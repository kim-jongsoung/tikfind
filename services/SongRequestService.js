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
    /**
     * 문자열 유사도 계산 (Levenshtein Distance)
     */
    calculateSimilarity(str1, str2) {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        
        const maxLength = Math.max(s1.length, s2.length);
        return maxLength === 0 ? 1 : 1 - costs[s2.length] / maxLength;
    }

    async searchSong(title, artist) {
        try {
            console.log('🔍 DB 검색 시작:', title, '-', artist);
            
            // 정규화 (대소문자, 공백 제거)
            const normalizedTitle = title.toLowerCase().trim();
            const normalizedArtist = artist ? artist.toLowerCase().trim() : '';
            
            // 1단계: 정확한 매칭 (제목 + 아티스트)
            let dbSong = null;
            
            if (normalizedArtist) {
                dbSong = await PopularSong.findOne({
                    title: new RegExp(`^${this.escapeRegex(normalizedTitle)}$`, 'i'),
                    artist: new RegExp(`^${this.escapeRegex(normalizedArtist)}$`, 'i'),
                    isActive: true
                }).sort({ requestCount: -1 });
            }
            
            // 2단계: 제목만 정확 매칭 (아티스트 정보 없거나 매칭 실패)
            if (!dbSong) {
                dbSong = await PopularSong.findOne({
                    title: new RegExp(`^${this.escapeRegex(normalizedTitle)}$`, 'i'),
                    isActive: true
                }).sort({ requestCount: -1 });
            }
            
            // 3단계: 부분 매칭 (제목 포함)
            if (!dbSong) {
                dbSong = await PopularSong.findOne({
                    title: new RegExp(this.escapeRegex(normalizedTitle), 'i'),
                    isActive: true
                }).sort({ requestCount: -1 });
            }
            
            // 4단계: 텍스트 검색 (키워드 기반)
            if (!dbSong && normalizedTitle.length >= 3) {
                const textSearchResults = await PopularSong.find({
                    $text: { $search: normalizedTitle },
                    isActive: true
                }).limit(5).sort({ score: { $meta: 'textScore' }, requestCount: -1 });
                
                if (textSearchResults.length > 0) {
                    dbSong = textSearchResults[0];
                    console.log('✅ 텍스트 검색으로 찾음:', dbSong.title);
                }
            }

            if (dbSong) {
                console.log('✅ DB 캐시 히트 (비용 0원):', dbSong.title, '-', dbSong.artist);
                
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

            // 5단계: DB에 없으면 YouTube API 검색 (비용 발생!)
            console.log('⚠️ DB 캐시 미스 - YouTube API 호출 (비용 발생)');
            const youtubeResult = await this.searchYouTube(title, artist);
            
            if (youtubeResult) {
                // YouTube 검색 결과를 DB에 저장 (다음번엔 비용 0원)
                try {
                    const newSong = await PopularSong.create({
                        videoId: youtubeResult.videoId,
                        title: title,
                        artist: artist || youtubeResult.channelTitle,
                        thumbnail: youtubeResult.thumbnail,
                        keywords: [
                            title.toLowerCase(),
                            (artist || youtubeResult.channelTitle).toLowerCase()
                        ],
                        source: 'user',
                        popularity: 1,
                        requestCount: 1,
                        lastRequestedAt: new Date(),
                        isActive: true
                    });
                    console.log('💾 DB에 저장 완료 - 다음번엔 비용 0원:', newSong.title);
                } catch (saveError) {
                    // 중복 키 에러는 무시 (동시 요청)
                    if (saveError.code !== 11000) {
                        console.error('⚠️ DB 저장 실패:', saveError.message);
                    }
                }
                
                return {
                    videoId: youtubeResult.videoId,
                    title: title,
                    artist: artist,
                    channelTitle: youtubeResult.channelTitle,
                    thumbnail: youtubeResult.thumbnail,
                    url: youtubeResult.url,
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
     * 정규식 특수문자 이스케이프
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

            const url = 'https://www.googleapis.com/youtube/v3/search';
            
            // 여러 검색 전략 시도
            const queries = [
                `${title} ${artist}`, // 기본 검색
                `${title} ${artist} official`, // official 추가
                `${title} ${artist} MV`, // MV 추가
                `${artist} ${title}`, // 순서 변경
            ];

            for (const query of queries) {
                console.log('🔍 YouTube 검색 시도:', query);

                const response = await axios.get(url, {
                    params: {
                        key: this.youtubeApiKey,
                        q: query,
                        part: 'snippet',
                        type: 'video',
                        maxResults: 10, // 더 많은 결과 확인
                        videoCategoryId: '10' // Music category
                    }
                });

                console.log('✅ YouTube API 응답:', response.data.items?.length || 0, '개 결과');

                if (response.data.items && response.data.items.length > 0) {
                    // 모든 결과를 검증하여 가장 적합한 것 선택
                    for (const video of response.data.items) {
                        const videoTitle = video.snippet.title.toLowerCase();
                        const videoChannel = video.snippet.channelTitle.toLowerCase();
                        const searchTitle = title.toLowerCase();
                        const searchArtist = artist.toLowerCase();
                        
                        // 제목 유사도 확인
                        const titleSimilarity = this.calculateSimilarity(searchTitle, videoTitle);
                        // 가수 이름이 채널명 또는 제목에 포함되는지 확인
                        const artistMatch = videoChannel.includes(searchArtist) || 
                                          videoTitle.includes(searchArtist);
                        
                        console.log('🎵 검증 중:', {
                            video: video.snippet.title,
                            channel: video.snippet.channelTitle,
                            titleSimilarity: titleSimilarity.toFixed(2),
                            artistMatch
                        });
                        
                        // 제목 유사도 0.4 이상이고 가수 이름이 매칭되면 선택
                        if (titleSimilarity >= 0.4 && artistMatch) {
                            const result = {
                                videoId: video.id.videoId,
                                url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
                                thumbnail: video.snippet.thumbnails.high.url,
                                channelTitle: video.snippet.channelTitle,
                                title: video.snippet.title
                            };
                            console.log('✅ YouTube 검색 성공:', result.videoId, '-', video.snippet.title);
                            return result;
                        }
                    }
                    
                    // 검증 통과한 결과가 없으면 첫 번째 결과 사용 (기존 동작)
                    console.log('⚠️ 정확한 매칭 없음, 첫 번째 결과 사용');
                    const video = response.data.items[0];
                    const result = {
                        videoId: video.id.videoId,
                        url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
                        thumbnail: video.snippet.thumbnails.high.url,
                        channelTitle: video.snippet.channelTitle,
                        title: video.snippet.title
                    };
                    console.log('✅ YouTube 검색 성공 (fallback):', result.videoId, '-', video.snippet.title);
                    return result;
                }
                
                console.log('⚠️ 이 쿼리로는 결과 없음, 다음 전략 시도...');
            }

            console.log('❌ 모든 검색 전략 실패:', title, artist);
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
