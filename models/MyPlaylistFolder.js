const mongoose = require('mongoose');

const myPlaylistFolderSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('MyPlaylistFolder', myPlaylistFolderSchema);
