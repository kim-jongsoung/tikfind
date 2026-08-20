const express = require('express');
const path = require('path');
const router = express.Router();

// 인증 체크 미들웨어
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.redirect('/');
    }
    next();
};

// 온보딩 라우트 (인증 필요, 틱톡 ID 없을 때)
router.get('/onboarding', requireAuth, (req, res) => {
    res.render('onboarding', { title: '프로필 설정 - TikFind', user: req.user });
});

// 대시보드 라우트 (인증 필요)
router.get('/dashboard', requireAuth, (req, res) => {
    // 첫 로그인 시 TikTok ID가 없으면 온보딩으로
    if (!req.user.tiktokId) {
        return res.redirect('/onboarding');
    }
    res.render('dashboard/main', { title: '대시보드 - TikFind', user: req.user, upgrade: req.query.upgrade || '' });
});

router.get('/dashboard/live', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard-live-new.html'));
});

router.get('/dashboard/overlay', requireAuth, (req, res) => {
    res.render('dashboard/overlay', { title: '위젯 설정 - TikFind', user: req.user });
});

router.get('/dashboard/overlay-unified', requireAuth, async (req, res) => {
    const user = await req.user.populate('unifiedOverlayPositions');
    res.render('dashboard/overlay-unified', { title: '오버레이 설정 - TikFind', user: req.user });
});

// 오버레이 표시 페이지 (인증 불필요 - OBS에서 접근)
router.get('/overlay/:userId', (req, res) => {
    res.render('overlay-display', { title: 'TikFind Overlay', userId: req.params.userId });
});

// 선물 알림 위젯 (인증 불필요 - OBS 브라우저 소스)
router.get('/overlay/:userId/gift', (req, res) => {
    res.render('overlay-gift', { title: 'TikFind Gift Overlay', userId: req.params.userId });
});

// 모더 위젯 (인증 불필요 - OBS 브라우저 소스)
router.get('/overlay/:userId/moderator', (req, res) => {
    res.render('overlay-moderator', { title: 'TikFind Moderator Overlay', userId: req.params.userId });
});

// 50레벨 시청자 위젯 (인증 불필요 - OBS 브라우저 소스)
router.get('/overlay/:userId/level50', (req, res) => {
    res.render('overlay-level50', { title: 'TikFind Level 50 Viewer Overlay', userId: req.params.userId });
});

// 채팅 그라데이션 위젯 (인증 불필요 - OBS 브라우저 소스)
router.get('/overlay/:userId/chat-gradient', (req, res) => {
    res.render('overlay-chat-gradient', { title: 'TikFind Chat Gradient Overlay', userId: req.params.userId });
});

// 번역 자막 위젯 (인증 불필요 - OBS 브라우저 소스)
router.get('/overlay/:userId/speech', (req, res) => {
    res.render('overlay-speech', { title: 'TikFind Speech Overlay', userId: req.params.userId });
});

// 번역 자막 마이크 컨트롤러 (Chrome에서 열기 - Web Speech API)
router.get('/overlay/:userId/speech-mic', (req, res) => {
    res.render('overlay-speech-mic', { title: 'TikFind 마이크', userId: req.params.userId });
});

// 룰렛 미션 위젯 (인증 불필요 - OBS 브라우저 소스)
router.get('/overlay/:userId/roulette', (req, res) => {
    res.render('overlay-roulette', { title: 'TikFind 룰렛', userId: req.params.userId });
});

// 통합 오버레이 뷰 (인증 불필요 - OBS 브라우저 소스)
router.get('/overlay/:userId/unified', async (req, res) => {
    try {
        const User = require('../models/User');
        const user = await User.findById(req.params.userId).select('overlaySettings speechLangs').lean();
        res.render('overlay-unified', {
            title: 'TikFind Unified Overlay',
            userId: req.params.userId,
            overlaySettings: user?.overlaySettings || {},
            speechLangs: user?.speechLangs || ['en']
        });
    } catch (e) {
        res.status(500).send('Error loading overlay');
    }
});

router.get('/dashboard/billing', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/billing.html'));
});

router.get('/dashboard/history', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/history.html'));
});

router.get('/dashboard/settings', requireAuth, (req, res) => {
    res.render('dashboard/settings', { title: '설정 - TikFind', user: req.user });
});

router.get('/dashboard/report', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/report.html'));
});

router.get('/dashboard/growth', requireAuth, (req, res) => {
    const plan = (req.user.plan || 'free').toLowerCase();
    const isActive = req.user.subscriptionStatus === 'active' || req.user.subscriptionStatus === 'trial';
    if (plan !== 'unlimited' || !isActive) {
        return res.redirect('/dashboard?upgrade=growth');
    }
    res.render('dashboard/growth', { title: '알고리즘 확장 - TikFind', user: req.user });
});

// 라이브 커머스 몰 라우트 (인증 필요)
router.get('/dashboard/mall/setup', requireAuth, (req, res) => {
    res.render('dashboard/mall/setup', { title: '몰 설정 - TikFind', user: req.user });
});

router.get('/dashboard/mall/products', requireAuth, (req, res) => {
    res.render('dashboard/mall/products', { title: '상품 관리 - TikFind', user: req.user });
});

router.get('/dashboard/mall/livesale', requireAuth, (req, res) => {
    res.render('dashboard/mall/livesale', { title: '라이브 판매 설정 - TikFind', user: req.user });
});

router.get('/dashboard/mall/orders', requireAuth, (req, res) => {
    res.render('dashboard/mall/orders', { title: '주문 관리 - TikFind', user: req.user });
});

// 시청자용 주문서 페이지 (인증 불필요)
router.get('/buy', (req, res) => {
    res.render('buy', { title: '주문서 - TikFind' });
});

// 마이페이지 라우트 (인증 필요)
router.get('/mypage', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/mypage.html'));
});

// 설치 가이드 (공개)
router.get('/install-guide', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/install-guide.html'));
});

// 퍼블릭 페이지
router.get('/features', (req, res) => {
    res.render('features', { title: '기능 소개 - TikFind', user: req.user });
});

router.get('/pricing', (req, res) => {
    res.render('pricing', { title: '가격 정책 - TikFind', user: req.user });
});

module.exports = router;
