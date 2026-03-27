/**
 * TikFind Desktop Collector - TikTok Live Data Collector
 */

const { WebcastPushConnection } = require('tiktok-live-connector');
const { EventEmitter } = require('events');
const TTSService = require('./tts');

class TikTokCollector extends EventEmitter {
    constructor(username, userId, serverUrl, sessionId, ttTargetIdc) {
        super();
        this.username = username;
        this.userId = userId;
        this.serverUrl = serverUrl || 'http://localhost:3001';
        const sid = (sessionId && sessionId.trim()) ? sessionId.trim() : null;
        const idc = (ttTargetIdc && ttTargetIdc.trim()) ? ttTargetIdc.trim() : null;
        this.sessionId = sid;
        this.client = new WebcastPushConnection(username, {
            enableExtendedGiftInfo: true,
            processInitialData: false,
            fetchRoomInfoOnConnect: true,
            disableEulerFallbacks: true,
            sessionId: sid,
            ttTargetIdc: idc,
            webClientParams: { appLanguage: 'ko-KR', devicePlatform: 'web' },
            webClientHeaders: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.tiktok.com/',
                'Origin': 'https://www.tiktok.com'
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
    
    // 공통 유저 정보 추출 헬퍼
    extractUser(data) {
        return {
            uniqueId: data.uniqueId || '',
            nickname: data.nickname || data.uniqueId || '',
            profilePictureUrl: data.profilePictureUrl || '',
            followRole: data.followRole || 0,
            followInfo: data.followInfo || null,
            userBadges: data.userBadges || [],
            userDetails: data.userDetails || null,
            isModerator: data.isModerator || false,
            isNewGifter: data.isNewGifter || false,
            isSubscriber: data.isSubscriber || false,
            topGifterRank: data.topGifterRank || null,
            gifterLevel: data.gifterLevel || 0,
            teamMemberLevel: data.teamMemberLevel || null,
            msgId: data.msgId || null,
            createTime: data.createTime || null
        };
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

        // 방송 종료 (호스트 종료 or 플랫폼 강제종료)
        this.client.on('streamEnd', (actionId) => {
            console.log(`🔴 방송 종료 (actionId: ${actionId})`);
            this.isRunning = false;
            this.emit('streamEnd', { actionId });
            this.broadcastStatus(false);
            // 서버에도 알림
            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'streamEnd',
                data: { actionId, timestamp: Date.now() }
            });
        });
        
        // 채팅 메시지
        this.client.on('chat', (data) => {
            if (!this.isRunning) {
                console.log('✅ TikTok Live 연결 성공 (첫 채팅 수신)');
                this.isRunning = true;
                this.emit('connected');
                this.broadcastStatus(true);
            }

            
            const chatData = {
                ...this.extractUser(data),
                username: data.uniqueId || data.nickname,
                message: data.comment,
                badges: data.badges || [],
                displayType: data.displayType || null,
                label: data.label || null,
                timestamp: Date.now()
            };
            
            this.stats.messages++;
            console.log(`💬 [${chatData.uniqueId}]: ${chatData.message}`);
            
            this.emit('chat', chatData);
            this.emit('stats', this.stats);
        });
        
        // 시청자 수 + 상위 선물 랭킹
        this.client.on('roomUser', (data) => {
            this.stats.viewers = data.viewerCount || 0;
            console.log(`👥 시청자: ${this.stats.viewers}`);
            this.emit('stats', this.stats);

            // 서버: 시청자 수 + topGifterList 포함
            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'stats',
                data: {
                    viewerCount: this.stats.viewers,
                    topGifterList: data.topGifterList || [],
                    timestamp: Date.now()
                }
            });
        });
        
        // 선물 (전체 필드)
        this.client.on('gift', (data) => {
            // 스트릭 중인 선물은 repeatEnd=true 일 때만 최종 처리
            const isFinal = data.giftType !== 1 || data.repeatEnd === true;

            const giftData = {
                ...this.extractUser(data),
                username: data.uniqueId || data.nickname,
                giftId: data.giftId || null,
                giftName: data.giftName || 'Unknown',
                giftPictureUrl: data.giftPictureUrl || '',
                giftType: data.giftType || 0,
                diamondCount: data.diamondCount || 0,
                repeatCount: data.repeatCount || 1,
                repeatEnd: data.repeatEnd || false,
                groupId: data.groupId || null,
                receiverUserId: data.receiverUserId || null,
                displayType: data.displayType || null,
                describe: data.describe || null,
                isFinal,
                timestamp: Date.now()
            };
            
            if (isFinal) this.stats.gifts += giftData.repeatCount;
            console.log(`🎁 선물: ${giftData.giftName} x${giftData.repeatCount} 💎${giftData.diamondCount} (from ${giftData.username}) final=${isFinal}`);
            
            this.emit('gift', giftData);
            this.emit('stats', this.stats);
        });
        
