const mongoose = require('mongoose');

const moderatorSchema = new mongoose.Schema({
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tiktokUniqueId:{ type: String, required: true, trim: true },
    displayName:   { type: String, required: true, maxlength: 20, trim: true },
    profileImg:    { type: String, default: '' },
    order:         { type: Number, default: 0 }
}, { timestamps: true });

moderatorSchema.index({ userId: 1 });

module.exports = mongoose.model('Moderator', moderatorSchema);
