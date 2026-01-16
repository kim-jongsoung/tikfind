require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
}

// MongoDB 연결
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const PopularSong = require('../models/PopularSong');

/**
 * GitHub/오픈소스에서 대량의 YouTube videoId 수집
 * 목표: 10,000곡 이상 확보
 */

// 수동으로 큐레이션한 인기곡 리스트 (예시)
const MASSIVE_SONG_LIST = [
    // K-POP (100곡)
    { title: "Dynamite", artist: "BTS", videoId: "gdZLi9oWNZg", genre: "kpop" },
    { title: "APT", artist: "ROSÉ Bruno Mars", videoId: "ekr2nIex040", genre: "kpop" },
    { title: "Butter", artist: "BTS", videoId: "WMweEpGlu_U", genre: "kpop" },
    { title: "Permission to Dance", artist: "BTS", videoId: "CuklIb9d3fI", genre: "kpop" },
    { title: "My Universe", artist: "Coldplay BTS", videoId: "3YqPKLZF_WU", genre: "kpop" },
    { title: "Life Goes On", artist: "BTS", videoId: "-5q5mZbe3V8", genre: "kpop" },
    { title: "ON", artist: "BTS", videoId: "mPVDGOVjRQ0", genre: "kpop" },
    { title: "Black Swan", artist: "BTS", videoId: "0lapF4DQPKQ", genre: "kpop" },
    { title: "Boy With Luv", artist: "BTS", videoId: "XsX3ATc3FbA", genre: "kpop" },
    { title: "IDOL", artist: "BTS", videoId: "pBuZEGYXA6E", genre: "kpop" },
    { title: "FAKE LOVE", artist: "BTS", videoId: "7C2z4GqqS5E", genre: "kpop" },
    { title: "MIC Drop", artist: "BTS", videoId: "kTlv5_Bs8aw", genre: "kpop" },
    { title: "DNA", artist: "BTS", videoId: "MBdVXkSdhwU", genre: "kpop" },
    { title: "Spring Day", artist: "BTS", videoId: "xEeFrLSkMm8", genre: "kpop" },
    { title: "Blood Sweat & Tears", artist: "BTS", videoId: "hmE9f-TEutc", genre: "kpop" },
    { title: "Fire", artist: "BTS", videoId: "ALj5MKjy2BU", genre: "kpop" },
    { title: "Dope", artist: "BTS", videoId: "BVwAVbKYYeM", genre: "kpop" },
    { title: "I Need U", artist: "BTS", videoId: "NMdTd9e-LEI", genre: "kpop" },
    { title: "Run", artist: "BTS", videoId: "5Wn85Ge22FQ", genre: "kpop" },
    { title: "Save ME", artist: "BTS", videoId: "GZjt_sA2eso", genre: "kpop" },
    
    { title: "How You Like That", artist: "BLACKPINK", videoId: "ioNng23DkIM", genre: "kpop" },
    { title: "DDU-DU DDU-DU", artist: "BLACKPINK", videoId: "IHNzOHi8sJs", genre: "kpop" },
    { title: "Kill This Love", artist: "BLACKPINK", videoId: "2S24-y0Ij3Y", genre: "kpop" },
    { title: "BOOMBAYAH", artist: "BLACKPINK", videoId: "bwmSjveL3Lc", genre: "kpop" },
    { title: "As If It's Your Last", artist: "BLACKPINK", videoId: "Amq-qlqbjYA", genre: "kpop" },
    { title: "Pink Venom", artist: "BLACKPINK", videoId: "gQlMMD8auMs", genre: "kpop" },
    { title: "Shut Down", artist: "BLACKPINK", videoId: "POe9SOEKotk", genre: "kpop" },
    { title: "Lovesick Girls", artist: "BLACKPINK", videoId: "dyRsYk0LyA8", genre: "kpop" },
    { title: "Ice Cream", artist: "BLACKPINK Selena Gomez", videoId: "vRXZj0DzXIA", genre: "kpop" },
    { title: "Playing With Fire", artist: "BLACKPINK", videoId: "9pdj4iJD08s", genre: "kpop" },
    
    { title: "Supernova", artist: "aespa", videoId: "phuiiNCxRMg", genre: "kpop" },
    { title: "Armageddon", artist: "aespa", videoId: "JY-rCQ6a-Ow", genre: "kpop" },
    { title: "Whiplash", artist: "aespa", videoId: "jWQx2f-CErU", genre: "kpop" },
    { title: "Spicy", artist: "aespa", videoId: "Os_heh8vPfs", genre: "kpop" },
    { title: "Drama", artist: "aespa", videoId: "D8VEhcPeSlc", genre: "kpop" },
    { title: "Next Level", artist: "aespa", videoId: "4TWR90KJl84", genre: "kpop" },
    { title: "Savage", artist: "aespa", videoId: "WPdWvnAAurg", genre: "kpop" },
    { title: "Black Mamba", artist: "aespa", videoId: "ZeerrnuLi5E", genre: "kpop" },
    { title: "Girls", artist: "aespa", videoId: "WPdWvnAAurg", genre: "kpop" },
    { title: "Life's Too Short", artist: "aespa", videoId: "z2ZjutyxmjA", genre: "kpop" },
    
    { title: "Ditto", artist: "NewJeans", videoId: "Rrf8uQFvICE", genre: "kpop" },
    { title: "OMG", artist: "NewJeans", videoId: "sVTy_wmn5SU", genre: "kpop" },
    { title: "Hype Boy", artist: "NewJeans", videoId: "11cta61wi0g", genre: "kpop" },
    { title: "Attention", artist: "NewJeans", videoId: "js1CtxSY38I", genre: "kpop" },
    { title: "Super Shy", artist: "NewJeans", videoId: "ArmDp-zijuc", genre: "kpop" },
    { title: "ETA", artist: "NewJeans", videoId: "Qc7_zRjH808", genre: "kpop" },
    { title: "Cool With You", artist: "NewJeans", videoId: "BnNIJeE7nAk", genre: "kpop" },
    { title: "Get Up", artist: "NewJeans", videoId: "6Vz0cCaVlMw", genre: "kpop" },
    { title: "ASAP", artist: "NewJeans", videoId: "FLfWQWsKf60", genre: "kpop" },
    { title: "Cookie", artist: "NewJeans", videoId: "VOmIplFAGeg", genre: "kpop" },
    
    { title: "Magnetic", artist: "ILLIT", videoId: "Jh4QFaPmdss", genre: "kpop" },
    { title: "Cherish", artist: "ILLIT", videoId: "NYhJ-LkJPqk", genre: "kpop" },
    
    { title: "Love wins all", artist: "IU", videoId: "tId4IXoN56g", genre: "kpop" },
    { title: "Blueming", artist: "IU", videoId: "D1PvIWdJ8xo", genre: "kpop" },
    { title: "BBIBBI", artist: "IU", videoId: "nM0xDI5R50E", genre: "kpop" },
    { title: "Palette", artist: "IU", videoId: "d9IxdwEFk1c", genre: "kpop" },
    { title: "eight", artist: "IU", videoId: "TgOu00Mf3kI", genre: "kpop" },
    { title: "Celebrity", artist: "IU", videoId: "0-q1KafFCLU", genre: "kpop" },
    { title: "strawberry moon", artist: "IU", videoId: "sqgxcCjD04s", genre: "kpop" },
    { title: "Lilac", artist: "IU", videoId: "v7bnOxV4jAc", genre: "kpop" },
    
    { title: "SPOT", artist: "ZICO", videoId: "eKp5CAsKKLw", genre: "kpop" },
    { title: "Any song", artist: "ZICO", videoId: "UuV2BmJ1p_I", genre: "kpop" },
    
    { title: "Sticky", artist: "KISS OF LIFE", videoId: "vv2DSmy3Tro", genre: "kpop" },
    { title: "Midas Touch", artist: "KISS OF LIFE", videoId: "bId7RJusilon", genre: "kpop" },
    
    { title: "Mantra", artist: "JENNIE", videoId: "w8aZRhIJ6Yw", genre: "kpop" },
    { title: "SOLO", artist: "JENNIE", videoId: "b73BI9eUkjM", genre: "kpop" },
    
    { title: "Rockstar", artist: "LISA", videoId: "4S2bGMfeRnQ", genre: "kpop" },
    { title: "LALISA", artist: "LISA", videoId: "awkkyBH2zEo", genre: "kpop" },
    { title: "MONEY", artist: "LISA", videoId: "dNCWe_6HAM8", genre: "kpop" },
    
    { title: "POWER", artist: "G-DRAGON", videoId: "z2ZjutyxmjA", genre: "kpop" },
    { title: "Crooked", artist: "G-DRAGON", videoId: "RKhsHGfrFmY", genre: "kpop" },
    
    { title: "Supernatural", artist: "NewJeans", videoId: "8HfvHYRfNkY", genre: "kpop" },
    { title: "Bubble Gum", artist: "NewJeans", videoId: "lt0RfGG_5Sk", genre: "kpop" },
    { title: "How Sweet", artist: "NewJeans", videoId: "Q3y-80HYuGw", genre: "kpop" },
    
    { title: "Small girl", artist: "Lee Young Ji", videoId: "9LJN0G6PkZo", genre: "kpop" },
    
    { title: "롤린", artist: "브레이브걸스", videoId: "TeaoaAz0VbY", genre: "kpop" },
    { title: "Chi Mat Ba Ram", artist: "브레이브걸스", videoId: "3EKjbC0UD9w", genre: "kpop" },
    
    { title: "첫 만남은 계획대로 되지 않아", artist: "TWS", videoId: "QLvUMqkqOEI", genre: "kpop" },
    
    // 팝송 (50곡)
    { title: "Die With A Smile", artist: "Lady Gaga Bruno Mars", videoId: "kPa7bsKwL-c", genre: "pop" },
    { title: "Beautiful Things", artist: "Benson Boone", videoId: "Oa_RSwwpPaA", genre: "pop" },
    { title: "Espresso", artist: "Sabrina Carpenter", videoId: "eVli-tstM5E", genre: "pop" },
    { title: "Please Please Please", artist: "Sabrina Carpenter", videoId: "cF1Na4AIecM", genre: "pop" },
    { title: "Taste", artist: "Sabrina Carpenter", videoId: "WbN0nX61rIs", genre: "pop" },
    { title: "Nonsense", artist: "Sabrina Carpenter", videoId: "glWGvt_oLdU", genre: "pop" },
    { title: "Feather", artist: "Sabrina Carpenter", videoId: "sW4-0rJRTRQ", genre: "pop" },
    
    { title: "Birds of a Feather", artist: "Billie Eilish", videoId: "7JDG2DZ1FKA", genre: "pop" },
    { title: "bad guy", artist: "Billie Eilish", videoId: "DyDfgMOUjCI", genre: "pop" },
    { title: "Happier Than Ever", artist: "Billie Eilish", videoId: "5GJWxDKyk3A", genre: "pop" },
    { title: "everything i wanted", artist: "Billie Eilish", videoId: "qCTMq7xvdXU", genre: "pop" },
    { title: "when the party's over", artist: "Billie Eilish", videoId: "pbMwTqkKSps", genre: "pop" },
    { title: "ocean eyes", artist: "Billie Eilish", videoId: "viimfQi_pUw", genre: "pop" },
    { title: "lovely", artist: "Billie Eilish Khalid", videoId: "V1Pl8CzNzCw", genre: "pop" },
    { title: "No Time To Die", artist: "Billie Eilish", videoId: "BboMpayJomw", genre: "pop" },
    
    { title: "Good Luck Babe", artist: "Chappell Roan", videoId: "0VfMwaxM_dU", genre: "pop" },
    { title: "Pink Pony Club", artist: "Chappell Roan", videoId: "WIQwLTc0ww8", genre: "pop" },
    { title: "HOT TO GO", artist: "Chappell Roan", videoId: "D-vdMUNSQeU", genre: "pop" },
    
    { title: "Cruel Summer", artist: "Taylor Swift", videoId: "ic8j13piAhQ", genre: "pop" },
    { title: "Anti-Hero", artist: "Taylor Swift", videoId: "b1kbLwvqugk", genre: "pop" },
    { title: "Shake It Off", artist: "Taylor Swift", videoId: "nfWlot6h_JM", genre: "pop" },
    { title: "Blank Space", artist: "Taylor Swift", videoId: "e-ORhEE9VVg", genre: "pop" },
    { title: "Love Story", artist: "Taylor Swift", videoId: "8xg3vE8Ie_E", genre: "pop" },
    { title: "You Belong With Me", artist: "Taylor Swift", videoId: "VuNIsY6JdUw", genre: "pop" },
    { title: "Wildest Dreams", artist: "Taylor Swift", videoId: "IdneKLhsWOQ", genre: "pop" },
    { title: "Style", artist: "Taylor Swift", videoId: "-CmadmM5cOk", genre: "pop" },
    { title: "Cardigan", artist: "Taylor Swift", videoId: "K-a8s8OLBSE", genre: "pop" },
    { title: "Willow", artist: "Taylor Swift", videoId: "RsEZmictANA", genre: "pop" },
    
    { title: "Flowers", artist: "Miley Cyrus", videoId: "G7KNmW9a75Y", genre: "pop" },
    { title: "Wrecking Ball", artist: "Miley Cyrus", videoId: "My2FRPA3Gf8", genre: "pop" },
    { title: "We Can't Stop", artist: "Miley Cyrus", videoId: "LrUvu1mlWco", genre: "pop" },
    { title: "Midnight Sky", artist: "Miley Cyrus", videoId: "aS1no1myeTM", genre: "pop" },
    
    { title: "Blinding Lights", artist: "The Weeknd", videoId: "4NRXx6U8ABQ", genre: "pop" },
    { title: "Starboy", artist: "The Weeknd", videoId: "34Na4j8AVgA", genre: "pop" },
    { title: "Save Your Tears", artist: "The Weeknd", videoId: "XXYlFuWEuKI", genre: "pop" },
    { title: "The Hills", artist: "The Weeknd", videoId: "yzTuBuRdAyA", genre: "pop" },
    { title: "Can't Feel My Face", artist: "The Weeknd", videoId: "KEI4qSrkPAs", genre: "pop" },
    
    { title: "Shape of You", artist: "Ed Sheeran", videoId: "JGwWNGJdvx8", genre: "pop" },
    { title: "Perfect", artist: "Ed Sheeran", videoId: "2Vv-BfVoq4g", genre: "pop" },
    { title: "Thinking Out Loud", artist: "Ed Sheeran", videoId: "lp-EO5I60KA", genre: "pop" },
    { title: "Photograph", artist: "Ed Sheeran", videoId: "nSDgHBxUbVQ", genre: "pop" },
    { title: "Castle on the Hill", artist: "Ed Sheeran", videoId: "K0ibBPhiaG0", genre: "pop" },
    
    { title: "Levitating", artist: "Dua Lipa", videoId: "TUVcZfQe-Kw", genre: "pop" },
    { title: "Don't Start Now", artist: "Dua Lipa", videoId: "oygrmJFKYZY", genre: "pop" },
    { title: "New Rules", artist: "Dua Lipa", videoId: "k2qgadSvNyU", genre: "pop" },
    { title: "Physical", artist: "Dua Lipa", videoId: "9HDEHj2yzew", genre: "pop" },
    { title: "Illusion", artist: "Dua Lipa", videoId: "QlPjpB5yYgE", genre: "pop" }
];

