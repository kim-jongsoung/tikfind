const express = require('express');
const passport = require('passport');
const router = express.Router();

console.log('🔍 Auth Routes 모듈 로드됨');

// Desktop App 전용 Google OAuth
router.get('/google/desktop', (req, res, next) => {
    const fs = require('fs');
    const logMsg = `[${new Date().toISOString()}] 🖥️ Desktop App Google OAuth 시작 - 세션 ID: ${req.sessionID}\n`;
    fs.appendFileSync('auth-debug.log', logMsg);
    
    console.log('🖥️ Desktop App Google OAuth 시작');
    console.log('📋 세션 ID:', req.sessionID);
    req.session.isDesktopLogin = true;
    
    // 세션 저장 강제
    req.session.save((err) => {
        if (err) {
            console.error('❌ 세션 저장 오류:', err);
            fs.appendFileSync('auth-debug.log', `[${new Date().toISOString()}] ❌ 세션 저장 오류: ${err}\n`);
        } else {
            console.log('✅ 세션 저장 완료 - isDesktopLogin:', req.session.isDesktopLogin);
            fs.appendFileSync('auth-debug.log', `[${new Date().toISOString()}] ✅ 세션 저장 완료 - isDesktopLogin: ${req.session.isDesktopLogin}\n`);
        }
        next();
    });
}, passport.authenticate('google', { 
    scope: ['profile', 'email']
    // 기존 콜백 URL 사용 (Google Cloud Console에 등록된 URL)
}));

// 웹 브라우저용 Google OAuth
router.get('/google', (req, res, next) => {
    console.log('🚀 /auth/google 라우트 실행됨');
    next();
}, passport.authenticate('google', { 
    scope: ['profile', 'email']
}));

router.get('/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/' 
    }),
    async (req, res) => {
        const fs = require('fs');
        const logMsg = `[${new Date().toISOString()}] ✅ 로그인 성공: ${req.user?.email} - 세션 ID: ${req.sessionID} - Desktop 플래그: ${req.session.isDesktopLogin}\n`;
        fs.appendFileSync('auth-debug.log', logMsg);
        
        console.log('✅ 로그인 성공:', req.user?.email);
        console.log('📋 세션 ID (콜백):', req.sessionID);
        console.log('📋 온보딩 완료 여부:', req.user?.isSetupComplete);
        console.log('🔍 세션 Desktop 플래그:', req.session.isDesktopLogin);
        console.log('🔍 전체 세션:', JSON.stringify(req.session));
        
        // 시간대 및 언어 자동 감지 및 저장 (쿼리 파라미터에서)
        if (req.user) {
            try {
                const User = require('../models/User');
                const updateData = {};
                
                // 시간대 저장 (없거나 UTC인 경우)
                if (req.query.timezone && (!req.user.timezone || req.user.timezone === 'UTC')) {
                    updateData.timezone = req.query.timezone;
                    console.log('🌍 시간대 저장:', req.query.timezone, '(사용자:', req.user.email, ')');
                }
                
                // 언어 저장 (없는 경우에만)
                if (req.query.language && !req.user.preferredLanguage) {
                    updateData.preferredLanguage = req.query.language;
                    console.log('🌐 언어 저장:', req.query.language, '(사용자:', req.user.email, ')');
                }
                
                // 업데이트할 데이터가 있으면 저장
                if (Object.keys(updateData).length > 0) {
                    await User.findByIdAndUpdate(req.user._id, updateData);
                }
            } catch (error) {
                console.error('❌ 시간대/언어 저장 실패:', error);
            }
        }
        
        // Desktop App에서 로그인한 경우 (세션 플래그 확인)
        const isDesktopApp = req.session.isDesktopLogin === true;
        fs.appendFileSync('auth-debug.log', `[${new Date().toISOString()}] isDesktopApp: ${isDesktopApp}\n`);
        
        if (isDesktopApp) {
            console.log('🖥️ Desktop App 로그인 감지 - 사용자 정보 전달');
            // 세션 플래그 제거
            delete req.session.isDesktopLogin;
            
            // 사용자 정보를 포함한 HTML 페이지 반환
            const userData = {
                userId: req.user._id.toString(),
                email: req.user.email,
                tiktokId: req.user.tiktokId || '',
                nickname: req.user.nickname || req.user.email.split('@')[0],
                subscriptionStatus: req.user.subscriptionStatus || 'free'
            };
            
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>로그인 완료</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                        }
                        .message {
                            text-align: center;
                            padding: 40px;
                            background: rgba(255, 255, 255, 0.1);
                            border-radius: 20px;
                            backdrop-filter: blur(10px);
                        }
                        .spinner {
                            border: 4px solid rgba(255, 255, 255, 0.3);
                            border-top: 4px solid white;
                            border-radius: 50%;
                            width: 40px;
                            height: 40px;
                            animation: spin 1s linear infinite;
                            margin: 20px auto;
                        }
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                </head>
                <body>
                    <div class="message">
                        <h2>✅ 로그인 완료!</h2>
                        <div class="spinner"></div>
                        <p>Desktop App으로 돌아가는 중...</p>
                        <p style="font-size: 12px; opacity: 0.7;">${userData.email}</p>
                    </div>
                    <script>
                        const userData = ${JSON.stringify(userData)};
                        console.log('📤 사용자 정보 전달:', userData);
                        
                        // Electron IPC로 데이터 전달 시도
                        if (window.electronAPI) {
                            window.electronAPI.sendUserData(userData);
                        }
                        
                        // 1초 후 자동 닫기
                        setTimeout(() => {
                            window.close();
                        }, 1500);
                    </script>
                </body>
                </html>
            `);
        }
        
        // 웹 브라우저에서 로그인한 경우 - 바로 대시보드로
        console.log('🔄 대시보드로 리다이렉트');
        console.log('👤 로그인 사용자:', req.user.email);
        res.redirect('/dashboard');
    }
);

router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('❌ Logout Error:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.redirect('/');
    });
});

router.get('/current_user', (req, res) => {
    if (req.user) {
        res.json({
            success: true,
            user: {
                id: req.user._id,
                email: req.user.email,
                nickname: req.user.nickname,
                profileImage: req.user.profileImage,
                plan: req.user.plan,
                tiktokId: req.user.tiktokId,
                isSetupComplete: req.user.isSetupComplete,
                authProvider: req.user.authProvider
            }
        });
    } else {
        res.json({
            success: false,
            user: null
        });
    }
});

module.exports = router;
