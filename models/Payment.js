const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription'
    },
    
    // Payment Info
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD',
        uppercase: true
    },
    status: {
        type: String,
        enum: ['pending', 'succeeded', 'failed', 'refunded', 'cancelled'],
        default: 'pending',
        index: true
    },
    
    // Stripe Info
    stripePaymentIntentId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    stripeChargeId: {
        type: String
    },
    stripeCustomerId: {
        type: String
    },
    
    // Payment Method
    paymentMethod: {
        type: String,
        enum: ['card', 'paypal', 'other'],
        default: 'card'
    },
    cardBrand: {
        type: String // visa, mastercard, amex, etc.
    },
    cardLast4: {
        type: String
    },
    
    // Details
    description: {
        type: String
    },
    receiptUrl: {
        type: String
    },
    receiptEmail: {
        type: String
    },
    
    // Refund Info
    refundAmount: {
        type: Number,
        default: 0
    },
    refundReason: {
        type: String
    },
    refundedAt: {
        type: Date
    },
    
    // Metadata
    metadata: {
        type: Map,
        of: String
    },
    
    // Timestamps
    paidAt: {
        type: Date
    },
    failedAt: {
        type: Date
    },
    failureMessage: {
        type: String
    }
}, {
    timestamps: true
});

// Indexes for performance
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ userId: 1, status: 1 });

// Methods
paymentSchema.methods.markAsSucceeded = function() {
    this.status = 'succeeded';
    this.paidAt = new Date();
    return this.save();
};

paymentSchema.methods.markAsFailed = function(message) {
    this.status = 'failed';
    this.failedAt = new Date();
    this.failureMessage = message;
    return this.save();
};

paymentSchema.methods.refund = function(amount, reason) {
    this.status = 'refunded';
    this.refundAmount = amount || this.amount;
    this.refundReason = reason;
    this.refundedAt = new Date();
    return this.save();
};

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
