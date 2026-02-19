const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const io = require('socket.io-client');
const TikTokCollector = require('./src/collector');
const log = require('electron-log');

let tray = null;
let socket = null;
let collector = null;
let userConfig = null;

// 로그 설정
log.transports.file.level = 'info';

// User 설정 파일 로드
function loadUserConfig() {
    try {
        const configPath = path.join(__dirname, 'user-config.json');
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            userConfig = JSON.parse(configData);
            log.info('✅ User 설정 로드 완료:', userConfig.userId);
            return userConfig;
        } else {
            log.warn('⚠️ user-config.json 파일이 없습니다.');
            return null;
        }
    } catch (error) {
        log.error('❌ User 설정 로드 오류:', error);
        return null;
    }
}

// User 설정 파일 저장
function saveUserConfig(config) {
    try {
        const configPath = path.join(__dirname, 'user-config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        log.info('✅ User 설정 저장 완료:', config.userId);
        return true;
    } catch (error) {
        log.error('❌ User 설정 저장 오류:', error);
        return false;
    }
}

// 트레이용 아이콘 생성 - 보라색 배경 + 흰색 "Tik" 픽셀 패턴 (외부 모듈 불필요)
function createTrayIcon() {
    const W = 16, H = 16;
    // RGBA 버퍼: 보라색 배경 (#7c3aed)
    const buf = Buffer.alloc(W * H * 4);
    const bg = [124, 58, 237, 255]; // 보라색
    const fg = [255, 255, 255, 255]; // 흰색

    // 배경 채우기
    for (let i = 0; i < W * H; i++) {
        buf[i * 4]     = bg[0];
        buf[i * 4 + 1] = bg[1];
        buf[i * 4 + 2] = bg[2];
        buf[i * 4 + 3] = bg[3];
    }

    // 픽셀 찍기 헬퍼
    function px(x, y) {
        if (x < 0 || x >= W || y < 0 || y >= H) return;
        const i = (y * W + x) * 4;
        buf[i] = fg[0]; buf[i+1] = fg[1]; buf[i+2] = fg[2]; buf[i+3] = fg[3];
    }

    // "T" (x:1~5, y:3~11)
    for (let x = 1; x <= 5; x++) px(x, 3); // 가로획
    px(3, 4); px(3, 5); px(3, 6); px(3, 7); px(3, 8); px(3, 9); px(3, 10); px(3, 11);

    // "i" (x:7, y:3~11)
    px(7, 3); // 점
    px(7, 5); px(7, 6); px(7, 7); px(7, 8); px(7, 9); px(7, 10); px(7, 11);

    // "k" (x:9~13, y:3~11)
    px(9, 3); px(9, 4); px(9, 5); px(9, 6); px(9, 7); px(9, 8); px(9, 9); px(9, 10); px(9, 11);
    px(10, 7); px(11, 6); px(12, 5); px(13, 4); px(13, 3); // 위 대각
    px(10, 8); px(11, 9); px(12, 10); px(13, 11);           // 아래 대각

    return nativeImage.createFromBuffer(buf, { width: W, height: H });
}

// 시스템 트레이 생성
function createTray() {
    const trayIcon = createTrayIcon();
    tray = new Tray(trayIcon);
    updateTrayMenu('대기 중');
    tray.setToolTip('TikFind Desktop App');
    log.info('✅ 시스템 트레이 생성 완료');
}

// 트레이 메뉴 업데이트
function updateTrayMenu(status, tiktokId = '') {
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: `상태: ${status}`, 
            enabled: false 
        },
        { 
            label: tiktokId ? `TikTok: ${tiktokId}` : 'TikTok: 미연결', 
            enabled: false 
        },
        { type: 'separator' },
        { 
            label: '서버 연결 상태', 
            enabled: false 
        },
        { 
            label: socket && socket.connected ? '✅ 연결됨' : '❌ 연결 끊김', 
            enabled: false 
        },
        { type: 'separator' },
        { 
            label: '종료', 
            click: () => {
                app.quit();
            }
        }
    ]);
    
    tray.setContextMenu(contextMenu);
}

