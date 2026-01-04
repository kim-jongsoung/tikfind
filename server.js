require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('./config/passport');
const connectDB = require('./config/db');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const TikTokLiveService = require('./services/TikTokLiveService');
const authRoutes = require('./routes/auth');
const viewRoutes = require('./routes/viewRoutes');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3001;

// TikTok Live 연결 관리
const liveConnections = new Map();

// AI 발음 코치 캐시 시스템
const pronunciationCache = new Map();
const MAX_CACHE_SIZE = 10000; // 최대 10,000개 캐시

// 자주 사용되는 인사말 미리 준비
const commonPhrases = {
    // 영어 인사말
    'hello': { originalMeaning: '안녕', response: 'Nice to meet you!', responseMeaning: '만나서 반가워요', pronunciation: '나이스 투 밋 유' },
    'hi': { originalMeaning: '안녕', response: 'Hello there!', responseMeaning: '안녕하세요', pronunciation: '헬로우 데어' },
    'hey': { originalMeaning: '안녕', response: 'Hey! How are you?', responseMeaning: '안녕! 어떻게 지내?', pronunciation: '헤이 하우 아 유' },
    'good morning': { originalMeaning: '좋은 아침', response: 'Good morning!', responseMeaning: '좋은 아침이에요', pronunciation: '굿 모닝' },
    'good night': { originalMeaning: '잘자', response: 'Good night!', responseMeaning: '잘 자요', pronunciation: '굿 나잇' },
    'thank you': { originalMeaning: '감사합니다', response: 'You\'re welcome!', responseMeaning: '천만에요', pronunciation: '유어 웰컴' },
    'thanks': { originalMeaning: '고마워', response: 'No problem!', responseMeaning: '별말씀을요', pronunciation: '노 프라블럼' },
    'bye': { originalMeaning: '안녕', response: 'See you later!', responseMeaning: '나중에 봐요', pronunciation: '씨 유 레이터' },
    'goodbye': { originalMeaning: '안녕히 가세요', response: 'Take care!', responseMeaning: '조심히 가요', pronunciation: '테이크 케어' },
    'i love you': { originalMeaning: '사랑해', response: 'I love you too!', responseMeaning: '나도 사랑해', pronunciation: '아이 러브 유 투' },
    'love you': { originalMeaning: '사랑해', response: 'Love you too!', responseMeaning: '나도 사랑해', pronunciation: '러브 유 투' },
    'how are you': { originalMeaning: '어떻게 지내?', response: 'I\'m doing great!', responseMeaning: '잘 지내요', pronunciation: '아임 두잉 그레잇' },
    'nice': { originalMeaning: '좋아', response: 'Thank you!', responseMeaning: '고마워요', pronunciation: '땡큐' },
    'cool': { originalMeaning: '멋져', response: 'Thanks!', responseMeaning: '고마워', pronunciation: '땡스' },
    'wow': { originalMeaning: '와', response: 'Amazing, right?', responseMeaning: '놀랍죠?', pronunciation: '어메이징 라잇' },
    
    // 일본어 인사말
    'こんにちは': { originalMeaning: '안녕하세요', response: 'はじめまして', responseMeaning: '처음 뵙겠습니다', pronunciation: '하지메마시테' },
    'ありがとう': { originalMeaning: '고마워요', response: 'どういたしまして', responseMeaning: '천만에요', pronunciation: '도이타시마시테' },
    'おはよう': { originalMeaning: '좋은 아침', response: 'おはようございます', responseMeaning: '좋은 아침이에요', pronunciation: '오하요 고자이마스' },
    'おやすみ': { originalMeaning: '잘자', response: 'おやすみなさい', responseMeaning: '잘 자요', pronunciation: '오야스미 나사이' },
    'さようなら': { originalMeaning: '안녕히 가세요', response: 'またね', responseMeaning: '또 봐요', pronunciation: '마타네' },
    'すごい': { originalMeaning: '대단해', response: 'ありがとう', responseMeaning: '고마워요', pronunciation: '아리가토' },
    'かわいい': { originalMeaning: '귀여워', response: 'ありがとう', responseMeaning: '고마워요', pronunciation: '아리가토' },
    
    // 중국어 인사말
    '你好': { originalMeaning: '안녕하세요', response: '你好', responseMeaning: '안녕하세요', pronunciation: '니하오' },
    '谢谢': { originalMeaning: '감사합니다', response: '不客气', responseMeaning: '천만에요', pronunciation: '부커치' },
    '早上好': { originalMeaning: '좋은 아침', response: '早上好', responseMeaning: '좋은 아침이에요', pronunciation: '자오상하오' },
    '晚安': { originalMeaning: '잘자', response: '晚安', responseMeaning: '잘 자요', pronunciation: '완안' },
    '再见': { originalMeaning: '안녕히 가세요', response: '再见', responseMeaning: '안녕히 가세요', pronunciation: '짜이지엔' },
    
    // 스페인어 인사말
    'hola': { originalMeaning: '안녕', response: '¡Hola!', responseMeaning: '안녕하세요', pronunciation: '올라' },
    'gracias': { originalMeaning: '감사합니다', response: 'De nada', responseMeaning: '천만에요', pronunciation: '데 나다' },
    'buenos días': { originalMeaning: '좋은 아침', response: 'Buenos días', responseMeaning: '좋은 아침이에요', pronunciation: '부에노스 디아스' },
    'buenas noches': { originalMeaning: '잘자', response: 'Buenas noches', responseMeaning: '잘 자요', pronunciation: '부에나스 노체스' },
    'adiós': { originalMeaning: '안녕히 가세요', response: 'Hasta luego', responseMeaning: '나중에 봐요', pronunciation: '아스타 루에고' },
    
    // 프랑스어 인사말
    'bonjour': { originalMeaning: '안녕하세요', response: 'Bonjour!', responseMeaning: '안녕하세요', pronunciation: '봉주르' },
    'merci': { originalMeaning: '감사합니다', response: 'De rien', responseMeaning: '천만에요', pronunciation: '드 리앙' },
    'bonsoir': { originalMeaning: '좋은 저녁', response: 'Bonsoir', responseMeaning: '좋은 저녁이에요', pronunciation: '봉수아르' },
    'au revoir': { originalMeaning: '안녕히 가세요', response: 'À bientôt', responseMeaning: '곧 봐요', pronunciation: '아 비앙토' },
    
    // 독일어 인사말
    'hallo': { originalMeaning: '안녕', response: 'Hallo!', responseMeaning: '안녕하세요', pronunciation: '할로' },
    'danke': { originalMeaning: '감사합니다', response: 'Bitte', responseMeaning: '천만에요', pronunciation: '비테' },
    'guten morgen': { originalMeaning: '좋은 아침', response: 'Guten Morgen', responseMeaning: '좋은 아침이에요', pronunciation: '구텐 모르겐' },
    'gute nacht': { originalMeaning: '잘자', response: 'Gute Nacht', responseMeaning: '잘 자요', pronunciation: '구테 나흐트' },
    
    // 러시아어 인사말
    'привет': { originalMeaning: '안녕', response: 'Привет!', responseMeaning: '안녕하세요', pronunciation: '프리베트' },
    'спасибо': { originalMeaning: '감사합니다', response: 'Пожалуйста', responseMeaning: '천만에요', pronunciation: '파잘루스타' },
    
    // 태국어 인사말
    'สวัสดี': { originalMeaning: '안녕하세요', response: 'สวัสดี', responseMeaning: '안녕하세요', pronunciation: '사왓디' },
    'ขอบคุณ': { originalMeaning: '감사합니다', response: 'ไม่เป็นไร', responseMeaning: '천만에요', pronunciation: '마이펜라이' },
    
    // 베트남어 인사말
    'xin chào': { originalMeaning: '안녕하세요', response: 'Xin chào!', responseMeaning: '안녕하세요', pronunciation: '신 짜오' },
    'cảm ơn': { originalMeaning: '감사합니다', response: 'Không có gì', responseMeaning: '천만에요', pronunciation: '콩 꼬 지' }
};

