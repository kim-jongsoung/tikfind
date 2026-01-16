require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI 환경 변수가 설정되지 않았습니다.');
    console.log('💡 Railway 대시보드에서 실행하거나 .env 파일에 MONGODB_URI를 추가해주세요.');
    process.exit(1);
}

if (!YOUTUBE_API_KEY) {
    console.error('❌ YOUTUBE_API_KEY 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
}

// MongoDB 연결
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const PopularSong = require('../models/PopularSong');

/**
 * 부정확한 제목 필터링 키워드
 */
const INVALID_KEYWORDS = [
    '모음', 'mix', 'playlist', 'compilation', 
    '인기곡', '베스트', 'best', 'top',
    '2024', '2025', '2026',
    'hour', 'hours', '시간',
    'full album', '전곡', 'medley',
    'collection', 'hits'
];

/**
 * 부정확한 곡 삭제
 */
async function deleteInvalidSongs() {
    console.log('🗑️  부정확한 곡 삭제 시작...\n');
    
    const allSongs = await PopularSong.find({ isActive: true });
    console.log(`📊 전체 곡 수: ${allSongs.length}곡\n`);
    
    let deletedCount = 0;
    
    for (const song of allSongs) {
        const title = song.title.toLowerCase();
        const isInvalid = INVALID_KEYWORDS.some(keyword => title.includes(keyword));
        
        if (isInvalid) {
            console.log(`❌ 삭제: ${song.title}`);
            await PopularSong.deleteOne({ _id: song._id });
            deletedCount++;
        }
    }
    
    console.log(`\n✅ 삭제 완료: ${deletedCount}곡`);
    console.log(`📊 남은 곡 수: ${allSongs.length - deletedCount}곡\n`);
    
    return deletedCount;
}

/**
 * YouTube 검색 (정확한 가수명 + 제목)
 */
async function searchYouTube(title, artist) {
    try {
        const query = `${title} ${artist} official`;
        const url = 'https://www.googleapis.com/youtube/v3/search';
        
        const response = await axios.get(url, {
            params: {
                key: YOUTUBE_API_KEY,
                q: query,
                part: 'snippet',
                type: 'video',
                maxResults: 1,
                videoCategoryId: '10', // Music category
                order: 'relevance'
            }
        });

        if (response.data.items && response.data.items.length > 0) {
            const video = response.data.items[0];
            return {
                videoId: video.id.videoId,
                title: video.snippet.title,
                artist: video.snippet.channelTitle,
                thumbnail: video.snippet.thumbnails.high.url
            };
        }

        return null;
    } catch (error) {
        console.error('❌ YouTube 검색 오류:', error.message);
        return null;
    }
}

/**
 * 정확한 곡 재수집
 */
async function recollectSongs() {
    console.log('🎵 정확한 곡 재수집 시작...\n');
    
    // 인기 있는 K-POP, 팝송 리스트
    const popularSongs = [
        // K-POP
        { title: 'Dynamite', artist: 'BTS', genre: 'kpop' },
        { title: 'APT', artist: 'ROSÉ Bruno Mars', genre: 'kpop' },
        { title: '롤린', artist: '브레이브걸스', genre: 'kpop' },
        { title: 'Supernova', artist: 'aespa', genre: 'kpop' },
        { title: 'Love wins all', artist: 'IU', genre: 'kpop' },
        { title: 'Magnetic', artist: 'ILLIT', genre: 'kpop' },
        { title: 'How Sweet', artist: 'NewJeans', genre: 'kpop' },
        { title: 'SPOT', artist: 'ZICO', genre: 'kpop' },
        { title: 'Whiplash', artist: 'aespa', genre: 'kpop' },
        { title: 'Armageddon', artist: 'aespa', genre: 'kpop' },
        { title: 'Small girl', artist: 'Lee Young Ji', genre: 'kpop' },
        { title: 'Bubble Gum', artist: 'NewJeans', genre: 'kpop' },
        { title: 'POWER', artist: 'G-DRAGON', genre: 'kpop' },
        { title: 'Mantra', artist: 'JENNIE', genre: 'kpop' },
        { title: 'Rockstar', artist: 'LISA', genre: 'kpop' },
        { title: 'Supernatural', artist: 'NewJeans', genre: 'kpop' },
        { title: 'Sticky', artist: 'KISS OF LIFE', genre: 'kpop' },
        { title: 'Cherish', artist: 'ILLIT', genre: 'kpop' },
        { title: 'Ditto', artist: 'NewJeans', genre: 'kpop' },
        { title: 'OMG', artist: 'NewJeans', genre: 'kpop' },
        
        // 팝송
        { title: 'Die With A Smile', artist: 'Lady Gaga Bruno Mars', genre: 'pop' },
        { title: 'Beautiful Things', artist: 'Benson Boone', genre: 'pop' },
        { title: 'Espresso', artist: 'Sabrina Carpenter', genre: 'pop' },
        { title: 'Please Please Please', artist: 'Sabrina Carpenter', genre: 'pop' },
        { title: 'Birds of a Feather', artist: 'Billie Eilish', genre: 'pop' },
        { title: 'Taste', artist: 'Sabrina Carpenter', genre: 'pop' },
        { title: 'Good Luck Babe', artist: 'Chappell Roan', genre: 'pop' },
        { title: 'Cruel Summer', artist: 'Taylor Swift', genre: 'pop' },
        { title: 'Flowers', artist: 'Miley Cyrus', genre: 'pop' },
        { title: 'Anti-Hero', artist: 'Taylor Swift', genre: 'pop' },
        
        // 발라드
        { title: '첫 만남은 계획대로 되지 않아', artist: 'TWS', genre: 'ballad' },
        { title: '너의 모든 순간', artist: '성시경', genre: 'ballad' },
        { title: '사랑은 늘 도망가', artist: '임영웅', genre: 'ballad' },
        { title: 'Hype Boy', artist: 'NewJeans', genre: 'ballad' },
        { title: '무지개', artist: '임영웅', genre: 'ballad' },
        
        // 댄스/EDM
        { title: 'Get Up', artist: 'NewJeans', genre: 'dance' },
        { title: 'ETA', artist: 'NewJeans', genre: 'dance' },
        { title: 'Cool With You', artist: 'NewJeans', genre: 'dance' },
        { title: 'Attention', artist: 'NewJeans', genre: 'dance' },
        { title: 'Super Shy', artist: 'NewJeans', genre: 'dance' }
    ];
    
    let successCount = 0;
    let failCount = 0;
    
    for (const song of popularSongs) {
        try {
            // 이미 존재하는지 확인
            const exists = await PopularSong.findOne({ 
                title: new RegExp(song.title, 'i'),
                artist: new RegExp(song.artist, 'i')
            });
            
            if (exists) {
                console.log(`⏭️  이미 존재: ${song.title} - ${song.artist}`);
                continue;
            }
            
            // YouTube 검색
            console.log(`🔍 검색: ${song.title} - ${song.artist}`);
            const videoData = await searchYouTube(song.title, song.artist);
            
            if (videoData) {
                // DB에 저장
                await PopularSong.create({
                    videoId: videoData.videoId,
                    title: videoData.title,
                    artist: videoData.artist,
                    thumbnail: videoData.thumbnail,
                    genre: song.genre,
                    keywords: [
                        videoData.title.toLowerCase(),
                        videoData.artist.toLowerCase()
                    ],
                    source: 'manual',
                    popularity: 100,
                    isActive: true
                });
                
                console.log(`✅ 저장: ${videoData.title} - ${videoData.artist}\n`);
                successCount++;
            } else {
                console.log(`❌ 검색 실패: ${song.title} - ${song.artist}\n`);
                failCount++;
            }
            
            // API Rate Limit 방지
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`❌ 오류: ${song.title} - ${error.message}\n`);
            failCount++;
        }
    }
    
    console.log(`\n🎉 재수집 완료!`);
    console.log(`✅ 성공: ${successCount}곡`);
    console.log(`❌ 실패: ${failCount}곡`);
}

/**
 * 메인 실행
 */
async function main() {
    try {
        console.log('🚀 DB 정리 및 재수집 시작\n');
        console.log('=' .repeat(50) + '\n');
        
        // 1. 부정확한 곡 삭제
        await deleteInvalidSongs();
        
        console.log('=' .repeat(50) + '\n');
        
        // 2. 정확한 곡 재수집
        await recollectSongs();
        
        console.log('\n' + '=' .repeat(50));
        console.log('✅ 모든 작업 완료!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 오류 발생:', error);
        process.exit(1);
    }
}

main();