// 서버 연결
function connectToServer() {
    if (!userConfig) {
        log.warn('⚠️ User 설정이 없습니다. 서버 연결 불가.');
        return;
    }
    
    const serverUrl = userConfig.serverUrl || process.env.SERVER_URL || 'https://tikfind.kr';
    
    log.info('🔌 서버 연결 시도:', serverUrl);
    
    socket = io(serverUrl, {
        auth: {
            userId: userConfig.userId,
            type: 'desktop-app'
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity
    });
    
    socket.on('connect', () => {
        log.info('✅ 서버 연결 성공');
        updateTrayMenu('대기 중');
        
        // 룸 참가
        log.info('👤 사용자 룸 참가 요청:', userConfig.userId);
        socket.emit('join-room', userConfig.userId);
        
        // 라이브 중이면 live-status 재전송
        if (collector && collector.isRunning) {
            log.info('📤 재연결 후 live-status 전송:', userConfig.userId);
            socket.emit('live-status', { 
                userId: userConfig.userId,
                isLive: true, 
                tiktokId: collector.username 
            });
        }
    });
    
    socket.on('disconnect', () => {
        log.warn('❌ 서버 연결 끊김');
        updateTrayMenu('연결 끊김');
    });
    
    socket.on('reconnect', (attemptNumber) => {
        log.info(`✅ 서버 재연결 성공 (시도: ${attemptNumber})`);
        updateTrayMenu('대기 중');
    });
    
    // 라이브 시작 명령
    socket.on('start-live', async (data) => {
        log.info('🎥 라이브 시작 명령 수신:', data);
        await startLive(data.tiktokId);
    });
    
    // 라이브 종료 명령
    socket.on('stop-live', () => {
        log.info('⏹️ 라이브 종료 명령 수신');
        stopLive();
    });
    
    // TTS 설정 업데이트
    socket.on('tts-settings', (settings) => {
        log.info('🔊 TTS 설정 업데이트:', settings);
        if (collector) {
            collector.updateTTSSettings(settings);
        }
    });
    
    // 라이브 상태 조회
    socket.on('get-live-status', () => {
        log.info('🔍 라이브 상태 조회 요청');
        const isLive = collector !== null;
        const tiktokId = userConfig.tiktokId;
        
        socket.emit('live-status', {
            userId: userConfig.userId,
            isLive,
            tiktokId
        });
        
        log.info(`📤 라이브 상태 전송: ${isLive}`);
    });
    
    socket.on('error', (error) => {
        log.error('❌ Socket.io 오류:', error);
    });
}

// 라이브 시작
async function startLive(tiktokId) {
    try {
        if (collector) {
            log.warn('⚠️ 이미 라이브 연결 중입니다.');
            return;
        }
        
        log.info('📡 TikTok Live 연결 시작:', tiktokId);
        updateTrayMenu('연결 중...', tiktokId);
        
        const serverUrl = userConfig.serverUrl || process.env.SERVER_URL || 'https://tikfind.kr';
        collector = new TikTokCollector(tiktokId, userConfig.userId, serverUrl);
        
        collector.on('connected', () => {
            log.info('✅ TikTok Live 연결 성공');
            updateTrayMenu('방송 중', tiktokId);
            
            log.info('📤 live-status 전송 시도:', userConfig.userId);
            if (socket && socket.connected) {
                socket.emit('live-status', { 
                    userId: userConfig.userId,
                    isLive: true, 
                    tiktokId 
                });
                log.info('✅ live-status 전송 완료');
            } else {
                log.error('❌ Socket 연결 없음 - live-status 전송 실패');
            }
        });
        
        collector.on('disconnected', () => {
            log.info('❌ TikTok Live 연결 종료');
            updateTrayMenu('대기 중');
            
            if (socket) {
                socket.emit('live-status', { 
                    userId: userConfig.userId,
                    isLive: false 
                });
            }
            
            collector = null;
        });
        
        collector.on('chat', (chatData) => {
            log.info('📤 채팅 데이터 서버 전송:', chatData.username);
            if (socket) {
                socket.emit('tiktok-data', {
                    userId: userConfig.userId,
                    type: 'chat',
                    data: chatData
                });
                log.info('✅ 채팅 데이터 전송 완료');
            } else {
                log.error('❌ Socket 연결 없음');
            }
        });
        
        collector.on('stats', (stats) => {
            if (socket) {
                socket.emit('tiktok-data', {
                    userId: userConfig.userId,
                    type: 'stats',
                    data: stats
                });
            }
        });
        
        collector.on('gift', (giftData) => {
            if (socket) {
                socket.emit('tiktok-data', {
                    userId: userConfig.userId,
                    type: 'gift',
                    data: giftData
                });
            }
        });
        
        collector.on('like', (likeData) => {
            if (socket) {
                socket.emit('tiktok-data', {
                    userId: userConfig.userId,
                    type: 'like',
                    data: likeData
                });
            }
        });
        
        collector.on('error', (error) => {
            log.error('❌ TikTok Collector 오류:', error);
            updateTrayMenu('오류 발생', tiktokId);
        });
        
        await collector.start();
        
    } catch (error) {
        log.error('❌ 라이브 시작 실패:', error);
        updateTrayMenu('연결 실패');
        collector = null;
    }
}

// 라이브 종료
function stopLive() {
    if (collector) {
        collector.stop();
        collector = null;
        updateTrayMenu('대기 중');
        log.info('⏹️ 라이브 종료 완료');
    }
}

// Windows 시작 프로그램 등록
function setAutoLaunch() {
    app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        args: ['--hidden']
    });
    log.info('✅ Windows 시작 프로그램 등록 완료');
}