console.log(`✅ AI 발음 코치 캐시 시스템 초기화 (일반 인사말 ${Object.keys(commonPhrases).length}개 준비)`);

connectDB();

// CORS 설정 (Desktop App 지원)
const allowedOrigins = [
    'http://localhost:3001',
    process.env.FRONTEND_URL // 프로덕션 도메인 (예: https://tikfind.com)
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Desktop App (origin이 없는 경우) 또는 허용된 도메인
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // 개발 중에는 모두 허용
        }
    },
    credentials: true // 쿠키 전달 허용
}));

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 세션 설정
const isProduction = process.env.NODE_ENV === 'production';

app.use(session({
    secret: process.env.SESSION_SECRET || 'tikfind-secret-key',
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URL,
        touchAfter: 24 * 3600
    }),
    cookie: { 
        secure: false, // HTTPS 없이도 쿠키 전송 허용
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

// Passport 초기화
app.use(passport.initialize());
app.use(passport.session());

// 뷰 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 인증 라우트
app.use('/auth', authRoutes);
console.log('✅ Auth Routes 연결됨: /auth/google, /auth/google/callback, /auth/logout');

// API 라우트
app.use('/api', apiRoutes);
console.log('✅ API Routes 연결됨: /api/download-app, /api/user/plan 등');

// 업데이트 라우트
const updateRoutes = require('./routes/updates');
app.use('/updates', updateRoutes);
console.log('✅ Update Routes 연결됨: /updates/latest.yml');

// Desktop App 메인 화면 라우트
app.get('/desktop-main', (req, res) => {
    res.sendFile(path.join(__dirname, 'tikfind-desktop', 'renderer', 'index.html'));
});

// 뷰 라우트
app.use('/', viewRoutes);
console.log('✅ View Routes 연결됨: /dashboard, /dashboard/live, /dashboard/ai 등');

// 관리자 라우트
const adminAuthRoutes = require('./routes/adminAuth');
const adminRoutes = require('./routes/admin');
const adminViewRoutes = require('./routes/adminViews');
app.use('/admin/auth', adminAuthRoutes);
app.use('/admin/api', adminRoutes);
app.use('/admin', adminViewRoutes);
console.log('✅ Admin Routes 연결됨: /admin/login, /admin/dashboard, /admin/api/users, /admin/api/stats 등');

// 메인 라우트
app.get('/', (req, res) => {
    res.render('index', { title: 'TikFind - 글로벌 틱톡커를 위한 AI 라이브 스트리밍 어시스턴트', user: req.user });
});

app.get('/onboarding', (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'onboarding.html'));
});

