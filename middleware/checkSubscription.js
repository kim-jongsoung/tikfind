/**
 * 구독 확인 미들웨어
 * 모든 API 요청에서 사용자의 구독 상태를 확인
 */

const User = require('../models/User');

/**
 * 구독 상태 확인 미들웨어
 */
const checkSubscription = async (req, res, next) => {
    try {
        const { userId } = req.body;

        // userId 없으면 에러
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'USER_ID_REQUIRED',
                message: 'User ID가 필요합니다.'
            });
        }

        // 사용자 조회
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        // 구독 상태 확인 (trial 또는 active만 허용)
        const validStatuses = ['trial', 'active'];
        if (!user.subscriptionStatus || !validStatuses.includes(user.subscriptionStatus)) {
            return res.status(403).json({
                success: false,
                error: 'SUBSCRIPTION_REQUIRED',
                message: '구독이 필요합니다. tikfind.com에서 구독해주세요.',
                currentStatus: user.subscriptionStatus,
                redirectUrl: 'https://tikfind.com/pricing'
            });
        }

        // 구독 만료일 확인
        if (user.subscriptionEndDate && user.subscriptionEndDate < Date.now()) {
            return res.status(403).json({
                success: false,
                error: 'SUBSCRIPTION_EXPIRED',
                message: '구독이 만료되었습니다. 갱신해주세요.',
                expiresAt: user.subscriptionEndDate,
                redirectUrl: 'https://tikfind.com/pricing'
            });
        }

        // 트라이얼 만료일 확인
        if (user.subscriptionStatus === 'trial' && user.trialEndDate && user.trialEndDate < Date.now()) {
            return res.status(403).json({
                success: false,
                error: 'TRIAL_EXPIRED',
                message: '무료 체험 기간이 만료되었습니다. 유료 플랜으로 업그레이드해주세요.',
                trialEndDate: user.trialEndDate,
                redirectUrl: 'https://tikfind.com/pricing'
            });
        }

        // 모든 확인 통과
        req.user = user; // 다음 미들웨어나 라우트에서 사용 가능
        next();

    } catch (error) {
        console.error('❌ 구독 확인 오류:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: '서버 오류가 발생했습니다.'
        });
    }
};

/**
 * 관리자 권한 확인 미들웨어
 */
const checkAdmin = async (req, res, next) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'USER_ID_REQUIRED',
                message: 'User ID가 필요합니다.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        // 관리자 권한 확인
        if (!user.isAdmin && user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'ADMIN_REQUIRED',
                message: '관리자 권한이 필요합니다.'
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ 관리자 권한 확인 오류:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: '서버 오류가 발생했습니다.'
        });
    }
};

/**
 * HWID 바인딩 확인 (선택사항)
 */
const checkHWID = async (req, res, next) => {
    try {
        const { userId, hwid } = req.body;

        if (!userId || !hwid) {
            return res.status(400).json({
                success: false,
                error: 'HWID_REQUIRED',
                message: 'Hardware ID가 필요합니다.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        // HWID가 등록되지 않았으면 등록
        if (!user.hwid) {
            user.hwid = hwid;
            await user.save();
            console.log(`✅ HWID 등록: ${userId} -> ${hwid}`);
        }
        // HWID가 다르면 에러
        else if (user.hwid !== hwid) {
            return res.status(403).json({
                success: false,
                error: 'DEVICE_MISMATCH',
                message: '다른 PC에서 사용 중입니다. 한 계정은 한 PC에서만 사용 가능합니다.',
                registeredHWID: user.hwid.substring(0, 8) + '...' // 일부만 표시
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ HWID 확인 오류:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: '서버 오류가 발생했습니다.'
        });
    }
};

/**
 * 사용량 제한 확인 (API 호출 횟수 제한)
 */
const checkUsageLimit = async (req, res, next) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'USER_ID_REQUIRED',
                message: 'User ID가 필요합니다.'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        // 플랜별 제한 (예시)
        const limits = {
            'free': 100,      // 무료: 하루 100회
            'basic': 1000,    // 베이직: 하루 1000회
            'pro': 10000,     // 프로: 하루 10000회
            'enterprise': -1  // 엔터프라이즈: 무제한
        };

        const userLimit = limits[user.plan] || 100;

        // 무제한이면 통과
        if (userLimit === -1) {
            req.user = user;
            return next();
        }

        // 사용량 확인 (오늘 날짜 기준)
        const today = new Date().toISOString().split('T')[0];
        const usageKey = `usage_${today}`;

        if (!user.apiUsage) {
            user.apiUsage = {};
        }

        const todayUsage = user.apiUsage[usageKey] || 0;

        // 제한 초과
        if (todayUsage >= userLimit) {
            return res.status(429).json({
                success: false,
                error: 'USAGE_LIMIT_EXCEEDED',
                message: `일일 사용량 제한을 초과했습니다. (${todayUsage}/${userLimit})`,
                currentUsage: todayUsage,
                limit: userLimit,
                resetTime: new Date(new Date().setHours(24, 0, 0, 0)).toISOString()
            });
        }

        // 사용량 증가
        user.apiUsage[usageKey] = todayUsage + 1;
        await user.save();

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ 사용량 제한 확인 오류:', error);
        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: '서버 오류가 발생했습니다.'
        });
    }
};

module.exports = {
    checkSubscription,
    checkAdmin,
    checkHWID,
    checkUsageLimit
};
