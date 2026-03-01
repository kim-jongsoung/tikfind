const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const io = require('socket.io-client');
const TikTokCollector = require('./src/collector');
const TTSService = require('./src/tts');
const log = require('electron-log');

let tray = null;
let socket = null;
let collector = null;
let userConfig = null;
const standaloneTTS = new TTSService(); // collector 없을 때 사용

// Windows에서 tikfind:// 프로토콜 수신을 위해 single instance lock 필요
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
}

// 로그 설정
log.transports.file.level = 'info';

// User 설정 파일 로드
function loadUserConfig() {
    try {
        const configPath = path.join(app.getPath('userData'), 'user-config.json');
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
        const configPath = path.join(app.getPath('userData'), 'user-config.json');
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
        log.info('🎥 라이브 시작 명령 수신:', data.tiktokId);
        // standaloneTTS에도 Google TTS 설정 전달
        if (data.googleTTS) {
            standaloneTTS.updateGoogleTTSSettings(data.googleTTS);
            log.info(`🔊 standaloneTTS Google TTS: ${data.googleTTS.enabled ? '활성화' : '비활성화'} | apiKey=${data.googleTTS.apiKey ? '있음' : '없음'}`);
        }
        await startLive(data.tiktokId, data.googleTTS);
    });
    
    // 라이브 종료 명령
    socket.on('stop-live', () => {
        log.info('⏹️ 라이브 종료 명령 수신');
        stopLive();
    });

    // TTS 즉시 중지 명령 (방송 중지 시)
    socket.on('tts-stop', () => {
        log.info('⛔ tts-stop 수신 - TTS 강제 중지');
        const ttsInstance = collector ? collector.tts : standaloneTTS;
        ttsInstance.stop();
    });
    
    // 서버 → Desktop App: TTS 실행 명령
    socket.on('tts-speak', (data) => {
        if (!data.text) return;
        log.info(`🔊 tts-speak 수신: "${data.text}" | @${data.uniqueId} | volume=${data.volume}`);
        const ttsInstance = collector ? collector.tts : standaloneTTS;
        // 볼륨 실시간 적용
        if (data.volume !== undefined) {
            ttsInstance.volume = Math.min(Math.max(parseInt(data.volume) || 80, 0), 100);
        }
        // 매번 최신 Google TTS 설정 적용
        if (data.googleTTS) {
            ttsInstance.updateGoogleTTSSettings(data.googleTTS);
            log.info(`🔊 Google TTS 설정 갱신: enabled=${data.googleTTS.enabled} | apiKey=${data.googleTTS.apiKey ? '있음' : '없음'}`);
        }
        ttsInstance.speak(data.text, data.uniqueId, data.userGenders || {});
    });

    // TTS 설정 업데이트 (방송 중 실시간 반영)
    socket.on('tts-settings', (settings) => {
        log.info('🔊 TTS 설정 업데이트');
        // standaloneTTS에도 항상 반영
        if (settings.googleTTS) {
            standaloneTTS.updateGoogleTTSSettings(settings.googleTTS);
        }
        if (settings.enabled !== undefined) standaloneTTS.enabled = settings.enabled;
        if (collector) {
            collector.updateTTSSettings(settings);
            // Google TTS 설정도 실시간 반영
            if (settings.googleTTS) {
                collector.tts.updateGoogleTTSSettings(settings.googleTTS);
                log.info(`🔊 Google TTS 실시간 업데이트: ${settings.googleTTS.enabled ? '활성화' : '비활성화'} | VIP ${(settings.googleTTS.voiceSettings || []).length}명`);
            }
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
    
    // Google TTS 오디오 수신 및 재생
    socket.on('google-tts-audio', async (data) => {
        try {
            const { audio } = data;
            if (!audio) return;

            const { app: electronApp } = require('electron');
            const path = require('path');
            const fs = require('fs');
            const { exec } = require('child_process');

            // 임시 MP3 파일로 저장
            const tmpDir = electronApp.getPath('temp');
            const tmpFile = path.join(tmpDir, `tikfind_tts_${Date.now()}.mp3`);
            fs.writeFileSync(tmpFile, Buffer.from(audio, 'base64'));

            // PowerShell로 MP3 재생
            const psCommand = `(New-Object Media.SoundPlayer).Stop(); Add-Type -AssemblyName presentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open([uri]'${tmpFile}'); $player.Play(); Start-Sleep -Milliseconds 5000; $player.Close()`;
            exec(`powershell -Command "${psCommand}"`, (err) => {
                // 재생 후 임시 파일 삭제
                setTimeout(() => {
                    try { fs.unlinkSync(tmpFile); } catch (e) {}
                }, 10000);
                if (err) log.error('❌ Google TTS 재생 오류:', err.message);
            });
        } catch (error) {
            log.error('❌ Google TTS 오디오 처리 오류:', error.message);
        }
    });

    socket.on('error', (error) => {
        log.error('❌ Socket.io 오류:', error);
    });
}

// 라이브 시작
async function startLive(tiktokId, googleTTS) {
    try {
        if (collector) {
            log.warn('⚠️ 이미 라이브 연결 중입니다.');
            return;
        }
        
        log.info('📡 TikTok Live 연결 시작:', tiktokId);
        updateTrayMenu('연결 중...', tiktokId);
        
        const serverUrl = userConfig.serverUrl || process.env.SERVER_URL || 'https://tikfind.kr';
        collector = new TikTokCollector(tiktokId, userConfig.userId, serverUrl);

        // Google TTS 설정 전달
        if (googleTTS) {
            collector.tts.updateGoogleTTSSettings(googleTTS);
            log.info(`🔊 Google TTS ${googleTTS.enabled ? '활성화' : '비활성화'} | VIP ${(googleTTS.voiceSettings || []).length}명`);
        }
        
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

// 서버 세션으로 userId 자동 조회 (웹 로그인 연동)
async function fetchUserIdFromSession() {
    try {
        const serverUrl = 'https://tikfind.kr';
        const response = await fetch(`${serverUrl}/auth/current_user`, {
            headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();
        if (data.success && data.user) {
            const userId = (data.user._id || data.user.id || '').toString();
            const tiktokId = data.user.tiktokId || '';
            if (userId) {
                const config = { userId, tiktokId, serverUrl };
                saveUserConfig(config);
                log.info('✅ 웹 세션으로 userId 자동 연동:', userId);
                return config;
            }
        }
    } catch (e) {
        log.warn('⚠️ 세션 자동 확인 실패 (오프라인이거나 미로그인):', e.message);
    }
    return null;
}

// 앱 시작
app.whenReady().then(async () => {
    log.info('🚀 TikFind Desktop App (Background Service) 시작');
    
    // User 설정 로드
    userConfig = loadUserConfig();
    
    // 시스템 트레이 생성
    createTray();
    
    // Windows 시작 프로그램 등록
    setAutoLaunch();
    
    // user-config 없으면 웹 세션에서 자동 조회
    if (!userConfig || !userConfig.userId) {
        log.info('🔍 user-config 없음 → 웹 세션 자동 확인 시도...');
        updateTrayMenu('로그인 확인 중...');
        userConfig = await fetchUserIdFromSession();
    }

    // 서버 연결
    if (userConfig && userConfig.userId) {
        connectToServer();
    } else {
        log.warn('⚠️ User 설정이 없습니다. tikfind.kr 에서 로그인 후 앱을 재시작하세요.');
        updateTrayMenu('로그인 필요 - tikfind.kr');
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
    handleProtocolUrl(url);
});

// Windows에서는 second-instance 이벤트로 URL 수신
app.on('second-instance', (event, argv) => {
    const url = argv.find(arg => arg.startsWith('tikfind://'));
    if (url) {
        log.info('🔗 second-instance URL 수신:', url);
        handleProtocolUrl(url);
    }
});

async function handleProtocolUrl(url) {
    try {
        const urlObj = new URL(url);

        // tikfind://connect?token=xxx&server=https://tikfind.kr (토큰 방식)
        if (urlObj.hostname === 'connect') {
            const token = urlObj.searchParams.get('token');
            const serverUrl = urlObj.searchParams.get('server') || 'https://tikfind.kr';
            if (!token) return;
            log.info('🔑 토큰으로 userId 조회 중...');
            updateTrayMenu('계정 연결 중...');
            try {
                const res = await fetch(`${serverUrl}/api/desktop/token/${token}`);
                const data = await res.json();
                if (data.success && data.userId) {
                    userConfig = { userId: data.userId, tiktokId: data.tiktokId || '', serverUrl };
                    saveUserConfig(userConfig);
                    log.info('✅ 계정 연결 완료:', data.userId);
                    if (socket) { try { socket.disconnect(); } catch(e) {} }
                    connectToServer();
                } else {
                    log.warn('⚠️ 토큰 조회 실패:', data.message);
                    updateTrayMenu('연결 실패 - 다시 시도');
                }
            } catch (e) {
                log.error('❌ 토큰 조회 오류:', e.message);
                updateTrayMenu('연결 실패 - 다시 시도');
            }
        }

        // tikfind://start?userId=xxx&tiktokId=yyy (기존 방식 유지)
        if (urlObj.hostname === 'start') {
            const userId = urlObj.searchParams.get('userId');
            const tiktokId = urlObj.searchParams.get('tiktokId');
            const serverUrl = urlObj.searchParams.get('serverUrl') || 'https://tikfind.kr';
            if (userId && tiktokId) {
                userConfig = { userId, tiktokId, serverUrl };
                saveUserConfig(userConfig);
                if (!socket || !socket.connected) connectToServer();
                setTimeout(() => startLive(tiktokId), 1000);
            }
        }
    } catch (e) {
        log.error('❌ URL 파싱 오류:', e.message);
    }
}
