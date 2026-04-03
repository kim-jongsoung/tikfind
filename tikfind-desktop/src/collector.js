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
            const rawStr = JSON.stringify(data);
            console.log(`⚔️ [RAW linkMicBattle FULL]:`, rawStr.slice(0, 2000));
            const users = data.battleUsers || [];
            // 화면 좌측(짝수인덱스)=팀A, 우측(홀수인덱스)=팀B
            // 1:1이면 [0]=팀A, [1]=팀B / 2:2이면 [0][1]=팀A, [2][3]=팀B
            const teamSize = users.length <= 2 ? 1 : 2;
            const participants = users.map((u, i) => {
                // uniqueId가 없을 경우 여러 필드명 시도
                const uid = u.uniqueId || u.unique_id || u.tiktokId || u.username
                    || u.user?.uniqueId || u.user?.unique_id || '';
                const uid2 = String(u.userId || u.userIdStr || u.user_id || u.user?.userId || '');
                console.log(`⚔️ [battleUser ${i}] uniqueId="${uid}" userId="${uid2}" keys=${Object.keys(u).join(',')}`);
                return {
                    uniqueId: uid,
                    userId: uid2,
                    nickname: u.nickname || u.user?.nickname || '',
                    profilePictureUrl: u.profilePictureUrl || u.user?.profilePictureUrl || '',
                    teamId: i < teamSize ? 'A' : 'B'
                };
            });
            const battleData = {
                battleId: data.battleId || null,
                participants,
                teamSize,
                timestamp: Date.now()
            };
            console.log(`⚔️ 매치 시작: 팀A: ${participants.filter(p=>p.teamId==='A').map(p=>p.uniqueId||p.userId).join('+')} vs 팀B: ${participants.filter(p=>p.teamId==='B').map(p=>p.uniqueId||p.userId).join('+')}`);
            this.emit('matchStart', battleData);
            this.sendToServer('/api/live/tiktok-data', {
                userId: this.userId,
                type: 'matchStart',
                data: battleData
            });
        });

        // 매치 점수 업데이트 (linkMicArmies)
        this.client.on('linkMicArmies', (data) => {
            // battleStatus: 2=종료, 그 외(1,4 등)=진행 중
            const battleStatus = data.battleStatus === 2 ? 2 : 1;

            // 실제 구조: data.teamArmies[].teamId / teamTotalScore / teamUsers[].userId,score
            let teamAPoints = 0;
            let teamBPoints = 0;
            const armies = [];

            const teamArmies = data.teamArmies || [];
            teamArmies.forEach((team, i) => {
                const teamLabel = i === 0 ? 'A' : 'B';
                const totalScore = parseInt(team.teamTotalScore || team.teamScore || 0, 10);
                if (teamLabel === 'A') teamAPoints = totalScore;
                else teamBPoints = totalScore;

                (team.teamUsers || []).forEach(u => {
                    armies.push({
                        hostUserId: String(u.userId || u.userIdStr || ''),
                        uniqueId: u.uniqueId || '',
                        points: parseInt(u.score || 0, 10),
                        teamId: teamLabel
                    });
                });
            });

            const armiesData = {
                battleId: data.battleId || null,
                battleStatus,
                armies,
                teamAPoints,
                teamBPoints,
                timestamp: Date.now()
            };
            console.log(`📊 매치 점수(status=${data.battleStatus}, ${armies.length}명): 팀A=${teamAPoints} vs 팀B=${teamBPoints}`);
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
