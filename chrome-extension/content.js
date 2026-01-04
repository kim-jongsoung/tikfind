/**
 * TikFind Live Collector - Content Script
 * TikTok Live 페이지에서 채팅 메시지를 감지하여 서버로 전송
 */

console.log('🚀 TikFind Collector 활성화됨');

let serverUrl = 'http://localhost:3001';
let userId = null;
let isCollecting = false;
let observedMessages = new Set();

// 설정 로드
chrome.storage.sync.get(['serverUrl', 'userId'], (result) => {
    if (result.serverUrl) serverUrl = result.serverUrl;
    if (result.userId) {
        userId = result.userId;
        startCollecting();
    } else {
        console.warn('⚠️ 사용자 ID가 설정되지 않았습니다. Extension 팝업에서 설정하세요.');
    }
});

// 수집 시작
function startCollecting() {
    if (isCollecting) return;
    isCollecting = true;
    
    console.log('✅ 채팅 수집 시작');
    console.log('🌐 서버:', serverUrl);
    console.log('👤 사용자 ID:', userId);
    
    // 방송 상태 전송
    sendLiveStatus(true);
    
    // 채팅 메시지 감지
    observeChatMessages();
    
    // 시청자 수 감지
    observeViewerCount();
}

// 채팅 메시지 감지
function observeChatMessages() {
    const chatContainer = document.querySelector('[data-e2e="live-comment-list"]') 
                       || document.querySelector('.chat-list')
                       || document.querySelector('[class*="ChatRoom"]');
    
    if (!chatContainer) {
        console.warn('⚠️ 채팅 컨테이너를 찾을 수 없습니다. 5초 후 재시도...');
        setTimeout(observeChatMessages, 5000);
        return;
    }
    
    console.log('✅ 채팅 컨테이너 발견:', chatContainer);
    
    // MutationObserver로 새 채팅 감지
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    processChatMessage(node);
                }
            });
        });
    });
    
    observer.observe(chatContainer, {
        childList: true,
        subtree: true
    });
    
    // 기존 메시지 처리
    chatContainer.querySelectorAll('[data-e2e="live-comment-item"]').forEach(processChatMessage);
}

// 채팅 메시지 처리
function processChatMessage(element) {
    try {
        // 사용자 이름 추출
        const usernameEl = element.querySelector('[data-e2e="live-comment-user-name"]')
                        || element.querySelector('[class*="Username"]')
                        || element.querySelector('.username');
        
        // 메시지 내용 추출
        const messageEl = element.querySelector('[data-e2e="live-comment-text"]')
                       || element.querySelector('[class*="CommentText"]')
                       || element.querySelector('.comment-text');
        
        if (!usernameEl || !messageEl) return;
        
        const username = usernameEl.textContent.trim();
        const message = messageEl.textContent.trim();
        
        // 중복 메시지 필터링
        const messageKey = `${username}:${message}:${Date.now()}`;
        if (observedMessages.has(messageKey)) return;
        observedMessages.add(messageKey);
        
        // 오래된 메시지 키 정리 (메모리 관리)
        if (observedMessages.size > 1000) {
            const keysArray = Array.from(observedMessages);
            observedMessages = new Set(keysArray.slice(-500));
        }
        
        console.log(`💬 [${username}]: ${message}`);
        
        // 서버로 전송
        sendChatMessage(username, message);
        
    } catch (error) {
        console.error('❌ 메시지 처리 오류:', error);
    }
}

// 시청자 수 감지
function observeViewerCount() {
    const updateViewerCount = () => {
        const viewerEl = document.querySelector('[data-e2e="live-viewer-count"]')
                      || document.querySelector('[class*="ViewerCount"]')
                      || document.querySelector('.viewer-count');
        
        if (viewerEl) {
            const viewerText = viewerEl.textContent.trim();
            const viewerCount = parseInt(viewerText.replace(/[^0-9]/g, '')) || 0;
            
            if (viewerCount > 0) {
                sendViewerCount(viewerCount);
            }
        }
    };
    
    // 5초마다 시청자 수 업데이트
    setInterval(updateViewerCount, 5000);
    updateViewerCount();
}

// 서버로 방송 상태 전송
async function sendLiveStatus(isLive) {
    if (!userId) return;
    
    try {
        const response = await fetch(`${serverUrl}/api/live/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                username: getTikTokUsername(),
                isLive,
                timestamp: Date.now()
            })
        });
        
        if (response.ok) {
            console.log('✅ 방송 상태 전송 성공');
        }
    } catch (error) {
        console.error('❌ 방송 상태 전송 실패:', error);
    }
}

// 서버로 채팅 메시지 전송
async function sendChatMessage(username, message) {
    if (!userId) return;
    
    try {
        const response = await fetch(`${serverUrl}/api/live/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                username,
                message,
                timestamp: Date.now()
            })
        });
        
        if (response.ok) {
            console.log('✅ 채팅 메시지 전송 성공');
        }
    } catch (error) {
        console.error('❌ 채팅 메시지 전송 실패:', error);
    }
}

// 서버로 시청자 수 전송
async function sendViewerCount(viewerCount) {
    if (!userId) return;
    
    try {
        await fetch(`${serverUrl}/api/live/viewers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                viewerCount
            })
        });
    } catch (error) {
        console.error('❌ 시청자 수 전송 실패:', error);
    }
}

// TikTok 사용자 이름 추출
function getTikTokUsername() {
    const url = window.location.href;
    const match = url.match(/@([^/]+)/);
    return match ? match[1] : 'unknown';
}

// 페이지 언로드 시 방송 종료 전송
window.addEventListener('beforeunload', () => {
    if (isCollecting) {
        sendLiveStatus(false);
    }
});

// 설정 변경 감지
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        if (changes.serverUrl) {
            serverUrl = changes.serverUrl.newValue;
            console.log('🔄 서버 URL 업데이트:', serverUrl);
        }
        if (changes.userId) {
            userId = changes.userId.newValue;
            console.log('🔄 사용자 ID 업데이트:', userId);
            if (userId && !isCollecting) {
                startCollecting();
            }
        }
    }
});
