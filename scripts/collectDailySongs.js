/**
 * 매일 99곡 자동 수집 스크립트
 * YouTube API 무료 할당량(10,000 quota) 내에서 운영
 * 하루 99곡 × 20일 = 1,980곡 무료 수집
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const PopularSong = require('../models/PopularSong');

// YouTube API 설정
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DAILY_QUOTA_LIMIT = 99; // 하루 99곡 (10,000 quota 내)

// 확장 가능한 검색 키워드 생성기 - 개별 곡 중심
function generateSearchTerms() {
    const searchTerms = {
        kpop: [],
        pop: [],
        ballad: [],
        dance: [],
        jpop: [],
        trot: [],
        hiphop: [],
        rnb: [],
        rock: [],
        indie: [],
        tiktok_dance: []
    };
    
    // K-POP: 인기 아티스트별 대표곡
    const kpopArtists = [
        'BTS', 'BLACKPINK', 'NewJeans', 'aespa', 'IVE', 'LE SSERAFIM',
        'TWICE', 'Stray Kids', 'SEVENTEEN', 'NCT', 'EXO', 'Red Velvet',
        '(G)I-DLE', 'ITZY', 'TXT', 'ENHYPEN', 'TREASURE', 'ATEEZ'
    ];
    kpopArtists.forEach(artist => {
        searchTerms.kpop.push(
            `${artist} official music video`,
            `${artist} popular song`,
            `${artist} hit song`
        );
    });
    
    // 팝: 인기 아티스트별 대표곡
    const popArtists = [
        'Ed Sheeran', 'Taylor Swift', 'The Weeknd', 'Ariana Grande',
        'Bruno Mars', 'Dua Lipa', 'Justin Bieber', 'Billie Eilish',
        'Olivia Rodrigo', 'Harry Styles', 'Adele', 'Sam Smith'
    ];
    popArtists.forEach(artist => {
        searchTerms.pop.push(
            `${artist} official music video`,
            `${artist} popular song`,
            `${artist} hit song`
        );
    });
    
    // 발라드: 인기 발라드 가수
    const balladArtists = [
        '임영웅', '성시경', '백지영', '거미', '폴킴', '멜로망스',
        '벤', '린', '휘인', '태연'
    ];
    balladArtists.forEach(artist => {
        searchTerms.ballad.push(
            `${artist} 발라드`,
            `${artist} official music video`
        );
    });
    
    // 댄스/EDM: 인기 DJ/프로듀서
    const edmArtists = [
        'Calvin Harris', 'David Guetta', 'Martin Garrix', 'Marshmello',
        'The Chainsmokers', 'Kygo', 'Alan Walker', 'Avicii'
    ];
    edmArtists.forEach(artist => {
        searchTerms.dance.push(
            `${artist} official music video`,
            `${artist} popular song`
        );
    });
    
    // J-POP: 인기 아티스트
    const jpopArtists = [
        'YOASOBI', 'Ado', 'Fujii Kaze', 'Official HIGE DANdism',
        'LiSA', 'Kenshi Yonezu', 'back number', 'Aimer'
    ];
    jpopArtists.forEach(artist => {
        searchTerms.jpop.push(
            `${artist} official music video`,
            `${artist} popular song`
        );
    });
    
    // 트로트: 인기 트로트 가수
    const trotArtists = [
        '임영웅', '영탁', '이찬원', '장민호', '송가인',
        '진성', '홍진영', '박서진'
    ];
    trotArtists.forEach(artist => {
        searchTerms.trot.push(
            `${artist} 트로트`,
            `${artist} official music video`
        );
    });
    
    // 힙합: 인기 래퍼
    const hiphopArtists = [
        'Drake', 'Travis Scott', 'Post Malone', 'Eminem',
        '쿠시', '비와이', '창모', '식케이', '지코'
    ];
    hiphopArtists.forEach(artist => {
        searchTerms.hiphop.push(
            `${artist} official music video`,
            `${artist} popular song`
        );
    });
    
    // R&B: 인기 R&B 아티스트
    const rnbArtists = [
        'The Weeknd', 'SZA', 'Frank Ocean', 'H.E.R.',
        '딘', '크러쉬', '헤이즈', '박재범'
    ];
    rnbArtists.forEach(artist => {
        searchTerms.rnb.push(
            `${artist} official music video`,
            `${artist} popular song`
        );
    });
    
    // 록: 인기 록 밴드
    const rockArtists = [
        'The Rose', 'DAY6', 'FTISLAND', 'CNBLUE',
        'Linkin Park', 'Imagine Dragons', 'ONE OK ROCK'
    ];
    rockArtists.forEach(artist => {
        searchTerms.rock.push(
            `${artist} official music video`,
            `${artist} popular song`
        );
    });
    
    // 인디: 인기 인디 아티스트
    const indieArtists = [
        '혁오', '잔나비', '새소년', '검정치마', '10cm',
        '볼빨간사춘기', '악동뮤지션', '선우정아'
    ];
    indieArtists.forEach(artist => {
        searchTerms.indie.push(
            `${artist} official music video`,
            `${artist} popular song`
        );
    });
    
    // 틱톡 유행 댄스곡
    const tiktokDanceSongs = [
        'TikTok viral dance 2024', 'TikTok trending dance songs',
        'TikTok dance challenge 2024', 'viral TikTok songs',
        'TikTok popular dance music', 'trending dance songs TikTok',
        'Cupid Twin Version', 'Monkeys Spinning Monkeys',
        'Rasputin dance', 'Renegade dance song',
        'Savage Love dance', 'Say So dance',
        'WAP dance', 'Blinding Lights dance'
    ];
    tiktokDanceSongs.forEach(query => {
        searchTerms.tiktok_dance.push(query);
    });
    
    return searchTerms;
}

// 동적으로 검색어 생성
const genreSearchTerms = generateSearchTerms();

/**
 * YouTube에서 곡 검색
 */
