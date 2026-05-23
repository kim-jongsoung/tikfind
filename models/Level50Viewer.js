const mongoose = require('mongoose');

const level50ViewerSchema = new mongoose.Schema({
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tiktokUniqueId:{ type: String, required: true, trim: true },
    displayName:   { type: String, required: true, maxlength: 20, trim: true },
    profileImg:    { type: String, default: '' },
    order:         { type: Number, default: 0 }
}, { timestamps: true });

level50ViewerSchema.index({ userId: 1 });

module.exports = mongoose.model('Level50Viewer', level50ViewerSchema);
