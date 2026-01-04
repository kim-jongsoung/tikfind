const mongoose = require('mongoose');

const adminLogSchema = new mongoose.Schema({
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Action Info
    action: {
        type: String,
        required: true,
        enum: [
            'user_view',
            'user_update',
            'user_delete',
            'user_activate',
            'user_deactivate',
            'subscription_cancel',
            'subscription_reactivate',
            'subscription_extend',
            'payment_refund',
            'payment_view',
            'settings_update',
            'admin_login',
            'admin_logout',
            'export_data',
            'other'
        ]
    },
    
    // Request Info
    method: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    },
    path: {
        type: String
    },
    
    // Target Info
    targetType: {
        type: String,
        enum: ['user', 'subscription', 'payment', 'settings', 'system']
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId
    },
    
    // Request Data
    body: {
        type: mongoose.Schema.Types.Mixed
    },
    query: {
        type: mongoose.Schema.Types.Mixed
    },
    
    // Changes (for update actions)
    changes: {
        before: {
            type: mongoose.Schema.Types.Mixed
        },
        after: {
            type: mongoose.Schema.Types.Mixed
        }
    },
    
    // Additional Info
    reason: {
        type: String
    },
    notes: {
        type: String
    },
    
    // Client Info
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    
    // Result
    success: {
        type: Boolean,
        default: true
    },
    errorMessage: {
        type: String
    }
}, {
    timestamps: true
});

// Indexes for performance
adminLogSchema.index({ adminId: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
adminLogSchema.index({ targetType: 1, targetId: 1 });
adminLogSchema.index({ createdAt: -1 });

// TTL index - automatically delete logs older than 90 days
adminLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

const AdminLog = mongoose.model('AdminLog', adminLogSchema);

module.exports = AdminLog;
