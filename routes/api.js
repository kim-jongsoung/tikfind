const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const User = require('../models/User');

// 인증 체크 미들웨어
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    next();
};

// Desktop App 다운로드
router.get('/download-app', requireAuth, async (req, res) => {
    try {
        const exePath = path.join(__dirname, '../public/downloads/TikFind-Setup.exe');

        // 파일 존재 확인
        if (!fs.existsSync(exePath)) {
            return res.status(404).json({ 
                success: false, 
                message: '설치 파일을 찾을 수 없습니다. 관리자에게 문의하세요.' 
            });
        }

        // 파일 다운로드
        res.download(exePath, 'TikFind-Setup.exe', (err) => {
            if (err) {
                console.error('Desktop App 다운로드 오류:', err);
                if (!res.headersSent) {
                    res.status(500).json({ 
                        success: false, 
                        message: '다운로드 중 오류가 발생했습니다.' 
                    });
                }
            }
        });

    } catch (error) {
        console.error('Desktop App 다운로드 오류:', error);
        res.status(500).json({ success: false, message: '다운로드 중 오류가 발생했습니다.' });
    }
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

// 신청곡 요청 API (제한 적용)
router.post('/song-request', requireAuth, checkSongRequestLimit, async (req, res) => {
    try {
        const { songTitle, artist } = req.body;
        
        // 실제 신청곡 처리 로직
        // TODO: YouTube API 연동 등
        
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
        
        if (!tiktokId || !tiktokId.startsWith('@')) {
            return res.status(400).json({ success: false, message: 'TikTok ID는 @로 시작해야 합니다.' });
        }
        
        req.user.tiktokId = tiktokId;
        await req.user.save();
        
        res.json({ success: true, message: 'TikTok ID가 설정되었습니다.' });
    } catch (error) {
        console.error('TikTok ID 설정 오류:', error);
        res.status(500).json({ success: false, message: 'TikTok ID 설정 중 오류가 발생했습니다.' });
    }
});

// TikTok ID 변경 (설정 페이지에서 - /api/change-tiktok)
router.post('/change-tiktok', requireAuth, async (req, res) => {
    try {
        const { tiktokId } = req.body;
        
        if (!tiktokId) {
            return res.status(400).json({ success: false, message: 'TikTok ID를 입력하세요.' });
        }
        
        // @ 기호 제거
        const cleanTiktokId = tiktokId.replace('@', '').trim();
        
        req.user.tiktokId = cleanTiktokId;
        
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

// TikTok ID 변경 (온보딩에서 - /api/update-tiktok)
router.post('/update-tiktok', requireAuth, async (req, res) => {
    try {
        const { tiktokId } = req.body;
        
        if (!tiktokId || !tiktokId.startsWith('@')) {
            return res.status(400).json({ success: false, message: 'TikTok ID는 @로 시작해야 합니다.' });
        }
        
        req.user.tiktokId = tiktokId;
        
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

module.exports = router;