app.get('/api/current_user', (req, res) => {
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
                streamerPersona: req.user.streamerPersona || '',
                isSetupComplete: req.user.isSetupComplete,
                authProvider: req.user.authProvider,
                preferredLanguage: req.user.preferredLanguage || 'ko',
                isAdmin: req.user.isAdmin || false,
                role: req.user.role || 'user'
            }
        });
    } else {
        res.json({
            success: false,
            user: null
        });
    }
});

app.post('/api/update-language', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    
    try {
        const { language } = req.body;
        const validLanguages = ['ko', 'en', 'ja', 'es', 'zh-TW', 'vi', 'th'];
        
        if (!language || !validLanguages.includes(language)) {
            return res.status(400).json({ success: false, message: '유효하지 않은 언어입니다.' });
        }
        
        const User = require('./models/User');
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }
        
        user.preferredLanguage = language;
        await user.save();
        
        res.json({ success: true, message: '언어 설정이 저장되었습니다.' });
    } catch (error) {
        console.error('❌ 언어 설정 오류:', error);
        res.status(500).json({ success: false, message: '언어 설정 중 오류가 발생했습니다.' });
    }
});

// YouTube 검색 API
app.post('/api/youtube/search', async (req, res) => {
    try {
        const { title, artist } = req.body;
        
        if (!title || !artist) {
            return res.json({ success: false, message: '노래 제목과 가수를 입력해주세요' });
        }
        
        const SongRequestService = require('./services/SongRequestService');
        const songService = new SongRequestService();
        
        const result = await songService.searchYouTube(title, artist);
        
        if (result && result.videoId) {
            res.json({
                success: true,
                videoId: result.videoId,
                url: result.url,
                thumbnail: result.thumbnail
            });
        } else {
            res.json({
                success: false,
                message: 'YouTube에서 노래를 찾을 수 없습니다'
            });
        }
    } catch (error) {
        console.error('❌ YouTube 검색 오류:', error);
        res.json({
            success: false,
            message: 'YouTube 검색 중 오류가 발생했습니다'
        });
    }
});

