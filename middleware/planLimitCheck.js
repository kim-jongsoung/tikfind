const PlanLimit = require('../models/PlanLimit');
const UsageLog = require('../models/UsageLog');

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환
function getTodayDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

// 사용자의 플랜 이름 가져오기
function getUserPlanName(user) {
    if (!user) return 'free';
    
    // plan이 'unlimited'이면 unlimited
    if (user.plan === 'unlimited') return 'unlimited';
    
    // plan이 'pro'이고 subscriptionStatus가 'active' 또는 'trial'이면 universe
    if (user.plan === 'pro' && (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trial')) {
        return 'universe';
    }
    
    // 그 외는 모두 free
    return 'free';
}

// 플랜 제한 체크 공통 로직
async function checkLimit(req, res, next, featureType) {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                error: 'UNAUTHORIZED',
                message: '로그인이 필요합니다.' 
            });
        }

        const userId = req.user._id;
        const planName = getUserPlanName(req.user);
        const today = getTodayDate();

        // 플랜 제한 가져오기
        let planLimit = await PlanLimit.findOne({ planName });
        
        // 기본값이 없으면 생성
        if (!planLimit) {
            const defaultLimits = {
                free: { songRequestLimit: 5, gptAiLimit: 20, pronunciationCoachLimit: 10 },
                universe: { songRequestLimit: 100, gptAiLimit: 100, pronunciationCoachLimit: 100 },
                unlimited: { songRequestLimit: -1, gptAiLimit: -1, pronunciationCoachLimit: -1 }
            };
            
            planLimit = await PlanLimit.create({
                planName,
                ...defaultLimits[planName]
            });
        }

        // 해당 기능의 제한 확인
        let limit;
        let usageField;
        
        switch (featureType) {
            case 'songRequest':
                limit = planLimit.songRequestLimit;
                usageField = 'songRequestCount';
                break;
            case 'gptAi':
                limit = planLimit.gptAiLimit;
                usageField = 'gptAiCount';
                break;
            case 'pronunciationCoach':
                limit = planLimit.pronunciationCoachLimit;
                usageField = 'pronunciationCoachCount';
                break;
            default:
                return res.status(400).json({ 
                    success: false, 
                    error: 'INVALID_FEATURE',
                    message: '잘못된 기능 타입입니다.' 
                });
        }

        // -1은 무제한
        if (limit === -1) {
            // 사용량 기록은 하되 제한 없음
            await incrementUsage(userId, today, usageField);
            return next();
        }

        // 오늘의 사용량 가져오기
        let usageLog = await UsageLog.findOne({ userId, date: today });
        
        if (!usageLog) {
            // 오늘 처음 사용
            usageLog = await UsageLog.create({
                userId,
                date: today,
                [usageField]: 0
            });
        }

        const currentUsage = usageLog[usageField] || 0;

        // 제한 초과 확인
        if (currentUsage >= limit) {
            return res.status(429).json({ 
                success: false, 
                error: 'LIMIT_EXCEEDED',
                message: `일일 사용 제한을 초과했습니다. (${currentUsage}/${limit})`,
                limit: limit,
                currentUsage: currentUsage,
                planName: planName
            });
        }

        // 사용량 증가
        await incrementUsage(userId, today, usageField);

        // 제한 정보를 req에 추가
        req.planLimit = {
            planName,
            limit,
            currentUsage: currentUsage + 1,
            remaining: limit - currentUsage - 1
        };

        next();
    } catch (error) {
        console.error('플랜 제한 체크 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: 'SERVER_ERROR',
            message: '서버 오류가 발생했습니다.' 
        });
    }
}

// 개별 미들웨어 함수들
const checkSongRequestLimit = (req, res, next) => checkLimit(req, res, next, 'songRequest');
const checkGptAiLimit = (req, res, next) => checkLimit(req, res, next, 'gptAi');
const checkPronunciationCoachLimit = (req, res, next) => checkLimit(req, res, next, 'pronunciationCoach');

// 사용량 증가 함수
async function incrementUsage(userId, date, usageField) {
    await UsageLog.findOneAndUpdate(
        { userId, date },
        { $inc: { [usageField]: 1 } },
        { upsert: true, new: true }
    );
}

// 사용량 조회 함수 (대시보드용)
async function getUserUsage(userId, date = null) {
    const targetDate = date || getTodayDate();
    
    const usageLog = await UsageLog.findOne({ 
        userId, 
        date: targetDate 
    });

    if (!usageLog) {
        return {
            songRequestCount: 0,
            gptAiCount: 0,
            pronunciationCoachCount: 0
        };
    }

    return {
        songRequestCount: usageLog.songRequestCount || 0,
        gptAiCount: usageLog.gptAiCount || 0,
        pronunciationCoachCount: usageLog.pronunciationCoachCount || 0
    };
}

module.exports = {
    checkSongRequestLimit,
    checkGptAiLimit,
    checkPronunciationCoachLimit,
    getUserUsage,
    getUserPlanName
};
