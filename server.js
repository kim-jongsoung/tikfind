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
const { checkUsageLimit, getUserDailyUsage } = require('./middleware/usageLimit');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3001;

// TikTok Live 연결 관리
const liveConnections = new Map();

// 라이브 상태 저장 (userId → { isLive, tiktokId })
const liveStatusMap = new Map();

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

// www → non-www 리디렉션 미들웨어
app.use((req, res, next) => {
    const host = req.headers.host;
    if (host && host.startsWith('www.')) {
        const newHost = host.replace('www.', '');
        return res.redirect(301, `${req.protocol}://${newHost}${req.originalUrl}`);
    }
    next();
});

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

// 사용자 시간대 업데이트 API
app.post('/api/update-timezone', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    
    try {
        const { timezone } = req.body;
        if (!timezone) {
            return res.status(400).json({ success: false, message: '시간대 정보가 필요합니다.' });
        }
        
        const User = require('./models/User');
        await User.findByIdAndUpdate(req.user._id, { timezone });
        
        console.log('🌍 시간대 업데이트:', timezone, '(사용자:', req.user.email, ')');
        
        res.json({ success: true, message: '시간대가 업데이트되었습니다.', timezone });
    } catch (error) {
        console.error('❌ 시간대 업데이트 실패:', error);
        res.status(500).json({ success: false, message: '시간대 업데이트 실패' });
    }
});

