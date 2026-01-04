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
            enableExtendedGiftInfo: true
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
            const chatData = {
                userId: this.userId,
                username: data.uniqueId || data.nickname,
                uniqueId: data.uniqueId,
                message: data.comment,
                badges: data.badges || [],
                timestamp: Date.now()
            };
            
            this.stats.messages++;
            
            console.log(`💬 [${chatData.username}]: ${chatData.message}`);
            
            // 즉시 UI 업데이트 (최우선)
            this.emit('chat', chatData);
            this.emit('stats', this.stats);
            
            // TTS로 읽기 (비동기) - 대화 내용만
            this.tts.speak(chatData.message);
            
            // 서버 전송 (비동기, 백그라운드)
            this.sendToServer('/api/live/chat', chatData);
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
            this.emit('stats', this.stats);
            
            // 서버 전송 (비동기, 백그라운드)
            this.sendToServer('/api/live/gift', giftData);
        });
        
        // 좋아요
        this.client.on('like', (data) => {
            this.stats.likes += data.likeCount || 1;
            
            console.log(`❤️ 좋아요 +${data.likeCount || 1}`);
            
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
