const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const AdminLog = require('../models/AdminLog');
const { isAuthenticated, isAdmin, logAdminAction } = require('../middleware/adminAuth');

// Apply authentication middleware to all admin routes
router.use(isAuthenticated);
router.use(isAdmin);

// ==================== DASHBOARD STATS ====================

// Get dashboard statistics
router.get('/stats', logAdminAction('stats_view'), async (req, res) => {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Total users
        const totalUsers = await User.countDocuments({ deletedAt: null });
        
        // Active subscribers (pro plan with active status)
        const activeSubscribers = await User.countDocuments({
            plan: 'pro',
            subscriptionStatus: { $in: ['active', 'trialing'] },
            deletedAt: null
        });
        
        // New users (last 30 days)
        const newUsers = await User.countDocuments({
            createdAt: { $gte: thirtyDaysAgo },
            deletedAt: null
        });
        
        // New users (last 7 days)
        const newUsersWeek = await User.countDocuments({
            createdAt: { $gte: sevenDaysAgo },
            deletedAt: null
        });
        
        // Trial users
        const trialUsers = await User.countDocuments({
            subscriptionStatus: 'trialing',
            deletedAt: null
        });
        
        // Expired trials
        const expiredTrials = await User.countDocuments({
            subscriptionStatus: 'expired',
            plan: 'free',
            deletedAt: null
        });
        
        // Calculate MRR (Monthly Recurring Revenue)
        const activeSubscriptions = await Subscription.find({
            status: { $in: ['active', 'trialing'] }
        });
        
        let mrr = 0;
        activeSubscriptions.forEach(sub => {
            if (sub.billingCycle === 'monthly') {
                mrr += sub.amount;
            } else if (sub.billingCycle === 'yearly') {
                mrr += sub.amount / 12;
            }
        });
        
        // Total revenue (last 30 days)
        const revenueResult = await Payment.aggregate([
            {
                $match: {
                    status: 'succeeded',
                    paidAt: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' }
                }
            }
        ]);
        
        const revenue30Days = revenueResult.length > 0 ? revenueResult[0].total : 0;
        
        // Conversion rate (trial to paid)
        const totalTrialUsers = await User.countDocuments({
            trialStartDate: { $exists: true },
            deletedAt: null
        });
        
        const convertedUsers = await User.countDocuments({
            trialStartDate: { $exists: true },
            subscriptionStatus: 'active',
            plan: 'pro',
            deletedAt: null
        });
        
        const conversionRate = totalTrialUsers > 0 
            ? ((convertedUsers / totalTrialUsers) * 100).toFixed(2) 
            : 0;
        
        // Churn rate (last 30 days)
        const cancelledSubscriptions = await Subscription.countDocuments({
            cancelledAt: { $gte: thirtyDaysAgo }
        });
        
        const churnRate = activeSubscribers > 0 
            ? ((cancelledSubscriptions / activeSubscribers) * 100).toFixed(2) 
            : 0;

        res.json({
            success: true,
            stats: {
                totalUsers,
                activeSubscribers,
                trialUsers,
                expiredTrials,
                newUsers,
                newUsersWeek,
                mrr: mrr.toFixed(2),
                revenue30Days: revenue30Days.toFixed(2),
                conversionRate: parseFloat(conversionRate),
                churnRate: parseFloat(churnRate)
            }
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
    }
});

// ==================== USER MANAGEMENT ====================

// Get users list with pagination, search, and filters
router.get('/users', logAdminAction('users_list'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        
        // Build query
        const query = { deletedAt: null };
        
        // Search by email or TikTok ID
        if (req.query.search) {
            query.$or = [
                { email: { $regex: req.query.search, $options: 'i' } },
                { tiktokId: { $regex: req.query.search, $options: 'i' } },
                { nickname: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        
        // Filter by plan
        if (req.query.plan) {
            query.plan = req.query.plan;
        }
        
        // Filter by subscription status
        if (req.query.status) {
            query.subscriptionStatus = req.query.status;
        }
        
        // Filter by active/inactive
        if (req.query.isActive !== undefined) {
            query.isActive = req.query.isActive === 'true';
        }
        
        // Date range filter
        if (req.query.startDate || req.query.endDate) {
            query.createdAt = {};
            if (req.query.startDate) {
                query.createdAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                query.createdAt.$lte = new Date(req.query.endDate);
            }
        }
        
        // Sort
        let sort = { createdAt: -1 }; // Default: newest first
        if (req.query.sortBy) {
            sort = {};
            const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
            sort[req.query.sortBy] = sortOrder;
        }
        
        // Execute query
        const users = await User.find(query)
            .select('-password')
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();
        
        const totalUsers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limit);
        
        res.json({
            success: true,
            users,
            pagination: {
                currentPage: page,
                totalPages,
                totalUsers,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

// Get single user details
router.get('/users/:id', logAdminAction('user_view'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
            .lean();
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Get user's subscription
        const subscription = await Subscription.findOne({ userId: user._id })
            .sort({ createdAt: -1 })
            .lean();
        
        // Get user's payments
        const payments = await Payment.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        
        // Get admin logs for this user
        const logs = await AdminLog.find({ targetId: user._id })
            .populate('adminId', 'email nickname')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
        
        res.json({
            success: true,
            user,
            subscription,
            payments,
            logs
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user details' });
    }
});

// Update user
router.put('/users/:id', logAdminAction('user_update'), async (req, res) => {
    try {
        const { plan, subscriptionStatus, isActive, role, notes } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const before = user.toObject();
        
        // Update allowed fields
        if (plan !== undefined) user.plan = plan;
        if (subscriptionStatus !== undefined) user.subscriptionStatus = subscriptionStatus;
        if (isActive !== undefined) user.isActive = isActive;
        if (role !== undefined) user.role = role;
        
        await user.save();
        
        // Log the change
        await AdminLog.create({
            adminId: req.user._id,
            action: 'user_update',
            targetType: 'user',
            targetId: user._id,
            changes: {
                before: { plan: before.plan, subscriptionStatus: before.subscriptionStatus, isActive: before.isActive },
                after: { plan: user.plan, subscriptionStatus: user.subscriptionStatus, isActive: user.isActive }
            },
            notes,
            ipAddress: req.ip
        });
        
        res.json({ success: true, message: 'User updated successfully', user });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
});

// Delete user (soft delete)
router.delete('/users/:id', logAdminAction('user_delete'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        user.deletedAt = new Date();
        user.isActive = false;
        await user.save();
        
        // Log the deletion
        await AdminLog.create({
            adminId: req.session.adminId,
            action: 'user_delete',
            targetType: 'user',
            targetId: user._id,
            reason: req.body.reason,
            ipAddress: req.ip
        });
        
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
});

// ==================== SUBSCRIPTION MANAGEMENT ====================

// Get all subscriptions
router.get('/subscriptions', logAdminAction('subscriptions_list'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        
        const query = {};
        if (req.query.status) {
            query.status = req.query.status;
        }
        
        const subscriptions = await Subscription.find(query)
            .populate('userId', 'email nickname tiktokId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        const total = await Subscription.countDocuments(query);
        
        res.json({
            success: true,
            subscriptions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                total,
                limit
            }
        });
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscriptions' });
    }
});

// Cancel subscription
router.post('/subscriptions/:id/cancel', logAdminAction('subscription_cancel'), async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }
        
        await subscription.cancel(req.body.reason, req.body.feedback);
        
        // Update user status
        await User.findByIdAndUpdate(subscription.userId, {
            subscriptionStatus: 'cancelled'
        });
        
        await AdminLog.create({
            adminId: req.user._id,
            action: 'subscription_cancel',
            targetType: 'subscription',
            targetId: subscription._id,
            reason: req.body.reason,
            ipAddress: req.ip
        });
        
        res.json({ success: true, message: 'Subscription cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
    }
});

// ==================== PAYMENT MANAGEMENT ====================

// Get all payments
router.get('/payments', logAdminAction('payments_list'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        
        const query = {};
        if (req.query.status) {
            query.status = req.query.status;
        }
        
        const payments = await Payment.find(query)
            .populate('userId', 'email nickname')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        const total = await Payment.countDocuments(query);
        
        res.json({
            success: true,
            payments,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                total,
                limit
            }
        });
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payments' });
    }
});

// Refund payment
router.post('/payments/:id/refund', logAdminAction('payment_refund'), async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        
        if (payment.status !== 'succeeded') {
            return res.status(400).json({ success: false, message: 'Only succeeded payments can be refunded' });
        }
        
        await payment.refund(req.body.amount, req.body.reason);
        
        await AdminLog.create({
            adminId: req.session.adminId,
            action: 'payment_refund',
            targetType: 'payment',
            targetId: payment._id,
            reason: req.body.reason,
            ipAddress: req.ip
        });
        
        res.json({ success: true, message: 'Payment refunded successfully' });
    } catch (error) {
        console.error('Error refunding payment:', error);
        res.status(500).json({ success: false, message: 'Failed to refund payment' });
    }
});

// ==================== ADMIN LOGS ====================

// Get admin activity logs
router.get('/logs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;
        
        const query = {};
        if (req.query.action) {
            query.action = req.query.action;
        }
        if (req.query.adminId) {
            query.adminId = req.query.adminId;
        }
        
        const logs = await AdminLog.find(query)
            .populate('adminId', 'email nickname')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        const total = await AdminLog.countDocuments(query);
        
        res.json({
            success: true,
            logs,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                total,
                limit
            }
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
});

// ==================== EXPORT DATA ====================

// Export users to CSV
router.get('/export/users', logAdminAction('export_data'), async (req, res) => {
    try {
        const users = await User.find({ deletedAt: null })
            .select('email nickname tiktokId plan subscriptionStatus createdAt lastLogin')
            .lean();
        
        // Convert to CSV
        const csv = [
            'Email,Nickname,TikTok ID,Plan,Status,Created At,Last Login',
            ...users.map(u => 
                `${u.email},${u.nickname || ''},${u.tiktokId || ''},${u.plan},${u.subscriptionStatus},${u.createdAt},${u.lastLogin || ''}`
            )
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
        res.send(csv);
    } catch (error) {
        console.error('Error exporting users:', error);
        res.status(500).json({ success: false, message: 'Failed to export users' });
    }
});

// ==================== PLAN LIMITS ====================

const PlanLimit = require('../models/PlanLimit');

// Get plan limits
router.get('/plan-limits', logAdminAction('plan_limits_view'), async (req, res) => {
    try {
        let limits = await PlanLimit.find();
        
        // 기본값이 없으면 생성
        if (limits.length === 0) {
            const defaultLimits = [
                { planName: 'free', songRequestLimit: 5, gptAiLimit: 20, pronunciationCoachLimit: 10 },
                { planName: 'universe', songRequestLimit: 100, gptAiLimit: 100, pronunciationCoachLimit: 100 },
                { planName: 'unlimited', songRequestLimit: -1, gptAiLimit: -1, pronunciationCoachLimit: -1 }
            ];
            
            limits = await PlanLimit.insertMany(defaultLimits);
        }
        
        res.json({ success: true, limits });
    } catch (error) {
        console.error('Error fetching plan limits:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch plan limits' });
    }
});

// Update plan limits
router.post('/plan-limits', logAdminAction('plan_limits_update'), async (req, res) => {
    try {
        const { limits } = req.body;
        
        if (!limits || !Array.isArray(limits)) {
            return res.status(400).json({ success: false, message: 'Invalid limits data' });
        }
        
        // 각 플랜의 제한을 업데이트
        for (const limit of limits) {
            await PlanLimit.findOneAndUpdate(
                { planName: limit.planName },
                {
                    songRequestLimit: limit.songRequestLimit,
                    gptAiLimit: limit.gptAiLimit,
                    pronunciationCoachLimit: limit.pronunciationCoachLimit
                },
                { upsert: true, new: true }
            );
        }
        
        res.json({ success: true, message: 'Plan limits updated successfully' });
    } catch (error) {
        console.error('Error updating plan limits:', error);
        res.status(500).json({ success: false, message: 'Failed to update plan limits' });
    }
});

module.exports = router;
