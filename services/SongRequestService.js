/**
 * 신청곡 관리 서비스
 * #노래제목#가수이름 형식 파싱 및 YouTube 검색
 * 하이브리드 방식: DB 우선 검색 → YouTube API 백업 → 자동 DB 저장
 */

const axios = require('axios');
const PopularSong = require('../models/PopularSong');

class SongRequestService {
    constructor(youtubeApiKey) {
        this.youtubeApiKey = youtubeApiKey || process.env.YOUTUBE_API_KEY;
        this.songQueue = new Map(); // userId -> 신청곡 배열
        this.settings = new Map(); // userId -> { isAccepting, cooldownMinutes }
        this.lastRequestTime = new Map(); // `${userId}:${uniqueId}` -> timestamp
    }

    getSettings(userId) {
        return this.settings.get(userId) || { isAccepting: true, cooldownMinutes: 0, minFollowRole: 0 };
    }

    setSettings(userId, settings) {
        const current = this.getSettings(userId);
        this.settings.set(userId, { ...current, ...settings });
    }

    getLastRequestTime(userId, uniqueId) {
        return this.lastRequestTime.get(`${userId}:${uniqueId}`) || 0;
    }

    setLastRequestTime(userId, uniqueId, timestamp) {
        this.lastRequestTime.set(`${userId}:${uniqueId}`, timestamp);
    }

    /**
     * 채팅 메시지에서 신청곡 파싱
     * @param {string} message - 채팅 메시지
     * @returns {object|null} - { title, artist } 또는 null
     */
    parseSongRequest(message) {
        // # 기호가 2개 이상 있어야 신청곡으로 인식
        const hashCount = (message.match(/#/g) || []).length;
        if (hashCount < 2) return null;

        // 모든 # 위치 찾기
        const parts = [];
        const regex = /#([^#]+)/g;
        let m;
        while ((m = regex.exec(message)) !== null) {
            const val = m[1].trim();
            if (val) parts.push(val);
        }

        if (parts.length >= 2) {
            // 가수명 뒤에 붙는 불필요한 텍스트 제거 (예: "박종훈 해주세요" → "박종훈")
            // 한글 조사/부탁말이 붙은 경우 첫 번째 단어만 사용
            let artist = parts[1];
            const artistWords = artist.split(/\s+/);
            const koreanSuffixes = ['해주세요', '신청해요', '틀어주세요', '부탁해요', '부탁드려요', '해주세용', '틀어줘요', '플리즈', '제발'];
            if (artistWords.length > 1 && koreanSuffixes.some(s => artist.includes(s))) {
                artist = artistWords[0];
            }
            return {
                title: parts[0],
                artist: artist
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
                
                // 신청 횟수 증가 (실패해도 검색 결과는 반환)
                try {
                    await dbSong.incrementRequestCount();
                } catch (countError) {
                    console.warn('⚠️ 신청 횟수 증가 실패 (무시):', countError.message);
                }
                
                return {
                    videoId: dbSong.videoId,
                    url: `https://www.youtube.com/watch?v=${dbSong.videoId}`,
                    thumbnail: dbSong.thumbnail,
                    title: dbSong.title,
                    artist: dbSong.artist,
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
        const url = 'https://www.googleapis.com/youtube/v3/search';
        const query = artist ? `${title} ${artist}` : title;

        const trySearch = async (apiKey, keyLabel) => {
            if (!apiKey) return null;
            console.log(`🔍 YouTube 검색 [${keyLabel}]:`, query);
            const response = await axios.get(url, {
                params: {
                    key: apiKey,
                    q: query,
                    part: 'snippet',
                    type: 'video',
                    maxResults: 5,
                    videoCategoryId: '10'
                }
            });
            const items = response.data.items;
            if (items && items.length > 0) {
                const video = items[0];
                console.log(`✅ YouTube 검색 성공 [${keyLabel}]:`, video.id.videoId, '-', video.snippet.title);
                return {
                    videoId: video.id.videoId,
                    url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
                    thumbnail: video.snippet.thumbnails.high.url,
                    channelTitle: video.snippet.channelTitle,
                    title: video.snippet.title
                };
            }
            return null;
        };

        const serverKey = process.env.YOUTUBE_API_KEY;
        const isHostKey = this.youtubeApiKey && this.youtubeApiKey !== serverKey;

        try {
            if (!this.youtubeApiKey) {
                console.error('❌ YouTube API 키가 설정되지 않았습니다.');
                return null;
            }
            const result = await trySearch(this.youtubeApiKey, isHostKey ? '호스트 키' : '서버 키');
            if (result) return result;
            console.log('❌ YouTube 검색 결과 없음:', title, artist);
            return null;
        } catch (error) {
            const status = error.response?.status;
            const reason = error.response?.data?.error?.errors?.[0]?.reason;
            console.error(`❌ YouTube 검색 오류 [${isHostKey ? '호스트 키' : '서버 키'}]:`, status, reason || error.message);

            // 호스트 키 quota 초과(403 quotaExceeded/dailyLimitExceeded) → 공용 키로 fallback
            if (isHostKey && status === 403 && serverKey && serverKey !== this.youtubeApiKey) {
                console.log('⚠️ 호스트 키 한도 초과 → 서버 공용 키로 재시도');
                try {
                    const fallback = await trySearch(serverKey, '서버 공용 키(fallback)');
                    if (fallback) return fallback;
                    console.log('❌ 공용 키로도 검색 결과 없음');
                } catch (fallbackError) {
                    console.error('❌ 공용 키 fallback 오류:', fallbackError.response?.status, fallbackError.message);
                }
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

        // DB 캐시 우선 → 없으면 YouTube API (비용 최소화)
        const youtubeData = await this.searchSong(title, artist);

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
            requester: requester.uniqueId || requester.username,
            requesterNickname: requester.nickname || requester.username,
            requesterId: requester.uniqueId,
            isStreamer: requester.isStreamer || false,
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
     * 신청곡 큐 전체 삭제
     * @param {string} userId - 스트리머 ID
     */
    clearQueue(userId) {
        this.songQueue.set(userId, []);
        console.log(`🗑️ 신청곡 큐 전체 삭제: ${userId}`);
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
        if (!queue) return null;

        const index = queue.findIndex(s => s.id === songId);
        if (index === -1) return null;

        const [song] = queue.splice(index, 1);
        console.log(`✅ 신청곡 재생 완료 및 큐 제거: ${song.title} - ${song.artist}`);
        return song;
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
