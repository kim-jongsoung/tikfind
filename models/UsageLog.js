const mongoose = require('mongoose');

const usageLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    date: {
        type: String, // YYYY-MM-DD 형식
        required: true,
        index: true
    },
    songRequestCount: {
        type: Number,
        default: 0
    },
    gptAiCount: {
        type: Number,
        default: 0
    },
    pronunciationCoachCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// 복합 인덱스: userId + date로 빠른 조회
usageLogSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('UsageLog', usageLogSchema);
