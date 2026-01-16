const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const User = require('../models/User');
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

// Desktop App 다운로드 - GitHub Releases로 리디렉션
router.get('/download-app', requireAuth, async (req, res) => {
    try {
        // latest.yml에서 최신 버전 정보 가져오기
        const latestYmlPath = path.join(__dirname, '../public/updates/latest.yml');
        
        if (fs.existsSync(latestYmlPath)) {
            const yaml = require('js-yaml');
            const latestYml = yaml.load(fs.readFileSync(latestYmlPath, 'utf8'));
            const downloadUrl = latestYml.files[0].url;
            
            // GitHub Releases로 리디렉션
            return res.redirect(downloadUrl);
        }
        
        // latest.yml이 없으면 기본 URL로 리디렉션
        return res.redirect('https://github.com/kim-jongsoung/tikfind/releases/latest');

    } catch (error) {
        console.error('Desktop App 다운로드 오류:', error);
        // 오류 발생 시에도 GitHub Releases로 리디렉션
        res.redirect('https://github.com/kim-jongsoung/tikfind/releases/latest');
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

router.post('/youtube/stream', async (req, res) => {
    try {
        const { videoId } = req.body;
        
        if (!videoId) {
            return res.status(400).json({ 
                success: false, 
                message: 'videoId가 필요합니다.' 
            });
        }
        
        console.log('🎵 YouTube 스트림 URL 추출 시작:', videoId);
        
        // YouTube 비디오 정보 가져오기 (옵션 추가로 안정성 개선)
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const info = await ytdl.getInfo(videoUrl, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive'
                }
            }
        });
        
        console.log('📊 사용 가능한 포맷 수:', info.formats.length);
        
        // 비디오+오디오 포맷 우선 선택 (재생 가능성 높음)
        const videoFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        
        console.log('🎬 비디오+오디오 포맷:', videoFormats.length);
        console.log('🎵 오디오 전용 포맷:', audioFormats.length);
        
        // 포맷 선택 로직 개선 - 여러 품질 시도
        let selectedFormat = null;
        if (videoFormats.length > 0) {
            // 낮은 품질부터 시도 (안정성 우선)
            const qualities = ['144p', '240p', '360p', '480p'];
            for (const quality of qualities) {
                selectedFormat = videoFormats.find(f => f.qualityLabel === quality);
                if (selectedFormat) break;
            }
            // 찾지 못하면 첫 번째 포맷 사용
            if (!selectedFormat) selectedFormat = videoFormats[0];
        } else if (audioFormats.length > 0) {
            // 오디오 포맷 중 가장 낮은 품질 선택 (안정성)
            selectedFormat = audioFormats.sort((a, b) => 
                (a.audioBitrate || 0) - (b.audioBitrate || 0)
            )[0];
        } else {
            // 마지막 수단: 모든 포맷 중 첫 번째
            selectedFormat = info.formats.find(f => f.url);
        }
        
        if (!selectedFormat || !selectedFormat.url) {
            console.log('❌ 재생 가능한 포맷을 찾을 수 없음');
            return res.status(404).json({ 
                success: false, 
                message: '재생 가능한 포맷을 찾을 수 없습니다.' 
            });
        }
        
        console.log('✅ YouTube 스트림 URL 추출 성공');
        console.log('📺 선택된 포맷:', selectedFormat.qualityLabel || 'audio', selectedFormat.container);
        
        res.json({
            success: true,
            streamUrl: selectedFormat.url,
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

// 장르별 랜덤 곡 가져오기
router.post('/popular-songs/random', async (req, res) => {
    try {
        const { genre, count = 20 } = req.body;
        const PopularSong = require('../models/PopularSong');
        
        const query = { isActive: true };
        if (genre && genre !== 'all') {
            query.genre = genre;
        }
        
        // 랜덤으로 곡 선택
        const songs = await PopularSong.aggregate([
            { $match: query },
            { $sample: { size: parseInt(count) } }
        ]);
        
        res.json({
            success: true,
            songs: songs.map(song => ({
                id: song._id,
                videoId: song.videoId,
                title: song.title,
                artist: song.artist,
                thumbnail: song.thumbnail,
                genre: song.genre
            }))
        });
    } catch (error) {
        console.error('❌ 랜덤 곡 조회 오류:', error);
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
        
        console.log('🎵 신청곡 검색:', title, artist || '');
        
        const songRequestService = new SongRequestService();
        const song = await songRequestService.searchSong(title, artist || '');
        
        if (song) {
            console.log('✅ 곡 찾음:', song.videoId);
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
            console.log('❌ 곡을 찾을 수 없음');
            res.json({
                success: false,
                message: '곡을 찾을 수 없습니다.'
            });
        }
    } catch (error) {
        console.error('❌ 신청곡 검색 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '신청곡 검색 실패',
            error: error.message
        });
    }
});

module.exports = router;
