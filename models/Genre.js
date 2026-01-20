const mongoose = require('mongoose');

const genreSchema = new mongoose.Schema({
    // 장르 이름 (자유롭게 추가 가능)
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    
    // 장르 설명 (선택)
    description: {
        type: String,
        default: ''
    },
    
    // 큐레이션된 곡 수
    curatedCount: {
        type: Number,
        default: 0
    },
    
    // 마지막 큐레이션 시간
    lastCuratedAt: {
        type: Date
    },
    
    // 활성 상태
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// 인덱스
genreSchema.index({ name: 1 });
genreSchema.index({ isActive: 1 });

module.exports = mongoose.model('Genre', genreSchema);
