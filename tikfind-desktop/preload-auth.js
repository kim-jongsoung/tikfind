/**
 * OAuth 창용 Preload Script
 */

const { contextBridge, ipcRenderer } = require('electron');

// OAuth 창에서 사용자 정보를 메인 프로세스로 전달
contextBridge.exposeInMainWorld('electronAPI', {
    sendUserData: (userData) => {
        console.log('📤 Preload: 사용자 정보 전송', userData);
        ipcRenderer.send('auth-user-data', userData);
    }
});
