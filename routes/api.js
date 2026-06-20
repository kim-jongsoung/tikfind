const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const User = require('../models/User');
const AlgorithmViewer = require('../models/AlgorithmViewer');
const MessageTemplate = require('../models/MessageTemplate');
const OverlayNotice = require('../models/OverlayNotice');
const Moderator = require('../models/Moderator');
const Level50Viewer = require('../models/Level50Viewer');
const Notice = require('../models/Notice');
const ytdl = require('@distube/ytdl-core');
const SongRequestService = require('../services/SongRequestService');

// 사용자별 신청곡 쿨다운 맵 (메모리 기반)
// { userId: { lastRequestTime: Date, cooldownMinutes: Number } }
const userSongCooldowns = new Map();

// 인증 체크 미들웨어
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    next();
};

// 시간 기반 중복신청제한 체크 미들웨어
const checkSongCooldown = (req, res, next) => {
    const userId = req.body.userId || req.user?._id?.toString();
    const cooldownMinutes = parseInt(req.body.cooldownMinutes) || 30;
    
    if (!userId) {
        return next(); // userId 없으면 통과
    }
    
    // 제한없음(0분) 선택 시 쿨다운 체크 건너뛰기
    const userCooldown = userSongCooldowns.get(userId);
    const requiredCooldown = userCooldown?.cooldownMinutes ?? cooldownMinutes;
    
    if (requiredCooldown === 0) {
        console.log('⏭️ 쿨다운 제한없음:', userId);
        return next(); // 제한없음이면 통과
    }
    
    const now = new Date();
    
    if (userCooldown && userCooldown.lastRequestTime) {
        const timeSinceLastRequest = (now - userCooldown.lastRequestTime) / 1000 / 60; // 분 단위
        
        if (timeSinceLastRequest < requiredCooldown) {
            const remainingMinutes = Math.ceil(requiredCooldown - timeSinceLastRequest);
            return res.status(429).json({
                success: false,
                error: 'COOLDOWN_ACTIVE',
                message: `${remainingMinutes}분 후에 다시 신청할 수 있습니다.`,
                remainingMinutes: remainingMinutes,
                cooldownMinutes: requiredCooldown
            });
        }
    }
    
    // 쿨다운 업데이트
    userSongCooldowns.set(userId, {
        lastRequestTime: now,
        cooldownMinutes: cooldownMinutes
    });
    
    next();
};

// Desktop App 연결용 1회용 토큰 (메모리 저장, 5분 유효)
const desktopTokens = new Map();

// 토큰 생성 (웹 로그인 후 대시보드에서 호출)
router.post('/desktop/token', requireAuth, (req, res) => {
    const userId = req.user._id.toString();
    const tiktokId = req.user.tiktokId || '';
    const token = require('crypto').randomBytes(32).toString('hex');
    desktopTokens.set(token, { userId, tiktokId, createdAt: Date.now() });
    setTimeout(() => desktopTokens.delete(token), 5 * 60 * 1000);
    res.json({ success: true, token });
});

// 토큰으로 userId 조회 (Desktop App에서 호출 - 인증 불필요)
router.get('/desktop/token/:token', (req, res) => {
    const data = desktopTokens.get(req.params.token);
    if (!data) return res.status(404).json({ success: false, message: '유효하지 않거나 만료된 토큰입니다.' });
    desktopTokens.delete(req.params.token);
    res.json({ success: true, userId: data.userId, tiktokId: data.tiktokId });
});

// Desktop App 다운로드 - GitHub Releases 최신 버전으로 리다이렉트
router.get('/download-app', (req, res) => {
    // tikfind 레포의 최신 릴리즈로 리다이렉트
    res.redirect('https://github.com/kim-jongsoung/tikfind/releases/latest/download/TikFind Setup 1.3.19.exe');
});

// 현재 로그인 유저 정보 (Desktop App 연결용)
router.get('/user/me', requireAuth, (req, res) => {
    res.json({
        userId: req.user._id.toString(),
        tiktokId: req.user.tiktokId || '',
        name: req.user.name || '',
        email: req.user.email || ''
    });
});

// User 플랜 조회
router.get('/user/plan', requireAuth, (req, res) => {
    const plan = req.user.plan || 'free'; // 실제 플랜 (free, pro)
    const subscriptionStatus = req.user.subscriptionStatus || 'trial'; // 구독 상태
    
    res.json({ 
        success: true, 
        plan: plan,
        subscriptionStatus: subscriptionStatus,
        subscriptionStartDate: req.user.subscriptionStartDate,
        subscriptionEndDate: req.user.subscriptionEndDate,
        nextBillingDate: req.user.subscriptionEndDate
    });
});

// 사용량 조회 API
const { getUserUsage, getUserPlanName, checkSongRequestLimit, checkGptAiLimit, checkPronunciationCoachLimit } = require('../middleware/planLimitCheck');
const PlanLimit = require('../models/PlanLimit');

router.get('/user/usage', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const planName = getUserPlanName(req.user);
        
        // 오늘의 사용량 가져오기
        const usage = await getUserUsage(userId);
        
        // 플랜 제한 가져오기
        const planLimit = await PlanLimit.findOne({ planName });
        
        res.json({
            success: true,
            planName: planName,
            usage: usage,
            limits: planLimit ? {
                songRequestLimit: planLimit.songRequestLimit,
                gptAiLimit: planLimit.gptAiLimit,
                pronunciationCoachLimit: planLimit.pronunciationCoachLimit
            } : null
        });
    } catch (error) {
        console.error('사용량 조회 오류:', error);
        res.status(500).json({ success: false, message: '사용량 조회 중 오류가 발생했습니다.' });
    }
});

// 쿨다운 설정 업데이트 API
router.post('/song-cooldown/update', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { cooldownMinutes } = req.body;
        
        if (!cooldownMinutes || cooldownMinutes < 0) {
            return res.status(400).json({ 
                success: false, 
                message: '유효하지 않은 쿨다운 시간입니다.' 
            });
        }
        
        // 기존 쿨다운 정보 가져오기
        const existingCooldown = userSongCooldowns.get(userId);
        
        // 쿨다운 시간만 업데이트 (마지막 신청 시간은 유지)
        userSongCooldowns.set(userId, {
            lastRequestTime: existingCooldown?.lastRequestTime || null,
            cooldownMinutes: parseInt(cooldownMinutes)
        });
        
        console.log(`⏱️ 쿨다운 설정 업데이트: ${userId} -> ${cooldownMinutes}분`);
        
        res.json({
            success: true,
            message: '쿨다운 설정이 업데이트되었습니다.',
            cooldownMinutes: parseInt(cooldownMinutes)
        });
    } catch (error) {
        console.error('쿨다운 설정 오류:', error);
        res.status(500).json({ success: false, message: '쿨다운 설정 중 오류가 발생했습니다.' });
    }
});

// 신청곡 요청 API (일일 제한 + 시간 제한 적용)
router.post('/song-request', requireAuth, checkSongCooldown, checkSongRequestLimit, async (req, res) => {
    try {
        const { songTitle, artist, userId } = req.body;
        
        // 실제 신청곡 처리 로직
        // TODO: YouTube API 연동 등
        
        console.log(`✅ 신청곡 추가: ${songTitle} - ${artist} (사용자: ${userId})`);
        
        res.json({
            success: true,
            message: '신청곡이 추가되었습니다.',
            planLimit: req.planLimit,
            song: { title: songTitle, artist }
        });
    } catch (error) {
        console.error('신청곡 요청 오류:', error);
        res.status(500).json({ success: false, message: '신청곡 요청 중 오류가 발생했습니다.' });
    }
});

// GPT AI 질문 API (제한 적용)
router.post('/gpt-ai', requireAuth, checkGptAiLimit, async (req, res) => {
    try {
        const { question } = req.body;
        
        // 실제 GPT AI 처리 로직
        // TODO: OpenAI API 연동
        
        res.json({
            success: true,
            message: 'GPT AI 응답이 생성되었습니다.',
            planLimit: req.planLimit,
            answer: '테스트 응답입니다.'
        });
    } catch (error) {
        console.error('GPT AI 요청 오류:', error);
        res.status(500).json({ success: false, message: 'GPT AI 요청 중 오류가 발생했습니다.' });
    }
});

// AI 발음 코치 API (제한 적용)
router.post('/pronunciation-coach', requireAuth, checkPronunciationCoachLimit, async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        
        // 실제 AI 발음 코치 처리 로직
        // TODO: OpenAI API 연동
        
        res.json({
            success: true,
            message: 'AI 발음 코치 응답이 생성되었습니다.',
            planLimit: req.planLimit,
            pronunciation: '테스트 발음입니다.'
        });
    } catch (error) {
        console.error('AI 발음 코치 요청 오류:', error);
        res.status(500).json({ success: false, message: 'AI 발음 코치 요청 중 오류가 발생했습니다.' });
    }
});

// 언어 설정 업데이트
router.post('/update-language', requireAuth, async (req, res) => {
    try {
        const { language } = req.body;
        
        req.user.nativeLanguage = language;
        await req.user.save();
        
        res.json({ success: true, message: '언어 설정이 업데이트되었습니다.' });
    } catch (error) {
        console.error('언어 설정 오류:', error);
        res.status(500).json({ success: false, message: '언어 설정 중 오류가 발생했습니다.' });
    }
});

// TikTok ID 설정
router.post('/setup-tiktok', requireAuth, async (req, res) => {
    try {
        const { tiktokId } = req.body;
        
        if (!tiktokId) {
            return res.status(400).json({ success: false, message: 'TikTok ID를 입력하세요.' });
        }
        
        const cleanTiktokId = tiktokId.replace(/^@+/, '').trim();
        if (!cleanTiktokId) {
            return res.status(400).json({ success: false, message: 'TikTok ID를 입력하세요.' });
        }
        
        req.user.tiktokId = cleanTiktokId;
        await req.user.save();
        
        res.json({ success: true, message: 'TikTok ID가 설정되었습니다.' });
    } catch (error) {
        console.error('TikTok ID 설정 오류:', error);
        res.status(500).json({ success: false, message: 'TikTok ID 설정 중 오류가 발생했습니다.' });
    }
});