// User ID로 사용자 정보 조회 (TikTok ID 가져오기)
app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.json({ success: false, message: 'User ID가 필요합니다' });
        }
        
        const User = require('./models/User');
        const user = await User.findById(userId);
        
        if (!user) {
            return res.json({ success: false, message: '사용자를 찾을 수 없습니다' });
        }
        
        // 플랜별 제한 설정
        const planLimits = {
            free: { aiCoach: 10, songRequest: 5, gptAi: 3 },
            trial: { aiCoach: 100, songRequest: 50, gptAi: 30 },
            active: { aiCoach: -1, songRequest: -1, gptAi: -1 } // 무제한
        };
        
        const userPlan = user.subscriptionStatus || 'free';
        const limits = planLimits[userPlan];
        
        // 오늘 사용량 계산
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dailyUsage = user.dailyUsage || {};
        const todayKey = today.toISOString().split('T')[0];
        const todayUsage = dailyUsage[todayKey] || { aiCoach: 0, songRequest: 0, gptAi: 0 };
        
        res.json({
            success: true,
            user: {
                id: user._id,
                nickname: user.nickname,
                tiktokId: user.tiktokId,
                streamerPersona: user.streamerPersona || '',
                preferredLanguage: user.preferredLanguage || 'ko',
                plan: userPlan,
                planName: userPlan === 'free' ? 'Free' : userPlan === 'trial' ? 'UNIVERSE' : 'UNLIMITED',
                limits: limits,
                usage: todayUsage
            }
        });
    } catch (error) {
        console.error('❌ 사용자 조회 오류:', error);
        res.json({
            success: false,
            message: '사용자 조회 중 오류가 발생했습니다'
        });
    }
});

// AI 발음 코치 API (캐싱 적용)
app.post('/api/ai/pronunciation', async (req, res) => {
    try {
        const { message, targetLanguage, streamerNickname, streamerPersona, viewerUsername } = req.body;
        
        if (!message || !targetLanguage) {
            return res.json({ success: false, message: '메시지와 언어를 입력해주세요' });
        }
        
        // 캐시 키 생성 (메시지 + 언어)
        const cacheKey = `${message.toLowerCase().trim()}_${targetLanguage}`;
        
        // 1단계: 일반 인사말 확인 (즉시 반환, 무료)
        const commonPhrase = commonPhrases[message.toLowerCase().trim()];
        if (commonPhrase) {
            console.log(`✅ 일반 인사말 즉시 반환: "${message}" (무료, 0ms)`);
            return res.json({
                success: true,
                ...commonPhrase,
                cached: true,
                cacheType: 'common'
            });
        }
        
        // 2단계: 캐시 확인 (빠른 반환, 무료)
        if (pronunciationCache.has(cacheKey)) {
            console.log(`✅ 캐시에서 반환: "${message}" (무료, ~10ms)`);
            return res.json({
                success: true,
                ...pronunciationCache.get(cacheKey),
                cached: true,
                cacheType: 'memory'
            });
        }
        
        // 3단계: OpenAI API 호출 (새로운 메시지)
        console.log(`🔄 OpenAI API 호출: "${message}" (유료, ~2초)`);
        const AiPronunciationService = require('./services/AiPronunciationService');
        const aiService = new AiPronunciationService();
        
        const result = await aiService.generatePronunciationCoach(
            message,
            targetLanguage,
            streamerNickname || 'Streamer',
            streamerPersona || '친근하고 활발한 스트리머',
            viewerUsername || 'Viewer'
        );
        
        if (result) {
            // 캐시에 저장 (최대 10,000개)
            if (pronunciationCache.size < MAX_CACHE_SIZE) {
                pronunciationCache.set(cacheKey, {
                    originalMeaning: result.originalMeaning,
                    response: result.response,
                    responseMeaning: result.responseMeaning,
                    pronunciation: result.pronunciation
                });
                console.log(`💾 캐시 저장: "${message}" (총 ${pronunciationCache.size}개)`);
            } else {
                // 캐시가 가득 찬 경우 가장 오래된 항목 삭제 (LRU)
                const firstKey = pronunciationCache.keys().next().value;
                pronunciationCache.delete(firstKey);
                pronunciationCache.set(cacheKey, {
                    originalMeaning: result.originalMeaning,
                    response: result.response,
                    responseMeaning: result.responseMeaning,
                    pronunciation: result.pronunciation
                });
                console.log(`💾 캐시 저장 (LRU): "${message}"`);
            }
            
            res.json({
                success: true,
                originalMeaning: result.originalMeaning,
                response: result.response,
                responseMeaning: result.responseMeaning,
                pronunciation: result.pronunciation,
                cached: false
            });
        } else {
            res.json({
                success: false,
                message: 'AI 발음 코치 생성 중 오류가 발생했습니다'
            });
        }
    } catch (error) {
        console.error('❌ AI 발음 코치 오류:', error);
        res.json({
            success: false,
            message: 'AI 발음 코치 생성 중 오류가 발생했습니다'
        });
    }
});