app.get('/api/current_user', async (req, res) => {
    if (req.user) {
        // 사용자의 일일 사용량 조회
        const usage = await getUserDailyUsage(req.user._id, req.user.timezone || 'UTC');
        
        // 플랜 제한 조회
        const PlanLimit = require('./models/PlanLimit');
        const planLimit = await PlanLimit.findOne({ planName: req.user.plan || 'free' });
        
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
                timezone: req.user.timezone || 'UTC',
                isAdmin: req.user.isAdmin || false,
                role: req.user.role || 'user',
                subscription: {
                    status: req.user.subscriptionStatus,
                    plan: req.user.plan
                }
            },
            usage: {
                songRequest: {
                    used: usage.songRequestCount,
                    limit: planLimit?.songRequestLimit || 5
                },
                gptAi: {
                    used: usage.gptAiCount,
                    limit: planLimit?.gptAiLimit || 20
                },
                pronunciationCoach: {
                    used: usage.pronunciationCoachCount,
                    limit: planLimit?.pronunciationCoachLimit || 10
                }
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
        
        // 하이브리드 검색: DB 우선 → YouTube API 백업
        const result = await songService.searchSong(title, artist);
        
        if (result && result.videoId) {
            res.json({
                success: true,
                video: {
                    videoId: result.videoId,
                    url: result.url,
                    thumbnail: result.thumbnail
                }
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
            message: '검색 중 오류가 발생했습니다'
        });
    }
});

// YouTube 영상 길이 조회 API
app.get('/api/youtube/duration/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        
        if (!videoId) {
            return res.json({ success: false, message: 'Video ID가 필요합니다' });
        }
        
        const SongRequestService = require('./services/SongRequestService');
        const songService = new SongRequestService();
        
        const duration = await songService.getVideoDuration(videoId);
        
        if (duration !== null) {
            res.json({
                success: true,
                duration: duration
            });
        } else {
            res.json({
                success: false,
                message: '영상 길이를 가져올 수 없습니다'
            });
        }
    } catch (error) {
        console.error('❌ YouTube 영상 길이 조회 오류:', error);
        res.json({
            success: false,
            message: '조회 중 오류가 발생했습니다'
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
const { checkSubscription, checkAdmin, checkHWID } = require('./middleware/checkSubscription');

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
        const { userId, username, message, timestamp, uniqueId, nickname, badges, userBadges, followRole, isModerator, isSubscriber, topGifterRank, teamMemberLevel } = req.body;
        
        console.log(`💬 [${username}]: ${message} (userId: ${userId})`);
        
        // 사용자 정보 가져오기
        const User = require('./models/User');
        const user = await User.findById(userId);
        const streamerLanguage = user?.preferredLanguage || 'ko';
        
        // 구독 상태 확인 (유료 기능용)
        const hasSubscription = user && ['trial', 'active'].includes(user.subscriptionStatus);
        
        // 1. 언어 감지
        const messageLanguage = await pronunciationCoach.detectLanguage(message);
        console.log(`🔍 언어감지: "${message}" → ${messageLanguage} (스트리머: ${streamerLanguage})`);
        
        // 2. AI 발음 코치 (플랜 한도 기반)
        let pronunciationGuide = null;
        if (messageLanguage !== streamerLanguage && messageLanguage !== 'unknown') {
            // 메시지 필터링: 이모티콘, 숫자만, 특수문자만 있는 메시지는 AI 호출 안 함
            const shouldProcessMessage = (msg) => {
                // 숫자만 있는 경우
                if (/^\d+$/.test(msg.trim())) {
                    console.log('⏭️ 숫자만 있는 메시지, AI 호출 스킵:', msg);
                    return false;
                }
                
                // 특수문자만 있는 경우 (공백, 특수문자, 이모티콘만)
                const textOnly = msg.replace(/[\s\p{Emoji}\p{P}\p{S}]/gu, '');
                if (textOnly.length === 0) {
                    console.log('⏭️ 특수문자/이모티콘만 있는 메시지, AI 호출 스킵:', msg);
                    return false;
                }
                
                // 최소 2글자 이상의 의미 있는 텍스트가 있어야 함
                if (textOnly.length < 2) {
                    console.log('⏭️ 너무 짧은 메시지, AI 호출 스킵:', msg);
                    return false;
                }
                
                return true;
            };
            
            if (!shouldProcessMessage(message)) {
                console.log('🚫 AI 발음 코치 호출 스킵 (필터링됨):', message);
            } else {
                // 사용량 체크
                const UsageLog = require('./models/UsageLog');
                const PlanLimit = require('./models/PlanLimit');
                
                const today = new Date().toISOString().split('T')[0];
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
                
                const planLimit = await PlanLimit.findOne({ planName: user.plan || 'free' });
                const limit = planLimit?.pronunciationCoachLimit ?? 10;
                const currentUsage = usageLog.pronunciationCoachCount || 0;
                console.log(`📊 발음코치 사용량: ${currentUsage}/${limit} (플랜: ${user.plan || 'free'})`);
                
                // 제한 체크 (무제한은 -1)
                if (limit === -1 || currentUsage < limit) {
                    // 빠른 응답 먼저 확인
                    pronunciationGuide = pronunciationCoach.getQuickResponse(message, messageLanguage, streamerLanguage);
                    
                    // 없으면 AI로 생성
                    if (!pronunciationGuide) {
                        console.log(`🤖 AI 발음코치 호출: "${message}" (${messageLanguage} → ${streamerLanguage})`);
                        pronunciationGuide = await pronunciationCoach.generatePronunciationGuide(
                            message, 
                            messageLanguage, 
                            streamerLanguage
                        );
                        console.log(`✅ AI 발음코치 결과:`, pronunciationGuide ? '성공' : '실패(null)');
                    } else {
                        console.log(`⚡ 빠른응답 사용:`, pronunciationGuide.response);
                    }
                    
                    // 사용량 증가
                    if (pronunciationGuide) {
                        usageLog.pronunciationCoachCount = (usageLog.pronunciationCoachCount || 0) + 1;
                        await usageLog.save();
                    }
                } else {
                    console.log(`⚠️ AI 발음 코치 제한 초과: ${currentUsage}/${limit}`);
                    // 한도 초과 메시지 전송
                    pronunciationGuide = {
                        limitExceeded: true,
                        currentUsage,
                        limit,
                        message: '일일 AI 발음 코치 한도를 초과했습니다.'
                    };
                }
            }
        }
        
        // 3. 신청곡 파싱 (팔로워 이상만 가능)
        const songData = songRequestService.parseSongRequest(message);
        let songRequest = null;
        const requesterFollowRole = Number(followRole) || 0;
        
        if (songData && requesterFollowRole >= 1) {
            // 사용량 체크
            const UsageLog = require('./models/UsageLog');
            const PlanLimit = require('./models/PlanLimit');
            
            const today = new Date().toISOString().split('T')[0];
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
            
            const planLimit = await PlanLimit.findOne({ planName: user.plan || 'free' });
            const limit = planLimit?.songRequestLimit || 5;
            const currentUsage = usageLog.songRequestCount || 0;
            
            // 제한 체크 (무제한은 -1)
            if (limit === -1 || currentUsage < limit) {
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
                    
                    // 사용량 증가
                    usageLog.songRequestCount = (usageLog.songRequestCount || 0) + 1;
                    await usageLog.save();
                    
                    // 신청곡 큐 업데이트 전송
                    emitQueueUpdate(userId);
                }
            } else {
                console.log(`⚠️ 신청곡 제한 초과: ${currentUsage}/${limit}`);
            }
        }
        
        // 현재 사용량 조회
        const currentUsage = await getUserDailyUsage(userId, user.timezone || 'UTC');
        const PlanLimit = require('./models/PlanLimit');
        const planLimit = await PlanLimit.findOne({ planName: user.plan || 'free' });
        
        // 4. Socket.io로 전송 (사용량 정보 포함)
        io.to(userId).emit('chat-message', {
            username,
            uniqueId: uniqueId || username,
            nickname: nickname || username,
            message,
            messageLanguage,
            pronunciationGuide,
            songRequest,
            userBadges: userBadges || [],
            followRole: followRole || 0,
            isModerator: isModerator || false,
            isSubscriber: isSubscriber || false,
            topGifterRank: topGifterRank || null,
            teamMemberLevel: teamMemberLevel || null,
            timestamp: timestamp || Date.now(),
            usage: {
                songRequest: {
                    used: currentUsage.songRequestCount,
                    limit: planLimit?.songRequestLimit || 5
                },
                gptAi: {
                    used: currentUsage.gptAiCount,
                    limit: planLimit?.gptAiLimit || 20
                },
                pronunciationCoach: {
                    used: currentUsage.pronunciationCoachCount,
                    limit: planLimit?.pronunciationCoachLimit || 10
                }
            }
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
            emitQueueUpdate(userId);
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
            emitQueueUpdate(userId);
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
            emitQueueUpdate(userId);
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

// 신청곡 큐 업데이트 헬퍼 - 대시보드 + 오버레이 동시 전송
function emitQueueUpdate(userId) {
    const queue = songRequestService.getQueue(userId);
    io.to(userId).emit('song-queue-update', { queue });
    io.to(`overlay-${userId}`).emit('song-queue', queue.map(s => ({
        title: s.title,
        artist: s.artist,
        requester: s.requester
    })));
}

// ==================== Socket.io 이벤트 ====================
io.on('connection', (socket) => {
    console.log('🔌 클라이언트 연결:', socket.id);
    
    // 클라이언트 타입 확인
    const clientType = socket.handshake.auth.type || 'web';
    const userId = socket.handshake.auth.userId;
    
    console.log(`📱 클라이언트 타입: ${clientType}, User ID: ${userId}`);

    // 오버레이 룸 참가 (TikTok Live Studio 브라우저 소스)
    socket.on('join-overlay', (overlayUserId) => {
        const overlayRoom = `overlay-${overlayUserId}`;
        socket.join(overlayRoom);
        console.log(`🎬 오버레이 룸 참가: ${overlayRoom}`);
        
        // 현재 큐 즉시 전송
        const currentQueue = songRequestService.getQueue(overlayUserId);
        socket.emit('song-queue', currentQueue.map(s => ({
            title: s.title,
            artist: s.artist,
            requester: s.requester
        })));
    });

    // 대시보드 → 오버레이: 현재 재생 곡 전송
    socket.on('overlay-now-playing', (data) => {
        const { userId: targetUserId, title, artist, requester, thumbnail } = data;
        const overlayRoom = `overlay-${targetUserId}`;
        console.log(`🎬 오버레이 현재 재생 곡 전송: ${title} - ${artist}`);
        io.to(overlayRoom).emit('current-song', { title, artist, requester, thumbnail });

        // 큐도 함께 전송
        const currentQueue = songRequestService.getQueue(targetUserId);
        io.to(overlayRoom).emit('song-queue', currentQueue.map(s => ({
            title: s.title,
            artist: s.artist,
            requester: s.requester
        })));
    });

    // 사용자 룸 참가
    socket.on('join-room', (roomUserId) => {
        const targetUserId = roomUserId || userId;
        socket.join(targetUserId);
        console.log(`👤 사용자 룸 참가: ${targetUserId} (타입: ${clientType})`);
        
        // Desktop App이 룸에 참가한 후 웹에 알림
        if (clientType === 'desktop-app') {
            io.to(targetUserId).emit('desktop-app-connected', { userId: targetUserId });
            console.log(`📱 Desktop App 연결 알림 전송: ${targetUserId}`);
        }
        
        // 웹 클라이언트가 룸에 참가할 때
        if (clientType === 'web') {
            // 1. 저장된 라이브 상태가 있으면 즉시 전달 (핵심 버그 수정)
            const savedStatus = liveStatusMap.get(targetUserId);
            if (savedStatus) {
                socket.emit('live-status', savedStatus);
                console.log(`📤 저장된 라이브 상태 전달: ${targetUserId}, isLive: ${savedStatus.isLive}`);
            }
            
            // 2. Desktop App이 이미 연결되어 있으면 알림
            const roomSockets = io.sockets.adapter.rooms.get(targetUserId);
            if (roomSockets) {
                for (const socketId of roomSockets) {
                    const clientSocket = io.sockets.sockets.get(socketId);
                    if (clientSocket && clientSocket.handshake.auth.type === 'desktop-app') {
                        socket.emit('desktop-app-connected', { userId: targetUserId });
                        console.log(`📱 기존 Desktop App 연결 알림: ${targetUserId}`);
                        break;
                    }
                }
            }
        }
    });
    
    // 라이브 상태 조회 (웹 → 서버)
    socket.on('get-live-status', (data) => {
        const { userId: targetUserId } = data;
        console.log(`🔍 라이브 상태 조회: ${targetUserId}`);
        
        // Desktop App에 상태 요청
        io.to(targetUserId).emit('get-live-status');
    });
    
    // 연결 해제 시
    socket.on('disconnect', () => {
        console.log('❌ 클라이언트 연결 해제:', socket.id);
        
        // Desktop App 연결 해제 시 웹에 알림 + 라이브 상태 초기화
        if (clientType === 'desktop-app' && userId) {
            liveStatusMap.delete(userId);
            io.to(userId).emit('desktop-app-disconnected', { userId });
            io.to(userId).emit('live-status', { isLive: false });
        }
    });
    
    // Desktop App → 웹: TikTok 데이터 전송
    socket.on('tiktok-data', async (data) => {
        const { userId, type, data: tiktokData } = data;
        console.log(`📡 TikTok 데이터 수신 (${type}):`, userId);
        
        if (type === 'chat') {
            try {
                // 팀/배지 확인용 로그
                console.log(`📦 userBadges:`, JSON.stringify(tiktokData.userBadges));
                console.log(`📦 teamMemberLevel:`, tiktokData.teamMemberLevel);
                console.log(`📦 followRole:`, tiktokData.followRole);

                const User = require('./models/User');
                const user = await User.findById(userId);
                const streamerLanguage = user?.preferredLanguage || 'ko';

                // 언어 감지
                const messageLanguage = await pronunciationCoach.detectLanguage(tiktokData.message);
                console.log(`🔍 언어감지: "${tiktokData.message}" → ${messageLanguage} (스트리머: ${streamerLanguage})`);

                let pronunciationGuide = null;

                if (messageLanguage !== streamerLanguage && messageLanguage !== 'unknown') {
                    const shouldProcess = (msg) => {
                        if (/^\d+$/.test(msg.trim())) return false;
                        const textOnly = msg.replace(/[\s\p{Emoji}\p{P}\p{S}]/gu, '');
                        if (textOnly.length < 2) return false;
                        return true;
                    };

                    if (shouldProcess(tiktokData.message)) {
                        const UsageLog = require('./models/UsageLog');
                        const PlanLimit = require('./models/PlanLimit');
                        const today = new Date().toISOString().split('T')[0];
                        let usageLog = await UsageLog.findOne({ userId, date: today });
                        if (!usageLog) {
                            usageLog = await UsageLog.create({ userId, date: today, songRequestCount: 0, gptAiCount: 0, pronunciationCoachCount: 0 });
                        }
                        const planLimit = await PlanLimit.findOne({ planName: user?.plan || 'free' });
                        const limit = planLimit?.pronunciationCoachLimit ?? 10;
                        const currentUsage = usageLog.pronunciationCoachCount || 0;
                        console.log(`📊 발음코치 사용량: ${currentUsage}/${limit} (플랜: ${user?.plan || 'free'})`);

                        if (limit === -1 || currentUsage < limit) {
                            pronunciationGuide = pronunciationCoach.getQuickResponse(tiktokData.message, messageLanguage, streamerLanguage);
                            if (!pronunciationGuide) {
                                console.log(`🤖 AI 발음코치 호출: "${tiktokData.message}" (${messageLanguage} → ${streamerLanguage})`);
                                pronunciationGuide = await pronunciationCoach.generatePronunciationGuide(tiktokData.message, messageLanguage, streamerLanguage);
                                console.log(`✅ AI 발음코치 결과:`, pronunciationGuide ? '성공' : '실패(null)');
                            } else {
                                console.log(`⚡ 빠른응답 사용:`, pronunciationGuide.response);
                            }
                            if (pronunciationGuide) {
                                usageLog.pronunciationCoachCount = currentUsage + 1;
                                await usageLog.save();
                            }
                        } else {
                            console.log(`⚠️ AI 발음 코치 제한 초과: ${currentUsage}/${limit}`);
                            pronunciationGuide = { limitExceeded: true, currentUsage, limit, message: '일일 AI 발음 코치 한도를 초과했습니다.' };
                        }
                    }
                }

                // 사용량 정보 조회 후 emit에 포함
                const UsageLogFinal = require('./models/UsageLog');
                const PlanLimitFinal = require('./models/PlanLimit');
                const todayFinal = new Date().toISOString().split('T')[0];
                const usageLogFinal = await UsageLogFinal.findOne({ userId, date: todayFinal });
                const planLimitFinal = await PlanLimitFinal.findOne({ planName: user?.plan || 'free' });

                const usageInfo = {
                    pronunciationCoach: {
                        used: usageLogFinal?.pronunciationCoachCount || 0,
                        limit: planLimitFinal?.pronunciationCoachLimit ?? 10
                    },
                    songRequest: {
                        used: usageLogFinal?.songRequestCount || 0,
                        limit: planLimitFinal?.songRequestLimit ?? 50
                    },
                    gptAi: {
                        used: usageLogFinal?.gptAiCount || 0,
                        limit: planLimitFinal?.gptAiLimit ?? -1
                    }
                };

                io.to(userId).emit('chat-message', {
                    ...tiktokData,
                    messageLanguage,
                    pronunciationGuide,
                    usage: usageInfo
                });
            } catch (err) {
                console.error('❌ tiktok-data chat 처리 오류:', err);
                io.to(userId).emit('chat-message', tiktokData);
            }
        } else if (type === 'stats') {
            io.to(userId).emit('viewer-update', tiktokData);
        } else if (type === 'gift') {
            io.to(userId).emit('gift-received', tiktokData);
        } else if (type === 'like') {
            io.to(userId).emit('like-received', tiktokData);
        }
    });
    
    // Desktop App → 웹: 라이브 상태 업데이트
    socket.on('live-status', (data) => {
        const { userId, isLive, tiktokId } = data;
        console.log(`🎥 라이브 상태 업데이트: ${userId}, Live: ${isLive}, TikTok: ${tiktokId}`);
        
        // 상태 저장 (나중에 웹이 접속해도 받을 수 있도록)
        if (isLive) {
            liveStatusMap.set(userId, { isLive, tiktokId });
        } else {
            liveStatusMap.delete(userId);
        }
        
        // 웹 대시보드로 전송
        io.to(userId).emit('live-status', { isLive, tiktokId });
        console.log(`✅ live-status 전송 완료 (룸: ${userId})`);
    });
    
    // 웹 → Desktop App: 라이브 시작 명령
    socket.on('start-live', async (data) => {
        const { userId, tiktokId } = data;
        console.log(`🎥 라이브 시작 명령: ${userId}, TikTok: ${tiktokId}`);
        
        // Desktop App으로 명령 전송
        io.to(userId).emit('start-live', { tiktokId });
    });
    
    // 웹 → Desktop App: 라이브 종료 명령
    socket.on('stop-live', (data) => {
        const { userId } = data;
        console.log(`⏹️ 라이브 종료 명령: ${userId}`);
        
        // Desktop App으로 명령 전송
        io.to(userId).emit('stop-live');
        
        // 웹에도 즉시 상태 업데이트
        io.to(userId).emit('live-status', { isLive: false });
    });
    
    // TTS 설정 (웹 → Desktop App)
    socket.on('tts-settings', (settings) => {
        console.log('🔊 TTS 설정 수신:', settings);
        const targetUserId = settings.userId || userId;
        
        // Desktop App으로 전송
        io.to(targetUserId).emit('tts-settings', settings);
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

    // 스트리머가 직접 신청곡 추가
    socket.on('add-song-request', async (data) => {
        try {
            const { userId, songData } = data;
            console.log('🎵 스트리머 신청곡 추가 요청:', songData);
            
            const result = await songRequestService.addSongRequest(
                userId, 
                { title: songData.title, artist: songData.artist },
                songData.requester
            );
            
            if (result.success) {
                console.log('✅ 스트리머 신청곡 추가 성공:', result.song.title);
                emitQueueUpdate(userId);
            }
        } catch (error) {
            console.error('❌ 스트리머 신청곡 추가 오류:', error);
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
