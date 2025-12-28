const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 세션 설정
app.use(session({
    secret: process.env.SESSION_SECRET || 'tikfind-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24시간
    }
}));

// 뷰 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 라우트
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'TikFind - 홈' 
    });
});

// 404 처리
app.use((req, res) => {
    res.status(404).render('404', { 
        title: '페이지를 찾을 수 없습니다' 
    });
});

// 에러 처리
app.use((err, req, res, next) => {
    console.error('❌ 서버 에러:', err);
    res.status(500).render('error', { 
        title: '서버 오류',
        error: process.env.NODE_ENV === 'development' ? err : {} 
    });
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`🚀 TikFind 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`📍 http://localhost:${PORT}`);
});