app.post('/api/update-profile', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    
    try {
        const { nickname, tiktokId, streamerPersona } = req.body;
        
        const User = require('./models/User');
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }
        
        // 선택적으로 업데이트
        if (nickname !== undefined && nickname.trim() !== '') {
            user.nickname = nickname.trim();
        }
        
        if (tiktokId !== undefined && tiktokId.trim() !== '') {
            user.tiktokId = tiktokId.trim();
        }
        
        if (streamerPersona !== undefined) {
            user.streamerPersona = streamerPersona.trim();
        }
        
        await user.save();
        
        res.json({ success: true, message: '프로필이 성공적으로 업데이트되었습니다.' });
    } catch (error) {
        console.error('❌ 프로필 업데이트 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// AI 어시스턴트 API
app.post('/api/ai-assistant', async (req, res) => {
    try {
        const { question, history } = req.body;
        
        if (!question || question.trim() === '') {
            return res.json({ success: false, message: '질문을 입력해주세요.' });
        }
        
        // OpenAI API 호출
        const axios = require('axios');
        const messages = [
            {
                role: 'system',
                content: '당신은 TikTok 라이브 스트리머를 돕는 친절한 AI 어시스턴트입니다. 방송 중 궁금한 것을 간단명료하게 답변해주세요. 답변은 2-3문장 이내로 짧게 해주세요.'
            }
        ];
        
        // 대화 히스토리 추가 (최근 10개)
        if (history && Array.isArray(history)) {
            history.slice(-10).forEach(msg => {
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            });
        }
        
        // 현재 질문 추가
        messages.push({
            role: 'user',
            content: question
        });
        
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: messages,
                max_tokens: 200,
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const answer = response.data.choices[0].message.content.trim();
        
        res.json({
            success: true,
            answer: answer
        });
        
    } catch (error) {
        console.error('❌ AI 어시스턴트 오류:', error);
        res.json({
            success: false,
            message: 'AI 어시스턴트 오류가 발생했습니다.'
        });
    }
});

app.post('/api/setup-tiktok', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    
    try {
        const { tiktokId } = req.body;
        
        if (!tiktokId || tiktokId.trim() === '') {
            return res.status(400).json({ success: false, message: '틱톡 ID를 입력해주세요.' });
        }
        
        const User = require('./models/User');
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }
        
        user.tiktokId = tiktokId.trim();
        await user.save();
        
        res.json({ success: true, message: '틱톡 ID가 성공적으로 등록되었습니다.' });
    } catch (error) {
        console.error('❌ TikTok ID 설정 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// Desktop App 전용 - User ID로 사용자 정보 가져오기
app.get('/api/user/:userId', async (req, res) => {
    try {
        const User = require('./models/User');
        const user = await User.findById(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }
        
        // Desktop App에 필요한 정보만 반환
        res.json({
            success: true,
            userId: user._id.toString(),
            email: user.email,
            tiktokId: user.tiktokId || '',
            nickname: user.nickname || user.email.split('@')[0],
            subscriptionStatus: user.subscriptionStatus || 'free'
        });
    } catch (error) {
        console.error('❌ 사용자 정보 조회 오류:', error);
        res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
});

// Desktop App 전용 - 사용자 정보 가져오기 (세션 기반)
app.get('/api/desktop/user-info', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    
    try {
        const User = require('./models/User');
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }
        
        // Desktop App에 필요한 정보만 반환
        res.json({
            success: true,
            userId: user._id.toString(),
            email: user.email,
            tiktokId: user.tiktokId || '',
            nickname: user.nickname || user.email.split('@')[0],
            subscriptionStatus: user.subscriptionStatus || 'free'
        });
    } catch (error) {
        console.error('❌ 사용자 정보 조회 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// TikTok 연결 해제
app.post('/api/disconnect-tiktok', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    
    try {
        const User = require('./models/User');
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }
        
        user.tiktokId = '';
        await user.save();
        
        res.json({ success: true, message: 'TikTok 계정 연결이 해제되었습니다.' });
    } catch (error) {
        console.error('❌ TikTok 연결 해제 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// ==================== Python Collector API ====================
const AIService = require('./services/AIService');
const PronunciationCoachService = require('./services/PronunciationCoachService');
const SongRequestService = require('./services/SongRequestService');
const { checkSubscription, checkAdmin, checkHWID, checkUsageLimit } = require('./middleware/checkSubscription');

const aiService = new AIService();
const pronunciationCoach = new PronunciationCoachService();
const songRequestService = new SongRequestService();

// Live 상태 업데이트
app.post('/api/live/status', checkSubscription, async (req, res) => {
    try {
        const { userId, username, isLive, timestamp } = req.body;
        
        console.log(`📡 Live 상태: ${username} - ${isLive ? '방송 중' : '종료'}`);
        
        // Socket.io로 상태 전송
        io.to(userId).emit('live-status', {
            isLive,
            username,
            timestamp
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Live 상태 업데이트 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 채팅 메시지 수신 (TTS 무료 서비스 - 구독 확인 없음)
app.post('/api/live/chat', async (req, res) => {
    try {
        const { userId, username, message, timestamp, uniqueId, badges } = req.body;
        
        console.log(`💬 [${username}]: ${message} (userId: ${userId})`);
        
        // 사용자 정보 가져오기
        const User = require('./models/User');
        const user = await User.findById(userId);
        const streamerLanguage = user?.preferredLanguage || 'ko';
        
        // 구독 상태 확인 (유료 기능용)
        const hasSubscription = user && ['trial', 'active'].includes(user.subscriptionStatus);
        
        // 1. 언어 감지
        const messageLanguage = await pronunciationCoach.detectLanguage(message);
        
        // 2. AI 발음 코치 (유료 기능 - 구독 필요)
        let pronunciationGuide = null;
        if (hasSubscription && messageLanguage !== streamerLanguage) {
            // 빠른 응답 먼저 확인
            pronunciationGuide = pronunciationCoach.getQuickResponse(message, messageLanguage, streamerLanguage);
            
            // 없으면 AI로 생성
            if (!pronunciationGuide) {
                pronunciationGuide = await pronunciationCoach.generatePronunciationGuide(
                    message, 
                    messageLanguage, 
                    streamerLanguage
                );
            }
        }
        
        // 3. 신청곡 파싱 (유료 기능 - 구독 필요)
        const songData = songRequestService.parseSongRequest(message);
        let songRequest = null;
        
        if (hasSubscription && songData) {
            const requesterInfo = {
                username: username,
                uniqueId: uniqueId || username,
                badges: badges || [],
                isVIP: false, // 나중에 구현
                level: 1 // 나중에 구현
            };
            
            const result = await songRequestService.addSongRequest(userId, songData, requesterInfo);
            if (result.success) {
                songRequest = result.song;
                
                // 신청곡 큐 업데이트 전송
                io.to(userId).emit('song-queue-update', {
                    queue: songRequestService.getQueue(userId)
                });
            }
        }
        
        // 4. Socket.io로 전송
        io.to(userId).emit('chat-message', {
            username,
            message,
            messageLanguage,
            pronunciationGuide,
            songRequest,
            timestamp: timestamp || Date.now()
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ 채팅 메시지 처리 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 시청자 수 업데이트 (무료 서비스)
app.post('/api/live/viewers', async (req, res) => {
    try {
        const { userId, viewerCount } = req.body;
        
        console.log(`👥 시청자 수: ${viewerCount} (userId: ${userId})`);
        
        io.to(userId).emit('viewer-update', {
            viewerCount
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ 시청자 수 업데이트 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 선물 수신 (무료 서비스)
app.post('/api/live/gift', async (req, res) => {
    try {
        const { userId, giftName, username } = req.body;
        
        console.log(`🎁 선물: ${giftName} (from ${username})`);
        
        io.to(userId).emit('gift-received', {
            giftName,
            username,
            timestamp: Date.now()
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ 선물 처리 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 신청곡 큐 조회
app.get('/api/song-queue/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const queue = songRequestService.getQueue(userId);
        res.json({ success: true, queue });
    } catch (error) {
        console.error('❌ 신청곡 큐 조회 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 신청곡 삭제
app.post('/api/song-queue/remove', (req, res) => {
    try {
        const { userId, songId } = req.body;
        const success = songRequestService.removeSong(userId, songId);
        
        if (success) {
            // 업데이트된 큐 전송
            io.to(userId).emit('song-queue-update', {
                queue: songRequestService.getQueue(userId)
            });
        }
        
        res.json({ success });
    } catch (error) {
        console.error('❌ 신청곡 삭제 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 신청곡 재생 완료
app.post('/api/song-queue/played', (req, res) => {
    try {
        const { userId, songId } = req.body;
        const success = songRequestService.markAsPlayed(userId, songId);
        
        if (success) {
            // 업데이트된 큐 전송
            io.to(userId).emit('song-queue-update', {
                queue: songRequestService.getQueue(userId)
            });
        }
        
        res.json({ success });
    } catch (error) {
        console.error('❌ 신청곡 재생 완료 처리 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 신청곡 순서 변경
app.post('/api/song-queue/move', (req, res) => {
    try {
        const { userId, songId, newPosition } = req.body;
        const success = songRequestService.moveSong(userId, songId, newPosition);
        
        if (success) {
            // 업데이트된 큐 전송
            io.to(userId).emit('song-queue-update', {
                queue: songRequestService.getQueue(userId)
            });
        }
        
        res.json({ success });
    } catch (error) {
        console.error('❌ 신청곡 순서 변경 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
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

// ==================== Socket.io 이벤트 ====================
io.on('connection', (socket) => {
    console.log('🔌 클라이언트 연결:', socket.id);

    // 사용자 룸 참가
    socket.on('join-room', (userId) => {
        socket.join(userId);
        console.log(`👤 사용자 룸 참가: ${userId}`);
    });
    
    // TTS 설정 (웹 → Desktop App)
    socket.on('tts-settings', (settings) => {
        console.log('🔊 TTS 설정 수신:', settings);
        // Desktop App으로 브로드캐스트
        io.emit('tts-settings-update', settings);
    });

    // TikTok Live 시작
    socket.on('start-tiktok-live', async (data) => {
        try {
            const { userId, tiktokId } = data;
            
            // 이미 연결되어 있으면 재사용
            if (liveConnections.has(userId)) {
                console.log('⚠️ 이미 연결된 사용자:', userId);
                socket.emit('live-error', { message: 'Already connected' });
                return;
            }

            // 새 연결 생성
            const liveService = new TikTokLiveService(tiktokId, userId, io);
            await liveService.connect();
            liveConnections.set(userId, liveService);
            
            // 사용자별 룸 참가
            socket.join(userId);
            
            console.log(`✅ TikTok Live 시작: ${tiktokId} (User: ${userId})`);
            socket.emit('live-started', { success: true });
            
        } catch (error) {
            console.error('TikTok Live 시작 실패:', error);
            socket.emit('live-error', { message: error.message });
        }
    });

    // TikTok Live 중지
    socket.on('stop-tiktok-live', (data) => {
        const { userId } = data;
        const liveService = liveConnections.get(userId);
        
        if (liveService) {
            liveService.disconnect();
            liveConnections.delete(userId);
            console.log(`⏹️ TikTok Live 중지: User ${userId}`);
            socket.emit('live-stopped', { success: true });
        }
    });

    // 신청곡 제거
    socket.on('remove-song', (data) => {
        const { userId, songId } = data;
        const liveService = liveConnections.get(userId);
        
        if (liveService) {
            liveService.removeSong(songId);
        }
    });

    // 신청곡 완료
    socket.on('complete-song', (data) => {
        const { userId, songId } = data;
        const liveService = liveConnections.get(userId);
        
        if (liveService) {
            liveService.completeSong(songId);
        }
    });

    // 연결 종료
    socket.on('disconnect', () => {
        console.log('🔌 클라이언트 연결 종료:', socket.id);
    });
});

// 서버 시작
connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 TikFind 서버가 포트 ${PORT}에서 실행 중입니다.`);
        console.log(`📍 http://localhost:${PORT}`);
    });
});
