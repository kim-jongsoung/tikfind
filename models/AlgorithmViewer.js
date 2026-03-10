const mongoose = require('mongoose');

const algorithmViewerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uniqueId: {
        type: String,
        required: true,
        trim: true
    },
    nickname: {
        type: String,
        default: ''
    },
    profilePictureUrl: {
        type: String,
        default: ''
    },
    visitCount: {
        type: Number,
        default: 1
    },
    firstSeenAt: {
        type: Date,
        default: Date.now
    },
    lastSeenAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['pending', 'followed', 'dm_sent', 'ignored'],
        default: 'pending'
    },
    memo: {
        type: String,
        default: ''
    },
    followRole: {
        type: Number,
        default: 0   // 0: 비팔로워, 1: 팔로워, 2: 친구
    },
    sources: {
        type: [String],  // ['member', 'chat', 'gift', 'social', 'subscribe']
        default: []
    },
    chatCount: {
        type: Number,
        default: 0
    },
    giftCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

algorithmViewerSchema.index({ userId: 1, uniqueId: 1 }, { unique: true });
algorithmViewerSchema.index({ userId: 1, lastSeenAt: -1 });
algorithmViewerSchema.index({ userId: 1, status: 1 });

const AlgorithmViewer = mongoose.model('AlgorithmViewer', algorithmViewerSchema);

module.exports = AlgorithmViewer;