// TikTok 숫자 userId 자동 조회
router.post('/fetch-tiktok-userid', requireAuth, async (req, res) => {
    const { tiktokId } = req.body;
    if (!tiktokId) return res.json({ success: false, message: 'tiktokId 필요' });
    const tid = tiktokId.replace(/^@+/, '').trim();
    try {
        const https = require('https');
        const numId = await new Promise((resolve) => {
            const options = {
                hostname: 'www.tiktok.com',
                path: `/@${tid}`,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Cache-Control': 'max-age=0',
                }
            };
            const r = https.request(options, (resp) => {
                let data = '';
                resp.on('data', c => { data += c; });
                resp.on('end', () => {
                    // 다양한 패턴 시도
                    const patterns = [
                        /"uniqueId":"[^"]*","id":"(\d+)"/,
                        /"secUid":"[^"]*","id":"(\d+)"/,
                        /"userId":"(\d+)"/,
                        /"authorId":"(\d+)"/,
                        /"id":"(\d{19})"/,
                        /"user":{"id":"(\d+)"/,
                        /"userInfo":{"user":{"id":"(\d+)"/,
                        /"webapp\.user-detail".*?"id":"(\d+)"/,
                        /__UNIVERSAL_DATA_FOR_REHYDRATION__.*?"id":"(\d{19})"/,
                    ];
                    for (const pattern of patterns) {
                        const match = data.match(pattern);
                        if (match && match[1] && match[1].length >= 15) {
                            resolve(match[1]);
                            return;
                        }
                    }
                    resolve('');
                });
            });
            r.on('error', () => resolve(''));
            r.setTimeout(10000, () => { r.destroy(); resolve(''); });
            r.end();
        });
        if (numId) {
            res.json({ success: true, tiktokUserId: numId });
        } else {
            res.json({ success: false, message: '자동 조회 실패 - 직접 입력하세요' });
        }
    } catch(e) {
        res.json({ success: false, message: e.message });
    }
});

