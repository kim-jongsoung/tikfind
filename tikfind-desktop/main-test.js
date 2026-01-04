const electron = require('electron');
const { app, BrowserWindow } = electron;
const path = require('path');

console.log('Electron loaded:', !!electron);
console.log('App loaded:', !!app);
console.log('BrowserWindow loaded:', !!BrowserWindow);

if (!app) {
    console.error('App is undefined!');
    process.exit(1);
}

function createWindow() {
    const win = new BrowserWindow({
        width: 500,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    
    win.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
    console.log('App is ready!');
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
