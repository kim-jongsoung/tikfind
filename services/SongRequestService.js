/**
 * 신청곡 관리 서비스
 * #노래제목#가수이름 형식 파싱 및 YouTube 검색
 * 하이브리드 방식: DB 우선 검색 → YouTube API 백업 → 자동 DB 저장
 */

const axios = require('axios');
const PopularSong = require('../models/PopularSong');

class SongRequestService {
    constructor() {
        this.youtubeApiKey = process.env.YOUTUBE_API_KEY;
        this.songQueue = new Map(); // userId -> 신청곡 배열
    }

    /**
     * 채팅 메시지에서 신청곡 파싱
     * @param {string} message - 채팅 메시지
     * @returns {object|null} - { title, artist } 또는 null
     */
    parseSongRequest(message) {
        // #노래제목#가수이름 패턴
        const pattern = /#([^#]+)#([^#]+)/;
        const match = message.match(pattern);

        if (match) {
            return {
                title: match[1].trim(),
                artist: match[2].trim()
            };
        }

        return null;
    }

    /**
     * 하이브리드 곡 검색: DB 우선 → YouTube API 백업
     * @param {string} title - 노래 제목
     * @param {string} artist - 가수 이름
     */
    async searchSong(title, artist) {
        try {
            // 1. 먼저 DB에서 검색 (무료, 빠름) - 제목만으로 검색 (비용 절감)
            console.log('🔍 DB 검색 시작 (제목만):', title);
            
            const dbSong = await PopularSong.findOne({
                title: new RegExp(title, 'i')
            }).sort({ requestCount: -1 }); // 신청 횟수 많은 곡 우선

            if (dbSong) {
                console.log('✅ DB에서 찾음 (무료):', dbSong.title);
                
                // 신청 횟수 증가
                await dbSong.incrementRequestCount();
                
                return {
                    videoId: dbSong.videoId,
                    url: `https://www.youtube.com/watch?v=${dbSong.videoId}`,
                    thumbnail: dbSong.thumbnail,
                    channelTitle: dbSong.artist,
                    fromDB: true
                };
            }

            // 2. DB에 없으면 YouTube API 검색 (유료)
            console.log('🔍 DB에 없음. YouTube API 검색 시작...');
            const youtubeResult = await this.searchYouTube(title, artist);
            
            if (youtubeResult) {
                // 3. YouTube 검색 결과를 DB에 저장 (다음번엔 무료)
                try {
                    await PopularSong.create({
                        videoId: youtubeResult.videoId,
                        title: title,
                        artist: artist,
                        thumbnail: youtubeResult.thumbnail,
                        keywords: [
                            title.toLowerCase(),
                            artist.toLowerCase()
                        ],
                        source: 'user',
                        popularity: 1,
                        requestCount: 1,
                        lastRequestedAt: new Date()
                    });
                    console.log('💾 DB에 저장 완료 (다음번엔 무료)');
                } catch (saveError) {
                    console.error('⚠️ DB 저장 실패:', saveError.message);
                }
                
                return {
                    ...youtubeResult,
                    fromDB: false
                };
            }

            return null;
        } catch (error) {
            console.error('❌ 곡 검색 오류:', error.message);
            return null;
        }
    }

    /**
     * YouTube에서 노래 검색 (내부용)
     * @param {string} title - 노래 제목
     * @param {string} artist - 가수 이름
     */
    async searchYouTube(title, artist) {
        try {
            if (!this.youtubeApiKey) {
                console.error('❌ YouTube API 키가 설정되지 않았습니다. .env 파일을 확인해주세요.');
                return null;
            }

            const query = `${title} ${artist} official music video`;
            const url = 'https://www.googleapis.com/youtube/v3/search';

            console.log('🔍 YouTube 검색 시작:', query);
            console.log('🔑 API 키:', this.youtubeApiKey ? '설정됨' : '없음');

            const response = await axios.get(url, {
                params: {
                    key: this.youtubeApiKey,
                    q: query,
                    part: 'snippet',
                    type: 'video',
                    maxResults: 1,
                    videoCategoryId: '10' // Music category
                }
            });

            console.log('✅ YouTube API 응답:', response.data.items?.length || 0, '개 결과');

            if (response.data.items && response.data.items.length > 0) {
                const video = response.data.items[0];
                const result = {
                    videoId: video.id.videoId,
                    url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
                    thumbnail: video.snippet.thumbnails.high.url,
                    channelTitle: video.snippet.channelTitle
                };
                console.log('✅ YouTube 검색 성공:', result.videoId, '-', video.snippet.title);
                return result;
            }

            console.log('❌ YouTube 검색 결과 없음:', query);
            return null;
        } catch (error) {
            console.error('❌ YouTube 검색 오류:', error.message);
            if (error.response) {
                console.error('❌ YouTube API 응답 에러:', error.response.status, error.response.data);
            }
            return null;
        }
    }

    /**
     * YouTube 영상 길이 가져오기
     * @param {string} videoId - YouTube 비디오 ID
     */
    async getVideoDuration(videoId) {
        try {
            if (!this.youtubeApiKey) {
                console.error('❌ YouTube API 키가 설정되지 않았습니다.');
                return null;
            }

            const url = 'https://www.googleapis.com/youtube/v3/videos';
            const response = await axios.get(url, {
                params: {
                    key: this.youtubeApiKey,
                    id: videoId,
                    part: 'contentDetails'
                }
            });

            if (response.data.items && response.data.items.length > 0) {
                const duration = response.data.items[0].contentDetails.duration;
                // ISO 8601 duration을 초로 변환 (예: PT3M45S -> 225초)
                const seconds = this.parseDuration(duration);
                console.log(`⏱️ 영상 길이: ${videoId} = ${seconds}초`);
                return seconds;
            }

            return null;
        } catch (error) {
            console.error('❌ YouTube 영상 길이 조회 오류:', error.message);
            return null;
        }
    }

