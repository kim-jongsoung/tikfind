const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const axios = require('axios');

const MONGODB_URI = process.env.MONGO_URL || process.env.DATABASE_URL;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

if (!MONGODB_URI || !YOUTUBE_API_KEY) {
    console.error('❌ 환경 변수가 필요합니다.');
    process.exit(1);
}

mongoose.connect(MONGODB_URI);

const PopularSong = require('../models/PopularSong');

// 한국 대표 아티스트와 대표곡
const koreanArtists = [
    {
        name: "김광석",
        songs: [
            "어느60대노부부이야기",
            "서른즈음에",
            "이등병의 편지",
            "사랑했지만",
            "너무 아픈 사랑은 사랑이 아니었음을",
            "먼지가 되어",
            "바람이 불어오는 곳",
            "두 바퀴로 가는 자동차"
        ]
    },
    {
        name: "이문세",
        songs: [
            "광화문 연가",
            "소녀",
            "붉은 노을",
            "가을이 오면",
            "옛사랑",
            "난 아직도 모르잖아요",
            "사랑이 지나가면"
        ]
    },
    {
        name: "조용필",
        songs: [
            "킬리만자로의 표범",
            "돌아와요 부산항에",
            "허공",
            "창밖의 여자",
            "고추잠자리",
            "친구여"
        ]
    },
    {
        name: "신해철",
        songs: [
            "그대에게",
            "민물장어의 꿈",
            "재즈카페",
            "슬픈표정하지말아요"
        ]
    },
    {
        name: "윤종신",
        songs: [
            "좋니",
            "오래전 그날",
            "너였다면",
            "말하는대로",
            "팬이야"
        ]
    },
    {
        name: "이적",
        songs: [
            "다행이다",
            "걱정말아요 그대",
            "하늘을 달리다",
            "거짓말 거짓말 거짓말"
        ]
    },
    {
        name: "김동률",
        songs: [
            "출발",
            "감사",
            "다시 사랑한다 말할까",
            "황금가면"
        ]
    },
    {
        name: "성시경",
        songs: [
            "너의 모든 순간",
            "두 사람",
            "거리에서",
            "넌 감동이었어"
        ]
    },
    {
        name: "폴킴",
        songs: [
            "모든 날 모든 순간",
            "너를 만나",
            "안녕",
            "길"
        ]
    },
    {
        name: "백예린",
        songs: [
            "Bye bye my blue",
            "Square",
            "0310",
            "La La La Love Song"
        ]
    },
    {
        name: "10cm",
        songs: [
            "봄이 좋냐",
            "매트리스",
            "폰서트",
            "아메리카노"
        ]
    },
    {
        name: "볼빨간사춘기",
        songs: [
            "우주를 줄게",
            "나만 안되는 연애",
            "좋다고 말해",
            "여행"
        ]
    },
    {
        name: "멜로망스",
        songs: [
            "선물",
            "좋은 날",
            "사랑인가 봐",
            "고백"
        ]
    },
    {
        name: "악동뮤지션",
        songs: [
            "200%",
            "Give Love",
            "오랜 날 오랜 밤",
            "작은별"
        ]
    },
    {
        name: "헤이즈",
        songs: [
            "비도 오고 그래서",
            "돌아오지마",
            "Star",
            "헤픈 우연"
        ]
    }
];

// YouTube 검색
async function searchYouTube(title, artist) {
    try {
        const query = `${title} ${artist}`;
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                key: YOUTUBE_API_KEY,
                q: query,
                type: 'video',
                part: 'snippet',
                maxResults: 1,
                videoCategoryId: '10' // Music
            }
        });

        if (response.data.items && response.data.items.length > 0) {
            const item = response.data.items[0];
            return {
                videoId: item.id.videoId,
                thumbnail: item.snippet.thumbnails.high.url
            };
        }
        return null;
    } catch (error) {
        console.error(`❌ YouTube 검색 실패: ${title} - ${artist}`, error.message);
        return null;
    }
}

// 메인 수집 함수
async function collectKoreanArtists() {
    try {
        console.log('🎵 한국 아티스트 곡 수집 시작...\n');
        
        let totalSongs = 0;
        let savedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const artist of koreanArtists) {
            console.log(`\n🎤 ${artist.name} 수집 중...`);
            
            for (const song of artist.songs) {
                totalSongs++;
                
                try {
                    // 중복 체크
                    const exists = await PopularSong.findOne({
                        title: new RegExp(`^${song}$`, 'i'),
                        artist: new RegExp(`^${artist.name}$`, 'i')
                    });
                    
                    if (exists) {
                        console.log(`   ⏭️  이미 있음: ${song}`);
                        skippedCount++;
                        continue;
                    }
                    
                    // YouTube 검색
                    const result = await searchYouTube(song, artist.name);
                    
                    if (!result) {
                        errorCount++;
                        continue;
                    }
                    
                    // DB에 저장
                    await PopularSong.create({
                        videoId: result.videoId,
                        title: song,
                        artist: artist.name,
                        thumbnail: result.thumbnail,
                        genre: 'ballad', // 기본값, 나중에 수정 가능
                        keywords: [
                            song.toLowerCase(),
                            artist.name.toLowerCase()
                        ],
                        source: 'manual',
                        popularity: 100,
                        isActive: true
                    });
                    
                    console.log(`   ✅ 저장: ${song}`);
                    savedCount++;
                    
                    // API 할당량 보호 (1초 대기)
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (error) {
                    console.error(`   ❌ 오류: ${song}`, error.message);
                    errorCount++;
                }
            }
        }
        
        console.log(`\n🎉 수집 완료!`);
        console.log(`📊 총 곡 수: ${totalSongs}곡`);
        console.log(`✅ 저장: ${savedCount}곡`);
        console.log(`⏭️  스킵 (중복): ${skippedCount}곡`);
        console.log(`❌ 오류: ${errorCount}곡`);
        
        // 최종 통계
        const totalInDB = await PopularSong.countDocuments({ isActive: true });
        console.log(`\n💾 DB 전체 곡 수: ${totalInDB}곡`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 오류 발생:', error);
        process.exit(1);
    }
}

collectKoreanArtists();
