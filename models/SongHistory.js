const mongoose = require('mongoose');

const songHistorySchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    videoId: { type: String },
    thumbnail: { type: String },
    youtubeUrl: { type: String },
    requester: { type: String },       // TikTok uniqueId (@아이디)
    requesterNickname: { type: String }, // TikTok 닉네임 (표시이름)
    isStreamer: { type: Boolean, default: false },
    playedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

module.exports = mongoose.model('SongHistory', songHistorySchema);
