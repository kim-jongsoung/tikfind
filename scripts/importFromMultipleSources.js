const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

const MONGODB_URI = process.env.MONGO_URL || process.env.DATABASE_URL || process.env.MONGODB_URI;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

if (!MONGODB_URI) {
    console.error('❌ MONGO_URL 환경 변수가 필요합니다.');
    process.exit(1);
}

if (!YOUTUBE_API_KEY) {
    console.error('❌ YOUTUBE_API_KEY 환경 변수가 필요합니다.');
    console.error('💡 7분 이하 필터링을 위해 YouTube API Key가 필요합니다.');
    process.exit(1);
}

// MongoDB 연결
mongoose.connect(MONGODB_URI);

const PopularSong = require('../models/PopularSong');

// 영상 길이 확인 (초 단위)
async function getVideoDuration(videoId) {
    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'contentDetails',
                id: videoId,
                key: YOUTUBE_API_KEY
            }
        });

        if (response.data.items && response.data.items.length > 0) {
            const duration = response.data.items[0].contentDetails.duration;
            // ISO 8601 duration을 초로 변환 (예: PT4M33S -> 273초)
            const seconds = parseDuration(duration);
            return seconds;
        }
        return null;
    } catch (error) {
        console.error(`❌ 영상 길이 확인 실패 (${videoId}):`, error.message);
        return null;
    }
}

// ISO 8601 duration을 초로 변환
function parseDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    
    return hours * 3600 + minutes * 60 + seconds;
}

// 장르 매핑 (아티스트 기반)
const artistGenreMap = {
    // K-POP
    "BTS": "kpop",
    "BLACKPINK": "kpop",
    "NewJeans": "kpop",
    "aespa": "kpop",
    "IU": "kpop",
    "TWICE": "kpop",
    "Stray Kids": "kpop",
    "SEVENTEEN": "kpop",
    "Red Velvet": "kpop",
    "EXO": "kpop",
    "NCT": "kpop",
    "ITZY": "kpop",
    "LE SSERAFIM": "kpop",
    "ILLIT": "kpop",
    "KISS OF LIFE": "kpop",
    "JENNIE": "kpop",
    "LISA": "kpop",
    "ROSÉ": "kpop",
    "JISOO": "kpop",
    "G-DRAGON": "kpop",
    "ZICO": "kpop",
    "Lee Young Ji": "kpop",
    "브레이브걸스": "kpop",
    "TWS": "kpop",
    
    // POP
    "Taylor Swift": "pop",
    "Ed Sheeran": "pop",
    "Billie Eilish": "pop",
    "Ariana Grande": "pop",
    "Dua Lipa": "pop",
    "Olivia Rodrigo": "pop",
    "Sabrina Carpenter": "pop",
    "Miley Cyrus": "pop",
    "Lady Gaga": "pop",
    "Bruno Mars": "pop",
    "Adele": "pop",
    "Sam Smith": "pop",
    "Harry Styles": "pop",
    "Shawn Mendes": "pop",
    "Justin Bieber": "pop",
    "Selena Gomez": "pop",
    "Katy Perry": "pop",
    "Rihanna": "pop",
    "Beyoncé": "pop",
    "Coldplay": "pop",
    "Maroon 5": "pop",
    "OneRepublic": "pop",
    "Imagine Dragons": "pop",
    "Benson Boone": "pop",
    "Chappell Roan": "pop",
    
    // Hip-Hop/R&B
    "Drake": "hiphop",
    "The Weeknd": "hiphop",
    "Post Malone": "hiphop",
    "Travis Scott": "hiphop",
    "Kendrick Lamar": "hiphop",
    "J. Cole": "hiphop",
    "21 Savage": "hiphop",
    "Lil Baby": "hiphop",
    "Future": "hiphop",
    "Metro Boomin": "hiphop",
    "SZA": "hiphop",
    "Khalid": "hiphop",
    "Frank Ocean": "hiphop",
    
    // Dance/EDM
    "Calvin Harris": "dance",
    "David Guetta": "dance",
    "Marshmello": "dance",
    "The Chainsmokers": "dance",
    "Avicii": "dance",
    "Martin Garrix": "dance",
    "Kygo": "dance",
    "Zedd": "dance",
    "Alan Walker": "dance",
    "Tiësto": "dance",
    
    // Ballad (한국 발라드)
    "폴킴": "ballad",
    "백예린": "ballad",
    "10cm": "ballad",
    "볼빨간사춘기": "ballad",
    "멜로망스": "ballad",
    "악동뮤지션": "ballad",
    "헤이즈": "ballad",
    "임재현": "ballad",
    "김필": "ballad",
    "성시경": "ballad"
};

