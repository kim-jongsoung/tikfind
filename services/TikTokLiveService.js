const { WebcastPushConnection } = require('tiktok-live-connector');
const AIService = require('./AIService');

class TikTokLiveService {
    constructor(username, userId, io) {
        this.username = username;
        this.userId = userId;
        this.io = io;
        this.connection = null;
        this.aiService = new AIService();
        
        // 상태
        this.isLive = false;
        this.viewerCount = 0;
        this.songQueue = [];
        
        // 통계
        this.stats = {
            totalMessages: 0,
            songRequests: 0,
            aiResponses: 0
        };
    }

    /**
     * TikTok Live 연결 시작
     */
    async connect() {
        try {
            this.connection = new WebcastPushConnection(this.username, {
                enableExtendedGiftInfo: true,
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                },
                sessionId: undefined // 세션 ID 자동 생성
            });

            // 연결 성공
            this.connection.on('connected', () => {
                console.log(`✅ TikTok Live 연결 성공: @${this.username}`);
                this.isLive = true;
                this.emitStatus();
            });

            // 시청자 수 업데이트
            this.connection.on('roomUser', (data) => {
                this.viewerCount = data.viewerCount || 0;
                this.emitStatus();
            });

            // 채팅 메시지 수신
            this.connection.on('chat', async (data) => {
                await this.handleChatMessage(data);
            });

            // 연결 종료
            this.connection.on('disconnected', () => {
                console.log(`❌ TikTok Live 연결 종료: @${this.username}`);
                this.isLive = false;
                this.emitStatus();
            });

            // 에러 처리
            this.connection.on('error', (err) => {
                console.error('TikTok Live 에러:', err);
            });

            // 연결 시작
            await this.connection.connect();
            
        } catch (error) {
            console.error('TikTok Live 연결 실패:', error);
            throw error;
        }
    }

    /**
     * 채팅 메시지 처리
     */
    async handleChatMessage(data) {
        this.stats.totalMessages++;
        
        const message = data.comment;
        const username = data.uniqueId;
        const userId = data.userId;

        console.log(`💬 [${username}]: ${message}`);

        // 1. 신청곡 파싱 (정규식 먼저 시도)
        const song = await this.parseSongRequest(message);
        if (song) {
            await this.addToQueue(song, username);
        }

        // 2. AI 자동응답 (비동기)
        this.generateAIResponse(message, username).catch(err => {
            console.error('AI 응답 실패:', err);
        });

        // 3. 클라이언트에 메시지 전송
        this.io.to(this.userId).emit('chat-message', {
            username,
            message,
            timestamp: Date.now()
        });
    }

    /**
     * 신청곡 파싱 (정규식 + AI)
     */
    async parseSongRequest(message) {
        // 정규식으로 먼저 시도 (빠름)
        const patterns = [
            /신청곡[:：\s]+(.+)/i,
            /노래[:：\s]+(.+)/i,
            /song[:：\s]+(.+)/i,
            /play[:：\s]+(.+)/i
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                const songInfo = match[1].trim();
                return this.parseSongInfo(songInfo);
            }
        }

        // AI로 파싱 시도 (느림)
        return await this.aiService.parseSongRequest(message);
    }

    /**
     * 신청곡 정보 파싱
     */
    parseSongInfo(songInfo) {
        // "아이유 - 좋은날" 형식
        const parts = songInfo.split(/[-–—]/);
        if (parts.length >= 2) {
            return {
                artist: parts[0].trim(),
                title: parts[1].trim()
            };
        }
        
        // 제목만 있는 경우
        return {
            artist: '',
            title: songInfo.trim()
        };
    }

    /**
     * 신청곡 큐에 추가
     */
    async addToQueue(song, requester) {
        this.stats.songRequests++;
        
        const queueItem = {
            id: Date.now(),
            song,
            requester,
            timestamp: Date.now(),
            status: 'pending'
        };

        this.songQueue.push(queueItem);

        console.log(`🎵 신청곡 추가: ${song.artist} - ${song.title} (by ${requester})`);

        // 클라이언트에 큐 업데이트 전송
        this.io.to(this.userId).emit('queue-update', {
            queue: this.songQueue,
            stats: this.stats
        });

        // DB 저장 (선택사항)
        // await SongRequest.create({ userId: this.userId, ...queueItem });
    }

    /**
     * AI 자동응답 생성
     */
    async generateAIResponse(message, username) {
        try {
            // 언어 감지
            const language = await this.aiService.detectLanguage(message);
            
            // AI 응답 생성
            const response = await this.aiService.generateResponse(message, language);
            
            if (response) {
                this.stats.aiResponses++;
                
                console.log(`🤖 AI 응답 [${language}]: ${response}`);

                // 클라이언트에 AI 응답 전송
                this.io.to(this.userId).emit('ai-response', {
                    username,
                    originalMessage: message,
                    response,
                    language,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('AI 응답 생성 실패:', error);
        }
    }

    /**
     * 상태 전송
     */
    emitStatus() {
        this.io.to(this.userId).emit('live-status', {
            isLive: this.isLive,
            viewerCount: this.viewerCount,
            username: this.username,
            stats: this.stats
        });
    }

    /**
     * 연결 종료
     */
    disconnect() {
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
        }
    }

    /**
     * 신청곡 제거
     */
    removeSong(songId) {
        this.songQueue = this.songQueue.filter(item => item.id !== songId);
        this.io.to(this.userId).emit('queue-update', {
            queue: this.songQueue,
            stats: this.stats
        });
    }

    /**
     * 신청곡 재생 완료
     */
    completeSong(songId) {
        const song = this.songQueue.find(item => item.id === songId);
        if (song) {
            song.status = 'completed';
            this.removeSong(songId);
        }
    }
}

module.exports = TikTokLiveService;
