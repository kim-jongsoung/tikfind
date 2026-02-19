const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');

const MONGODB_URI = process.env.MONGO_URL || process.env.DATABASE_URL || process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGO_URL 환경 변수가 필요합니다.');
    process.exit(1);
}

// MongoDB 연결
mongoose.connect(MONGODB_URI);

const PopularSong = require('../models/PopularSong');

// 장르 매핑 (아티스트 기반)
const artistGenreMap = {
    // K-POP
    "BTS": "kpop", "BLACKPINK": "kpop", "NewJeans": "kpop", "aespa": "kpop", "IU": "kpop",
    "TWICE": "kpop", "Stray Kids": "kpop", "SEVENTEEN": "kpop", "Red Velvet": "kpop", "EXO": "kpop",
    "NCT": "kpop", "ITZY": "kpop", "LE SSERAFIM": "kpop", "ILLIT": "kpop", "KISS OF LIFE": "kpop",
    "JENNIE": "kpop", "LISA": "kpop", "ROSÉ": "kpop", "JISOO": "kpop", "G-DRAGON": "kpop",
    "ZICO": "kpop", "Lee Young Ji": "kpop", "브레이브걸스": "kpop", "TWS": "kpop",
    
    // POP
    "Taylor Swift": "pop", "Ed Sheeran": "pop", "Billie Eilish": "pop", "Ariana Grande": "pop",
    "Dua Lipa": "pop", "Olivia Rodrigo": "pop", "Sabrina Carpenter": "pop", "Miley Cyrus": "pop",
    "Lady Gaga": "pop", "Bruno Mars": "pop", "Adele": "pop", "Sam Smith": "pop",
    "Harry Styles": "pop", "Shawn Mendes": "pop", "Justin Bieber": "pop", "Selena Gomez": "pop",
    "Katy Perry": "pop", "Rihanna": "pop", "Beyoncé": "pop", "Coldplay": "pop",
    "Maroon 5": "pop", "OneRepublic": "pop", "Imagine Dragons": "pop", "Benson Boone": "pop",
    "Chappell Roan": "pop",
    
    // Hip-Hop/R&B
    "Drake": "hiphop", "The Weeknd": "hiphop", "Post Malone": "hiphop", "Travis Scott": "hiphop",
    "Kendrick Lamar": "hiphop", "J. Cole": "hiphop", "21 Savage": "hiphop", "Lil Baby": "hiphop",
    "Future": "hiphop", "Metro Boomin": "hiphop", "SZA": "hiphop", "Khalid": "hiphop",
    "Frank Ocean": "hiphop",
    
    // Dance/EDM
    "Calvin Harris": "dance", "David Guetta": "dance", "Marshmello": "dance",
    "The Chainsmokers": "dance", "Avicii": "dance", "Martin Garrix": "dance",
    "Kygo": "dance", "Zedd": "dance", "Alan Walker": "dance", "Tiësto": "dance",
    
    // Ballad
    "폴킴": "ballad", "백예린": "ballad", "10cm": "ballad", "볼빨간사춘기": "ballad",
    "멜로망스": "ballad", "악동뮤지션": "ballad", "헤이즈": "ballad", "임재현": "ballad",
    "김필": "ballad", "성시경": "ballad"
};

// 키워드 기반 장르 분류
function detectGenreByKeywords(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    
    if (text.includes('tiktok') || text.includes('challenge') || text.includes('trend')) {
        return 'tiktok_trend';
    }
    if (text.includes('remix') || text.includes('edm') || text.includes('club') || text.includes('dance')) {
        return 'dance';
    }
    if (text.includes('ballad') || text.includes('발라드') || text.includes('사랑') || text.includes('이별')) {
        return 'ballad';
    }
    return null;
}

// 아티스트 기반 장르 분류
function getGenreByArtist(artist) {
    if (artistGenreMap[artist]) return artistGenreMap[artist];
    
    for (const [key, genre] of Object.entries(artistGenreMap)) {
        if (artist.includes(key) || key.includes(artist)) {
            return genre;
        }
    }
    return null;
}

// 장르 자동 분류
function autoDetectGenre(title, artist) {
    const artistGenre = getGenreByArtist(artist);
    if (artistGenre) return artistGenre;
    
    const keywordGenre = detectGenreByKeywords(title, artist);
    if (keywordGenre) return keywordGenre;
    
    return 'pop';
}

