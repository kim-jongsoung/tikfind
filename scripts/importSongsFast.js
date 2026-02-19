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

mongoose.connect(MONGODB_URI);

const PopularSong = require('../models/PopularSong');

const artistGenreMap = {
    "BTS": "kpop", "BLACKPINK": "kpop", "NewJeans": "kpop", "aespa": "kpop", "IU": "kpop",
    "TWICE": "kpop", "Stray Kids": "kpop", "SEVENTEEN": "kpop", "Red Velvet": "kpop",
    "Taylor Swift": "pop", "Ed Sheeran": "pop", "Billie Eilish": "pop", "Ariana Grande": "pop",
    "Dua Lipa": "pop", "Bruno Mars": "pop", "Adele": "pop", "Coldplay": "pop",
    "Drake": "hiphop", "The Weeknd": "hiphop", "Post Malone": "hiphop", "SZA": "hiphop",
    "Calvin Harris": "dance", "David Guetta": "dance", "Marshmello": "dance", "Avicii": "dance",
    "폴킴": "ballad", "백예린": "ballad", "10cm": "ballad", "헤이즈": "ballad"
};

function autoDetectGenre(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    
    for (const [key, genre] of Object.entries(artistGenreMap)) {
        if (artist.includes(key) || key.includes(artist)) {
            return genre;
        }
    }
    
    if (text.includes('tiktok') || text.includes('challenge')) return 'tiktok_trend';
    if (text.includes('remix') || text.includes('edm') || text.includes('dance')) return 'dance';
    if (text.includes('ballad') || text.includes('발라드')) return 'ballad';
    
    return 'pop';
}

function extractVideoId(data) {
    const urlFields = [data.Url_youtube, data.url_youtube, data.youtube_url, data.url, data.link];
    
    for (const url of urlFields) {
        if (url && typeof url === 'string') {
            const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (match) return match[1];
        }
    }
    return null;
}

async function importSongsFast() {
    try {
        console.log('🚀 빠른 노래 수집 시작...\n');
        
        const filePath = path.join(__dirname, 'data', 'Spotify_Youtube.csv');
        
        if (!fs.existsSync(filePath)) {
            console.error('❌ Spotify_Youtube.csv 파일이 없습니다.');
            process.exit(1);
        }
        
        console.log('📄 CSV 파일 읽는 중...');
        
        const records = [];
        
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => records.push(data))
                .on('end', resolve)
                .on('error', reject);
        });
        
        console.log(`✅ ${records.length}개 레코드 읽기 완료\n`);
        console.log('🔄 videoId 추출 및 데이터 준비 중...');
        
        const songsToInsert = [];
        const existingVideoIds = new Set();
        
        // 기존 videoId 가져오기
        const existingSongs = await PopularSong.find({}, { videoId: 1 }).lean();
        existingSongs.forEach(song => existingVideoIds.add(song.videoId));
        
        console.log(`   기존 곡: ${existingVideoIds.size}개\n`);
        
        let processed = 0;
        let noVideoId = 0;
        let duplicate = 0;
        
        for (const record of records) {
            processed++;
            
            const videoId = extractVideoId(record);
            if (!videoId) {
                noVideoId++;
                continue;
            }
            
            if (existingVideoIds.has(videoId)) {
                duplicate++;
                continue;
            }
            
            const title = record.Track || record.Title || record.title || 'Unknown';
            const artist = record.Artist || record.artist || 'Unknown';
            const genre = autoDetectGenre(title, artist);
            
            songsToInsert.push({
                videoId: videoId,
                title: title,
                artist: artist,
                thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                genre: genre,
                keywords: [title.toLowerCase(), artist.toLowerCase()],
                source: 'dataset',
                popularity: 100,
                isActive: true
            });
            
            existingVideoIds.add(videoId);
            
            if (processed % 5000 === 0) {
                console.log(`   처리 중: ${processed}/${records.length}`);
            }
        }
        
        console.log(`\n✅ 데이터 준비 완료: ${songsToInsert.length}곡`);
        console.log(`   - 처리: ${processed}개`);
        console.log(`   - videoId 없음: ${noVideoId}개`);
        console.log(`   - 중복: ${duplicate}개\n`);
        
        if (songsToInsert.length === 0) {
            console.log('⚠️  저장할 새로운 곡이 없습니다.');
            process.exit(0);
        }
        
        console.log('💾 DB에 일괄 저장 중...');
        
        // 배치 저장 (1000개씩)
        const batchSize = 1000;
        let savedTotal = 0;
        
        for (let i = 0; i < songsToInsert.length; i += batchSize) {
            const batch = songsToInsert.slice(i, i + batchSize);
            await PopularSong.insertMany(batch, { ordered: false });
            savedTotal += batch.length;
            console.log(`   저장: ${savedTotal}/${songsToInsert.length}곡`);
        }
        
        console.log(`\n🎉 수집 완료!`);
        console.log(`✅ 총 저장: ${savedTotal}곡\n`);
        
        const totalSongs = await PopularSong.countDocuments({ isActive: true });
        const kpopCount = await PopularSong.countDocuments({ genre: 'kpop', isActive: true });
        const popCount = await PopularSong.countDocuments({ genre: 'pop', isActive: true });
        const hiphopCount = await PopularSong.countDocuments({ genre: 'hiphop', isActive: true });
        const danceCount = await PopularSong.countDocuments({ genre: 'dance', isActive: true });
        const balladCount = await PopularSong.countDocuments({ genre: 'ballad', isActive: true });
        const tiktokCount = await PopularSong.countDocuments({ genre: 'tiktok_trend', isActive: true });
        
        console.log(`💾 DB 통계:`);
        console.log(`   전체: ${totalSongs}곡`);
        console.log(`   K-POP: ${kpopCount}곡`);
        console.log(`   POP: ${popCount}곡`);
        console.log(`   힙합/R&B: ${hiphopCount}곡`);
        console.log(`   댄스/EDM: ${danceCount}곡`);
        console.log(`   발라드: ${balladCount}곡`);
        console.log(`   틱톡 트렌드: ${tiktokCount}곡\n`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 오류 발생:', error);
        process.exit(1);
    }
}

importSongsFast();