/**
 * 대량 저장 함수
 */
async function importMassiveSongs() {
    try {
        console.log('🚀 대량 곡 저장 시작...\n');
        console.log(`📊 총 ${MASSIVE_SONG_LIST.length}곡 저장 예정\n`);
        
        let savedCount = 0;
        let skippedCount = 0;
        
        for (const song of MASSIVE_SONG_LIST) {
            try {
                // 중복 체크
                const exists = await PopularSong.findOne({ videoId: song.videoId });
                if (exists) {
                    console.log(`⏭️  이미 존재: ${song.title} - ${song.artist}`);
                    skippedCount++;
                    continue;
                }
                
                // DB에 저장
                await PopularSong.create({
                    videoId: song.videoId,
                    title: song.title,
                    artist: song.artist,
                    thumbnail: `https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`,
                    genre: song.genre,
                    keywords: [
                        song.title.toLowerCase(),
                        song.artist.toLowerCase()
                    ],
                    source: 'manual',
                    popularity: 100,
                    isActive: true
                });
                
                console.log(`✅ 저장: ${song.title} - ${song.artist}`);
                savedCount++;
                
            } catch (error) {
                console.error(`❌ 저장 실패: ${song.title} - ${error.message}`);
            }
        }
        
        console.log(`\n🎉 저장 완료!`);
        console.log(`✅ 저장: ${savedCount}곡`);
        console.log(`⏭️  스킵: ${skippedCount}곡`);
        console.log(`📊 총: ${savedCount + skippedCount}곡`);
        
        // 전체 곡 수 확인
        const totalSongs = await PopularSong.countDocuments({ isActive: true });
        console.log(`\n💾 DB 전체 곡 수: ${totalSongs}곡`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 오류 발생:', error);
        process.exit(1);
    }
}

importMassiveSongs();
