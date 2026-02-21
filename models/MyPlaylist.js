const mongoose = require('mongoose');

const myPlaylistSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    videoId: { type: String },
    thumbnail: { type: String },
    youtubeUrl: { type: String },
    order: { type: Number, default: 0 },
    addedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('MyPlaylist', myPlaylistSchema);
