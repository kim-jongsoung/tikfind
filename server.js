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
app.use('/admin/api', adminRoutes(io));
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
                    limit: planLimit?.songRequestLimit || 10
                },
                gptAi: {
                    used: usage.gptAiCount,
                    limit: planLimit?.gptAiLimit || 20
                },
                pronunciationCoach: {
                    used: usage.pronunciationCoachCount,
                    limit: planLimit?.pronunciationCoachLimit || 10
                },
                ttsChar: {
                    used: usage.ttsCharCount,
                    limit: planLimit?.ttsCharLimit ?? -1
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

// 노래 추천 AI 조언 API (모달 전용)
app.post('/api/ai-song-advice', async (req, res) => {
    try {
        const { question, history } = req.body;
        if (!question || !question.trim()) return res.json({ success: false, message: '질문을 입력해주세요.' });
        const axios = require('axios');
        const messages = [
            {
                role: 'system',
                content: '당신은 TikTok 라이브 스트리머를 위한 노래 추천 전문 AI입니다. 스트리머가 방송 중 틀 노래를 고를 때 도움을 줍니다. 노래 제목과 가수명을 명확하게 포함해서 추천해주세요. 답변은 간결하게 해주세요. 한국어로 답변해주세요.'
            }
        ];
        if (history && Array.isArray(history)) {
            history.slice(-8).forEach(msg => messages.push({ role: msg.role, content: msg.content }));
        }
        messages.push({ role: 'user', content: question });
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            { model: 'gpt-4o-mini', messages, max_tokens: 500, temperature: 0.8 },
            { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }
        );
        res.json({ success: true, answer: response.data.choices[0].message.content.trim() });
    } catch (error) {
        console.error('❌ AI 노래 추천 오류:', error);
        res.json({ success: false, message: 'AI 응답 오류가 발생했습니다.' });
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

// 닉네임 발음 캐시: "userId:nickname" → "발음"
const nicknamePronunciationCache = new Map();

// ===== 채팅 메시지 공통 처리 함수 (TikTokLiveService + /api/live/chat 공유) =====
async function processChatMessage(chatData) {
    const { userId, username, message, uniqueId, nickname, badges, userBadges,
            followRole, isModerator, isSubscriber, topGifterRank, teamMemberLevel, timestamp } = chatData;

    const User = require('./models/User');
    const UsageLog = require('./models/UsageLog');
    const PlanLimit = require('./models/PlanLimit');

    const user = await User.findById(userId);
    const streamerLanguage = user?.preferredLanguage || 'ko';

    // 1. 언어 감지 + AI 발음코치
    const messageLanguage = await pronunciationCoach.detectLanguage(message);
    let pronunciationGuide = null;

    if (messageLanguage !== streamerLanguage && messageLanguage !== 'unknown') {
        const textOnly = message.replace(/[\s\p{Emoji}\p{P}\p{S}]/gu, '');
        const shouldProcess = textOnly.length >= 2 && !/^\d+$/.test(message.trim());

        if (shouldProcess) {
            const today = new Date().toISOString().split('T')[0];
            let usageLog = await UsageLog.findOneAndUpdate(
                { userId, date: today },
                { $setOnInsert: { songRequestCount: 0, gptAiCount: 0, pronunciationCoachCount: 0 } },
                { upsert: true, new: true }
            );
            const planLimit = await PlanLimit.findOne({ planName: user?.plan || 'free' });
            const limit = planLimit?.pronunciationCoachLimit ?? 10;
            const currentUsage = usageLog.pronunciationCoachCount || 0;

            if (limit === -1 || currentUsage < limit) {
                pronunciationGuide = pronunciationCoach.getQuickResponse(message, messageLanguage, streamerLanguage);
                if (!pronunciationGuide) {
                    pronunciationGuide = await pronunciationCoach.generatePronunciationGuide(message, messageLanguage, streamerLanguage);
                }
                if (pronunciationGuide) {
                    await UsageLog.updateOne({ userId, date: today }, { $inc: { pronunciationCoachCount: 1 } });
                }
            } else {
                pronunciationGuide = { limitExceeded: true, currentUsage, limit, message: '일일 AI 발음 코치 한도를 초과했습니다.' };
            }
        }
    }

    // 2. 신청곡 파싱
    const songData = songRequestService.parseSongRequest(message);
    let songRequest = null;
    const requesterFollowRole = Number(followRole) || 0;
    const songSettings = songRequestService.getSettings(userId);

    if (songData) {
        console.log(`🎵 신청곡 감지: "${songData.title}" - "${songData.artist}" | followRole=${requesterFollowRole} | isAccepting=${songSettings.isAccepting}`);
    }

    const minRole = songSettings.minFollowRole ?? 0;
    if (songData && songSettings.isAccepting && (requesterFollowRole >= minRole || isModerator)) {
        const lastTime = songRequestService.getLastRequestTime(userId, uniqueId || username);
        const elapsed = lastTime ? (Date.now() - lastTime) / 1000 / 60 : Infinity;
        const cooldownOk = songSettings.cooldownMinutes === 0 || elapsed >= songSettings.cooldownMinutes;
        console.log(`🎵 쿨다운 체크: elapsed=${elapsed.toFixed(1)}분, cooldown=${songSettings.cooldownMinutes}분, ok=${cooldownOk}`);

        if (cooldownOk) {
            const today = new Date().toISOString().split('T')[0];
            let usageLog = await UsageLog.findOneAndUpdate(
                { userId, date: today },
                { $setOnInsert: { songRequestCount: 0, gptAiCount: 0, pronunciationCoachCount: 0 } },
                { upsert: true, new: true }
            );
            const planLimit = await PlanLimit.findOne({ planName: user?.plan || 'free' });
            const limit = planLimit ? (planLimit.songRequestLimit ?? -1) : -1;
            const currentUsage = usageLog.songRequestCount || 0;
            console.log(`🎵 사용량 체크: ${currentUsage}/${limit}`);

            if (limit === -1 || currentUsage < limit) {
                const hostYoutubeKey = user?.youtubeApiKey || process.env.YOUTUBE_API_KEY;
                const hostSongService = new SongRequestService(hostYoutubeKey);
                // 기존 큐/설정 상태 복사
                hostSongService.songQueue = songRequestService.songQueue;
                hostSongService.settings = songRequestService.settings;
                hostSongService.lastRequestTime = songRequestService.lastRequestTime;
                const result = await hostSongService.addSongRequest(userId, songData, {
                    username, uniqueId: uniqueId || username, nickname: nickname || username, badges: badges || [], isVIP: false, level: 1
                });
                console.log(`🎵 addSongRequest 결과:`, result.success, result.message || '');
                if (result.success) {
                    songRequest = result.song;
                    songRequestService.setLastRequestTime(userId, uniqueId || username, Date.now());
                    await UsageLog.updateOne({ userId, date: today }, { $inc: { songRequestCount: 1 } });
                    emitQueueUpdate(userId);
                }
            } else {
                console.log(`🎵 사용량 초과: ${currentUsage}/${limit}`);
            }
        }
    } else if (songData) {
        console.log(`🎵 신청곡 거부: isAccepting=${songSettings.isAccepting}, followRole=${requesterFollowRole}`);
    }

    // 3. 사용량 조회
    const currentUsage = await getUserDailyUsage(userId, user?.timezone || 'UTC');
    const planLimit = await PlanLimit.findOne({ planName: user?.plan || 'free' });

    // 3-5. Desktop App TTS 실행 명령 (서버가 TikTok 직접 연결 시)
    const liveStatus = liveStatusMap.get(String(userId));
    const isCurrentlyLive = liveStatus?.isLive === true;
    const desktopSocketId = desktopSocketMap.get(userId);
    console.log(`🔊 TTS-SPEAK 체크: desktopSocketId=${desktopSocketId || '없음'} | userId=${userId} | isLive=${isCurrentlyLive} | text="${message}"`);
    if (desktopSocketId && isCurrentlyLive) {
        const userGenders = {};
        if (user?.tiktokUserGenders) {
            user.tiktokUserGenders.forEach((v, k) => { userGenders[k] = v; });
        }
        io.to(desktopSocketId).emit('tts-speak', {
            text: message,
            uniqueId: uniqueId || username,
            userGenders
        });
        console.log(`✅ tts-speak 전송 완료 → ${desktopSocketId}`);
    } else if (!isCurrentlyLive) {
        console.log(`⛔ 방송 중지 상태 - tts-speak 차단 (userId=${userId})`);
    } else {
        console.log(`⚠️ Desktop App 미연결 - tts-speak 전송 불가`);
    }

    // 4. 닉네임 발음 처리 (외국어 닉네임 → 한국어 발음, 캐시 기반)
    let nicknamePronunciation = null;
    const displayNickname = nickname || username || '';
    const isKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(displayNickname);
    const isAsciiOnly = /^[a-zA-Z0-9._\-\s]+$/.test(displayNickname);
    // 한글 아니고, 순수 영문/숫자/기호도 아닌 경우 (일본어, 중국어, 아랍어 등) 발음 변환
    if (!isKorean && !isAsciiOnly && displayNickname.length > 0) {
        const cacheKey = `${userId}:${displayNickname}`;
        if (nicknamePronunciationCache.has(cacheKey)) {
            nicknamePronunciation = nicknamePronunciationCache.get(cacheKey);
        } else {
            try {
                const guide = await pronunciationCoach.generatePronunciationGuide(displayNickname, await pronunciationCoach.detectLanguage(displayNickname), 'ko');
                if (guide?.pronunciation) {
                    nicknamePronunciation = guide.pronunciation;
                    nicknamePronunciationCache.set(cacheKey, nicknamePronunciation);
                    if (nicknamePronunciationCache.size > 2000) {
                        const firstKey = nicknamePronunciationCache.keys().next().value;
                        nicknamePronunciationCache.delete(firstKey);
                    }
                }
            } catch (e) { /* 발음 변환 실패 시 무시 */ }
        }
    }

    // 5. 클라이언트 전송
    io.to(userId).emit('chat-message', {
        username,
        uniqueId: uniqueId || username,
        nickname: nickname || username,
        nicknamePronunciation,
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
            songRequest: { used: currentUsage.songRequestCount, limit: planLimit?.songRequestLimit || 10 },
            gptAi: { used: currentUsage.gptAiCount, limit: planLimit?.gptAiLimit || 20 },
            pronunciationCoach: { used: currentUsage.pronunciationCoachCount, limit: planLimit?.pronunciationCoachLimit || 10 },
            ttsChar: { used: currentUsage.ttsCharCount, limit: planLimit?.ttsCharLimit ?? -1 }
        }
    });

}

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
        await processChatMessage({ userId, username, message, timestamp, uniqueId, nickname, badges, userBadges, followRole, isModerator, isSubscriber, topGifterRank, teamMemberLevel });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ 채팅 메시지 처리 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 채팅 메시지 수신 (구버전 - 하위 호환용)
app.post('/api/live/chat_legacy', async (req, res) => {
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
        
        // 3. 신청곡 파싱 (팔로워 이상 + 받기 상태 + 중복신청 제한)
        const songData = songRequestService.parseSongRequest(message);
        let songRequest = null;
        const requesterFollowRole = Number(followRole) || 0;
        const songSettings = songRequestService.getSettings(userId);
        
        // 신청곡 받기 상태 체크
        if (songData && !songSettings.isAccepting) {
            console.log(`🚫 신청곡 안받기 상태 - 무시: ${username}`);
        }
        // 팔로워 이상 체크
        // 중복신청 제한 체크
        else if (songData && songSettings.cooldownMinutes > 0) {
            const lastTime = songRequestService.getLastRequestTime(userId, uniqueId || username);
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000 / 60; // 분
            if (lastTime && elapsed < songSettings.cooldownMinutes) {
                const remaining = Math.ceil(songSettings.cooldownMinutes - elapsed);
                console.log(`⏱ 중복신청 제한: ${username} (${remaining}분 후 가능)`);
            } else if (songData) {
                songRequestService.setLastRequestTime(userId, uniqueId || username, now);
            }
        }

        const minRole2 = songSettings.minFollowRole ?? 0;
        if (songData && songSettings.isAccepting && (requesterFollowRole >= minRole2 || isModerator)) {
            // 중복신청 재확인
            const lastTime = songRequestService.getLastRequestTime(userId, uniqueId || username);
            const now = Date.now();
            const elapsed = lastTime ? (now - lastTime) / 1000 / 60 : Infinity;
            const cooldownOk = songSettings.cooldownMinutes === 0 || elapsed >= songSettings.cooldownMinutes;

            if (!cooldownOk) {
                // 중복신청 제한 - 건너뜀 (위에서 이미 로그)
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
                const limit = planLimit?.songRequestLimit || 5;
                const currentUsage = usageLog.songRequestCount || 0;
                
                // 제한 체크 (무제한은 -1)
                if (limit === -1 || currentUsage < limit) {
                    const requesterInfo = {
                        username: username,
                        uniqueId: uniqueId || username,
                        badges: badges || [],
                        isVIP: false,
                        level: 1
                    };
                    
                    const result = await songRequestService.addSongRequest(userId, songData, requesterInfo);
                    if (result.success) {
                        songRequest = result.song;
                        songRequestService.setLastRequestTime(userId, uniqueId || username, Date.now());
                        
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
app.post('/api/song-queue/played', async (req, res) => {
    try {
        const { userId, songId } = req.body;
        
        // 재생 완료 전 곡 정보 가져오기 (DB 저장용)
        const queue = songRequestService.getQueue(userId);
        const song = queue.find(s => s.id === songId);
        
        const playedSong = songRequestService.markAsPlayed(userId, songId);
        
        if (playedSong) {
            emitQueueUpdate(userId);
            
            // SongHistory DB 저장
            if (song) {
                try {
                    const SongHistory = require('./models/SongHistory');
                    await SongHistory.create({
                        userId,
                        title: song.title,
                        artist: song.artist,
                        videoId: song.videoId,
                        thumbnail: song.thumbnail,
                        youtubeUrl: song.youtubeUrl,
                        requester: song.requester,
                        requesterNickname: song.requesterNickname || song.requester,
                        isStreamer: song.isStreamer || false,
                        playedAt: new Date()
                    });
                    console.log(`📚 히스토리 저장: ${song.title} - ${song.artist} (신청: ${song.requester})`);
                } catch (dbErr) {
                    console.error('❌ 히스토리 저장 오류:', dbErr.message);
                }
            }
        }
        
        res.json({ success: !!playedSong });
    } catch (error) {
        console.error('❌ 신청곡 재생 완료 처리 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 신청곡 설정 업데이트 (받기/안받기, 중복신청 제한)
app.post('/api/song-queue/settings', (req, res) => {
    try {
        const { userId, isAccepting, cooldownMinutes, minFollowRole } = req.body;
        const update = {};
        if (isAccepting !== undefined) update.isAccepting = isAccepting;
        if (cooldownMinutes !== undefined) update.cooldownMinutes = Number(cooldownMinutes);
        if (minFollowRole !== undefined) update.minFollowRole = Number(minFollowRole);
        songRequestService.setSettings(userId, update);
        console.log(`⚙️ 신청곡 설정 업데이트: ${userId}`, update);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── 플레이리스트 폴더 CRUD ──────────────────────────────────────
// 폴더 목록 조회
app.get('/api/my-playlist-folder/:userId', async (req, res) => {
    try {
        const MyPlaylistFolder = require('./models/MyPlaylistFolder');
        const folders = await MyPlaylistFolder.find({ userId: req.params.userId }).sort({ order: 1, createdAt: 1 });
        res.json({ success: true, folders });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 폴더 생성
app.post('/api/my-playlist-folder/create', async (req, res) => {
    try {
        const MyPlaylistFolder = require('./models/MyPlaylistFolder');
        const { userId, name } = req.body;
        if (!userId || !name) return res.json({ success: false, message: '이름을 입력해주세요' });
        const count = await MyPlaylistFolder.countDocuments({ userId });
        const folder = await MyPlaylistFolder.create({ userId, name, order: count });
        res.json({ success: true, folder });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// 폴더 삭제 (폴더 내 곡도 함께 삭제)
app.delete('/api/my-playlist-folder/:id', async (req, res) => {
    try {
        const MyPlaylistFolder = require('./models/MyPlaylistFolder');
        const MyPlaylist = require('./models/MyPlaylist');
        const folder = await MyPlaylistFolder.findByIdAndDelete(req.params.id);
        if (folder) await MyPlaylist.deleteMany({ folderId: String(folder._id) });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 나만의 플레이리스트 곡 CRUD ─────────────────────────────────
// 폴더 내 곡 조회
app.get('/api/my-playlist/:userId', async (req, res) => {
    try {
        const MyPlaylist = require('./models/MyPlaylist');
        const { userId } = req.params;
        const { folderId, search } = req.query;
        const query = { userId };
        if (folderId) query.folderId = folderId;
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { artist: { $regex: search, $options: 'i' } }
            ];
        }
        const playlist = await MyPlaylist.find(query).sort({ order: 1, addedAt: 1 });
        res.json({ success: true, playlist });
    } catch (error) {
        console.error('❌ 플레이리스트 조회 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 곡 추가 (폴더 지정)
app.post('/api/my-playlist/add', async (req, res) => {
    try {
        const MyPlaylist = require('./models/MyPlaylist');
        const { userId, title, artist, videoId, thumbnail, youtubeUrl, folderId, folderName } = req.body;
        if (!userId || !title) return res.json({ success: false, message: '필수 파라미터 누락' });
        if (folderId) {
            const count = await MyPlaylist.countDocuments({ userId, folderId });
            if (count >= 20) return res.json({ success: false, message: '폴더당 최대 20곡까지 저장 가능합니다' });
        }
        const count = await MyPlaylist.countDocuments({ userId, folderId: folderId || null });
        const item = await MyPlaylist.create({ userId, title, artist: artist || '', videoId, thumbnail, youtubeUrl, folderId: folderId || null, folderName: folderName || null, order: count });
        res.json({ success: true, item });
    } catch (error) {
        console.error('❌ 플레이리스트 추가 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 곡 삭제
app.delete('/api/my-playlist/:id', async (req, res) => {
    try {
        const MyPlaylist = require('./models/MyPlaylist');
        await MyPlaylist.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ 플레이리스트 삭제 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 플레이리스트 → 신청곡 큐 추가
app.post('/api/my-playlist/add-to-queue', async (req, res) => {
    try {
        const MyPlaylist = require('./models/MyPlaylist');
        const User = require('./models/User');
        const { userId, itemId } = req.body;
        const item = await MyPlaylist.findById(itemId);
        if (!item) return res.json({ success: false, message: '곡을 찾을 수 없습니다' });
        const user = await User.findById(userId);
        const streamerName = user?.tiktokId || 'Streamer';
        const hostYoutubeKey1 = user?.youtubeApiKey || process.env.YOUTUBE_API_KEY;
        const hostSongService1 = new SongRequestService(hostYoutubeKey1);
        hostSongService1.songQueue = songRequestService.songQueue;
        hostSongService1.settings = songRequestService.settings;
        hostSongService1.lastRequestTime = songRequestService.lastRequestTime;
        const result = await hostSongService1.addSongRequest(userId,
            { title: item.title, artist: item.artist },
            { username: streamerName, uniqueId: streamerName, nickname: streamerName, badges: [], isVIP: false, isStreamer: true, level: 1 }
        );
        if (result.success) emitQueueUpdate(userId);
        res.json(result);
    } catch (error) {
        console.error('❌ 플레이리스트→큐 추가 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 신청곡 히스토리 조회
app.get('/api/song-history/:userId', async (req, res) => {
    try {
        const SongHistory = require('./models/SongHistory');
        const { userId } = req.params;
        const { search, date, limit = 100 } = req.query;

        const query = { userId, isStreamer: { $ne: true } };
        if (date) {
            const start = new Date(date);
            const end = new Date(date);
            end.setDate(end.getDate() + 1);
            query.playedAt = { $gte: start, $lt: end };
        }
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { artist: { $regex: search, $options: 'i' } },
                { requester: { $regex: search, $options: 'i' } },
                { requesterNickname: { $regex: search, $options: 'i' } }
            ];
        }

        const history = await SongHistory.find(query)
            .sort({ playedAt: -1 })
            .limit(parseInt(limit));

        res.json({ success: true, history });
    } catch (error) {
        console.error('❌ 히스토리 조회 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 히스토리에서 큐로 추가 (방송 전 미리 담기)
app.post('/api/song-history/add-to-queue', async (req, res) => {
    try {
        const { userId, historyId } = req.body;
        const SongHistory = require('./models/SongHistory');
        const song = await SongHistory.findById(historyId);
        if (!song) return res.json({ success: false, message: '히스토리를 찾을 수 없습니다' });

        const User = require('./models/User');
        const user = await User.findById(userId);

        const hostYoutubeKey2 = user?.youtubeApiKey || process.env.YOUTUBE_API_KEY;
        const hostSongService2 = new SongRequestService(hostYoutubeKey2);
        hostSongService2.songQueue = songRequestService.songQueue;
        hostSongService2.settings = songRequestService.settings;
        hostSongService2.lastRequestTime = songRequestService.lastRequestTime;
        const result = await hostSongService2.addSongRequest(userId, { title: song.title, artist: song.artist }, {
            username: user?.tiktokId || 'Streamer',
            uniqueId: user?.tiktokId || 'Streamer',
            nickname: user?.tiktokId || 'Streamer',
            badges: [],
            isVIP: false,
            isStreamer: true,
            level: 1
        });

        if (result.success) emitQueueUpdate(userId);
        res.json(result);
    } catch (error) {
        console.error('❌ 히스토리→큐 추가 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 호스트 직접 신청: 곡 검색 + 큐 추가
app.post('/api/song-request/search', async (req, res) => {
    try {
        const { userId, title, artist } = req.body;
        if (!userId || !title) return res.json({ success: false, message: '필수 파라미터 누락' });

        const songData = await songRequestService.searchSong(title, artist || '');
        if (!songData) return res.json({ success: false, message: '노래를 찾을 수 없습니다' });

        res.json({ success: true, song: songData });
    } catch (error) {
        console.error('❌ 곡 검색 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 신청곡 전체 삭제
app.post('/api/song-queue/clear', (req, res) => {
    try {
        const { userId } = req.body;
        songRequestService.clearQueue(userId);
        emitQueueUpdate(userId);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ 신청곡 전체 삭제 오류:', error);
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

// ===== 신청곡 테스트 API (라이브 없이 시뮬레이션) =====
app.post('/api/song-queue/test', async (req, res) => {
    try {
        const { userId, message, username, followRole } = req.body;
        // message 예: "#Dynamite #BTS" 또는 "#Dynamite#BTS"

        if (!userId || !message) {
            return res.status(400).json({ success: false, message: 'userId, message 필수' });
        }

        // 1. 파싱
        const songData = songRequestService.parseSongRequest(message);
        if (!songData) {
            return res.json({ success: false, message: '신청곡 패턴 인식 실패. 형식: #노래제목 #가수명' });
        }

        // 2. 팔로워 체크 (테스트에서는 followRole 파라미터로 제어, 기본 1)
        const role = Number(followRole ?? 1);
        if (role < 1) {
            return res.json({ success: false, message: '팔로워 아님 (followRole < 1)' });
        }

        // 3. 설정 체크
        const settings = songRequestService.getSettings(userId);
        if (!settings.isAccepting) {
            return res.json({ success: false, message: '신청곡 안받기 상태' });
        }

        // 4. 큐 추가
        const requesterInfo = {
            username: username || 'test_user',
            uniqueId: username || 'test_user',
            badges: ['follower'],
            isVIP: false,
            level: 1
        };

        const result = await songRequestService.addSongRequest(userId, songData, requesterInfo);
        if (result.success) {
            emitQueueUpdate(userId);
            return res.json({
                success: true,
                parsed: songData,
                song: result.song,
                queuePosition: result.queuePosition,
                totalQueue: result.totalQueue
            });
        } else {
            return res.json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error('❌ 신청곡 테스트 오류:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== Google TTS API =====
const googleTTS = require('./services/GoogleTTSService');
const VoiceSettings = require('./models/VoiceSettings');

// VIP 목소리 설정 목록 조회
app.get('/api/tts/voice-settings/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const settings = await VoiceSettings.find({ userId }).sort({ createdAt: -1 });
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// VIP 목소리 설정 저장/수정
app.post('/api/tts/voice-settings', async (req, res) => {
    try {
        const { userId, tiktokUniqueId, nickname, chirpVoice, speed, memo } = req.body;
        if (!userId || !tiktokUniqueId || !chirpVoice) {
            return res.status(400).json({ success: false, message: 'userId, tiktokUniqueId, chirpVoice 필수' });
        }
        const setting = await VoiceSettings.findOneAndUpdate(
            { userId, tiktokUniqueId },
            { nickname: nickname || '', chirpVoice, speed: speed || 1.0, memo: memo || '' },
            { upsert: true, new: true }
        );
        res.json({ success: true, setting });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// VIP 목소리 설정 삭제
app.delete('/api/tts/voice-settings/:userId/:tiktokUniqueId', async (req, res) => {
    try {
        const { userId, tiktokUniqueId } = req.params;
        await VoiceSettings.deleteOne({ userId, tiktokUniqueId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 디버그: useGoogleTTS DB 값 확인
app.get('/debug/tts-settings/:userId', async (req, res) => {
    try {
        const User = require('./models/User');
        const user = await User.findById(req.params.userId).select('ttsSettings');
        const desktopSocketId = desktopSocketMap.get(req.params.userId);
        res.json({
            ttsSettings: user?.ttsSettings,
            desktopSocketId: desktopSocketId || '미등록',
            googleApiKey: process.env.GOOGLE_TTS_API_KEY ? '있음' : '없음'
        });
    } catch (e) {
        res.json({ error: e.message });
    }
});

// Google TTS 활성화 설정 저장
app.post('/api/tts/settings', async (req, res) => {
    try {
        const { userId, useGoogleTTS, defaultSpeed, defaultVolume } = req.body;
        const User = require('./models/User');
        await User.findByIdAndUpdate(userId, {
            'ttsSettings.useGoogleTTS': useGoogleTTS,
            'ttsSettings.defaultSpeed': defaultSpeed || 1.0,
            'ttsSettings.defaultVolume': defaultVolume != null ? defaultVolume : 80
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Chirp3 HD 목소리 목록 조회
app.get('/api/tts/voices', (req, res) => {
    res.json({ success: true, voices: googleTTS.getChirp3Voices() });
});

// TTS 미리 듣기 - 브라우저에서 MP3 스트리밍
app.get('/api/tts/preview', async (req, res) => {
    try {
        const { voice, text = '안녕하세요, 반갑습니다!', speed = 1.0 } = req.query;
        if (!voice) return res.status(400).json({ success: false, message: 'voice 파라미터 필요' });

        const apiKey = process.env.GOOGLE_TTS_API_KEY;
        if (!apiKey) return res.status(500).json({ success: false, message: 'GOOGLE_TTS_API_KEY 환경변수 없음' });

        // axios 직접 호출해서 오류 상세 확인
        const axios = require('axios');
        let voiceConfig;
        const CHIRP3 = ['Achernar','Aoede','Autonoe','Callirrhoe','Despina','Enceladus','Erinome','Fenrir','Gacrux','Iocaste','Laomedeia','Leda','Orus','Pulcherrima','Schedar','Sulafat','Umbriel','Vindemiatrix','Zephyr','Zubenelgenubi'];
        if (CHIRP3.includes(voice)) {
            voiceConfig = { languageCode: 'ko-KR', name: `ko-KR-Chirp3-HD-${voice}` };
        } else {
            voiceConfig = { languageCode: 'ko-KR', name: voice };
        }

        const response = await axios.post(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
            { input: { text }, voice: voiceConfig, audioConfig: { audioEncoding: 'MP3', speakingRate: parseFloat(speed) } },
            { timeout: 10000 }
        );

        if (!response.data?.audioContent) {
            return res.status(500).json({ success: false, message: 'audioContent 없음', raw: response.data });
        }

        const audioBuffer = Buffer.from(response.data.audioContent, 'base64');
        res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length });
        res.send(audioBuffer);
    } catch (error) {
        const detail = error.response?.data || error.message;
        console.error('❌ TTS 미리 듣기 오류:', detail);
        res.status(500).json({ success: false, message: 'TTS 오류', detail });
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

// userId별 Desktop App 소켓 ID 추적 (첫 번째 연결된 앱만 명령 수신)
const desktopSocketMap = new Map();

// 알고리즘 리포트 - 방송 세션 추적 (userId → { sessionId, startedAt, tiktokId, countryMap, hourlyMap, peakViewers, totalChats, totalGifts, totalLikes, foreignChatCount, languages })
const liveSessionMap = new Map();

// 디버그: Desktop App 등록 상태 확인
app.get('/debug/desktop-status', (req, res) => {
    const status = {};
    for (const [uid, sid] of desktopSocketMap.entries()) {
        const sock = io.sockets.sockets.get(sid);
        status[uid] = { socketId: sid, connected: sock ? sock.connected : false };
    }
    res.json({ desktopSocketMap: status, totalConnected: io.sockets.sockets.size });
});

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
            // 항상 최신 소켓으로 업데이트 (재연결 시에도 정상 작동)
            const prevSocketId = desktopSocketMap.get(targetUserId);
            desktopSocketMap.set(targetUserId, socket.id);
            if (prevSocketId && prevSocketId !== socket.id) {
                console.log(`📱 Desktop App 소켓 갱신: ${targetUserId} | ${prevSocketId} → ${socket.id}`);
            } else {
                console.log(`📱 주 Desktop App 등록: ${targetUserId} → ${socket.id}`);
            }
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
            // 주 Desktop App이 끊기면 맵에서 제거
            if (desktopSocketMap.get(userId) === socket.id) {
                desktopSocketMap.delete(userId);
                console.log(`📱 주 Desktop App 해제: ${userId}`);
                // 같은 룸에 다른 Desktop App이 있으면 그걸 주 앱으로 승격
                const room = io.sockets.adapter.rooms.get(userId);
                if (room) {
                    for (const sid of room) {
                        const s = io.sockets.sockets.get(sid);
                        if (s && s.handshake.auth.type === 'desktop-app') {
                            desktopSocketMap.set(userId, sid);
                            console.log(`📱 새 주 Desktop App 승격: ${userId} → ${sid}`);
                            break;
                        }
                    }
                }
            }
            if (!desktopSocketMap.has(userId)) {
                liveStatusMap.delete(userId);
                io.to(userId).emit('desktop-app-disconnected', { userId });
                io.to(userId).emit('live-status', { isLive: false });
            }
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

                // 신청곡 파싱
                const UsageLog = require('./models/UsageLog');
                const PlanLimit = require('./models/PlanLimit');
                const songData = songRequestService.parseSongRequest(tiktokData.message);
                let songRequest = null;
                const songSettings = songRequestService.getSettings(userId);
                const requesterFollowRole = Number(tiktokData.followRole) || 0;
                const minRole = songSettings.minFollowRole ?? 0;

                if (songData) {
                    console.log(`🎵 신청곡 감지: "${songData.title}" - "${songData.artist}" | followRole=${requesterFollowRole} | isAccepting=${songSettings.isAccepting}`);
                }

                if (songData && songSettings.isAccepting && (requesterFollowRole >= minRole || tiktokData.isModerator)) {
                    const lastTime = songRequestService.getLastRequestTime(userId, tiktokData.uniqueId || tiktokData.username);
                    const elapsed = lastTime ? (Date.now() - lastTime) / 1000 / 60 : Infinity;
                    const cooldownOk = songSettings.cooldownMinutes === 0 || elapsed >= songSettings.cooldownMinutes;

                    if (cooldownOk) {
                        const today = new Date().toISOString().split('T')[0];
                        let usageLog = await UsageLog.findOneAndUpdate(
                            { userId, date: today },
                            { $setOnInsert: { songRequestCount: 0, gptAiCount: 0, pronunciationCoachCount: 0 } },
                            { upsert: true, new: true }
                        );
                        const planLimit = await PlanLimit.findOne({ planName: user?.plan || 'free' });
                        const limit = planLimit ? (planLimit.songRequestLimit ?? -1) : -1;
                        const currentUsage = usageLog.songRequestCount || 0;

                        if (limit === -1 || currentUsage < limit) {
                            const hostYoutubeKey = user?.youtubeApiKey || process.env.YOUTUBE_API_KEY;
                            const hostSongService = new SongRequestService(hostYoutubeKey);
                            hostSongService.songQueue = songRequestService.songQueue;
                            hostSongService.settings = songRequestService.settings;
                            hostSongService.lastRequestTime = songRequestService.lastRequestTime;
                            console.log(`🔑 TikTok 신청곡 API 키: ${user?.youtubeApiKey ? '호스트 키' : '서버 공용 키'}`);
                            const result = await hostSongService.addSongRequest(userId, songData, {
                                username: tiktokData.username,
                                uniqueId: tiktokData.uniqueId || tiktokData.username,
                                nickname: tiktokData.nickname || tiktokData.username,
                                badges: tiktokData.badges || [],
                                isVIP: false,
                                level: 1
                            });
                            console.log(`🎵 addSongRequest 결과:`, result.success, result.message || '');
                            if (result.success) {
                                songRequest = result.song;
                                songRequestService.setLastRequestTime(userId, tiktokData.uniqueId || tiktokData.username, Date.now());
                                await UsageLog.updateOne({ userId, date: today }, { $inc: { songRequestCount: 1 } });
                                emitQueueUpdate(userId);
                            }
                        } else {
                            console.log(`🎵 신청곡 사용량 초과: ${currentUsage}/${limit}`);
                        }
                    } else {
                        console.log(`🎵 쿨다운 중: elapsed=${elapsed.toFixed(1)}분`);
                    }
                } else if (songData) {
                    console.log(`🎵 신청곡 거부: isAccepting=${songSettings.isAccepting}, followRole=${requesterFollowRole}`);
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

                // 닉네임 발음 처리 (외국어 닉네임 → 한국어 발음, 캐시 기반)
                let nicknamePronunciation2 = null;
                const dn2 = tiktokData.nickname || tiktokData.username || '';
                const isKorean2 = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(dn2);
                const isAscii2 = /^[a-zA-Z0-9._\-\s]+$/.test(dn2);
                if (!isKorean2 && !isAscii2 && dn2.length > 0) {
                    const ck2 = `${userId}:${dn2}`;
                    if (nicknamePronunciationCache.has(ck2)) {
                        nicknamePronunciation2 = nicknamePronunciationCache.get(ck2);
                    } else {
                        try {
                            const g2 = await pronunciationCoach.generatePronunciationGuide(dn2, await pronunciationCoach.detectLanguage(dn2), 'ko');
                            if (g2?.pronunciation) {
                                nicknamePronunciation2 = g2.pronunciation;
                                nicknamePronunciationCache.set(ck2, nicknamePronunciation2);
                            }
                        } catch (e) {}
                    }
                }

                io.to(userId).emit('chat-message', {
                    ...tiktokData,
                    nicknamePronunciation: nicknamePronunciation2,
                    messageLanguage,
                    pronunciationGuide,
                    songRequest,
                    usage: usageInfo
                });

                // Desktop App TTS 실행 명령
                const desktopSid = desktopSocketMap.get(userId);
                const liveStatusForTTS = liveStatusMap.get(String(userId));
                if (desktopSid && tiktokData.message && liveStatusForTTS?.isLive === true) {
                    const VoiceSettingsModel = require('./models/VoiceSettings');
                    const voiceSettings = await VoiceSettingsModel.find({ userId });
                    const userGendersMap = {};
                    if (user?.tiktokUserGenders) {
                        user.tiktokUserGenders.forEach((v, k) => { userGendersMap[k] = v; });
                    }
                    io.to(desktopSid).emit('tts-speak', {
                        text: tiktokData.message,
                        uniqueId: tiktokData.uniqueId || tiktokData.username,
                        volume: user?.ttsSettings?.defaultVolume != null ? user.ttsSettings.defaultVolume : 80,
                        userGenders: userGendersMap,
                        googleTTS: {
                            enabled: user?.ttsSettings?.useGoogleTTS || false,
                            apiKey: process.env.GOOGLE_TTS_API_KEY || '',
                            defaultSpeed: user?.ttsSettings?.defaultSpeed || 1.0,
                            voiceSettings: voiceSettings.map(v => ({
                                tiktokUniqueId: v.tiktokUniqueId,
                                chirpVoice: v.chirpVoice,
                                speed: v.speed
                            }))
                        }
                    });
                    console.log(`🔊 tts-speak 전송 → ${desktopSid} | "${tiktokData.message}" | googleTTS=${user?.ttsSettings?.useGoogleTTS}`);
                }

                // 알고리즘 리포트: 채팅/국가/시간대 기록
                const sessChat = liveSessionMap.get(String(userId));
                if (sessChat) {
                    sessChat.totalChats++;
                    const hr = new Date().getHours();
                    if (!sessChat.hourlyMap[hr]) sessChat.hourlyMap[hr] = { viewerCount: 0, chatCount: 0 };
                    sessChat.hourlyMap[hr].chatCount++;
                    const cc = tiktokData.userCountry || tiktokData.countryCode || '';
                    if (cc) sessChat.countryMap[cc] = (sessChat.countryMap[cc] || 0) + 1;
                    if (messageLanguage && messageLanguage !== 'unknown' && messageLanguage !== streamerLanguage) {
                        sessChat.foreignChatCount++;
                        sessChat.languages.add(messageLanguage);
                    }
                }
            } catch (err) {
                console.error('❌ tiktok-data chat 처리 오류:', err);
                io.to(userId).emit('chat-message', tiktokData);
            }
        } else if (type === 'stats') {
            io.to(userId).emit('viewer-update', tiktokData);
            // 알고리즘 리포트: 시청자 수 기록
            const sessSt = liveSessionMap.get(String(userId));
            if (sessSt) {
                const viewers = tiktokData.viewerCount || 0;
                if (viewers > sessSt.peakViewers) sessSt.peakViewers = viewers;
                const hr = new Date().getHours();
                if (!sessSt.hourlyMap[hr]) sessSt.hourlyMap[hr] = { viewerCount: 0, chatCount: 0 };
                sessSt.hourlyMap[hr].viewerCount = Math.max(sessSt.hourlyMap[hr].viewerCount, viewers);
            }
        } else if (type === 'gift') {
            io.to(userId).emit('gift-received', tiktokData);
            const sessGift = liveSessionMap.get(String(userId));
            if (sessGift && tiktokData.isFinal !== false) {
                sessGift.totalGifts += (tiktokData.repeatCount || 1);
                sessGift.totalDiamonds = (sessGift.totalDiamonds || 0) + ((tiktokData.diamondCount || 0) * (tiktokData.repeatCount || 1));
            }
        } else if (type === 'like') {
            io.to(userId).emit('like-received', tiktokData);
            const sessLike = liveSessionMap.get(String(userId));
            if (sessLike) sessLike.totalLikes += (tiktokData.likeCount || 1);
        } else if (type === 'member') {
            // 입장 이벤트 - 국가 데이터 수집 (followInfo.region 또는 userDetails 기반)
            io.to(userId).emit('member-join', tiktokData);
            const sessMember = liveSessionMap.get(String(userId));
            if (sessMember) {
                sessMember.totalJoins = (sessMember.totalJoins || 0) + 1;
                // 팔로워 수 기반 국가 추정은 어렵지만 데이터 저장은 해둠
                const cc = tiktokData.userCountry || tiktokData.countryCode || '';
                if (cc) sessMember.countryMap[cc] = (sessMember.countryMap[cc] || 0) + 1;
            }
        } else if (type === 'social') {
            io.to(userId).emit('social-event', tiktokData);
            const sessSocial = liveSessionMap.get(String(userId));
            if (sessSocial) {
                if (tiktokData.isFollow) sessSocial.totalFollows = (sessSocial.totalFollows || 0) + 1;
                if (tiktokData.isShare) sessSocial.totalShares = (sessSocial.totalShares || 0) + 1;
            }
        } else if (type === 'subscribe') {
            io.to(userId).emit('subscribe-event', tiktokData);
            const sessSub = liveSessionMap.get(String(userId));
            if (sessSub) sessSub.totalSubscribes = (sessSub.totalSubscribes || 0) + 1;
        } else if (type === 'streamEnd') {
            // TikTok이 자체 종료 → 서버도 라이브 상태 false 처리
            console.log(`🔴 streamEnd 수신 (userId: ${userId}, actionId: ${tiktokData.actionId})`);
            liveStatusMap.set(String(userId), { isLive: false });
            liveStatusMap.set(userId, { isLive: false });
            io.to(userId).emit('live-status', { isLive: false, reason: 'streamEnd', actionId: tiktokData.actionId });
            // 세션 종료 저장
            const sessEnd = liveSessionMap.get(String(userId));
            if (sessEnd) {
                try {
                    const LiveSession = require('./models/LiveSession');
                    const endedAt = new Date();
                    const durationMinutes = Math.round((endedAt - sessEnd.startedAt) / 60000);
                    const countryStats = Object.entries(sessEnd.countryMap).map(([cc, cnt]) => ({ countryCode: cc, countryName: cc, count: cnt }));
                    const hourlyStats = Object.entries(sessEnd.hourlyMap).map(([h, v]) => ({ hour: parseInt(h), viewerCount: v.viewerCount || 0, chatCount: v.chatCount || 0 }));
                    await LiveSession.findByIdAndUpdate(sessEnd.sessionId, {
                        endedAt, durationMinutes,
                        peakViewers: sessEnd.peakViewers,
                        totalChats: sessEnd.totalChats,
                        totalGifts: sessEnd.totalGifts,
                        totalLikes: sessEnd.totalLikes,
                        foreignChatCount: sessEnd.foreignChatCount,
                        countryStats, hourlyStats,
                        detectedLanguages: [...sessEnd.languages]
                    });
                } catch(e) { console.error('streamEnd 세션 저장 오류:', e); }
                liveSessionMap.delete(String(userId));
            }
        } else if (type === 'questionNew') {
            io.to(userId).emit('question-new', tiktokData);
        } else if (type === 'emote') {
            io.to(userId).emit('emote-received', tiktokData);
        } else if (type === 'envelope') {
            io.to(userId).emit('envelope-received', tiktokData);
        } else if (type === 'liveIntro') {
            io.to(userId).emit('live-intro', tiktokData);
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

        // 알고리즘 리포트: 세션 시작
        try {
            const LiveSession = require('./models/LiveSession');
            const session = await LiveSession.create({ userId, tiktokId, startedAt: new Date() });
            liveSessionMap.set(String(userId), {
                sessionId: session._id,
                startedAt: session.startedAt,
                tiktokId,
                countryMap: {},
                hourlyMap: {},
                peakViewers: 0,
                totalChats: 0,
                totalGifts: 0,
                totalLikes: 0,
                foreignChatCount: 0,
                languages: new Set()
            });
            console.log(`📊 LiveSession 시작: ${session._id}`);
        } catch(e) { console.error('LiveSession 시작 오류:', e); }

        // Desktop App이 연결되어 있는지 확인
        const room = io.sockets.adapter.rooms.get(userId);
        const roomSize = room ? room.size : 0;
        console.log(`📡 룸 ${userId} 연결 수: ${roomSize}`);

        const desktopSocketId = desktopSocketMap.get(userId);
        if (!desktopSocketId) {
            // Desktop App 미연결 - 에러 반환 (서버 직접 연결 금지)
            console.log(`⚠️ Desktop App 미연결 상태 - 방송시작 불가`);
            socket.emit('live-error', { message: 'Desktop App이 연결되어 있지 않습니다. TikFind 앱을 실행한 후 다시 시도해주세요.' });
            io.to(userId).emit('live-status', { isLive: false });
        } else {
            // VIP 목소리 설정 + Google TTS API 키 조회 후 전달
            try {
                const User = require('./models/User');
                const VoiceSettings = require('./models/VoiceSettings');
                const user = await User.findById(userId).select('ttsSettings');
                const voiceSettings = await VoiceSettings.find({ userId });

                io.to(desktopSocketId).emit('start-live', {
                    tiktokId,
                    googleTTS: {
                        enabled: user?.ttsSettings?.useGoogleTTS || false,
                        apiKey: process.env.GOOGLE_TTS_API_KEY || '',
                        defaultSpeed: user?.ttsSettings?.defaultSpeed || 1.0,
                        voiceSettings: voiceSettings.map(v => ({
                            tiktokUniqueId: v.tiktokUniqueId,
                            chirpVoice: v.chirpVoice,
                            speed: v.speed
                        }))
                    }
                });
            } catch (e) {
                io.to(desktopSocketId).emit('start-live', { tiktokId });
            }
            console.log(`📲 주 Desktop App(${desktopSocketId})으로 start-live 전달`);
        }
    });

    // 웹 → Desktop App: 라이브 종료 명령
    socket.on('stop-live', async (data) => {
        const { userId } = data;
        console.log(`⏹️ 라이브 종료 명령: ${userId}`);

        // 주 Desktop App 소켓 하나에만 전달
        const desktopSocketId = desktopSocketMap.get(userId);
        if (desktopSocketId) {
            io.to(desktopSocketId).emit('stop-live');
            io.to(desktopSocketId).emit('tts-stop'); // TTS 즉시 중지
        } else {
            io.to(userId).emit('stop-live');
        }

        // 서버 직접 연결도 종료
        const liveService = liveConnections.get(userId);
        if (liveService) {
            try { liveService.disconnect(); } catch(e) {}
            liveConnections.delete(userId);
        }

        // 라이브 상태를 false로 먼저 설정 (이후 tiktok-data 이벤트에서 tts-speak 차단됨)
        liveStatusMap.set(userId, { isLive: false });
        liveStatusMap.set(String(userId), { isLive: false });
        io.to(userId).emit('live-status', { isLive: false });

        // 알고리즘 리포트: 세션 종료 저장
        const sess = liveSessionMap.get(String(userId));
        if (sess) {
            try {
                const LiveSession = require('./models/LiveSession');
                const endedAt = new Date();
                const durationMinutes = Math.round((endedAt - sess.startedAt) / 60000);
                const countryStats = Object.entries(sess.countryMap).map(([cc, cnt]) => ({ countryCode: cc, countryName: cc, count: cnt }));
                const hourlyStats = Object.entries(sess.hourlyMap).map(([h, v]) => ({ hour: parseInt(h), viewerCount: v.viewerCount || 0, chatCount: v.chatCount || 0 }));
                await LiveSession.findByIdAndUpdate(sess.sessionId, {
                    endedAt, durationMinutes,
                    peakViewers: sess.peakViewers,
                    totalChats: sess.totalChats,
                    totalGifts: sess.totalGifts,
                    totalDiamonds: sess.totalDiamonds || 0,
                    totalLikes: sess.totalLikes,
                    totalFollows: sess.totalFollows || 0,
                    totalShares: sess.totalShares || 0,
                    totalSubscribes: sess.totalSubscribes || 0,
                    totalJoins: sess.totalJoins || 0,
                    foreignChatCount: sess.foreignChatCount,
                    countryStats,
                    hourlyStats,
                    detectedLanguages: [...sess.languages]
                });
                console.log(`📊 LiveSession 종료 저장: ${sess.sessionId} (${durationMinutes}분)`);
            } catch(e) { console.error('LiveSession 종료 저장 오류:', e); }
            liveSessionMap.delete(String(userId));
        }
    });
    
    // TTS 설정 (웹 → Desktop App)
    socket.on('tts-settings', async (settings) => {
        console.log('🔊 TTS 설정 수신:', settings);
        const targetUserId = settings.userId || userId;
        const desktopSocketId = desktopSocketMap.get(targetUserId);

        // Google TTS 실시간 업데이트 - VIP 목소리 설정 최신화
        try {
            const User = require('./models/User');
            const VoiceSettings = require('./models/VoiceSettings');
            const user = await User.findById(targetUserId).select('ttsSettings');
            const voiceSettings = await VoiceSettings.find({ userId: targetUserId });

            const googleTTSUpdate = {
                enabled: user?.ttsSettings?.useGoogleTTS || false,
                apiKey: process.env.GOOGLE_TTS_API_KEY || '',
                defaultSpeed: user?.ttsSettings?.defaultSpeed || 1.0,
                voiceSettings: voiceSettings.map(v => ({
                    tiktokUniqueId: v.tiktokUniqueId,
                    chirpVoice: v.chirpVoice,
                    speed: v.speed
                }))
            };

            const payload = { ...settings, googleTTS: googleTTSUpdate };

            if (desktopSocketId) {
                io.to(desktopSocketId).emit('tts-settings', payload);
            } else {
                io.to(targetUserId).emit('tts-settings', payload);
            }
            console.log(`🔊 TTS 설정 + Google TTS VIP ${voiceSettings.length}명 전달`);
        } catch (e) {
            if (desktopSocketId) {
                io.to(desktopSocketId).emit('tts-settings', settings);
            } else {
                io.to(targetUserId).emit('tts-settings', settings);
            }
        }
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

            const User = require('./models/User');
            const user = await User.findById(userId);
            const streamerName = user?.tiktokId || 'Streamer';

            const requester = {
                username: streamerName,
                uniqueId: streamerName,
                nickname: streamerName,
                badges: [],
                isVIP: false,
                isStreamer: true,
                level: 1
            };

            const hostYoutubeKey = user?.youtubeApiKey || process.env.YOUTUBE_API_KEY;
            const hostSongService = new SongRequestService(hostYoutubeKey);
            hostSongService.songQueue = songRequestService.songQueue;
            hostSongService.settings = songRequestService.settings;
            hostSongService.lastRequestTime = songRequestService.lastRequestTime;
            console.log(`🔑 스트리머 직접 신청 API 키: ${user?.youtubeApiKey ? '호스트 키' : '서버 공용 키'}`);
            const result = await hostSongService.addSongRequest(
                userId,
                { title: songData.title, artist: songData.artist },
                requester
            );

            if (result.success) {
                console.log('✅ 스트리머 신청곡 추가 성공:', result.song.title);
                emitQueueUpdate(userId);
            } else {
                console.log('❌ 스트리머 신청곡 추가 실패:', result.message);
                socket.emit('song-request-error', { message: result.message });
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
