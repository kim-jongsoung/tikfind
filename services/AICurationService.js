/**
 * AI 자동 큐레이션 서비스
 * OpenAI로 장르별 인기곡 추천 → YouTube API로 조회 → DB 저장
 */

const axios = require('axios');
const OpenAI = require('openai');
const PopularSong = require('../models/PopularSong');
const Genre = require('../models/Genre');

class AICurationService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.youtubeApiKey = process.env.YOUTUBE_API_KEY;
    }

    /**
     * AI로 장르별 인기곡 50곡 추천받기
     * @param {string} genreName - 장르 이름
     * @returns {Array} - [{title, artist}, ...]
     */
    async getAIRecommendations(genreName) {
        try {
            console.log(`🤖 AI에게 "${genreName}" 장르 인기곡 추천 요청...`);
            
            const prompt = `You are a music expert. Please recommend 50 most popular and trending songs for the genre "${genreName}" in 2024-2025.

Requirements:
- Return ONLY a JSON array
- Each item must have "title" and "artist" fields
- Focus on currently popular and trending songs
- Include both global hits and genre-specific favorites
- Mix of recent releases and timeless classics

Format:
[
  {"title": "Song Title", "artist": "Artist Name"},
  ...
]

Return exactly 50 songs.`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional music curator. Always return valid JSON arrays only.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            });

            const content = response.choices[0].message.content.trim();
            
            // JSON 파싱
            let songs;
            try {
                // ```json ... ``` 형식 제거
                const jsonMatch = content.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    songs = JSON.parse(jsonMatch[0]);
                } else {
                    songs = JSON.parse(content);
                }
            } catch (parseError) {
                console.error('❌ JSON 파싱 실패:', parseError);
                throw new Error('AI 응답을 파싱할 수 없습니다');
            }

            console.log(`✅ AI 추천 완료: ${songs.length}곡`);
            return songs;
        } catch (error) {
            console.error('❌ AI 추천 실패:', error.message);
            throw error;
        }
    }

    /**
     * YouTube에서 곡 검색
     * @param {string} title - 곡 제목
     * @param {string} artist - 아티스트
     * @returns {Object} - {videoId, thumbnail}
     */
    async searchYouTube(title, artist) {
        try {
            const query = `${title} ${artist} official`;
            const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                    key: this.youtubeApiKey,
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

    /**
     * 장르별 자동 큐레이션 실행
     * @param {string} genreId - 장르 ID
     * @returns {Object} - {success, savedCount, skippedCount, errorCount}
     */
    async curateGenre(genreId) {
        try {
            // 장르 조회
            const genre = await Genre.findById(genreId);
            if (!genre) {
                throw new Error('장르를 찾을 수 없습니다');
            }

            console.log(`\n🎵 "${genre.name}" 장르 자동 큐레이션 시작...\n`);

            // 1단계: AI 추천
            const recommendations = await this.getAIRecommendations(genre.name);
            
            let savedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            // 2단계: 각 곡을 YouTube에서 검색하고 DB에 저장
            for (let i = 0; i < recommendations.length; i++) {
                const { title, artist } = recommendations[i];
                
                try {
                    // 중복 체크
                    const exists = await PopularSong.findOne({
                        title: new RegExp(`^${title}$`, 'i'),
                        artist: new RegExp(`^${artist}$`, 'i'),
                        genre: genreId
                    });

                    if (exists) {
                        console.log(`   ⏭️  [${i + 1}/50] 이미 있음: ${title} - ${artist}`);
                        skippedCount++;
                        continue;
                    }

                    // YouTube 검색
                    const youtubeData = await this.searchYouTube(title, artist);
                    
                    if (!youtubeData) {
                        console.log(`   ❌ [${i + 1}/50] YouTube 검색 실패: ${title} - ${artist}`);
                        errorCount++;
                        continue;
                    }

                    // DB에 저장
                    await PopularSong.create({
                        videoId: youtubeData.videoId,
                        title: title,
                        artist: artist,
                        thumbnail: youtubeData.thumbnail,
                        genre: genreId,
                        keywords: [
                            title.toLowerCase(),
                            artist.toLowerCase()
                        ],
                        source: 'auto',
                        popularity: 100,
                        isAIPlaylist: true,
                        isActive: true
                    });

                    console.log(`   ✅ [${i + 1}/50] 저장: ${title} - ${artist}`);
                    savedCount++;

                    // API 할당량 보호 (1초 대기)
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    console.error(`   ❌ [${i + 1}/50] 오류: ${title} - ${artist}`, error.message);
                    errorCount++;
                }
            }

            // 장르 정보 업데이트
            genre.curatedCount = savedCount;
            genre.lastCuratedAt = new Date();
            await genre.save();

            console.log(`\n🎉 큐레이션 완료!`);
            console.log(`✅ 저장: ${savedCount}곡`);
            console.log(`⏭️  스킵: ${skippedCount}곡`);
            console.log(`❌ 오류: ${errorCount}곡\n`);

            return {
                success: true,
                savedCount,
                skippedCount,
                errorCount,
                total: recommendations.length
            };
        } catch (error) {
            console.error('❌ 큐레이션 실패:', error);
            throw error;
        }
    }
}

module.exports = new AICurationService();
