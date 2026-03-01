const mongoose = require('mongoose');

const countryStatSchema = new mongoose.Schema({
    countryCode: String,   // 'JP', 'US', 'TH', ...
    countryName: String,
    count: { type: Number, default: 0 }
}, { _id: false });

const hourlyStatSchema = new mongoose.Schema({
    hour: Number,          // 0~23
    viewerCount: { type: Number, default: 0 },
    chatCount: { type: Number, default: 0 }
}, { _id: false });

const liveSessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tiktokId: String,
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    durationMinutes: Number,
    peakViewers: { type: Number, default: 0 },
    totalChats: { type: Number, default: 0 },
    totalGifts: { type: Number, default: 0 },
    totalLikes: { type: Number, default: 0 },
    foreignChatCount: { type: Number, default: 0 },
    countryStats: [countryStatSchema],   // 국가별 채팅 수
    hourlyStats: [hourlyStatSchema],     // 시간대별 데이터
    detectedLanguages: [String]          // 감지된 언어 목록
}, { timestamps: true });

module.exports = mongoose.model('LiveSession', liveSessionSchema);