async function searchYouTube(query, genre) {
    try {
        const url = 'https://www.googleapis.com/youtube/v3/search';
        const response = await axios.get(url, {
            params: {
                key: YOUTUBE_API_KEY,
                q: query,
                part: 'snippet',
                type: 'video',
                maxResults: 5,
                videoCategoryId: '10', // Music category
                order: 'relevance'
            }
        });

        if (response.data.items && response.data.items.length > 0) {
            return response.data.items.map(video => ({
                videoId: video.id.videoId,
                title: video.snippet.title,
                artist: video.snippet.channelTitle,
                thumbnail: video.snippet.thumbnails.high.url,
                genre: genre,
                keywords: [
                    video.snippet.title.toLowerCase(),
                    video.snippet.channelTitle.toLowerCase()
                ],
                source: 'auto',
                popularity: 100
            }));
        }

        return [];
    } catch (error) {
        console.error('❌ YouTube 검색 오류:', error.message);
        return [];
    }
}

/**
 * 매일 99곡 수집 (확장 가능)
 */
async function collectDailySongs() {
    try {
        console.log('🚀 매일 자동 수집 시작...');
        console.log(`📅 날짜: ${new Date().toLocaleDateString('ko-KR')}`);
        
        // MongoDB 연결
        await mongoose.connect(process.env.MONGO_URL);
        console.log('✅ MongoDB 연결 성공');

        let totalCollected = 0;
        const genres = Object.keys(genreSearchTerms);
        const songsPerGenre = Math.floor(DAILY_QUOTA_LIMIT / genres.length);

        for (const genre of genres) {
            console.log(`\n🎵 ${genre.toUpperCase()} 수집 중...`);
            
            // 매일 다른 검색어 사용 (랜덤 셔플)
            const searchTerms = [...genreSearchTerms[genre]].sort(() => Math.random() - 0.5);
            let genreCollected = 0;

            for (const searchTerm of searchTerms) {
                if (genreCollected >= songsPerGenre) break;
                if (totalCollected >= DAILY_QUOTA_LIMIT) break;

                console.log(`  🔍 검색: ${searchTerm}`);
                const songs = await searchYouTube(searchTerm, genre);

                for (const song of songs) {
                    if (genreCollected >= songsPerGenre) break;
                    if (totalCollected >= DAILY_QUOTA_LIMIT) break;

                    try {
                        // 중복 체크
                        const exists = await PopularSong.findOne({ videoId: song.videoId });
                        if (exists) {
                            console.log(`  ⏭️  이미 존재: ${song.title}`);
                            continue;
                        }

                        // DB에 저장
                        await PopularSong.create(song);
                        console.log(`  ✅ 저장: ${song.title} - ${song.artist}`);
                        
                        genreCollected++;
                        totalCollected++;
                    } catch (error) {
                        console.error(`  ❌ 저장 실패: ${error.message}`);
                    }
                }

                // API 호출 간 딜레이 (Rate Limit 방지)
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log(`✅ ${genre} 완료: ${genreCollected}곡`);
        }

        console.log(`\n🎉 수집 완료!`);
        console.log(`📊 오늘 수집: ${totalCollected}곡`);
        
        // 전체 통계
        const totalSongs = await PopularSong.countDocuments();
        console.log(`📚 전체 DB: ${totalSongs}곡`);
        console.log(`📅 예상 완료: ${Math.ceil((2000 - totalSongs) / DAILY_QUOTA_LIMIT)}일 후`);

    } catch (error) {
        console.error('❌ 수집 오류:', error);
    } finally {
        await mongoose.disconnect();
        console.log('✅ MongoDB 연결 종료');
    }
}

// 스크립트 실행
if (require.main === module) {
    collectDailySongs()
        .then(() => {
            console.log('✅ 스크립트 완료');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ 스크립트 오류:', error);
            process.exit(1);
        });
}

module.exports = { collectDailySongs };
