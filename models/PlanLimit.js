const mongoose = require('mongoose');

const planLimitSchema = new mongoose.Schema({
    planName: {
        type: String,
        required: true,
        enum: ['free', 'universe', 'unlimited'],
        unique: true
    },
    songRequestLimit: {
        type: Number,
        default: -1 // -1 = 무제한
    },
    gptAiLimit: {
        type: Number,
        default: -1
    },
    pronunciationCoachLimit: {
        type: Number,
        default: -1
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PlanLimit', planLimitSchema);
