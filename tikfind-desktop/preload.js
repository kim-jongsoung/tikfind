/**
 * TikFind Desktop Collector - Preload Script
 */

const { contextBridge, ipcRenderer } = require('electron');

// Renderer 프로세스에 API 노출
contextBridge.exposeInMainWorld('tikfind', {
    startCollection: (data) => ipcRenderer.send('start-collection', data),
    stopCollection: () => ipcRenderer.send('stop-collection'),
    onStatus: (callback) => ipcRenderer.on('collection-status', (event, data) => callback(data)),
    onChat: (callback) => ipcRenderer.on('chat-message', (event, data) => callback(data)),
    onStats: (callback) => ipcRenderer.on('stats-update', (event, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('collection-error', (event, message) => callback(message)),
    onAutoStart: (callback) => ipcRenderer.on('auto-start', (event, data) => callback(data)),
    updateTTSSettings: (settings) => ipcRenderer.send('update-tts-settings', settings),
    getTranslations: () => ipcRenderer.invoke('get-translations'),
    getUserConfig: () => ipcRenderer.invoke('get-user-config'),
    onUserData: (callback) => ipcRenderer.on('user-data', (event, data) => callback(data)),
    googleLoginSuccess: (userData) => ipcRenderer.send('google-login-success', userData),
    openGoogleAuth: () => ipcRenderer.send('open-google-auth'),
    onAuthWindowClosed: (callback) => ipcRenderer.on('auth-window-closed', () => callback()),
    
    // YouTube 외부 브라우저 열기
    openYouTube: (url) => ipcRenderer.send('open-youtube', url)
});