// TikTok 숫자 userId 수동 저장
router.post('/save-tiktok-userid', requireAuth, async (req, res) => {
    try {
        const { tiktokUserId } = req.body;
        if (!tiktokUserId) return res.status(400).json({ success: false, message: 'tiktokUserId 필요' });
        await User.findByIdAndUpdate(req.user._id, { tiktokUserId: String(tiktokUserId).trim() }, { runValidators: false });
        console.log(`🔑 [save-tiktok-userid] ${req.user._id} → ${tiktokUserId}`);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// TikTok ID 변경 (설정 페이지에서 - /api/change-tiktok)
router.post('/change-tiktok', requireAuth, async (req, res) => {
    try {
        const { tiktokId } = req.body;
        
        if (!tiktokId) {
            return res.status(400).json({ success: false, message: 'TikTok ID를 입력하세요.' });
        }
        
        // @ 기호 제거 (앞에 붙은 @ 모두 제거)
        const cleanTiktokId = tiktokId.replace(/^@+/, '').trim();
        
        // findByIdAndUpdate로 직접 저장 (tiktokUserGenders 등 ValidationError 완전 우회)
        await User.findByIdAndUpdate(req.user._id, { tiktokId: cleanTiktokId }, { runValidators: false });

        // 숫자 userId 자동 조회 (비동기 - 프로필 페이지 스크래핑, 라이브 없이도 작동)
        ;(async () => {
            try {
                const https = require('https');
                const numId = await new Promise((resolve) => {
                    const options = {
                        hostname: 'www.tiktok.com',
                        path: `/@${cleanTiktokId}`,
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept-Language': 'en-US,en;q=0.9',
                        }
                    };
                    const req2 = https.request(options, (res2) => {
                        let data = '';
                        res2.on('data', chunk => { data += chunk; });
                        res2.on('end', () => {
                            const match = data.match(/"uniqueId":"[^"]*","id":"(\d+)"/) ||
                                          data.match(/"secUid":"[^"]*","id":"(\d+)"/) ||
                                          data.match(/"userId":"(\d+)"/) ||
                                          data.match(/"authorId":"(\d+)"/);
                            resolve(match ? match[1] : '');
                        });
                    });
                    req2.on('error', () => resolve(''));
                    req2.setTimeout(8000, () => { req2.destroy(); resolve(''); });
                    req2.end();
                });
                if (numId && numId !== '') {
                    console.log(`🔑 [change-tiktok] "${cleanTiktokId}" → ${numId}`);
                    await User.findByIdAndUpdate(req.user._id, { tiktokUserId: numId });
                } else {
                    console.log(`⚠️ [change-tiktok] "${cleanTiktokId}" 숫자 userId 못 찾음`);
                }
            } catch(e) {
                console.log(`⚠️ [change-tiktok] 오류: ${e.message}`);
            }
        })();
        
        res.json({ success: true, message: 'TikTok ID가 변경되었습니다.' });
    } catch (error) {
        console.error('TikTok ID 변경 오류:', error);
        res.status(500).json({ success: false, message: 'TikTok ID 변경 중 오류가 발생했습니다.' });
    }
});

// TikTok ID 변경 (온보딩에서 - /api/update-tiktok)
router.post('/update-tiktok', requireAuth, async (req, res) => {
    try {
        const { tiktokId } = req.body;
        
        if (!tiktokId) {
            return res.status(400).json({ success: false, message: 'TikTok ID를 입력하세요.' });
        }
        
        const cleanId = tiktokId.replace(/^@+/, '').trim();
        req.user.tiktokId = cleanId;
        
        // MongoDB 날짜 필드 형식 오류 수정 - timestamps 비활성화
        req.user.set('createdAt', new Date(), { strict: false });
        req.user.set('updatedAt', new Date(), { strict: false });
        
        await req.user.save({ timestamps: false });
        
        res.json({ success: true, message: 'TikTok ID가 변경되었습니다.' });
    } catch (error) {
        console.error('TikTok ID 변경 오류:', error);
        res.status(500).json({ success: false, message: 'TikTok ID 변경 중 오류가 발생했습니다.' });
    }
});

// 오버레이 설정 저장
router.post('/overlay/settings', requireAuth, async (req, res) => {
    try {

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }

        // 오버레이 설정 저장
        user.overlaySettings = {
            theme: req.body.theme || 'modern-dark',
            fontSize: req.body.fontSize || 16,
            animSpeed: req.body.animSpeed || 5,
            position: req.body.position || 'bottom-left',
            showCurrentSong: req.body.showCurrentSong !== false,
            showQueue: req.body.showQueue !== false,
            showRequester: req.body.showRequester !== false,
            showAlbumArt: req.body.showAlbumArt || false
        };

        // MongoDB 날짜 필드 형식 오류 수정 - timestamps 비활성화
        user.set('createdAt', new Date(), { strict: false });
        user.set('updatedAt', new Date(), { strict: false });

        await user.save({ timestamps: false });

        res.json({ success: true, message: '설정이 저장되었습니다.' });
    } catch (error) {
        console.error('오버레이 설정 저장 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// 오버레이 설정 불러오기
router.get('/overlay/settings', requireAuth, async (req, res) => {
    try {

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }

        res.json({ 
            success: true, 
            settings: user.overlaySettings || {
                theme: 'modern-dark',
                fontSize: 16,
                animSpeed: 5,
                position: 'bottom-left',
                showCurrentSong: true,
                showQueue: true,
                showRequester: true,
                showAlbumArt: false
            }
        });
    } catch (error) {
        console.error('오버레이 설정 불러오기 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// YouTube API 키 저장
router.post('/user/youtube-api-key', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });

        user.youtubeApiKey = (req.body.youtubeApiKey || '').trim();
        await user.save({ timestamps: false });
        console.log('✅ YouTube API 키 저장:', req.user._id);
        res.json({ success: true, message: 'YouTube API 키가 저장되었습니다.' });
    } catch (error) {
        console.error('❌ YouTube API 키 저장 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류: ' + error.message });
    }
});

// TikTok Session ID 저장
router.post('/user/tiktok-session-id', requireAuth, async (req, res) => {
    try {
        const sessionId = (req.body.sessionId || '').trim();
        await User.findByIdAndUpdate(req.user._id, { tiktokSessionId: sessionId });
        console.log('✅ TikTok Session ID 저장:', req.user._id, sessionId ? '(있음)' : '(삭제)');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 프로필 설정 저장 (닉네임, 스트리머 페르소나)
router.post('/user/profile', requireAuth, async (req, res) => {
    try {
        const { nickname, streamerPersona } = req.body;
        const updateData = {};
        if (nickname) updateData.nickname = nickname.trim();
        if (streamerPersona !== undefined) updateData.streamerPersona = streamerPersona.trim();

        const user = await User.findByIdAndUpdate(req.user._id, updateData, { new: true });
        if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });

        console.log('✅ 프로필 설정 저장:', req.user._id, nickname);
        res.json({ success: true, message: '프로필 설정이 저장되었습니다.' });
    } catch (error) {
        console.error('❌ 프로필 설정 저장 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류: ' + error.message });
    }
});

// 사용자 설정 저장
router.post('/user/settings', requireAuth, async (req, res) => {
    try {
        console.log('=== 사용자 설정 저장 시작 ===');
        console.log('요청 데이터:', req.body);
        console.log('사용자 ID:', req.user ? req.user._id : 'undefined');
        console.log('사용자 객체:', req.user ? { email: req.user.email, tiktokId: req.user.tiktokId } : 'undefined');

        if (!req.user) {
            console.error('❌ req.user가 undefined입니다!');
            return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            console.error('❌ 사용자를 찾을 수 없음:', req.user._id);
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }

        console.log('✅ 사용자 찾음:', { email: user.email, nickname: user.nickname });

        // 설정 업데이트
        if (req.body.nickname !== undefined) {
            console.log('닉네임 업데이트:', req.body.nickname);
            user.nickname = req.body.nickname;
        }
        if (req.body.streamerPersona !== undefined) {
            console.log('페르소나 업데이트:', req.body.streamerPersona);
            user.streamerPersona = req.body.streamerPersona;
        }
        if (req.body.nativeLanguage !== undefined) {
            console.log('모국어 업데이트:', req.body.nativeLanguage);
            user.nativeLanguage = req.body.nativeLanguage;
        }
        if (req.body.preferredLanguage !== undefined) {
            console.log('표시 언어 업데이트:', req.body.preferredLanguage);
            user.preferredLanguage = req.body.preferredLanguage;
        }

        console.log('저장 전 사용자 데이터:', {
            nickname: user.nickname,
            streamerPersona: user.streamerPersona,
            nativeLanguage: user.nativeLanguage,
            preferredLanguage: user.preferredLanguage
        });

        // MongoDB 날짜 필드 형식 오류 수정 - 더 강력한 방법
        console.log('createdAt 타입:', typeof user.createdAt, user.createdAt);
        console.log('updatedAt 타입:', typeof user.updatedAt, user.updatedAt);
        
        // timestamps를 비활성화하고 수동으로 설정
        user.set('createdAt', new Date(), { strict: false });
        user.set('updatedAt', new Date(), { strict: false });

        await user.save({ timestamps: false });
        console.log('✅ 사용자 설정 저장 완료');

        res.json({ success: true, message: '설정이 저장되었습니다.' });
    } catch (error) {
        console.error('❌ 사용자 설정 저장 오류:', error);
        console.error('오류 스택:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.', 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// YouTube 스트림 URL 추출 API
// YouTube 영상 재생 가능 여부 검증 API
router.post('/youtube/verify', async (req, res) => {
    try {
        const { videoId } = req.body;
        
        if (!videoId) {
            return res.status(400).json({ 
                success: false, 
                message: 'videoId가 필요합니다.' 
            });
        }
        
        console.log('🔍 YouTube 재생 가능 여부 검증:', videoId);
        
        try {
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const info = await ytdl.getInfo(videoUrl);
            
            // 비디오+오디오 또는 오디오 포맷이 있는지 확인
            const videoFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
            const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
            
            const isPlayable = videoFormats.length > 0 || audioFormats.length > 0;
            
            if (isPlayable) {
                console.log('✅ 재생 가능:', videoId);
                res.json({
                    success: true,
                    playable: true,
                    message: '재생 가능한 영상입니다.'
                });
            } else {
                console.log('❌ 재생 불가:', videoId, '(포맷 없음)');
                res.json({
                    success: true,
                    playable: false,
                    message: '재생할 수 없는 영상입니다. (저작권 제한 또는 embed 비활성화)'
                });
            }
        } catch (error) {
            console.log('❌ 재생 불가:', videoId, `(${error.message})`);
            res.json({
                success: true,
                playable: false,
                message: '재생할 수 없는 영상입니다.'
            });
        }
    } catch (error) {
        console.error('❌ 검증 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '검증 중 오류가 발생했습니다.' 
        });
    }
});

// YouTube 스트림 프록시 (GET)
router.get('/youtube/proxy/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        
        console.log('🎵 YouTube 스트림 프록시 시작:', videoId);
        
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const info = await ytdl.getInfo(videoUrl, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            }
        });
        
        // 비디오+오디오 포맷 선택
        const videoFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
        let selectedFormat = null;
        
        if (videoFormats.length > 0) {
            const qualities = ['360p', '480p', '720p'];
            for (const quality of qualities) {
                selectedFormat = videoFormats.find(f => f.qualityLabel === quality);
                if (selectedFormat) break;
            }
            if (!selectedFormat) selectedFormat = videoFormats[0];
        }
        
        if (!selectedFormat || !selectedFormat.url) {
            return res.status(404).send('재생 가능한 포맷을 찾을 수 없습니다.');
        }
        
        console.log('✅ 스트림 프록시 시작:', selectedFormat.qualityLabel || 'audio');
        
        // 스트림 프록시
        res.setHeader('Content-Type', selectedFormat.mimeType || 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        
        ytdl(videoUrl, {
            format: selectedFormat,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        }).pipe(res);
        
    } catch (error) {
        console.error('❌ 스트림 프록시 오류:', error);
        res.status(500).send('스트림 오류');
    }
});

router.post('/youtube/stream', async (req, res) => {
    try {
        const { videoId } = req.body;
        
        if (!videoId) {
            return res.status(400).json({ 
                success: false, 
                message: 'videoId가 필요합니다.' 
            });
        }
        
        console.log('🎵 YouTube 스트림 정보 가져오기:', videoId);
        
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const info = await ytdl.getInfo(videoUrl, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }
        });
        
        console.log('✅ YouTube 정보 가져오기 성공');
        
        // 프록시 URL 반환
        res.json({
            success: true,
            streamUrl: `/api/youtube/proxy/${videoId}`,
            videoInfo: {
                title: info.videoDetails.title,
                author: info.videoDetails.author.name,
                lengthSeconds: info.videoDetails.lengthSeconds,
                thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url
            }
        });
        
    } catch (error) {
        console.error('❌ YouTube 스트림 URL 추출 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: 'YouTube 스트림 URL 추출 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 장르별 인기곡 통계 조회
router.get('/popular-songs/stats', async (req, res) => {
    try {
        const PopularSong = require('../models/PopularSong');
        
        // 장르별 곡 수 집계
        const stats = await PopularSong.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$genre', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        
        // 전체 곡 수
        const total = await PopularSong.countDocuments({ isActive: true });
        
        // 장르별 객체로 변환
        const genreStats = {};
        stats.forEach(stat => {
            genreStats[stat._id] = stat.count;
        });
        
        res.json({
            success: true,
            total: total,
            genres: genreStats
        });
    } catch (error) {
        console.error('❌ 인기곡 통계 조회 오류:', error);
        res.status(500).json({ success: false, message: '통계 조회 실패' });
    }
});

// AI 자동재생용 곡 가져오기 (Genre 기반)
router.post('/popular-songs/random', async (req, res) => {
    try {
        const { genreId, count = 1, excludeIds = [] } = req.body;
        const PopularSong = require('../models/PopularSong');
        
        if (!genreId) {
            return res.status(400).json({ 
                success: false, 
                message: '장르 ID가 필요합니다' 
            });
        }
        
        console.log('🎲 랜덤 곡 조회:', { genreId, count, excludeIds: excludeIds.length });
        
        // AI 플레이리스트 곡 조회 (중복 제외)
        const query = {
            genre: genreId,
            isAIPlaylist: true,
            isActive: true
        };
        
        // 이미 재생한 곡 제외
        if (excludeIds && excludeIds.length > 0) {
            query._id = { $nin: excludeIds };
        }
        
        // MongoDB의 $sample을 사용한 진짜 랜덤 선택
        const songs = await PopularSong.aggregate([
            { $match: query },
            { $sample: { size: parseInt(count) } }
        ]);
        
        console.log('✅ 랜덤 곡 조회 결과:', songs.length, '곡');
        
        if (songs.length === 0) {
            console.log('⚠️ 곡이 없음 - 제외 목록 초기화하고 재시도');
            // 제외 목록 없이 다시 시도
            const retryQuery = {
                genre: genreId,
                isAIPlaylist: true,
                isActive: true
            };
            const retrySongs = await PopularSong.aggregate([
                { $match: retryQuery },
                { $sample: { size: parseInt(count) } }
            ]);
            
            return res.json({
                success: true,
                songs: retrySongs.map(song => ({
                    id: song._id,
                    videoId: song.videoId,
                    title: song.title,
                    artist: song.artist,
                    thumbnail: song.thumbnail
                })),
                resetExcludeList: true
            });
        }
        
        res.json({
            success: true,
            songs: songs.map(song => ({
                id: song._id,
                videoId: song.videoId,
                title: song.title,
                artist: song.artist,
                thumbnail: song.thumbnail
            }))
        });
    } catch (error) {
        console.error('❌ AI 플레이리스트 조회 오류:', error);
        res.status(500).json({ success: false, message: '곡 조회 실패' });
    }
});

// 사용량 카운팅 API
router.post('/usage/increment', async (req, res) => {
    try {
        const { userId, featureType } = req.body;
        
        if (!userId || !featureType) {
            return res.status(400).json({ 
                success: false, 
                message: 'userId와 featureType이 필요합니다.' 
            });
        }
        
        const UsageLog = require('../models/UsageLog');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 오늘 사용량 로그 찾기 또는 생성
        let usageLog = await UsageLog.findOne({ userId, date: today });
        
        if (!usageLog) {
            usageLog = await UsageLog.create({
                userId,
                date: today,
                songRequestCount: 0,
                gptAiCount: 0,
                pronunciationCoachCount: 0
            });
        }
        
        // 사용량 증가
        if (featureType === 'songRequest') {
            usageLog.songRequestCount = (usageLog.songRequestCount || 0) + 1;
        } else if (featureType === 'gptAi') {
            usageLog.gptAiCount = (usageLog.gptAiCount || 0) + 1;
        } else if (featureType === 'pronunciationCoach') {
            usageLog.pronunciationCoachCount = (usageLog.pronunciationCoachCount || 0) + 1;
        }
        
        await usageLog.save();
        
        console.log(`✅ 사용량 카운팅: ${featureType} - ${userId}`);
        
        res.json({
            success: true,
            usage: {
                songRequestCount: usageLog.songRequestCount,
                gptAiCount: usageLog.gptAiCount,
                pronunciationCoachCount: usageLog.pronunciationCoachCount
            }
        });
    } catch (error) {
        console.error('❌ 사용량 카운팅 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '사용량 카운팅 실패' 
        });
    }
});

// 신청곡 검색 API (DB 체크 → API 조회 → DB 저장)
router.post('/song-request/search', async (req, res) => {
    try {
        const { userId, title, artist } = req.body;
        
        if (!userId || !title) {
            return res.status(400).json({ 
                success: false, 
                message: 'userId와 title이 필요합니다.' 
            });
        }
        
        console.log('🎵 신청곡 검색 시작:', { title, artist: artist || '없음', userId });

        // 호스트 본인 YouTube API 키 우선 사용
        const hostUser = await User.findById(userId).select('youtubeApiKey');
        const youtubeApiKey = (hostUser && hostUser.youtubeApiKey) ? hostUser.youtubeApiKey : process.env.YOUTUBE_API_KEY;
        console.log('🔑 YouTube API 키:', youtubeApiKey ? (hostUser?.youtubeApiKey ? '호스트 키 사용' : '서버 공용 키 사용') : '❌ 없음');

        const songRequestService = new SongRequestService(youtubeApiKey);
        const song = await songRequestService.searchSong(title, artist || '');
        
        if (song) {
            console.log('✅ 곡 찾음:', song.videoId, '-', song.title || title);
            res.json({
                success: true,
                song: {
                    videoId: song.videoId,
                    title: song.title || title,
                    artist: song.channelTitle || song.artist,
                    thumbnail: song.thumbnail,
                    fromDB: song.fromDB || false
                }
            });
        } else {
            console.log('❌ 곡을 찾을 수 없음:', title, artist || '');
            res.json({
                success: false,
                message: `'${title}' 곡을 찾을 수 없습니다. YouTube API 키를 확인해주세요.`
            });
        }
    } catch (error) {
        console.error('❌ 신청곡 검색 오류:', error);
        console.error('스택:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: '신청곡 검색 실패: ' + error.message,
            error: error.message
        });
    }
});

// 대량 인기곡 저장 API (관리자용)
router.post('/admin/import-songs', async (req, res) => {
    try {
        const PopularSong = require('../models/PopularSong');
        const { songs } = req.body;
        
        if (!songs || !Array.isArray(songs)) {
            return res.status(400).json({ 
                success: false, 
                message: '노래 리스트가 필요합니다.' 
            });
        }
        
        let savedCount = 0;
        let skippedCount = 0;
        const errors = [];
        
        for (const song of songs) {
            try {
                // 중복 체크
                const exists = await PopularSong.findOne({ videoId: song.videoId });
                if (exists) {
                    skippedCount++;
                    continue;
                }
                
                // DB에 저장
                await PopularSong.create({
                    videoId: song.videoId,
                    title: song.title,
                    artist: song.artist,
                    thumbnail: `https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`,
                    genre: song.genre,
                    keywords: [
                        song.title.toLowerCase(),
                        song.artist.toLowerCase()
                    ],
                    source: 'manual',
                    popularity: 100,
                    isActive: true
                });
                
                savedCount++;
            } catch (error) {
                errors.push({ song: song.title, error: error.message });
            }
        }
        
        // 전체 곡 수 확인
        const totalSongs = await PopularSong.countDocuments({ isActive: true });
        
        res.json({
            success: true,
            savedCount,
            skippedCount,
            totalSongs,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('❌ 대량 저장 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '대량 저장 실패',
            error: error.message
        });
    }
});

// ==================== 관리자 API ====================

const Genre = require('../models/Genre');
const AICurationService = require('../services/AICurationService');

// 관리자: 장르 목록 조회
router.get('/admin/genres', async (req, res) => {
    try {
        const genres = await Genre.find({ isActive: true }).sort({ createdAt: -1 });
        res.json({ success: true, genres });
    } catch (error) {
        console.error('❌ 장르 조회 오류:', error);
        res.status(500).json({ success: false, message: '장르 조회 실패' });
    }
});

// 관리자: 장르 추가
router.post('/admin/genres', async (req, res) => {
    try {
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, message: '장르 이름이 필요합니다' });
        }
        
        // 중복 체크
        const exists = await Genre.findOne({ name: new RegExp(`^${name}$`, 'i') });
        if (exists) {
            return res.status(400).json({ success: false, message: '이미 존재하는 장르입니다' });
        }
        
        const genre = await Genre.create({ name, description });
        res.json({ success: true, genre, message: '장르가 추가되었습니다' });
    } catch (error) {
        console.error('❌ 장르 추가 오류:', error);
        res.status(500).json({ success: false, message: '장르 추가 실패' });
    }
});

// 관리자: 장르 삭제
router.delete('/admin/genres/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const genre = await Genre.findById(id);
        if (!genre) {
            return res.status(404).json({ success: false, message: '장르를 찾을 수 없습니다' });
        }
        
        // 해당 장르의 곡들도 삭제 (선택)
        const PopularSong = require('../models/PopularSong');
        await PopularSong.deleteMany({ genre: id, isAIPlaylist: true });
        
        await Genre.findByIdAndDelete(id);
        
        res.json({ success: true, message: '장르가 삭제되었습니다' });
    } catch (error) {
        console.error('❌ 장르 삭제 오류:', error);
        res.status(500).json({ success: false, message: '장르 삭제 실패' });
    }
});

