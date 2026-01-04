const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const TikTokCollector = require('./src/collector');
const i18n = require('./src/i18n');

let mainWindow;
let collector = null;
let youtubeBrowserWindow = null; // YouTube 전용 브라우저 창
let userConfig = null; // User 설정 정보

// User 설정 파일 로드
function loadUserConfig() {
    try {
        const configPath = path.join(__dirname, 'user-config.json');
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            userConfig = JSON.parse(configData);
            console.log('✅ User 설정 로드 완료:', userConfig.userId);
            return userConfig;
        } else {
            console.log('⚠️ user-config.json 파일이 없습니다. 수동 로그인이 필요합니다.');
            return null;
        }
    } catch (error) {
        console.error('❌ User 설정 로드 오류:', error);
        return null;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 1050,
        minWidth: 800,
        minHeight: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            partition: 'persist:tikfind',
            webviewTag: true,
            nodeIntegrationInSubFrames: true,
            allowRunningInsecureContent: true,
            webSecurity: false // YouTube iframe 재생을 위해 필요
        },
        resizable: true,
        icon: path.join(__dirname, 'build', 'icon.png')
    });
    
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    
    // 개발 모드에서만 개발자 도구 열기
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
    
    console.log('✅ TikFind Desktop App started');
}

app.whenReady().then(() => {
    // User 설정 로드
    userConfig = loadUserConfig();
    
    createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// User 설정 정보 요청
ipcMain.handle('get-user-config', () => {
    return userConfig;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('start-collection', async (event, data) => {
    try {
        if (collector) {
            event.reply('collection-error', '이미 연결되어 있습니다.');
            return;
        }
        
        console.log('📡 Start collection:', data);
        
        collector = new TikTokCollector(data.username, data.userId, data.serverUrl);
        
        collector.on('connected', () => {
            console.log('✅ TikTok Live 연결 성공');
            event.reply('collection-status', { status: 'connected', username: data.username });
        });
        
        collector.on('disconnected', () => {
            console.log('❌ TikTok Live 연결 종료');
            event.reply('collection-status', { status: 'disconnected' });
            collector = null;
        });
        
        collector.on('chat', (chatData) => {
            event.reply('chat-message', chatData);
        });
        
        collector.on('stats', (stats) => {
            event.reply('stats-update', stats);
        });
        
        collector.on('error', (error) => {
            console.error('❌ 오류:', error);
            event.reply('collection-error', error.message);
        });
        
        await collector.start();
        
    } catch (error) {
        console.error('❌ 연결 실패:', error);
        event.reply('collection-error', error.message);
        collector = null;
    }
});

ipcMain.on('stop-collection', (event) => {
    console.log('⏹️ Stop collection');
    if (collector) {
        collector.stop();
        collector = null;
        event.reply('collection-status', { status: 'stopped' });
    }
});

ipcMain.on('update-tts-settings', (event, settings) => {
    if (collector) {
        collector.updateTTSSettings(settings);
        console.log('🔊 TTS 설정 업데이트:', settings);
    }
});

// i18n 번역 데이터 요청
ipcMain.handle('get-translations', () => {
    return {
        locale: i18n.getLocale(),
        translations: i18n.translations
    };
});

// Google 로그인 성공 시 사용자 정보 전달
ipcMain.on('google-login-success', (event, userData) => {
    if (mainWindow) {
        mainWindow.webContents.send('user-data', userData);
    }
});

// Google OAuth 창 열기
ipcMain.on('open-google-auth', (event) => {
    const authWindow = new BrowserWindow({
        width: 500,
        height: 600,
        parent: mainWindow,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: 'persist:tikfind', // 메인 창과 같은 세션 사용
            preload: path.join(__dirname, 'preload-auth.js') // OAuth 전용 preload
        }
    });
    
    authWindow.loadURL('http://localhost:3001/auth/google?desktop=true');
    
    // 창이 닫힐 때
    authWindow.on('closed', () => {
        console.log('🔒 OAuth 창 닫힘');
        // 메인 창에 로그인 완료 알림
        if (mainWindow) {
            mainWindow.webContents.send('auth-window-closed');
        }
    });
    
    // URL 변경 감지 (로그인 완료 페이지)
    authWindow.webContents.on('did-navigate', (event, url) => {
        console.log('🔄 URL 변경:', url);
        
        // 로그인 완료 페이지 감지 (HTML 응답 확인)
        if (url.includes('callback')) {
            // 페이지 로드 완료 대기
            authWindow.webContents.once('did-finish-load', () => {
                // HTML 내용 확인
                authWindow.webContents.executeJavaScript('document.body.innerText').then(text => {
                    console.log('📄 페이지 내용:', text.substring(0, 100));
                    if (text.includes('로그인 완료') || text.includes('Desktop App')) {
                        setTimeout(() => {
                            authWindow.close();
                        }, 1500);
                    }
                });
            });
        }
    });
});

// YouTube 링크를 전용 BrowserWindow에서 열기 (같은 창에서 URL 변경)
ipcMain.on('open-youtube', (event, url) => {
    if (!youtubeBrowserWindow || youtubeBrowserWindow.isDestroyed()) {
        // 새 YouTube 전용 브라우저 창 생성
        youtubeBrowserWindow = new BrowserWindow({
            width: 1280,
            height: 720,
            title: 'TikFind - YouTube Player',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                partition: 'persist:youtube' // YouTube 전용 세션
            },
            autoHideMenuBar: true
        });
        
        // YouTube 광고 차단
        const session = youtubeBrowserWindow.webContents.session;
        
        // 광고 도메인 차단
        const adBlockFilters = [
            '*://*.doubleclick.net/*',
            '*://*.googlesyndication.com/*',
            '*://*.googleadservices.com/*',
            '*://googleads.g.doubleclick.net/*',
            '*://*.youtube.com/api/stats/ads*',
            '*://*.youtube.com/pagead/*',
            '*://*.youtube.com/ptracking*',
            '*://*.youtube.com/get_video_info*ad*'
        ];
        
        session.webRequest.onBeforeRequest({ urls: adBlockFilters }, (details, callback) => {
            callback({ cancel: true });
        });
        
        // 광고 스킵 스크립트 주입
        youtubeBrowserWindow.webContents.on('did-finish-load', () => {
            youtubeBrowserWindow.webContents.executeJavaScript(`
                // 광고 스킵 버튼 자동 클릭
                setInterval(() => {
                    const skipButton = document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button');
                    if (skipButton) {
                        skipButton.click();
                        console.log('✅ 광고 스킵됨');
                    }
                    
                    // 광고 오버레이 숨기기
                    const adOverlay = document.querySelector('.ytp-ad-overlay-container');
                    if (adOverlay) {
                        adOverlay.style.display = 'none';
                    }
                }, 500);
            `);
        });
        
        // 창이 닫히면 참조 제거
        youtubeBrowserWindow.on('closed', () => {
            console.log('🎵 YouTube 창 닫힘');
            youtubeBrowserWindow = null;
        });
        
        console.log('🎵 YouTube 창 생성 (광고 차단 활성화):', url);
    } else {
        console.log('🎵 YouTube URL 변경:', url);
    }
    
    // URL 로드 (같은 창에서)
    youtubeBrowserWindow.loadURL(url);
    youtubeBrowserWindow.focus(); // 창 포커스
});

// OAuth 창에서 사용자 정보 수신
ipcMain.on('auth-user-data', (event, userData) => {
    console.log('✅ 사용자 정보 수신:', userData);
    // 메인 창에 사용자 정보 전달
    if (mainWindow) {
        mainWindow.webContents.send('user-data', userData);
    }
});

// ==================== 자동 업데이트 ====================

// 자동 업데이트 로그 설정
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// 업데이트 서버 URL 설정 (자체 서버 사용)
autoUpdater.setFeedURL({
    provider: 'generic',
    url: process.env.UPDATE_SERVER_URL || 'http://localhost:3001/updates'
});

// 앱 시작 시 업데이트 확인
app.on('ready', () => {
    // 개발 모드가 아닐 때만 업데이트 확인
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') {
        setTimeout(() => {
            autoUpdater.checkForUpdates();
        }, 3000); // 3초 후 업데이트 확인
    }
});

// 업데이트 확인 중
autoUpdater.on('checking-for-update', () => {
    console.log('🔍 업데이트 확인 중...');
    if (mainWindow) {
        mainWindow.webContents.send('update-status', { status: 'checking' });
    }
});

// 업데이트 사용 가능
autoUpdater.on('update-available', (info) => {
    console.log('✅ 새 업데이트 발견:', info.version);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', { 
            status: 'available', 
            version: info.version 
        });
    }
});

// 업데이트 없음
autoUpdater.on('update-not-available', (info) => {
    console.log('✅ 최신 버전입니다:', info.version);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', { 
            status: 'not-available', 
            version: info.version 
        });
    }
});

// 업데이트 다운로드 진행률
autoUpdater.on('download-progress', (progressObj) => {
    const message = `다운로드 속도: ${progressObj.bytesPerSecond} - ${progressObj.percent}% 완료 (${progressObj.transferred}/${progressObj.total})`;
    console.log('📥', message);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', { 
            status: 'downloading', 
            progress: progressObj 
        });
    }
});

// 업데이트 다운로드 완료
autoUpdater.on('update-downloaded', (info) => {
    console.log('✅ 업데이트 다운로드 완료:', info.version);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', { 
            status: 'downloaded', 
            version: info.version 
        });
    }
    
    // 5초 후 자동으로 재시작하여 업데이트 적용
    setTimeout(() => {
        autoUpdater.quitAndInstall();
    }, 5000);
});

// 업데이트 오류
autoUpdater.on('error', (err) => {
    console.error('❌ 업데이트 오류:', err);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', { 
            status: 'error', 
            error: err.message 
        });
    }
});

// 수동 업데이트 확인 요청
ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdates();
});
