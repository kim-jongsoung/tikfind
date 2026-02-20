/**
 * TikFind Desktop Collector - TikTok Live Data Collector
 */

const { WebcastPushConnection } = require('tiktok-live-connector');
const { EventEmitter } = require('events');
const TTSService = require('./tts');

class TikTokCollector extends EventEmitter {
    constructor(username, userId, serverUrl) {
        super();
        this.username = username;
        this.userId = userId;
        this.serverUrl = serverUrl || 'http://localhost:3001';
        this.client = new WebcastPushConnection(username, {
            enableExtendedGiftInfo: true,
            // TikTok 차단 우회 설정
            processInitialData: false,
            fetchRoomInfoOnConnect: true,
            requestOptions: {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0'
                }
            }
        });
        this.isRunning = false;
        this.stats = {
            viewers: 0,
            messages: 0,
            gifts: 0,
            likes: 0
        };
        this.tts = new TTSService();
        
        this.setupListeners();
    }
    
    updateTTSSettings(settings) {
        this.tts.updateSettings(settings);
    }
    
    async sendToServer(endpoint, data) {
        try {
            const response = await fetch(`${this.serverUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                console.error('서버 전송 실패:', response.status);
            }
        } catch (error) {
            console.error('서버 전송 오류:', error);
        }
    }
    
    setupListeners() {
        // 연결 성공
        this.client.on('connected', () => {
            console.log('✅ TikTok Live 연결 성공');
            this.isRunning = true;
            this.emit('connected');
            this.broadcastStatus(true);
        });
        
        // 연결 종료
        this.client.on('disconnected', () => {
            console.log('❌ TikTok Live 연결 종료');
            this.isRunning = false;
            this.emit('disconnected');
            this.broadcastStatus(false);
        });
        
        // 채팅 메시지
        this.client.on('chat', (data) => {
            // 첫 채팅 수신 시 연결된 것으로 간주
            if (!this.isRunning) {
                console.log('✅ TikTok Live 연결 성공 (첫 채팅 수신)');
                this.isRunning = true;
                this.emit('connected');
                this.broadcastStatus(true);
            }
            
            // 원본 데이터 필드 확인 (개발용)
            console.log('📦 TikTok 채팅 원본 데이터 키:', Object.keys(data));
            console.log('📦 badges:', JSON.stringify(data.badges));
            console.log('📦 userBadges:', JSON.stringify(data.userBadges));
            console.log('📦 teamMemberLevel:', data.teamMemberLevel);
            console.log('📦 userDetails:', JSON.stringify(data.userDetails));
            console.log('📦 followRole:', data.followRole);
            console.log('📦 isModerator:', data.isModerator);
            console.log('📦 isSubscriber:', data.isSubscriber);
            console.log('📦 topGifterRank:', data.topGifterRank);
            
            const chatData = {
                userId: this.userId,
                username: data.uniqueId || data.nickname,
                nickname: data.nickname || data.uniqueId,
                uniqueId: data.uniqueId,
                message: data.comment,
                badges: data.badges || [],
                userBadges: data.userBadges || [],
                followRole: data.followRole || 0,
                isModerator: data.isModerator || false,
                isSubscriber: data.isSubscriber || false,
                topGifterRank: data.topGifterRank || null,
                teamMemberLevel: data.teamMemberLevel || null,
                userDetails: data.userDetails || null,
                timestamp: Date.now()
            };
            
            this.stats.messages++;
            
            console.log(`💬 [${chatData.username}]: ${chatData.message}`);
            console.log(`📤 채팅 데이터 전송 준비:`, chatData.username);
            
            // 즉시 UI 업데이트 (최우선)
            this.emit('chat', chatData);
            this.emit('stats', this.stats);
            
            // TTS는 서버에서 tts-speak 이벤트로 처리 (중복 방지)
        });
        
        // 시청자 수
        this.client.on('roomUser', (data) => {
            this.stats.viewers = data.viewerCount || 0;
            
            console.log(`👥 시청자: ${this.stats.viewers}`);
            
            // 즉시 UI 업데이트
            this.emit('stats', this.stats);
            
            // 서버 전송 (비동기, 백그라운드)
            this.sendToServer('/api/live/viewers', {
                userId: this.userId,
                viewerCount: this.stats.viewers
            });
        });
        
        // 선물
        this.client.on('gift', (data) => {
            const giftData = {
                userId: this.userId,
                username: data.uniqueId || data.nickname,
                giftName: data.giftName || 'Unknown',
                count: data.repeatCount || 1,
                timestamp: Date.now()
            };
            
            this.stats.gifts += giftData.count;
            
            console.log(`🎁 선물: ${giftData.giftName} x${giftData.count} (from ${giftData.username})`);
            
            // 즉시 UI 업데이트
            this.emit('gift', giftData);
            this.emit('stats', this.stats);
            
            // 서버 전송 (비동기, 백그라운드)
            this.sendToServer('/api/live/gift', giftData);
        });
        
        // 좋아요
        this.client.on('like', (data) => {
            const likeData = {
                count: data.likeCount || 1,
                timestamp: Date.now()
            };
            
            this.stats.likes += likeData.count;
            
            console.log(`❤️ 좋아요 +${likeData.count}`);
            
            this.emit('like', likeData);
            this.emit('stats', this.stats);
        });
        
        // 에러
        this.client.on('error', (error) => {
            console.error('❌ TikTok Live 오류:', error);
            this.emit('error', error);
        });
    }
    
    async start() {
        try {
            console.log(`🚀 TikTok Live 연결 시도: @${this.username}`);
            await this.client.connect();
        } catch (error) {
            console.error('❌ 연결 실패:', error);
            throw error;
        }
    }
    
    stop() {
        if (this.client) {
            this.client.disconnect();
        }
        this.isRunning = false;
    }
    
    broadcastStatus(isLive) {
        this.sendToServer('/api/live/status', {
            userId: this.userId,
            username: this.username,
            isLive,
            timestamp: Date.now()
        });
    }
}

module.exports = TikTokCollector;
