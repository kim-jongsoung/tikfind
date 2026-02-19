/**
 * VIP 아이디별 목소리 설정
 * - 호스트(userId)가 특정 시청자(tiktokUniqueId)에게 Chirp3 HD 목소리 지정
 */

const mongoose = require('mongoose');

const voiceSettingsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    tiktokUniqueId: {
        type: String,
        required: true,
        trim: true
    },
    chirpVoice: {
        type: String,
        required: true,
        enum: [
            'Achernar', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina',
            'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iocaste',
            'Laomedeia', 'Leda', 'Orus', 'Pulcherrima', 'Schedar',
            'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi'
        ]
    },
    speed: {
        type: Number,
        default: 1.0,
        min: 0.25,
        max: 4.0
    },
    memo: {
        type: String,
        default: '',
        maxlength: 100
    }
}, {
    timestamps: true
});

voiceSettingsSchema.index({ userId: 1, tiktokUniqueId: 1 }, { unique: true });

module.exports = mongoose.model('VoiceSettings', voiceSettingsSchema);