// 앱 시작
app.whenReady().then(() => {
    log.info('🚀 TikFind Desktop App (Background Service) 시작');
    
    // User 설정 로드
    userConfig = loadUserConfig();
    
    // 시스템 트레이 생성
    createTray();
    
    // Windows 시작 프로그램 등록
    setAutoLaunch();
    
    // 서버 연결
    if (userConfig) {
        connectToServer();
    } else {
        log.warn('⚠️ User 설정이 없습니다. 웹에서 설정을 완료해주세요.');
        updateTrayMenu('설정 필요');
    }
    
});

// 앱 종료 방지 (백그라운드 서비스)
app.on('window-all-closed', (e) => {
    e.preventDefault();
});

// 앱 종료 시
app.on('before-quit', () => {
    log.info('👋 TikFind Desktop App 종료');
    
    // 라이브 종료
    if (collector) {
        collector.stop();
    }
    
    // 서버 연결 종료
    if (socket) {
        socket.disconnect();
    }
});

// Custom URL Protocol 핸들러 (tikfind://)
app.setAsDefaultProtocolClient('tikfind');

app.on('open-url', (event, url) => {
    event.preventDefault();
    log.info('🔗 Custom URL 수신:', url);
    
    // tikfind://start?userId=xxx&tiktokId=yyy&serverUrl=zzz
    const urlObj = new URL(url);
    
    if (urlObj.hostname === 'start') {
        const userId = urlObj.searchParams.get('userId');
        const tiktokId = urlObj.searchParams.get('tiktokId');
        const serverUrl = urlObj.searchParams.get('serverUrl');
        
        if (userId && tiktokId) {
            // User 설정 저장
            userConfig = { userId, tiktokId };
            saveUserConfig(userConfig);
            
            // 서버 URL 설정
            if (serverUrl) {
                process.env.SERVER_URL = serverUrl;
            }
            
            // 서버 연결 (아직 연결 안 되어 있으면)
            if (!socket || !socket.connected) {
                connectToServer();
            }
            
            // 라이브 시작
            setTimeout(() => {
                startLive(tiktokId);
            }, 1000);
        }
    }
});
