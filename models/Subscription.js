const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Subscription Info
    plan: {
        type: String,
        enum: ['pro'],
        required: true,
        default: 'pro'
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'expired', 'past_due', 'trialing'],
        default: 'trialing',
        index: true
    },
    
    // Billing
    amount: {
        type: Number,
        required: true,
        default: 9.99
    },
    currency: {
        type: String,
        default: 'USD',
        uppercase: true
    },
    billingCycle: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly'
    },
    
    // Dates
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date
    },
    currentPeriodStart: {
        type: Date
    },
    currentPeriodEnd: {
        type: Date
    },
    nextBillingDate: {
        type: Date,
        index: true
    },
    cancelledAt: {
        type: Date
    },
    cancelAtPeriodEnd: {
        type: Boolean,
        default: false
    },
    
    // Stripe Info
    stripeCustomerId: {
        type: String,
        index: true
    },
    stripeSubscriptionId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    stripeProductId: {
        type: String
    },
    stripePriceId: {
        type: String
    },
    
    // Trial Info
    trialStart: {
        type: Date
    },
    trialEnd: {
        type: Date
    },
    
    // Cancellation
    cancellationReason: {
        type: String
    },
    cancellationFeedback: {
        type: String
    },
    
    // Metadata
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true
});

// Indexes for performance
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ status: 1, nextBillingDate: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

// Virtual for checking if subscription is active
subscriptionSchema.virtual('isActive').get(function() {
    return this.status === 'active' || this.status === 'trialing';
});

// Virtual for checking if trial is active
subscriptionSchema.virtual('isTrialing').get(function() {
    if (this.status !== 'trialing') return false;
    if (!this.trialEnd) return false;
    return new Date() < this.trialEnd;
});

// Virtual for days remaining in trial
subscriptionSchema.virtual('trialDaysRemaining').get(function() {
    if (!this.isTrialing) return 0;
    const now = new Date();
    const diff = this.trialEnd - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

subscriptionSchema.set('toJSON', { virtuals: true });
subscriptionSchema.set('toObject', { virtuals: true });

// Methods
subscriptionSchema.methods.cancel = function(reason, feedback) {
    this.status = 'cancelled';
    this.cancelledAt = new Date();
    this.cancellationReason = reason;
    this.cancellationFeedback = feedback;
    return this.save();
};

subscriptionSchema.methods.reactivate = function() {
    this.status = 'active';
    this.cancelledAt = null;
    this.cancelAtPeriodEnd = false;
    return this.save();
};

subscriptionSchema.methods.expire = function() {
    this.status = 'expired';
    return this.save();
};

subscriptionSchema.methods.updateBillingDate = function(date) {
    this.nextBillingDate = date;
    this.currentPeriodStart = new Date();
    this.currentPeriodEnd = date;
    return this.save();
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;