// 키워드 기반 장르 분류
function detectGenreByKeywords(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    
    // TikTok 트렌드
    if (text.includes('tiktok') || text.includes('challenge') || text.includes('trend')) {
        return 'tiktok_trend';
    }
    
    // Dance/EDM
    if (text.includes('remix') || text.includes('edm') || text.includes('club') || text.includes('dance')) {
        return 'dance';
    }
    
    // Ballad
    if (text.includes('ballad') || text.includes('발라드') || text.includes('사랑') || text.includes('이별')) {
        return 'ballad';
    }
    
    return null;
}

// 아티스트 기반 장르 분류
function getGenreByArtist(artist) {
    // 정확한 매칭
    if (artistGenreMap[artist]) {
        return artistGenreMap[artist];
    }
    
    // 부분 매칭
    for (const [key, genre] of Object.entries(artistGenreMap)) {
        if (artist.includes(key) || key.includes(artist)) {
            return genre;
        }
    }
    
    return null;
}

// 장르 자동 분류
function autoDetectGenre(title, artist) {
    // 1. 아티스트 기반 분류
    const artistGenre = getGenreByArtist(artist);
    if (artistGenre) return artistGenre;
    
    // 2. 키워드 기반 분류
    const keywordGenre = detectGenreByKeywords(title, artist);
    if (keywordGenre) return keywordGenre;
    
    // 3. 기본값: pop
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

// JSON 파일 파싱
async function parseJSON(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  파일 없음: ${filePath}`);
        return [];
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
}

// videoId 추출 (다양한 형식 지원)
function extractVideoId(data) {
    // 직접 videoId 필드
    if (data.videoId || data.video_id || data.youtube_id) {
        return data.videoId || data.video_id || data.youtube_id;
    }
    
    // YouTube URL에서 추출 (다양한 컬럼명 지원)
    const urlFields = [
        data.Url_youtube,  // Spotify_Youtube.csv
        data.url_youtube,
        data.youtube_url,
        data.url,
        data.link,
        data.Link,
        data.URL
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
async function importFromMultipleSources() {
    try {
        console.log('🚀 다중 소스 데이터 수집 시작...\n');
        
        const dataDir = path.join(__dirname, 'data');
        
        // data 폴더 확인
        if (!fs.existsSync(dataDir)) {
            console.log('📁 data 폴더를 생성합니다...');
            fs.mkdirSync(dataDir);
            console.log('\n📋 사용 방법:');
            console.log('1. Kaggle/GitHub에서 데이터셋 다운로드');
            console.log('2. CSV/JSON 파일을 scripts/data/ 폴더에 저장');
            console.log('3. 파일명 예시:');
            console.log('   - spotify_youtube.csv');
            console.log('   - kpop_dataset.csv');
            console.log('   - billboard_songs.json');
            console.log('4. 다시 스크립트 실행\n');
            process.exit(0);
        }
        
        // data 폴더의 모든 파일 읽기
        const files = fs.readdirSync(dataDir);
        console.log(`📂 발견된 파일: ${files.length}개\n`);
        
        if (files.length === 0) {
            console.log('❌ data 폴더에 파일이 없습니다.');
            console.log('Kaggle/GitHub에서 데이터셋을 다운로드하여 scripts/data/ 폴더에 저장하세요.\n');
            process.exit(0);
        }
        
        let totalProcessed = 0;
        let savedCount = 0;
        let skippedCount = 0;
        let tooLongCount = 0;
        let errorCount = 0;
        const MAX_DURATION = 420; // 7분 = 420초
        
        console.log('⏱️  7분(420초) 이하 영상만 수집합니다.\n');
        
        // 각 파일 처리
        for (const file of files) {
            const filePath = path.join(dataDir, file);
            const ext = path.extname(file).toLowerCase();
            
            console.log(`\n📄 처리 중: ${file}`);
            
            try {
                let data = [];
                
                if (ext === '.csv') {
                    data = await parseCSV(filePath);
                } else if (ext === '.json') {
                    data = await parseJSON(filePath);
                } else {
                    console.log(`⏭️  지원하지 않는 형식: ${ext}`);
                    continue;
                }
                
                console.log(`   발견된 레코드: ${data.length}개`);
                
                // 각 레코드 처리
                for (let i = 0; i < data.length; i++) {
                    const record = data[i];
                    totalProcessed++;
                    
                    try {
                        // videoId 추출
                        const videoId = extractVideoId(record);
                        if (!videoId) {
                            // 첫 10개는 디버깅 출력
                            if (totalProcessed <= 10) {
                                console.log(`   [디버그 ${totalProcessed}] videoId 추출 실패`);
                                console.log(`     Url_youtube:`, record.Url_youtube);
                            }
                            continue;
                        }
                        
                        // 첫 5개는 성공 로그
                        if (savedCount === 0 && totalProcessed <= 5) {
                            console.log(`   [디버그 ${totalProcessed}] videoId 추출 성공: ${videoId}`);
                        }
                        
                        // 제목, 아티스트 추출 (다양한 컬럼명 지원)
                        const title = record.Track || record.Title || record.title || record.track || record.song || record.name || 'Unknown';
                        const artist = record.Artist || record.artist || record.artists || record.Channel || record.channel || 'Unknown';
                        
                        // 중복 체크
                        const exists = await PopularSong.findOne({ videoId });
                        if (exists) {
                            skippedCount++;
                            continue;
                        }
                        
                        // 영상 길이 확인 (7분 이하만)
                        const duration = await getVideoDuration(videoId);
                        
                        if (duration === null) {
                            errorCount++;
                            continue;
                        }
                        
                        if (duration > MAX_DURATION) {
                            tooLongCount++;
                            continue;
                        }
                        
                        const minutes = Math.floor(duration / 60);
                        const seconds = duration % 60;
                        
                        // 장르 자동 분류
                        const genre = autoDetectGenre(title, artist);
                        
                        // DB에 저장
                        await PopularSong.create({
                            videoId: videoId,
                            title: title,
                            artist: artist,
                            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                            genre: genre,
                            duration: duration,
                            keywords: [
                                title.toLowerCase(),
                                artist.toLowerCase()
                            ],
                            source: 'dataset',
                            popularity: 100,
                            isActive: true
                        });
                        
                        savedCount++;
                        
                        // 진행 상황 출력 (50개마다)
                        if (savedCount % 50 === 0) {
                            console.log(`   ✅ 저장: ${savedCount}곡 (마지막: ${minutes}:${seconds.toString().padStart(2, '0')})`);
                        }
                        
                        // API 할당량 보호 (1초 대기)
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                    } catch (error) {
                        errorCount++;
                    }
                }
                
            } catch (error) {
                console.error(`   ❌ 파일 처리 실패: ${error.message}`);
            }
        }
        
        console.log(`\n🎉 수집 완료!`);
        console.log(`📊 처리된 레코드: ${totalProcessed}개`);
        console.log(`✅ 저장: ${savedCount}곡`);
        console.log(`⏭️  스킵 (중복): ${skippedCount}곡`);
        console.log(`🚫 제외 (7분 이상): ${tooLongCount}곡`);
        console.log(`❌ 오류: ${errorCount}개`);
        
        // 장르별 통계
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

importFromMultipleSources();