// 관리자: AI 자동 큐레이션 실행
router.post('/admin/genres/:id/curate', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🎵 큐레이션 시작: 장르 ID = ${id}`);
        
        // 동기로 실행하고 결과 반환
        const result = await AICurationService.curateGenre(id);
        
        console.log(`✅ 큐레이션 완료:`, result);
        
        res.json({ 
            success: true, 
            message: '큐레이션이 완료되었습니다!',
            ...result
        });
        
    } catch (error) {
        console.error('❌ 큐레이션 실패:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || '큐레이션 실패',
            error: error.toString()
        });
    }
});

// 관리자: 장르별 곡 목록 조회
router.get('/admin/genres/:id/songs', async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 50 } = req.query;
        
        const PopularSong = require('../models/PopularSong');
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [songs, total] = await Promise.all([
            PopularSong.find({ genre: id, isAIPlaylist: true, isActive: true })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            PopularSong.countDocuments({ genre: id, isAIPlaylist: true, isActive: true })
        ]);
        
        res.json({ success: true, songs, total });
    } catch (error) {
        console.error('❌ 곡 조회 오류:', error);
        res.status(500).json({ success: false, message: '곡 조회 실패' });
    }
});

// 관리자: 직접 곡 추가 (제목 + 가수명)
router.post('/admin/genres/:id/add-song', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, artist } = req.body;
        
        if (!title) {
            return res.status(400).json({ 
                success: false, 
                message: '제목을 입력하세요' 
            });
        }
        
        console.log('🎵 곡 추가 시작:', { genreId: id, title, artist });
        
        // SongRequestService로 YouTube 검색
        const SongRequestService = require('../services/SongRequestService');
        const songService = new SongRequestService();
        const youtubeResult = await songService.searchYouTube(title, artist || '');
        
        if (!youtubeResult) {
            return res.status(404).json({ 
                success: false, 
                message: '곡을 찾을 수 없습니다. 다른 검색어로 시도해주세요.' 
            });
        }
        
        console.log('✅ YouTube 검색 성공:', youtubeResult);
        
        // DB에 저장
        const PopularSong = require('../models/PopularSong');
        const Genre = require('../models/Genre');
        
        // 중복 체크
        const existing = await PopularSong.findOne({ 
            videoId: youtubeResult.videoId,
            genre: id 
        });
        
        if (existing) {
            return res.status(400).json({ 
                success: false, 
                message: '이미 추가된 곡입니다' 
            });
        }
        
        // 곡 저장
        const newSong = await PopularSong.create({
            videoId: youtubeResult.videoId,
            title: youtubeResult.title || title,
            artist: artist || youtubeResult.channelTitle,
            thumbnail: youtubeResult.thumbnail,
            genre: id,
            isAIPlaylist: true,
            isActive: true,
            popularity: 0,
            requestCount: 0,
            source: 'manual'
        });
        
        // 장르의 curatedCount 증가
        await Genre.findByIdAndUpdate(id, {
            $inc: { curatedCount: 1 },
            lastCuratedAt: new Date()
        });
        
        console.log('✅ 곡 저장 완료:', newSong._id);
        
        res.json({ 
            success: true, 
            message: '곡이 추가되었습니다',
            song: {
                _id: newSong._id,
                videoId: newSong.videoId,
                title: newSong.title,
                artist: newSong.artist,
                thumbnail: newSong.thumbnail
            }
        });
        
    } catch (error) {
        console.error('❌ 곡 추가 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '곡 추가 실패: ' + error.message 
        });
    }
});

// 관리자: 곡 삭제
router.delete('/admin/songs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const PopularSong = require('../models/PopularSong');
        
        const song = await PopularSong.findById(id);
        if (!song) {
            return res.status(404).json({ success: false, message: '곡을 찾을 수 없습니다' });
        }
        
        // 장르의 curatedCount 감소
        if (song.genre) {
            await Genre.findByIdAndUpdate(song.genre, {
                $inc: { curatedCount: -1 }
            });
        }
        
        await PopularSong.findByIdAndDelete(id);
        
        res.json({ success: true, message: '곡이 삭제되었습니다' });
    } catch (error) {
        console.error('❌ 곡 삭제 오류:', error);
        res.status(500).json({ success: false, message: '곡 삭제 실패' });
    }
});

// ── 호스트 직접 질문 발음코치 (POST /api/pronunciation-coach/host) ──
router.post('/pronunciation-coach/host', requireAuth, async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ success: false, message: '텍스트 필요' });
        if (!targetLanguage) return res.status(400).json({ success: false, message: 'targetLanguage 필요' });

        const PronunciationCoachService = require('../services/PronunciationCoachService');
        const coachService = new PronunciationCoachService();
        const result = await coachService.generateHostQuestionGuide(text.trim(), targetLanguage);

        if (!result) return res.status(500).json({ success: false, message: '발음코치 생성 실패' });
        res.json({ success: true, result });
    } catch (e) {
        console.error('❌ 호스트 발음코치 오류:', e);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// ── 시청자 성별 저장 (POST /api/tts/user-gender) ──
router.post('/tts/user-gender', requireAuth, async (req, res) => {
    try {
        const { uniqueId, gender } = req.body;
        if (!uniqueId) return res.status(400).json({ success: false, message: 'uniqueId 필요' });
        if (gender !== null && gender !== undefined && !['m', 'f'].includes(gender)) {
            return res.status(400).json({ success: false, message: '성별은 m 또는 f' });
        }

        const key = `tiktokUserGenders.${uniqueId}`;
        if (gender === null || gender === undefined) {
            await User.findByIdAndUpdate(req.user._id, { $unset: { [key]: '' } });
        } else {
            await User.findByIdAndUpdate(req.user._id, { $set: { [key]: gender } });
        }
        res.json({ success: true, uniqueId, gender });
    } catch (e) {
        console.error('❌ 성별 저장 오류:', e);
        res.status(500).json({ success: false, message: '저장 실패' });
    }
});

// ── 시청자 성별 전체 조회 (GET /api/tts/user-genders) ──
router.get('/tts/user-genders', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('tiktokUserGenders');
        const genders = {};
        if (user.tiktokUserGenders) {
            user.tiktokUserGenders.forEach((v, k) => { genders[k] = v; });
        }
        res.json({ success: true, genders });
    } catch (e) {
        res.status(500).json({ success: false, message: '조회 실패' });
    }
});

// ── 알고리즘 리포트 API ────────────────────────────────────────

// 방송 이력 목록
router.get('/report/sessions', requireAuth, async (req, res) => {
    try {
        const LiveSession = require('../models/LiveSession');
        const sessions = await LiveSession.find({ userId: req.user._id, endedAt: { $exists: true } })
            .sort({ startedAt: -1 }).limit(30).lean();
        res.json({ success: true, sessions });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 집계 통계 (국가별, 시간대별, 전체 요약)
router.get('/report/stats', requireAuth, async (req, res) => {
    try {
        const LiveSession = require('../models/LiveSession');
        const sessions = await LiveSession.find({ userId: req.user._id, endedAt: { $exists: true } })
            .sort({ startedAt: -1 }).limit(20).lean();

        // 국가별 집계
        const countryTotals = {};
        // 시간대별 집계
        const hourlyTotals = {};
        let totalDuration = 0, totalChats = 0, totalForeign = 0, sessionCount = sessions.length;

        for (const s of sessions) {
            totalDuration += s.durationMinutes || 0;
            totalChats += s.totalChats || 0;
            totalForeign += s.foreignChatCount || 0;
            for (const c of (s.countryStats || [])) {
                if (!c.countryCode) continue;
                countryTotals[c.countryCode] = (countryTotals[c.countryCode] || 0) + c.count;
            }
            for (const h of (s.hourlyStats || [])) {
                if (!hourlyTotals[h.hour]) hourlyTotals[h.hour] = { viewerTotal: 0, chatTotal: 0, count: 0 };
                hourlyTotals[h.hour].viewerTotal += h.viewerCount || 0;
                hourlyTotals[h.hour].chatTotal += h.chatCount || 0;
                hourlyTotals[h.hour].count++;
            }
        }

        const countryRanking = Object.entries(countryTotals)
            .map(([code, count]) => ({ code, count }))
            .sort((a, b) => b.count - a.count);

        const hourlyAvg = Object.entries(hourlyTotals).map(([h, v]) => ({
            hour: parseInt(h),
            avgViewers: v.count ? Math.round(v.viewerTotal / v.count) : 0,
            avgChats: v.count ? Math.round(v.chatTotal / v.count) : 0
        })).sort((a, b) => a.hour - b.hour);

        res.json({
            success: true,
            summary: { sessionCount, totalDuration, totalChats, totalForeign, avgDuration: sessionCount ? Math.round(totalDuration / sessionCount) : 0 },
            countryRanking,
            hourlyAvg,
            recentSessions: sessions.slice(0, 10)
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// AI 분석 + 다음 방송 전략 추천
router.post('/report/ai-analysis', requireAuth, async (req, res) => {
    try {
        const LiveSession = require('../models/LiveSession');
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const sessions = await LiveSession.find({ userId: req.user._id, endedAt: { $exists: true } })
            .sort({ startedAt: -1 }).limit(10).lean();

        if (sessions.length === 0) {
            return res.json({ success: false, message: '분석할 방송 데이터가 없습니다. 방송을 진행한 후 이용해주세요.' });
        }

        // 통계 집계
        const countryTotals = {};
        const hourlyTotals = {};
        let totalChats = 0, totalForeign = 0;

        for (const s of sessions) {
            totalChats += s.totalChats || 0;
            totalForeign += s.foreignChatCount || 0;
            for (const c of (s.countryStats || [])) {
                if (c.countryCode) countryTotals[c.countryCode] = (countryTotals[c.countryCode] || 0) + c.count;
            }
            for (const h of (s.hourlyStats || [])) {
                if (!hourlyTotals[h.hour]) hourlyTotals[h.hour] = { viewerTotal: 0, chatTotal: 0, count: 0 };
                hourlyTotals[h.hour].viewerTotal += h.viewerCount || 0;
                hourlyTotals[h.hour].chatTotal += h.chatCount || 0;
                hourlyTotals[h.hour].count++;
            }
        }

        const topCountries = Object.entries(countryTotals).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,n])=>`${c}(${n}명)`).join(', ');
        const bestHours = Object.entries(hourlyTotals)
            .map(([h, v]) => ({ hour: parseInt(h), avg: v.count ? v.viewerTotal / v.count : 0 }))
            .sort((a,b) => b.avg - a.avg).slice(0, 3).map(h => `${h.hour}시`).join(', ');
        const avgDuration = sessions.length ? Math.round(sessions.reduce((a,s) => a + (s.durationMinutes||0), 0) / sessions.length) : 0;
        const foreignRate = totalChats ? Math.round(totalForeign / totalChats * 100) : 0;

        // 추가 통계 계산
        const totalViewers = sessions.reduce((a, s) => a + (s.peakViewers || 0), 0);
        const avgViewers = sessions.length ? Math.round(totalViewers / sessions.length) : 0;
        const totalGifts = sessions.reduce((a, s) => a + (s.totalGifts || 0), 0);
        const totalDiamonds = sessions.reduce((a, s) => a + (s.totalDiamonds || 0), 0);
        const totalLikes = sessions.reduce((a, s) => a + (s.totalLikes || 0), 0);
        const totalFollows = sessions.reduce((a, s) => a + (s.totalFollows || 0), 0);
        const totalShares = sessions.reduce((a, s) => a + (s.totalShares || 0), 0);
        
        // 방송 성장 추세 계산 (최근 5회 vs 이전 5회)
        const recentSessions = sessions.slice(0, 5);
        const olderSessions = sessions.slice(5, 10);
        const recentAvgViewers = recentSessions.length ? Math.round(recentSessions.reduce((a, s) => a + (s.peakViewers || 0), 0) / recentSessions.length) : 0;
        const olderAvgViewers = olderSessions.length ? Math.round(olderSessions.reduce((a, s) => a + (s.peakViewers || 0), 0) / olderSessions.length) : 0;
        const viewerGrowth = olderAvgViewers > 0 ? Math.round((recentAvgViewers - olderAvgViewers) / olderAvgViewers * 100) : 0;
        
        // 참여율 계산 (채팅 + 좋아요 / 시청자)
        const engagementRate = avgViewers > 0 ? Math.round((totalChats + totalLikes) / (avgViewers * sessions.length) * 100) : 0;

        const prompt = `당신은 틱톡 라이브 알고리즘 전문가입니다. 아래 데이터를 분석하여 한국어로 답변해주세요.

[방송 데이터 (최근 ${sessions.length}회)]
- 평균 방송 시간: ${avgDuration}분
- 평균 최고 시청자: ${avgViewers}명
- 상위 해외 시청자 국가: ${topCountries || '데이터 없음'}
- 시청자 최다 시간대: ${bestHours || '데이터 없음'}
- 해외 채팅 비율: ${foreignRate}%
- 총 선물: ${totalGifts}개 (${totalDiamonds}💎)
- 총 좋아요: ${totalLikes.toLocaleString()}개
- 총 팔로우: ${totalFollows}명
- 총 공유: ${totalShares}회
- 시청자 성장률: ${viewerGrowth > 0 ? '+' : ''}${viewerGrowth}% (최근 5회 vs 이전 5회)
- 참여율: ${engagementRate}%

다음 형식으로 정확히 답변해주세요:

[알고리즘 분석]
(2-3줄로 현재 방송 패턴 분석)

[시청자 성장 진단]
(현재 성장 추세 분석과 성장을 위해 개선해야 할 핵심 포인트 2-3가지)

[참여율 개선 전략]
(채팅, 좋아요, 공유를 늘리기 위한 구체적인 방법 2-3가지)

[수익화 최적화]
(선물 수익을 높이기 위한 전략과 팁 2-3가지)

[집중 추천 시간대]
(다음 방송에서 집중할 최적 시간대 1-2개와 이유)

[집중 추천 국가]
(가장 공략할 국가 1-2개와 해당 국가 시청자를 위한 전략)

[방송 전 공지 문구]
(아래 상위 2개 국가 언어로 각각 방송 시작 알림 문구 작성, 예: 일본어라면 일본어로)
국가1: (해당 언어 문구)
국가2: (해당 언어 문구)

[다음 방송 실행 팁]
(구체적인 실행 가능한 팁 3가지)`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 1500
        });

        const analysis = response.choices[0].message.content.trim();
        res.json({ 
            success: true, 
            analysis, 
            dataUsed: { 
                sessions: sessions.length, 
                topCountries, 
                bestHours, 
                avgDuration, 
                foreignRate,
                avgViewers,
                totalGifts,
                totalDiamonds,
                viewerGrowth,
                engagementRate
            } 
        });
    } catch (e) {
        console.error('AI 분석 오류:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// ===== 알고리즘 확장 API =====

// 비팔로워 시청자 목록 조회 (확장 검색)
router.get('/growth/viewers', requireAuth, async (req, res) => {
    try {
        const {
            page = 1, limit = 50,
            status,           // pending|followed|dm_sent|ignored
            keyword,          // 닉네임/아이디 키워드
            minVisit,         // 최소 방문횟수
            dateFrom, dateTo, // 날짜 범위 (lastSeenAt 기준)
            sort = 'lastSeenAt_desc'  // lastSeenAt_desc|lastSeenAt_asc|visitCount_desc|firstSeenAt_asc
        } = req.query;

        const query = { userId: req.user._id };

        // 상태 필터
        if (status) query.status = status;

        // 키워드 (닉네임 or uniqueId)
        if (keyword && keyword.trim()) {
            const kw = keyword.trim();
            query.$or = [
                { uniqueId: { $regex: kw, $options: 'i' } },
                { nickname: { $regex: kw, $options: 'i' } }
            ];
        }

        // 최소 방문횟수
        if (minVisit && parseInt(minVisit) > 1) {
            query.visitCount = { $gte: parseInt(minVisit) };
        }

        // 날짜 범위
        if (dateFrom || dateTo) {
            query.lastSeenAt = {};
            if (dateFrom) query.lastSeenAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query.lastSeenAt.$lte = to;
            }
        }

        // 정렬
        const sortMap = {
            'lastSeenAt_desc':  { lastSeenAt: -1 },
            'lastSeenAt_asc':   { lastSeenAt:  1 },
            'visitCount_desc':  { visitCount: -1, lastSeenAt: -1 },
            'firstSeenAt_asc':  { firstSeenAt: 1 }
        };
        const sortOption = sortMap[sort] || { lastSeenAt: -1 };

        const total = await AlgorithmViewer.countDocuments(query);
        const viewers = await AlgorithmViewer.find(query)
            .sort(sortOption)
            .skip((page - 1) * parseInt(limit))
            .limit(parseInt(limit));

        // 상태별 통계
        const stats = await AlgorithmViewer.aggregate([
            { $match: { userId: req.user._id } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const statusStats = { pending: 0, followed: 0, dm_sent: 0, ignored: 0 };
        stats.forEach(s => { if (s._id) statusStats[s._id] = s.count; });

        res.json({ success: true, viewers, total, page: parseInt(page), statusStats });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 일괄 상태 변경
router.patch('/growth/viewers/bulk-status', requireAuth, async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!ids || !ids.length || !status) return res.status(400).json({ success: false, message: '필수 파라미터 누락' });
        await AlgorithmViewer.updateMany(
            { _id: { $in: ids }, userId: req.user._id },
            { $set: { status } }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 시청자 상태 변경
router.patch('/growth/viewers/:id', requireAuth, async (req, res) => {
    try {
        const { status, memo } = req.body;
        const update = {};
        if (status) update.status = status;
        if (memo !== undefined) update.memo = memo;
        const viewer = await AlgorithmViewer.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: update },
            { new: true }
        );
        if (!viewer) return res.status(404).json({ success: false, message: '없는 시청자입니다.' });
        res.json({ success: true, viewer });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 시청자 삭제
router.delete('/growth/viewers/:id', requireAuth, async (req, res) => {
    try {
        await AlgorithmViewer.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 팔로우 신청 대상 추천 리스트 (프로필이미지 있음 + 레벨 높은 순, 하루 100명)
router.get('/growth/follow-targets', requireAuth, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 오늘 이미 신청한 수
        const todayCount = await AlgorithmViewer.countDocuments({
            userId: req.user._id,
            followRequestedAt: { $gte: today }
        });

        // 팔로우 신청 안 한 비팔로워 중 프로필이미지 있는 사람 우선, 레벨 높은 순, 방문 많은 순
        const targets = await AlgorithmViewer.find({
            userId: req.user._id,
            followRole: { $lt: 1 },           // 비팔로워만
            status: { $nin: ['followed', 'ignored'] },
            followRequestedAt: null            // 아직 신청 안 한 사람
        })
        .sort({ gifterLevel: -1, visitCount: -1, lastSeenAt: -1 })
        .limit(100);

        // 프로필 이미지 있는 사람 먼저 정렬
        const withPhoto = targets.filter(v => v.profilePictureUrl && v.profilePictureUrl.trim());
        const withoutPhoto = targets.filter(v => !v.profilePictureUrl || !v.profilePictureUrl.trim());
        const sorted = [...withPhoto, ...withoutPhoto].slice(0, 100);

        // 효과 통계
        const stats = {
            totalFollowRequested: await AlgorithmViewer.countDocuments({ userId: req.user._id, followRequestedAt: { $ne: null } }),
            totalFollowedBack: await AlgorithmViewer.countDocuments({ userId: req.user._id, followRequestedAt: { $ne: null }, followRole: { $gte: 1 } }),
            totalRevisitAfterFollow: await AlgorithmViewer.countDocuments({ userId: req.user._id, followRequestedAt: { $ne: null }, visitCount: { $gte: 2 } }),
            todayRequested: todayCount,
            remaining: Math.max(0, 100 - todayCount)
        };

        res.json({ success: true, targets: sorted, stats });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 팔로우 신청 완료 처리 (버튼 클릭 시)
router.post('/growth/viewers/:id/follow-request', requireAuth, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCount = await AlgorithmViewer.countDocuments({
            userId: req.user._id,
            followRequestedAt: { $gte: today }
        });
        if (todayCount >= 100) {
            return res.json({ success: false, message: '오늘 팔로우 신청 한도(100명)에 도달했습니다.' });
        }
        const viewer = await AlgorithmViewer.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: { followRequestedAt: new Date(), status: 'followed' } },
            { new: true }
        );
        if (!viewer) return res.status(404).json({ success: false, message: '없는 시청자입니다.' });
        res.json({ success: true, viewer });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 메시지 템플릿 목록
router.get('/growth/templates', requireAuth, async (req, res) => {
    try {
        const templates = await MessageTemplate.find({ userId: req.user._id }).sort({ order: 1, createdAt: 1 });
        res.json({ success: true, templates });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 메시지 템플릿 저장
router.post('/growth/templates', requireAuth, async (req, res) => {
    try {
        const count = await MessageTemplate.countDocuments({ userId: req.user._id });
        if (count >= 10) return res.status(400).json({ success: false, message: '템플릿은 최대 10개까지 저장 가능합니다.' });
        const { title, content } = req.body;
        if (!title || !content) return res.status(400).json({ success: false, message: '제목과 내용을 입력해주세요.' });
        const tmpl = await MessageTemplate.create({ userId: req.user._id, title, content, order: count });
        res.json({ success: true, template: tmpl });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 메시지 템플릿 수정
router.patch('/growth/templates/:id', requireAuth, async (req, res) => {
    try {
        const { title, content } = req.body;
        const tmpl = await MessageTemplate.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: { title, content } },
            { new: true }
        );
        if (!tmpl) return res.status(404).json({ success: false, message: '없는 템플릿입니다.' });
        res.json({ success: true, template: tmpl });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 메시지 템플릿 삭제
router.delete('/growth/templates/:id', requireAuth, async (req, res) => {
    try {
        await MessageTemplate.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// AI 메시지 생성
router.post('/growth/ai-message', requireAuth, async (req, res) => {
    try {
        const { tiktokId, nickname } = req.body;
        const hostTiktokId = req.user.tiktokId || tiktokId || '';
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = `TikTok 라이브 스트리머 @${hostTiktokId}가 방송에 방문했던 비팔로워 시청자${nickname ? ` @${nickname}` : ''}에게 보낼 짧고 친근한 DM 메시지를 한국어로 3가지 만들어주세요.
조건:
- 각 메시지는 2~3문장 이내
- 방송에 와줘서 고맙다는 내용 포함
- 다음에 또 놀러오라는 재방문 유도
- 호스트 TikTok 링크(https://www.tiktok.com/@${hostTiktokId}) 자연스럽게 포함
- 과하지 않고 자연스럽게
- 각 메시지를 ---로 구분해서 출력`;
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        });
        const text = response.choices[0].message.content.trim();
        const messages = text.split('---').map(m => m.trim()).filter(Boolean);
        res.json({ success: true, messages });
    } catch (e) {
        console.error('AI 메시지 생성 오류:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// ===== 오버레이 공지사항 API =====

// 공지 목록 조회 (오버레이에서도 인증 없이 userId로 조회)
router.get('/overlay-notice/:userId', async (req, res) => {
    try {
        const notices = await OverlayNotice.find({ userId: req.params.userId, isActive: true })
            .sort({ order: 1, createdAt: 1 });
        res.json({ success: true, notices });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 공지 목록 조회 (대시보드 - 인증 필요)
router.get('/overlay-notice', requireAuth, async (req, res) => {
    try {
        const notices = await OverlayNotice.find({ userId: req.user._id })
            .sort({ order: 1, createdAt: 1 });
        res.json({ success: true, notices });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 공지 추가
router.post('/overlay-notice', requireAuth, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ success: false, message: '내용을 입력해주세요.' });

        // HTML 태그와 스크립트 제거 (이모지는 허용)
        let sanitizedContent = content.trim()
            .replace(/<[^>]*>/g, '')  // HTML 태그 제거
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');  // 이벤트 핸들러 제거

        if (sanitizedContent.length > 50) return res.status(400).json({ success: false, message: '50자 이내로 입력해주세요.' });
        const count = await OverlayNotice.countDocuments({ userId: req.user._id });
        if (count >= 10) return res.status(400).json({ success: false, message: '공지는 최대 10개까지 저장할 수 있습니다.' });
        const notice = await OverlayNotice.create({ userId: req.user._id, content: sanitizedContent, order: count });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + String(req.user._id)).emit('overlay-notice-update');
        res.json({ success: true, notice });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 공지 수정
router.patch('/overlay-notice/:id', requireAuth, async (req, res) => {
    try {
        const { content, isActive } = req.body;
        const update = {};
        if (content !== undefined) {
            // HTML 태그와 스크립트 제거 (이모지는 허용)
            let sanitizedContent = content.trim()
                .replace(/<[^>]*>/g, '')  // HTML 태그 제거
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '');  // 이벤트 핸들러 제거

            if (sanitizedContent.length > 50) return res.status(400).json({ success: false, message: '50자 이내로 입력해주세요.' });
            update.content = sanitizedContent;
        }
        if (isActive !== undefined) update.isActive = isActive;
        const notice = await OverlayNotice.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: update },
            { new: true }
        );
        if (!notice) return res.status(404).json({ success: false, message: '공지를 찾을 수 없습니다.' });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + String(req.user._id)).emit('overlay-notice-update');
        res.json({ success: true, notice });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 공지 삭제
router.delete('/overlay-notice/:id', requireAuth, async (req, res) => {
    try {
        await OverlayNotice.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + String(req.user._id)).emit('overlay-notice-update');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 선물 다이아 기준 설정 ──────────────────────────────────────
// GET /api/gift-settings?userId=xxx  (오버레이에서 공개 조회)
router.get('/gift-settings', async (req, res) => {
    try {
        const uid = req.query.userId || (req.user && req.user._id);
        if (!uid) return res.json({ success: true, midMin: 100, megaMin: 1000 });
        const user = await User.findById(uid).select('giftSettings');
        const s = user?.giftSettings || {};
        res.json({ success: true, midMin: s.midMin ?? 100, megaMin: s.megaMin ?? 1000 });
    } catch (e) {
        res.json({ success: true, midMin: 100, megaMin: 1000 });
    }
});

// POST /api/gift-settings  (인증 필요)
router.post('/gift-settings', requireAuth, async (req, res) => {
    try {
        const { midMin, megaMin } = req.body;
        const update = {};
        if (midMin  != null) update['giftSettings.midMin']  = Math.max(0, parseInt(midMin)  || 0);
        if (megaMin != null) update['giftSettings.megaMin'] = Math.max(0, parseInt(megaMin) || 0);
        await User.findByIdAndUpdate(req.user._id, { $set: update });

        // 실시간 반영: 오버레이에 소켓 emit
        const io = req.app.get('io');
        if (io) {
            io.to(req.user._id.toString()).emit('gift-settings-update', {
                midMin:  update['giftSettings.midMin']  ?? undefined,
                megaMin: update['giftSettings.megaMin'] ?? undefined
            });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 룰렛 미션 문구 ────────────────────────────────────────────
// POST /api/roulette-items  (인증 필요)
router.post('/roulette-items', requireAuth, async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'items 필요' });
        }
        // 오버레이에 소켓으로 즉시 전달
        const io = req.app.get('io');
        const userId = req.user._id.toString();
        if (io) {
            io.to(`overlay-${userId}`).emit('roulette-items-update', { items });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 모더 위젯 ─────────────────────────────────────────────────
// GET /api/moderator?userId=xxx  (오버레이 공개 조회)
router.get('/moderator', async (req, res) => {
    try {
        const uid = req.query.userId || (req.user && req.user._id);
        if (!uid) return res.json({ success: true, moderators: [], inactiveAlert: false });
        const mods = await Moderator.find({ userId: uid }).sort({ order: 1, createdAt: 1 });
        const user = await User.findById(uid).select('modInactiveAlert').lean();
        res.json({ success: true, moderators: mods, inactiveAlert: user?.modInactiveAlert === true });
    } catch (e) {
        res.json({ success: true, moderators: [], inactiveAlert: false });
    }
});

// GET /api/moderator/list  (인증 - 대시보드)
router.get('/moderator/list', requireAuth, async (req, res) => {
    try {
        const mods = await Moderator.find({ userId: req.user._id }).sort({ order: 1, createdAt: 1 });
        res.json({ success: true, moderators: mods });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/moderator  (추가)
router.post('/moderator', requireAuth, async (req, res) => {
    try {
        const { tiktokUniqueId, displayName, profileImg } = req.body;
        if (!tiktokUniqueId || !displayName)
            return res.status(400).json({ success: false, message: 'ID와 닉네임을 입력해주세요.' });
        const count = await Moderator.countDocuments({ userId: req.user._id });
        if (count >= 20)
            return res.status(400).json({ success: false, message: '최대 20명까지 등록 가능합니다.' });
        const mod = await Moderator.create({
            userId: req.user._id,
            tiktokUniqueId: tiktokUniqueId.trim(),
            displayName: displayName.trim().slice(0, 20),
            profileImg: profileImg || ''
        });
        // 실시간 반영
        const io = req.app.get('io');
        if (io) io.to('overlay-' + req.user._id.toString()).emit('moderator-update');
        res.json({ success: true, moderator: mod });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PATCH /api/moderator/:id  (수정)
router.patch('/moderator/:id', requireAuth, async (req, res) => {
    try {
        const { displayName, profileImg } = req.body;
        const update = {};
        if (displayName) update.displayName = displayName.trim().slice(0, 20);
        if (profileImg !== undefined) update.profileImg = profileImg;
        await Moderator.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: update });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + req.user._id.toString()).emit('moderator-update');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PATCH /api/moderator/inactive-alert  (비활동 색상 변경 설정 저장)
router.patch('/moderator/inactive-alert', requireAuth, async (req, res) => {
    try {
        const { inactiveAlert } = req.body;
        await User.findByIdAndUpdate(req.user._id, { modInactiveAlert: !!inactiveAlert });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + req.user._id.toString()).emit('moderator-inactive-alert', { inactiveAlert: !!inactiveAlert });
        res.json({ success: true, inactiveAlert: !!inactiveAlert });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// DELETE /api/moderator/:id
router.delete('/moderator/:id', requireAuth, async (req, res) => {
    try {
        await Moderator.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + req.user._id.toString()).emit('moderator-update');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── 50레벨 시청자 위젯 ─────────────────────────────────────────────────
// GET /api/level50?userId=xxx  (오버레이 공개 조회)
router.get('/level50', async (req, res) => {
    try {
        const uid = req.query.userId || (req.user && req.user._id);
        if (!uid) return res.json({ success: true, level50Viewers: [], inactiveAlert: false });
        const viewers = await Level50Viewer.find({ userId: uid }).sort({ order: 1, createdAt: 1 });
        const user = await User.findById(uid).select('level50InactiveAlert').lean();
        res.json({ success: true, level50Viewers: viewers, inactiveAlert: user?.level50InactiveAlert === true });
    } catch (e) {
        res.json({ success: true, level50Viewers: [], inactiveAlert: false });
    }
});

// GET /api/level50/list  (인증 - 대시보드)
router.get('/level50/list', requireAuth, async (req, res) => {
    try {
        const viewers = await Level50Viewer.find({ userId: req.user._id }).sort({ order: 1, createdAt: 1 });
        res.json({ success: true, level50Viewers: viewers });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/level50  (추가)
router.post('/level50', requireAuth, async (req, res) => {
    try {
        const { tiktokUniqueId, displayName, profileImg } = req.body;
        if (!tiktokUniqueId || !displayName)
            return res.status(400).json({ success: false, message: 'ID와 닉네임을 입력해주세요.' });
        const count = await Level50Viewer.countDocuments({ userId: req.user._id });
        if (count >= 20)
            return res.status(400).json({ success: false, message: '최대 20명까지 등록 가능합니다.' });
        const viewer = await Level50Viewer.create({
            userId: req.user._id,
            tiktokUniqueId: tiktokUniqueId.trim(),
            displayName: displayName.trim().slice(0, 20),
            profileImg: profileImg || ''
        });
        // 실시간 반영
        const io = req.app.get('io');
        if (io) io.to('overlay-' + req.user._id.toString()).emit('level50-update');
        res.json({ success: true, level50Viewer: viewer });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PATCH /api/level50/:id  (수정)
router.patch('/level50/:id', requireAuth, async (req, res) => {
    try {
        const { displayName, profileImg } = req.body;
        const update = {};
        if (displayName) update.displayName = displayName.trim().slice(0, 20);
        if (profileImg !== undefined) update.profileImg = profileImg;
        await Level50Viewer.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: update });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + req.user._id.toString()).emit('level50-update');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PATCH /api/level50/inactive-alert  (비활동 색상 변경 설정 저장)
router.patch('/level50/inactive-alert', requireAuth, async (req, res) => {
    try {
        const { inactiveAlert } = req.body;
        await User.findByIdAndUpdate(req.user._id, { level50InactiveAlert: !!inactiveAlert });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + req.user._id.toString()).emit('level50-inactive-alert', { inactiveAlert: !!inactiveAlert });
        res.json({ success: true, inactiveAlert: !!inactiveAlert });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// DELETE /api/level50/:id
router.delete('/level50/:id', requireAuth, async (req, res) => {
    try {
        await Level50Viewer.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + req.user._id.toString()).emit('level50-update');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ══════════════════════════════════════════════════
// 실시간 번역 자막 API
// ══════════════════════════════════════════════════

// POST /api/speech/translate  (오버레이에서 호출, 인증 불필요)
// 성능 최적화: system 프롬프트 분리 + max_tokens 축소 + 메모리 캐시
const _translateCache = new Map();
const _TRANSLATE_CACHE_MAX = 300;

router.post('/speech/translate', async (req, res) => {
    try {
        const { text, langs } = req.body;
        if (!text || !langs || !langs.length) {
            return res.json({ success: true, translations: [] });
        }

        const targetLangs = langs.slice(0, 2);
        const trimmed = text.trim();
        const cacheKey = trimmed + '|' + targetLangs.join(',');

        // 캐시 히트 → 즉시 반환
        if (_translateCache.has(cacheKey)) {
            return res.json({ success: true, translations: _translateCache.get(cacheKey) });
        }

        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const langNames = {
            en: 'English', ja: '日本語', zh: '中文(简体)',
            es: 'Español', fr: 'Français', de: 'Deutsch',
            th: 'ภาษาไทย', vi: 'Tiếng Việt', id: 'Bahasa Indonesia'
        };

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a live-stream subtitle translator. ' +
                        'Translate the given text naturally and accurately. ' +
                        'Add 1 relevant emoji at the end only when it fits the mood (skip if neutral/serious). ' +
                        'Keep translations concise and natural — no caps shouting, no excessive punctuation. ' +
                        'Return ONLY a compact JSON array, no explanation, no markdown. ' +
                        'Format: [{"lang":"<code>","text":"<translation>"}]'
                },
                {
                    role: 'user',
                    content: `Translate into ${targetLangs.map(l => (langNames[l] || l) + '(' + l + ')').join(' and ')}:\n${trimmed}`
                }
            ],
            max_tokens: 120,   // 이모지 1개 + 자연스러운 번역 여유
            temperature: 0.2   // 낮출수록 응답 속도 빠르고 일관성 높음
        });

        const raw = completion.choices[0].message.content.trim();
        const match = raw.match(/\[[\s\S]*\]/);
        const translations = match ? JSON.parse(match[0]) : [];

        // LRU 캐시 저장
        if (_translateCache.size >= _TRANSLATE_CACHE_MAX) {
            _translateCache.delete(_translateCache.keys().next().value);
        }
        _translateCache.set(cacheKey, translations);

        res.json({ success: true, translations });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/speech-settings?userId=xxx  (오버레이에서 공개 조회 또는 로그인 유저 조회)
router.get('/speech-settings', async (req, res) => {
    try {
        const userId = req.query.userId || (req.user && req.user._id);
        if (!userId) return res.json({ success: true, langs: ['en'] });
        const user = await User.findById(userId).select('speechLangs').lean();
        res.json({ success: true, langs: (user && user.speechLangs && user.speechLangs.length) ? user.speechLangs : ['en'] });
    } catch (e) {
        res.json({ success: true, langs: ['en'] });
    }
});

// POST /api/speech-settings  (인증 필요)
router.post('/speech-settings', requireAuth, async (req, res) => {
    try {
        const { langs } = req.body;
        if (!Array.isArray(langs)) return res.status(400).json({ success: false, message: '잘못된 요청' });
        const validLangs = ['en','ja','zh','es','fr','de','th','vi','id'];
        const filtered = langs.filter(l => validLangs.includes(l)).slice(0, 2);
        await User.findByIdAndUpdate(req.user._id, { speechLangs: filtered });
        const io = req.app.get('io');
        if (io) io.to('overlay-' + req.user._id.toString()).emit('speech-settings-update', { langs: filtered });
        res.json({ success: true, langs: filtered });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/match-coach-settings (인증 필요)
router.get('/match-coach-settings', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('matchCoachEnabled').lean();
        res.json({ success: true, enabled: user?.matchCoachEnabled !== false }); // 기본값 true
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/match-coach-settings (인증 필요)
router.post('/match-coach-settings', requireAuth, async (req, res) => {
    try {
        const { enabled } = req.body;
        await User.findByIdAndUpdate(req.user._id, { matchCoachEnabled: !!enabled });
        res.json({ success: true, enabled: !!enabled });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/ai-companion-settings (인증 필요)
router.get('/ai-companion-settings', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('aiCompanionEnabled aiCompanionPersonality aiCompanionFrequency aiCompanionName aiCompanionNameVariations aiCompanionTtsEnabled aiCompanionTtsVoice')
            .lean();
        
        console.log('📖 AI 시청자 설정 조회:', {
            userId: req.user._id,
            aiCompanionEnabled: user?.aiCompanionEnabled,
            aiCompanionPersonality: user?.aiCompanionPersonality,
            aiCompanionFrequency: user?.aiCompanionFrequency,
            aiCompanionName: user?.aiCompanionName
        });
        
        res.json({
            success: true,
            aiCompanionEnabled: user?.aiCompanionEnabled !== false,
            aiCompanionPersonality: user?.aiCompanionPersonality || '친근한',
            aiCompanionFrequency: user?.aiCompanionFrequency || '보통',
            aiCompanionName: user?.aiCompanionName || 'TikFind AI',
            aiCompanionNameVariations: user?.aiCompanionNameVariations || { ko: 'TikFind AI', en: 'TikFind AI', ja: 'TikFind AI' },
            aiCompanionTtsEnabled: user?.aiCompanionTtsEnabled !== false,
            aiCompanionTtsVoice: user?.aiCompanionTtsVoice || 'female'
        });
    } catch (e) {
        console.error('❌ AI 시청자 설정 조회 실패:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/ai-companion-settings (인증 필요)
router.post('/ai-companion-settings', requireAuth, async (req, res) => {
    try {
        const { aiCompanionEnabled, aiCompanionPersonality, aiCompanionFrequency, 
                aiCompanionName, aiCompanionTtsEnabled, aiCompanionTtsVoice } = req.body;
        
        const updateData = {};
        if (typeof aiCompanionEnabled === 'boolean') updateData.aiCompanionEnabled = aiCompanionEnabled;
        if (aiCompanionPersonality) updateData.aiCompanionPersonality = aiCompanionPersonality;
        if (aiCompanionFrequency) updateData.aiCompanionFrequency = aiCompanionFrequency;
        
        // AI 닉네임이 변경되면 다국어 번역 생성
        if (aiCompanionName) {
            updateData.aiCompanionName = aiCompanionName;
            
            // OpenAI로 다국어 번역 (비동기로 처리, 실패해도 설정은 저장)
            try {
                const OpenAI = require('openai');
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                
                const translation = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: 'Translate the following name to English and Japanese. Return only JSON format: {"ko": "original", "en": "english", "ja": "japanese"}'
                        },
                        {
                            role: 'user',
                            content: aiCompanionName
                        }
                    ],
                    temperature: 0.3
                });
                
                const translationText = translation.choices[0].message.content.trim();
                const translationData = JSON.parse(translationText);
                updateData.aiCompanionNameVariations = {
                    ko: aiCompanionName,
                    en: translationData.en || aiCompanionName,
                    ja: translationData.ja || aiCompanionName
                };
                console.log('✅ AI 닉네임 다국어 번역 성공:', updateData.aiCompanionNameVariations);
            } catch (e) {
                console.error('⚠️ AI 닉네임 다국어 번역 실패 (기본값 사용):', e.message);
                // 번역 실패시 기본값 사용
                updateData.aiCompanionNameVariations = {
                    ko: aiCompanionName,
                    en: aiCompanionName,
                    ja: aiCompanionName
                };
            }
        }
        
        if (typeof aiCompanionTtsEnabled === 'boolean') updateData.aiCompanionTtsEnabled = aiCompanionTtsEnabled;
        if (aiCompanionTtsVoice) updateData.aiCompanionTtsVoice = aiCompanionTtsVoice;

        console.log('💾 AI 시청자 설정 저장:', updateData);
        const updatedUser = await User.findByIdAndUpdate(req.user._id, updateData, { new: true });
        console.log('✅ AI 시청자 설정 저장 완료:', {
            aiCompanionEnabled: updatedUser.aiCompanionEnabled,
            aiCompanionPersonality: updatedUser.aiCompanionPersonality,
            aiCompanionFrequency: updatedUser.aiCompanionFrequency,
            aiCompanionName: updatedUser.aiCompanionName
        });
        res.json({ success: true });
    } catch (e) {
        console.error('❌ AI 시청자 설정 저장 실패:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/overlay/positions (인증 필요)
router.get('/overlay/positions', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('unifiedOverlayPositions').lean();
        res.json({ success: true, positions: user?.unifiedOverlayPositions || {} });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/overlay/positions (인증 필요)
router.post('/overlay/positions', requireAuth, async (req, res) => {
    try {
        const { positions } = req.body;
        if (!positions || typeof positions !== 'object') {
            return res.status(400).json({ success: false, message: '잘못된 요청' });
        }
        await User.findByIdAndUpdate(req.user._id, { unifiedOverlayPositions: positions });
        res.json({ success: true, positions });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/overlay-positions-public/:userId (인증 불필요 - 오버레이 뷰에서 사용)
router.get('/overlay-positions-public/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('unifiedOverlayPositions').lean();
        res.json({ success: true, positions: user?.unifiedOverlayPositions || {} });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/notices (인증 불필요 - 대시보드 공지사항 조회)
router.get('/notices', async (req, res) => {
    try {
        const notices = await Notice.find({ isVisible: true }).sort({ priority: -1, createdAt: -1 });
        res.json({ success: true, notices });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
