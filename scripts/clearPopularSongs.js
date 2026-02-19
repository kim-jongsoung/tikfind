const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URL || process.env.DATABASE_URL || process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGO_URL 환경 변수가 필요합니다.');
    process.exit(1);
}

// MongoDB 연결
mongoose.connect(MONGODB_URI);

const PopularSong = require('../models/PopularSong');

async function clearPopularSongs() {
    try {
        console.log('🗑️  기존 인기곡 데이터 삭제 중...\n');
        
        const count = await PopularSong.countDocuments();
        console.log(`📊 현재 저장된 곡: ${count}곡`);
        
        if (count === 0) {
            console.log('✅ 이미 비어있습니다.');
            process.exit(0);
        }
        
        const result = await PopularSong.deleteMany({});
        
        console.log(`\n✅ 삭제 완료: ${result.deletedCount}곡`);
        console.log('💾 DB가 깨끗하게 초기화되었습니다.\n');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 오류 발생:', error);
        process.exit(1);
    }
}

clearPopularSongs();
