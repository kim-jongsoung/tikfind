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
    res.render('dashboard/main', { title: '대시보드 - TikFind', user: req.user });
});

router.get('/dashboard/live', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard-live-new.html'));
});

router.get('/dashboard/overlay', requireAuth, (req, res) => {
    res.render('dashboard/overlay', { title: '오버레이 설정 - TikFind', user: req.user });
});

// 오버레이 표시 페이지 (인증 불필요 - OBS에서 접근)
router.get('/overlay/:userId', (req, res) => {
    res.render('overlay-display', { title: 'TikFind Overlay', userId: req.params.userId });
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

// 마이페이지 라우트 (인증 필요)
router.get('/mypage', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/mypage.html'));
});

// 퍼블릭 페이지
router.get('/features', (req, res) => {
    res.render('features', { title: '기능 소개 - TikFind', user: req.user });
});

router.get('/pricing', (req, res) => {
    res.render('pricing', { title: '가격 정책 - TikFind', user: req.user });
});

module.exports = router;