        // 좋아요 (전체 필드)
        this.client.on('like', (data) => {
            const likeData = {
                ...this.extractUser(data),
                username: data.uniqueId || data.nickname,
                likeCount: data.likeCount || 1,
                totalLikeCount: data.totalLikeCount || 0,
                displayType: data.displayType || null,
                label: data.label || null,
                timestamp: Date.now()
            };
            
            this.stats.likes += likeData.likeCount;
            console.log(`❤️ 좋아요 +${likeData.likeCount} (총 ${likeData.totalLikeCount}) by ${likeData.uniqueId}`);
            
            this.emit('like', likeData);
            this.emit('stats', this.stats);

            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'like',
                data: likeData
            });
        });

        // 입장 (시청자가 방에 들어올 때) - 국가 데이터 핵심
        this.client.on('member', (data) => {
            const memberData = {
                ...this.extractUser(data),
                username: data.uniqueId || data.nickname,
                actionId: data.actionId || null,
                displayType: data.displayType || null,
                label: data.label || null,
                timestamp: Date.now()
            };

            this.stats.viewers = Math.max(this.stats.viewers, 1);
            console.log(`👋 입장: ${memberData.uniqueId} (팔로워: ${memberData.followInfo?.followerCount || 0})`);

            this.emit('member', memberData);

            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'member',
                data: memberData
            });
        });

        // 팔로우 / 공유 (social 이벤트)
        this.client.on('social', (data) => {
            const isFollow = (data.displayType || '').includes('follow');
            const isShare = (data.displayType || '').includes('share');

            const socialData = {
                ...this.extractUser(data),
                username: data.uniqueId || data.nickname,
                displayType: data.displayType || null,
                label: data.label || null,
                isFollow,
                isShare,
                timestamp: Date.now()
            };

            if (isFollow) {
                this.stats.follows = (this.stats.follows || 0) + 1;
                console.log(`➕ 팔로우: ${socialData.uniqueId}`);
            } else if (isShare) {
                this.stats.shares = (this.stats.shares || 0) + 1;
                console.log(`🔗 공유: ${socialData.uniqueId}`);
            }

            this.emit('social', socialData);

            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'social',
                data: socialData
            });
        });

        // 구독 (멤버십)
        this.client.on('subscribe', (data) => {
            const subscribeData = {
                ...this.extractUser(data),
                username: data.uniqueId || data.nickname,
                subMonth: data.subMonth || 1,
                oldSubscribeStatus: data.oldSubscribeStatus || null,
                subscribingStatus: data.subscribingStatus || null,
                displayType: data.displayType || null,
                label: data.label || null,
                timestamp: Date.now()
            };

            this.stats.subscribes = (this.stats.subscribes || 0) + 1;
            console.log(`⭐ 구독: ${subscribeData.uniqueId} (${subscribeData.subMonth}개월)`);

            this.emit('subscribe', subscribeData);

            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'subscribe',
                data: subscribeData
            });
        });

        // 질문 기능
        this.client.on('questionNew', (data) => {
            const questionData = {
                ...this.extractUser(data),
                username: data.uniqueId || data.nickname,
                questionText: data.questionText || '',
                timestamp: Date.now()
            };

            console.log(`❓ 질문: [${questionData.uniqueId}] ${questionData.questionText}`);
            this.emit('questionNew', questionData);

            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'questionNew',
                data: questionData
            });
        });

        // 이모티콘 (구독자 전용 스티커)
        this.client.on('emote', (data) => {
            const emoteData = {
                ...this.extractUser(data),
                username: data.uniqueId || data.nickname,
                emoteId: data.emoteId || null,
                emoteImageUrl: data.emoteImageUrl || null,
                timestamp: Date.now()
            };

            console.log(`😀 이모티콘: ${emoteData.uniqueId} → ${emoteData.emoteId}`);
            this.emit('emote', emoteData);

            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'emote',
                data: emoteData
            });
        });

        // 보물상자 (envelope)
        this.client.on('envelope', (data) => {
            const envelopeData = {
                ...this.extractUser(data),
                username: data.uniqueId || data.nickname,
                coins: data.coins || 0,
                canOpen: data.canOpen || 0,
                timestamp: data.timestamp || Date.now()
            };

            console.log(`🎀 보물상자: ${envelopeData.uniqueId} (코인: ${envelopeData.coins})`);
            this.emit('envelope', envelopeData);

            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'envelope',
                data: envelopeData
            });
        });

        // 라이브 인트로
        this.client.on('liveIntro', (data) => {
            const introData = {
                ...this.extractUser(data),
                id: data.id || null,
                description: data.description || '',
                timestamp: Date.now()
            };

            console.log(`📢 라이브 인트로: ${introData.description}`);
            this.emit('liveIntro', introData);

            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'liveIntro',
                data: introData
            });
        });
        
        // 매치 시작 (linkMicBattle)
        this.client.on('linkMicBattle', (data) => {
            const battleData = {
                battleId: data.battleId || null,
                participants: (data.battleUsers || []).map(u => ({
                    uniqueId: u.uniqueId || '',
                    nickname: u.nickname || '',
                    profilePictureUrl: u.profilePictureUrl || ''
                })),
                timestamp: Date.now()
            };
            console.log(`⚔️ 매치 시작: battleId=${battleData.battleId} | 참가자: ${battleData.participants.map(p => p.uniqueId).join(' VS ')}`);
            this.emit('matchStart', battleData);
            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'matchStart',
                data: battleData
            });
        });

        // 매치 점수 업데이트 (linkMicArmies)
        this.client.on('linkMicArmies', (data) => {
            const battleStatus = data.battleStatus || 1; // 1=진행중, 2=종료
            const armies = (data.battleArmies || []).map(army => ({
                hostUserId: army.hostUserId || '',
                points: army.points || 0,
                participants: (army.participants || []).map(p => ({
                    uniqueId: p.uniqueId || '',
                    nickname: p.nickname || ''
                }))
            }));
            const armiesData = {
                battleId: data.battleId || null,
                battleStatus,
                armies,
                timestamp: Date.now()
            };
            console.log(`📊 매치 점수(status=${battleStatus}): ${armies.map(a => `${a.hostUserId}:${a.points}`).join(' vs ')}`);
            this.emit('matchScore', armiesData);
            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'matchScore',
                data: armiesData
            });
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
