const UsageLog = require('../models/UsageLog');
const PlanLimit = require('../models/PlanLimit');
const moment = require('moment-timezone');

/**
 * 사용자 시간대 기준으로 오늘 날짜 계산
 * @param {string} timezone - 사용자 시간대 (예: 'Asia/Seoul')
 * @returns {string} YYYY-MM-DD 형식의 날짜
 */
function getTodayInUserTimezone(timezone = 'UTC') {
    return moment().tz(timezone).format('YYYY-MM-DD');
}

/**
 * 사용자의 일일 사용량을 체크하고 제한을 확인하는 미들웨어
 * @param {string} featureType - 'songRequest', 'gptAi', 'pronunciationCoach'
 */
function checkUsageLimit(featureType) {
    return async (req, res, next) => {
        try {
            const userId = req.user?._id || req.user?.id;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: '로그인이 필요합니다.'
                });
            }

            // 사용자 플랜 확인
            const userPlan = req.user.plan || 'free';
            
            // 플랜 제한 조회
            const planLimit = await PlanLimit.findOne({ planName: userPlan });
            
            if (!planLimit) {
                return res.status(500).json({
                    success: false,
                    message: '플랜 정보를 찾을 수 없습니다.'
                });
            }

            // 제한 값 가져오기
            let limit;
            let countField;
            
            switch (featureType) {
                case 'songRequest':
                    limit = planLimit.songRequestLimit;
                    countField = 'songRequestCount';
                    break;
                case 'gptAi':
                    limit = planLimit.gptAiLimit;
                    countField = 'gptAiCount';
                    break;
                case 'pronunciationCoach':
                    limit = planLimit.pronunciationCoachLimit;
                    countField = 'pronunciationCoachCount';
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        message: '잘못된 기능 타입입니다.'
                    });
            }

            // 무제한 플랜 (-1)이면 바로 통과
            if (limit === -1) {
                req.usageInfo = {
                    unlimited: true,
                    used: 0,
                    limit: -1,
                    remaining: -1
                };
                return next();
            }

            // 사용자 시간대 기준으로 오늘 날짜 계산
            const userTimezone = req.user.timezone || 'UTC';
            const today = getTodayInUserTimezone(userTimezone);

            // 오늘의 사용량 조회 또는 생성
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

            const currentUsage = usageLog[countField] || 0;

            // 제한 초과 체크
            if (currentUsage >= limit) {
                return res.status(429).json({
                    success: false,
                    message: `일일 사용 제한에 도달했습니다. (${currentUsage}/${limit})`,
                    error: 'USAGE_LIMIT_EXCEEDED',
                    usageInfo: {
                        used: currentUsage,
                        limit: limit,
                        remaining: 0,
                        plan: userPlan
                    }
                });
            }

            // 사용량 정보를 req에 추가
            req.usageInfo = {
                unlimited: false,
                used: currentUsage,
                limit: limit,
                remaining: limit - currentUsage,
                plan: userPlan
            };

            // 사용량 증가 함수를 req에 추가
            req.incrementUsage = async () => {
                usageLog[countField] = (usageLog[countField] || 0) + 1;
                await usageLog.save();
            };

            next();
        } catch (error) {
            console.error('Usage limit check error:', error);
            res.status(500).json({
                success: false,
                message: '사용량 확인 중 오류가 발생했습니다.'
            });
        }
    };
}

/**
 * 사용자의 현재 일일 사용량을 조회하는 함수
 */
async function getUserDailyUsage(userId, userTimezone = 'UTC') {
    try {
        const today = getTodayInUserTimezone(userTimezone);
        
        let usageLog = await UsageLog.findOne({ userId, date: today });
        
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
    } catch (error) {
        console.error('Get user daily usage error:', error);
        return {
            songRequestCount: 0,
            gptAiCount: 0,
            pronunciationCoachCount: 0
        };
    }
}

module.exports = {
    checkUsageLimit,
    getUserDailyUsage
};