    /**
     * ISO 8601 duration을 초로 변환
     * @param {string} duration - ISO 8601 형식 (예: PT3M45S)
     */
    parseDuration(duration) {
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;

        const hours = parseInt(match[1] || 0);
        const minutes = parseInt(match[2] || 0);
        const seconds = parseInt(match[3] || 0);

        return hours * 3600 + minutes * 60 + seconds;
    }

    /**
     * 신청곡 추가
     * @param {string} userId - 스트리머 ID
     * @param {object} songData - 신청곡 데이터
     * @param {object} requester - 신청자 정보
     */
    async addSongRequest(userId, songData, requester) {
        const { title, artist } = songData;

        // YouTube 검색
        const youtubeData = await this.searchYouTube(title, artist);

        if (!youtubeData) {
            return {
                success: false,
                message: '노래를 찾을 수 없습니다'
            };
        }

        // 신청곡 객체 생성
        const song = {
            id: `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: title,
            artist: artist,
            requester: requester.username,
            requesterId: requester.uniqueId,
            youtubeUrl: youtubeData.url,
            videoId: youtubeData.videoId,
            thumbnail: youtubeData.thumbnail,
            priority: this.calculatePriority(requester),
            timestamp: Date.now(),
            played: false
        };

        // 큐에 추가
        if (!this.songQueue.has(userId)) {
            this.songQueue.set(userId, []);
        }

        const queue = this.songQueue.get(userId);
        queue.push(song);

        // 우선순위로 정렬
        queue.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority; // 높은 우선순위 먼저
            }
            return a.timestamp - b.timestamp; // 같으면 먼저 신청한 순서
        });

        console.log(`🎵 신청곡 추가: ${title} - ${artist} (신청: ${requester.username})`);

        return {
            success: true,
            song: song,
            queuePosition: queue.findIndex(s => s.id === song.id) + 1,
            totalQueue: queue.length
        };
    }

    /**
     * 우선순위 계산
     * @param {object} requester - 신청자 정보
     */
    calculatePriority(requester) {
        let priority = 100; // 기본값

        // VIP 후원자 (나중에 구현)
        if (requester.isVIP) {
            priority += 1000;
        }

        // 사용자 레벨 (나중에 구현)
        if (requester.level) {
            priority += requester.level * 10;
        }

        // 팔로워 배지
        if (requester.badges && requester.badges.includes('follower')) {
            priority += 50;
        }

        return priority;
    }

    /**
     * 신청곡 큐 가져오기
     * @param {string} userId - 스트리머 ID
     */
    getQueue(userId) {
        return this.songQueue.get(userId) || [];
    }

    /**
     * 신청곡 삭제
     * @param {string} userId - 스트리머 ID
     * @param {string} songId - 신청곡 ID
     */
    removeSong(userId, songId) {
        const queue = this.songQueue.get(userId);
        if (!queue) return false;

        const index = queue.findIndex(s => s.id === songId);
        if (index === -1) return false;

        queue.splice(index, 1);
        console.log(`🗑️ 신청곡 삭제: ${songId}`);
        return true;
    }

    /**
     * 신청곡 재생 완료 처리
     * @param {string} userId - 스트리머 ID
     * @param {string} songId - 신청곡 ID
     */
    markAsPlayed(userId, songId) {
        const queue = this.songQueue.get(userId);
        if (!queue) return false;

        const song = queue.find(s => s.id === songId);
        if (!song) return false;

        song.played = true;
        console.log(`✅ 신청곡 재생 완료: ${song.title} - ${song.artist}`);
        return true;
    }

    /**
     * 신청자 재실 확인
     * @param {string} userId - 스트리머 ID
     * @param {Set} activeViewers - 현재 시청자 Set
     */
    checkRequesterPresence(userId, activeViewers) {
        const queue = this.songQueue.get(userId);
        if (!queue || queue.length === 0) return;

        const nextSong = queue[0];
        
        // 신청자가 방에 없으면 스킵
        if (!activeViewers.has(nextSong.requesterId)) {
            console.log(`⏭️ 신청자 부재로 스킵: ${nextSong.title} (신청: ${nextSong.requester})`);
            this.removeSong(userId, nextSong.id);
            
            // 재귀적으로 다음 곡도 확인
            this.checkRequesterPresence(userId, activeViewers);
        }
    }

    /**
     * 신청곡 큐 초기화
     * @param {string} userId - 스트리머 ID
     */
    clearQueue(userId) {
        this.songQueue.delete(userId);
        console.log(`🗑️ 신청곡 큐 초기화: ${userId}`);
    }

    /**
     * 신청곡 순서 변경 (수동)
     * @param {string} userId - 스트리머 ID
     * @param {string} songId - 신청곡 ID
     * @param {number} newPosition - 새 위치 (0-based)
     */
    moveSong(userId, songId, newPosition) {
        const queue = this.songQueue.get(userId);
        if (!queue) return false;

        const currentIndex = queue.findIndex(s => s.id === songId);
        if (currentIndex === -1) return false;

        const [song] = queue.splice(currentIndex, 1);
        queue.splice(newPosition, 0, song);

        console.log(`🔄 신청곡 순서 변경: ${song.title} (${currentIndex} → ${newPosition})`);
        return true;
    }
}

module.exports = SongRequestService;
