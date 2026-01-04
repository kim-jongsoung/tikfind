/**
 * TikFind Desktop Collector - WebSocket Server
 */

const WebSocket = require('ws');

class WebSocketServer {
    constructor(port = 8082) {
        this.port = port;
        this.wss = new WebSocket.Server({ port });
        this.clients = new Set();
        
        this.wss.on('connection', (ws) => {
            console.log('✅ 웹 대시보드 연결됨');
            this.clients.add(ws);
            
            ws.on('close', () => {
                console.log('❌ 웹 대시보드 연결 종료');
                this.clients.delete(ws);
            });
            
            ws.on('error', (error) => {
                console.error('❌ WebSocket 오류:', error);
                this.clients.delete(ws);
            });
        });
        
        console.log(`✅ WebSocket 서버 시작: ws://localhost:${port}`);
    }
    
    broadcast(type, data) {
        const message = JSON.stringify({ type, data });
        
        this.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
    
    close() {
        this.wss.close();
    }
}

module.exports = WebSocketServer;
