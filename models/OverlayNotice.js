const mongoose = require('mongoose');

const overlayNoticeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 50, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

overlayNoticeSchema.index({ userId: 1, order: 1 });

module.exports = mongoose.model('OverlayNotice', overlayNoticeSchema);