// CSV 파일 파싱
async function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  파일 없음: ${filePath}`);
            resolve(results);
            return;
        }
        
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

// videoId 추출
function extractVideoId(data) {
    if (data.videoId || data.video_id || data.youtube_id) {
        return data.videoId || data.video_id || data.youtube_id;
    }
    
    const urlFields = [
        data.Url_youtube, data.url_youtube, data.youtube_url,
        data.url, data.link, data.Link, data.URL
    ];
    
    for (const url of urlFields) {
        if (url && typeof url === 'string') {
            const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (match) return match[1];
        }
    }
    return null;
}

// 메인 수집 함수
async function importSongsNoFilter() {
    try {
        console.log('🚀 노래 수집 시작 (필터링 없음)...\n');
        
        const dataDir = path.join(__dirname, 'data');
        const files = fs.readdirSync(dataDir);
        
        console.log(`📂 발견된 파일: ${files.length}개\n`);
        
        let totalProcessed = 0;
        let savedCount = 0;
        let skippedCount = 0;
        let noVideoIdCount = 0;
        
        for (const file of files) {
            const filePath = path.join(dataDir, file);
            const ext = path.extname(file).toLowerCase();
            
            if (ext !== '.csv') continue;
            
            console.log(`\n📄 처리 중: ${file}`);
            
            const data = await parseCSV(filePath);
            console.log(`   발견된 레코드: ${data.length}개`);
            
            for (let i = 0; i < data.length; i++) {
                const record = data[i];
                totalProcessed++;
                
                try {
                    const videoId = extractVideoId(record);
                    if (!videoId) {
                        noVideoIdCount++;
                        continue;
                    }
                    
                    const title = record.Track || record.Title || record.title || record.track || record.song || record.name || 'Unknown';
                    const artist = record.Artist || record.artist || record.artists || record.Channel || record.channel || 'Unknown';
                    
                    const exists = await PopularSong.findOne({ videoId });
                    if (exists) {
                        skippedCount++;
                        continue;
                    }
                    
                    const genre = autoDetectGenre(title, artist);
                    
                    await PopularSong.create({
                        videoId: videoId,
                        title: title,
                        artist: artist,
                        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                        genre: genre,
                        keywords: [
                            title.toLowerCase(),
                            artist.toLowerCase()
                        ],
                        source: 'dataset',
                        popularity: 100,
                        isActive: true
                    });
                    
                    savedCount++;
                    
                    if (savedCount % 500 === 0) {
                        console.log(`   ✅ 저장: ${savedCount}곡`);
                    }
                    
                } catch (error) {
                    // 에러 무시하고 계속
                }
            }
        }
        
        console.log(`\n🎉 수집 완료!`);
        console.log(`📊 처리된 레코드: ${totalProcessed}개`);
        console.log(`✅ 저장: ${savedCount}곡`);
        console.log(`⏭️  스킵 (중복): ${skippedCount}곡`);
        console.log(`❌ YouTube ID 없음: ${noVideoIdCount}개`);
        
        const totalSongs = await PopularSong.countDocuments({ isActive: true });
        const kpopCount = await PopularSong.countDocuments({ genre: 'kpop', isActive: true });
        const popCount = await PopularSong.countDocuments({ genre: 'pop', isActive: true });
        const hiphopCount = await PopularSong.countDocuments({ genre: 'hiphop', isActive: true });
        const danceCount = await PopularSong.countDocuments({ genre: 'dance', isActive: true });
        const balladCount = await PopularSong.countDocuments({ genre: 'ballad', isActive: true });
        const tiktokCount = await PopularSong.countDocuments({ genre: 'tiktok_trend', isActive: true });
        
        console.log(`\n💾 DB 통계:`);
        console.log(`   전체: ${totalSongs}곡`);
        console.log(`   K-POP: ${kpopCount}곡`);
        console.log(`   POP: ${popCount}곡`);
        console.log(`   힙합/R&B: ${hiphopCount}곡`);
        console.log(`   댄스/EDM: ${danceCount}곡`);
        console.log(`   발라드: ${balladCount}곡`);
        console.log(`   틱톡 트렌드: ${tiktokCount}곡`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 오류 발생:', error);
        process.exit(1);
    }
}

importSongsNoFilter();
