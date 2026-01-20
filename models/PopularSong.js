/**
 * 인기곡 데이터베이스 모델
 * YouTube API 비용 절감을 위한 곡 캐싱
 */

const mongoose = require('mongoose');

const popularSongSchema = new mongoose.Schema({
    // 곡 번호 (시청자가 #123 형식으로 신청)
    number: {
        type: Number,
        unique: true,
        sparse: true
    },
    
    // YouTube 비디오 ID
    videoId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // 곡 제목
    title: {
        type: String,
        required: true,
        index: true
    },
    
    // 가수/아티스트
    artist: {
        type: String,
        required: true,
        index: true
    },
    
    // 썸네일 URL
    thumbnail: {
        type: String,
        required: true
    },
    
    // 장르
    genre: {
        type: String,
        enum: ['kpop', 'pop', 'ballad', 'dance', 'edm', 'hiphop', 'rnb', 'jpop', 'trot', 'rock', 'indie', 'tiktok_dance', 'tiktok_trend', 'other'],
        default: 'other',
        index: true
    },
    
    // 국가
    country: {
        type: String,
        default: 'KR'
    },
    
    // 발매 연도
    year: {
        type: Number
    },
    
    // 검색 키워드 (제목, 가수의 다양한 표기)
    keywords: [{
        type: String
    }],
    
    // 인기도 (정렬용)
    popularity: {
        type: Number,
        default: 0
    },
    
    // 신청 횟수 (통계용)
    requestCount: {
        type: Number,
        default: 0
    },
    
    // 마지막 신청 시간
    lastRequestedAt: {
        type: Date
    },
    
    // 수집 방법 (manual: 수동, auto: 자동수집, user: 시청자신청, dataset: 데이터셋)
    source: {
        type: String,
        enum: ['manual', 'auto', 'user', 'dataset'],
        default: 'auto'
    },
    
    // 활성 상태 (삭제된 영상 등)
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// 복합 인덱스 (제목 + 가수로 빠른 검색)
popularSongSchema.index({ title: 'text', artist: 'text', keywords: 'text' });

// 장르별 인기도 정렬용 인덱스
popularSongSchema.index({ genre: 1, popularity: -1 });

// 신청곡 검색 최적화 인덱스 (제목 + 아티스트 복합)
popularSongSchema.index({ title: 1, artist: 1 });

// 활성 상태 + 신청 횟수 인덱스 (인기곡 우선)
popularSongSchema.index({ isActive: 1, requestCount: -1 });

// 신청 횟수 증가 메서드
popularSongSchema.methods.incrementRequestCount = function() {
    this.requestCount += 1;
    this.lastRequestedAt = new Date();
    return this.save();
};

module.exports = mongoose.model('PopularSong', popularSongSchema);
