/**
 * TikFind Desktop Collector - Renderer Process
 */

// 다국어 지원
let i18n = null;

// DOM 요소
const userIdInput = document.getElementById('userId');
const usernameInput = document.getElementById('username');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const viewerCount = document.getElementById('viewerCount');
const messageCount = document.getElementById('messageCount');
const giftCount = document.getElementById('giftCount');
const likeCount = document.getElementById('likeCount');
const chatMessages = document.getElementById('chatMessages');

// TTS 설정 요소
const ttsEnabled = document.getElementById('ttsEnabled');
const ttsVolume = document.getElementById('ttsVolume');
const ttsVolumeValue = document.getElementById('ttsVolumeValue');

let isConnected = false;

// 앱 초기화
async function initApp() {
    // 번역 로드
    const { locale, translations } = await window.tikfind.getTranslations();
    i18n = { locale, translations };
    console.log(`🌍 언어: ${locale}`);
    updateUILanguage();

    // 1순위: 서버 세션 자동 확인 (웹에서 로그인했으면 자동 연동)
    const autoLoaded = await autoLoadFromSession();

    // 2순위: localStorage 저장값 (세션 없을 때 폴백)
    if (!autoLoaded) {
        loadSavedUserId();
    }
}

// 서버 세션으로 자동 로그인 (웹 로그인 연동)
async function autoLoadFromSession() {
    try {
        const res = await fetch('https://tikfind.kr/auth/current_user', {
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success && data.user) {
            const user = data.user;
            console.log('✅ 웹 세션 자동 연동:', user.email || user._id);

            const userId = (user._id || user.id || '').toString();
            if (!userId) return false;

            // UI 자동 입력
            userIdInput.value = userId;
            if (user.tiktokId) usernameInput.value = user.tiktokId;

            // localStorage 갱신
            localStorage.setItem('tikfind_userId', userId);
            if (user.tiktokId) localStorage.setItem('tikfind_tiktokId', user.tiktokId);

            // 플랜 정보 표시
            if (user.plan) {
                updatePlanDisplay(user.plan, user.plan.toUpperCase(), null, null);
            }

            // user-config.json 갱신 (main 프로세스)
            window.tikfind.loginDone({ userId, tiktokId: user.tiktokId || '' });

            return true;
        }
    } catch (e) {
        console.log('⚠️ 세션 자동 확인 실패 (오프라인이거나 미로그인):', e.message);
    }
    return false;
}

// 저장된 User ID 불러오기 (폴백)
function loadSavedUserId() {
    const savedUserId = localStorage.getItem('tikfind_userId');
    if (savedUserId) {
        console.log('✅ localStorage User ID 로드:', savedUserId);
        userIdInput.value = savedUserId;
        const savedTiktokId = localStorage.getItem('tikfind_tiktokId');
        if (savedTiktokId) usernameInput.value = savedTiktokId;
        fetchUserInfo(savedUserId);
    }
}

// 서버에서 User ID로 TikTok ID 가져오기
async function fetchUserInfo(userId) {
    try {
        const response = await fetch(`https://tikfind.kr/api/user/${userId}`);
        const data = await response.json();
        
        if (data.success && data.user) {
            const user = data.user;
            const tiktokId = user.tiktokId;
            
            if (tiktokId) {
                console.log('✅ 서버에서 TikTok ID 로드:', tiktokId);
                localStorage.setItem('tikfind_tiktokId', tiktokId);
                usernameInput.value = tiktokId;
                
                // 닉네임과 언어도 저장
                if (user.nickname) {
                    localStorage.setItem('userNickname', user.nickname);
                }
                if (user.preferredLanguage) {
                    localStorage.setItem('preferredLanguage', user.preferredLanguage);
                }
            } else {
                console.log('⚠️ TikTok ID가 설정되지 않았습니다');
            }
            
            // 플랜 정보 표시
            if (user.plan && user.planName) {
                updatePlanDisplay(user.plan, user.planName, user.limits, user.usage);
            }
        } else {
            console.log('❌ 사용자 정보를 찾을 수 없습니다');
        }
    } catch (error) {
        console.error('❌ 사용자 정보 로드 오류:', error);
    }
}

// 플랜 정보 표시 업데이트
function updatePlanDisplay(plan, planName, limits, usage) {
    const planBadge = document.getElementById('planBadge');
    const planUsageInfo = document.getElementById('planUsageInfo');
    const upgradePlanBtn = document.getElementById('upgradePlanBtn');
    
    // 플랜 배지 업데이트
    if (planBadge) {
        planBadge.textContent = planName;
        planBadge.className = 'plan-badge';
        if (plan === 'free') {
            planBadge.style.background = '#95a5a6';
        } else if (plan === 'trial') {
            planBadge.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        } else if (plan === 'active') {
            planBadge.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
        }
    }
    
    // 사용량 정보 표시
    if (planUsageInfo && limits && usage) {
        planUsageInfo.style.display = 'block';
        
        // AI 발음 코치
        const aiCoachUsageEl = document.getElementById('aiCoachUsage');
        if (aiCoachUsageEl) {
            const aiCoachLimit = limits.aiCoach === -1 ? '∞' : limits.aiCoach;
            aiCoachUsageEl.textContent = `${usage.aiCoach || 0}/${aiCoachLimit}`;
            aiCoachUsageEl.style.color = usage.aiCoach >= limits.aiCoach && limits.aiCoach !== -1 ? '#e74c3c' : '#2ecc71';
        }
        
        // 신청곡
        const songRequestUsageEl = document.getElementById('songRequestUsage');
        if (songRequestUsageEl) {
            const songRequestLimit = limits.songRequest === -1 ? '∞' : limits.songRequest;
            songRequestUsageEl.textContent = `${usage.songRequest || 0}/${songRequestLimit}`;
            songRequestUsageEl.style.color = usage.songRequest >= limits.songRequest && limits.songRequest !== -1 ? '#e74c3c' : '#2ecc71';
        }
        
        // GPT AI
        const gptAiUsageEl = document.getElementById('gptAiUsage');
        if (gptAiUsageEl) {
            const gptAiLimit = limits.gptAi === -1 ? '∞' : limits.gptAi;
            gptAiUsageEl.textContent = `${usage.gptAi || 0}/${gptAiLimit}`;
            gptAiUsageEl.style.color = usage.gptAi >= limits.gptAi && limits.gptAi !== -1 ? '#e74c3c' : '#2ecc71';
        }
    }
    
    // 업그레이드 버튼 표시 (Free 플랜만)
    if (upgradePlanBtn) {
        if (plan === 'free') {
            upgradePlanBtn.style.display = 'inline-block';
            upgradePlanBtn.onclick = () => {
                window.open('https://tikfind.kr/dashboard/billing', '_blank');
            };
        } else {
            upgradePlanBtn.style.display = 'none';
        }
    }
}

function t(key) {
    if (!i18n) return key;
    
    const keys = key.split('.');
    let value = i18n.translations;
    
    for (const k of keys) {
        if (value && typeof value === 'object') {
            value = value[k];
        } else {
            return key;
        }
    }
    
    return value || key;
}

function updateUILanguage() {
    // 헤더
    const subtitle = document.querySelector('.subtitle');
    if (subtitle) subtitle.textContent = t('app.subtitle');
    
    // 연결 설정
    const userIdLabel = document.querySelector('label[for="userId"]');
    if (userIdLabel) userIdLabel.textContent = t('connection.userId');
    if (userIdInput) userIdInput.placeholder = t('connection.userIdPlaceholder');
    
    const usernameLabel = document.querySelector('label[for="username"]');
    if (usernameLabel) usernameLabel.textContent = t('connection.username');
    if (usernameInput) usernameInput.placeholder = t('connection.usernamePlaceholder');
    if (startBtn) startBtn.innerHTML = t('connection.startBtn');
    if (stopBtn) stopBtn.innerHTML = t('connection.stopBtn');
    if (statusText) statusText.textContent = t('connection.statusDisconnected');
    
    // TTS 설정
    const ttsSection = document.querySelector('.tts-section h3');
    if (ttsSection) ttsSection.innerHTML = `${t('tts.title')} <span class="feature-badge free">${t('badges.free')}</span>`;
    
    const ttsLabel = document.querySelector('.tts-label span');
    if (ttsLabel) ttsLabel.textContent = t('tts.enabled');
    
    const ttsSpeedLabel = document.querySelector('label[for="ttsSpeed"]');
    if (ttsSpeedLabel) ttsSpeedLabel.innerHTML = `${t('tts.speed')}: <span id="ttsSpeedValue">1.0</span>x`;
    
    // 채팅
    const chatSection = document.querySelector('.chat-section-full h3');
    if (chatSection) chatSection.innerHTML = `${t('chat.title')}`;
    
    // AI 발음 코치
    const aiCoachSection = document.querySelector('.ai-coach-section-compact h3');
    if (aiCoachSection) aiCoachSection.innerHTML = `${t('aiCoach.title')} <span class="badge-pro">PRO</span>`;
    
    // 신청곡
    const songQueueSection = document.querySelector('.song-queue-section-compact h3');
    if (songQueueSection) songQueueSection.innerHTML = `${t('songQueue.title')} <span class="badge-pro">PRO</span>`;
    
    // 푸터
    const footerServer = document.querySelector('.footer p:first-child');
    if (footerServer) footerServer.innerHTML = `${t('footer.server')}: <span id="serverStatus">https://tikfind.kr</span>`;
    
    const footerVersion = document.querySelector('.footer .version');
    if (footerVersion) footerVersion.textContent = t('footer.version');
}

// 앱 시작 시 초기화
initApp();

// User ID 등록/변경 버튼
const saveUserIdBtn = document.getElementById('saveUserIdBtn');

saveUserIdBtn.addEventListener('click', async () => {
    const userId = userIdInput.value.trim();
    
    if (!userId) {
        alert('User ID를 입력해주세요.');
        return;
    }
    
    console.log('💾 User ID 저장 중:', userId);
    saveUserIdBtn.disabled = true;
    saveUserIdBtn.textContent = '저장 중...';
    
    // 서버에서 사용자 정보 가져오기
    try {
        const response = await fetch(`https://tikfind.kr/api/user/${userId}`);
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success) {
                // localStorage에 저장
                localStorage.setItem('tikfind_userId', userId);
                
                console.log('✅ User ID 저장 완료:', userId);
                
                // TikTok ID 자동 입력
                if (data.tiktokId) {
                    console.log('✅ TikTok ID 자동 로드:', data.tiktokId);
                    usernameInput.value = data.tiktokId;
                    localStorage.setItem('tikfind_tiktokId', data.tiktokId);
                } else {
                    usernameInput.value = '';
                    localStorage.removeItem('tikfind_tiktokId');
                    alert('웹 대시보드에서 TikTok ID를 먼저 등록해주세요.');
                }
                
                // 플랜 뱃지 업데이트
                const planBadge = document.getElementById('planBadge');
                if (data.subscriptionStatus === 'active' || data.subscriptionStatus === 'trial') {
                    planBadge.textContent = 'PRO';
                    planBadge.classList.remove('free');
                    planBadge.classList.add('pro');
                } else {
                    planBadge.textContent = 'FREE';
                    planBadge.classList.remove('pro');
                    planBadge.classList.add('free');
                }
                
                // 버튼 텍스트 변경
                saveUserIdBtn.textContent = '변경';
                alert('User ID가 등록되었습니다!');
            }
        } else {
            alert('User ID를 찾을 수 없습니다. 웹 대시보드에서 확인해주세요.');
        }
    } catch (error) {
        console.error('❌ 사용자 정보 가져오기 실패:', error);
        alert('서버 연결 실패. 서버가 실행 중인지 확인해주세요.');
    } finally {
        saveUserIdBtn.disabled = false;
        if (saveUserIdBtn.textContent === '저장 중...') {
            saveUserIdBtn.textContent = '등록';
        }
    }
});

// 사용자 데이터 수신
window.tikfind.onUserData((data) => {
    console.log('✅ 로그인 성공:', data);
    
    // UI 업데이트
    const loginText = document.getElementById('loginText');
    loginText.textContent = data.email || '로그아웃';
    
    const userIdLabel = document.getElementById('userIdLabel');
    userIdLabel.textContent = '(로그인 완료)';
    
    // User ID 자동 입력
    if (data.userId) {
        userIdInput.value = data.userId;
        userIdInput.readOnly = true;
    }
    
    // TikTok ID 자동 입력
    if (data.tiktokId) {
        usernameInput.value = data.tiktokId;
        usernameInput.readOnly = true;
    }
    
    // 구독 상태 업데이트
    const planBadge = document.getElementById('planBadge');
    if (data.subscriptionStatus === 'active' || data.subscriptionStatus === 'trial') {
        planBadge.textContent = 'PRO';
        planBadge.style.background = 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)';
    }
    
    isLoggedIn = true;
    userData = data;
    
    // UI 업데이트
    loginText.textContent = data.email || '로그아웃';
    userIdLabel.textContent = '(로그인 완료)';
    
    // User ID 자동 입력
    if (data.userId) {
        userIdInput.value = data.userId;
        userIdInput.readOnly = true;
    }
    
    // TikTok ID 자동 입력
    if (data.tiktokId) {
        usernameInput.value = data.tiktokId;
        usernameInput.readOnly = true;
    }
});

// 연결 시작
startBtn.addEventListener('click', () => {
    const userId = userIdInput.value.trim();
    // @ 기호 자동 제거
    const username = usernameInput.value.trim().replace(/^@/, '');
    
    if (!userId) {
        alert(t('connection.alertUserId'));
        return;
    }
    
    if (!username) {
        alert(t('connection.alertUsername'));
        return;
    }
    
    console.log('🚀 연결 시작:', { userId, username });
    window.tikfind.startCollection({
        username: username,
        userId: userId,
        serverUrl: 'https://tikfind.kr'
    });
    
    startBtn.disabled = true;
    userIdInput.disabled = true;
    usernameInput.disabled = true;
    statusText.textContent = '연결 중...';
});

// 자동 시작 (웹에서 호출)
window.tikfind.onAutoStart((data) => {
    console.log('🚀 자동 시작:', data);
    
    userIdInput.value = data.userId;
    usernameInput.value = data.tiktokId;
    userIdInput.disabled = true;
    usernameInput.disabled = true;
    startBtn.disabled = true;
    statusText.textContent = '자동 연결 중...';
    
    window.tikfind.startCollection({
        username: data.tiktokId,
        userId: data.userId,
        serverUrl: data.serverUrl
    });
});

// 연결 중지
stopBtn.addEventListener('click', () => {
    window.tikfind.stopCollection();
});

// 상태 업데이트
window.tikfind.onStatus((data) => {
    if (data.status === 'connected') {
        isConnected = true;
        statusDot.classList.add('connected');
        statusText.textContent = `방송 중: @${data.username}`;
        stopBtn.disabled = false;
        
        // 연결 성공 시 TTS 설정 전송
        updateTTSSettings();
    } else if (data.status === 'disconnected' || data.status === 'stopped') {
        isConnected = false;
        statusDot.classList.remove('connected');
        statusText.textContent = '연결 안 됨';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        usernameInput.disabled = false;
    }
});

// 채팅 메시지
window.tikfind.onChat((data) => {
    addChatMessage(data.username, data.message);
});

// 통계 업데이트
window.tikfind.onStats((stats) => {
    viewerCount.textContent = stats.viewers.toLocaleString();
    messageCount.textContent = stats.messages.toLocaleString();
    giftCount.textContent = stats.gifts.toLocaleString();
    likeCount.textContent = stats.likes.toLocaleString();
});

// 에러 처리
window.tikfind.onError((error) => {
    alert(`오류: ${error}`);
    statusDot.classList.add('error');
    statusText.textContent = '연결 실패';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    usernameInput.disabled = false;
});

// 채팅 메시지 추가 (통합 UI)
function addChatMessage(username, message) {
    const chatAiMessages = document.getElementById('chatAiMessages');
    
    // 빈 메시지 제거
    const emptyMessage = chatAiMessages.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.innerHTML = `
        <div class="chat-username">@${username}</div>
        <div class="chat-text">${escapeHtml(message)}</div>
    `;
    
    chatAiMessages.appendChild(messageEl);
    
    // #노래제목#가수명 패턴 감지
    const songPattern = /#([^#]+)#([^#]+)/;
    const match = message.match(songPattern);
    
    if (match) {
        const title = match[1].trim();
        const artist = match[2].trim();
        console.log('🎵 신청곡 감지:', title, '-', artist, 'by', username);
        
        // 자동으로 신청곡 추가 (시청자는 30분 제한 적용)
        autoAddSongFromChat(title, artist, username);
    }
    
    // 외국어 감지 (스트리머 선택 언어가 아닌 경우)
    const streamerLanguage = localStorage.getItem('preferredLanguage') || 'ko'; // 스트리머 선택 언어
    
    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(message);
    const hasEnglish = /[a-zA-Z]/.test(message);
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(message);
    const hasChinese = /[\u4E00-\u9FFF]/.test(message);
    const hasThai = /[\u0E00-\u0E7F]/.test(message);
    
    // 스트리머 언어가 아닌 다른 언어가 감지된 경우
    let isForeignLanguage = false;
    if (streamerLanguage === 'ko' && !hasKorean && (hasEnglish || hasJapanese || hasChinese || hasThai)) {
        isForeignLanguage = true;
    } else if (streamerLanguage === 'en' && !hasEnglish && (hasKorean || hasJapanese || hasChinese || hasThai)) {
        isForeignLanguage = true;
    } else if (streamerLanguage === 'ja' && !hasJapanese && (hasKorean || hasEnglish || hasChinese || hasThai)) {
        isForeignLanguage = true;
    }
    
    if (isForeignLanguage) {
        console.log('🌍 외국어 감지:', message, 'by', username);
        // AI 발음 코치 요청 (비동기)
        requestAiCoach(username, message, messageEl, streamerLanguage);
    }
    
    // 최대 50개 메시지만 유지
    while (chatAiMessages.children.length > 50) {
        chatAiMessages.removeChild(chatAiMessages.firstChild);
    }
    
    // 스크롤 하단으로
    chatAiMessages.scrollTop = chatAiMessages.scrollHeight;
}

// AI 발음 코치 요청
async function requestAiCoach(username, message, messageEl, streamerLanguage = 'ko') {
    try {
        // 스트리머 정보 가져오기
        const streamerNickname = localStorage.getItem('userNickname') || 'Streamer';
        const streamerPersona = localStorage.getItem('streamerPersona') || '친근하고 활발한 스트리머';
        
        // 서버에 AI 발음 코치 요청
        const response = await fetch('https://tikfind.kr/api/ai/pronunciation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                targetLanguage: streamerLanguage, // 스트리머 선택 언어
                streamerNickname: streamerNickname, // 스트리머 닉네임
                streamerPersona: streamerPersona, // 스트리머 페르소나
                viewerUsername: username // 시청자 이름
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.response) {
            // 메시지 요소에 AI 코치 추가
            messageEl.classList.add('with-ai-coach');
            
            const aiCoachDiv = document.createElement('div');
            aiCoachDiv.className = 'ai-coach-inline';
            const nicknameLine = data.nicknamePronunciation
                ? `<div class="ai-nickname-pronunciation">👤 닉네임 발음: <strong>${escapeHtml(data.nicknamePronunciation)}</strong></div>`
                : '';
            aiCoachDiv.innerHTML = `
                <div class="ai-coach-header">🤖 AI 발음 코치</div>
                ${nicknameLine}
                <div class="ai-original">원본: ${escapeHtml(message)} <span class="ai-meaning">(${escapeHtml(data.originalMeaning || '의미')})</span></div>
                <div class="ai-response">답변: ${escapeHtml(data.response)} <span class="ai-meaning">(${escapeHtml(data.responseMeaning || '답변 의미')})</span></div>
                <div class="ai-pronunciation">발음: ${escapeHtml(data.pronunciation)}</div>
            `;
            
            messageEl.appendChild(aiCoachDiv);
            
            // AI 발음 코치 추가 후 스크롤을 하단으로 이동
            const chatAiMessages = document.getElementById('chatAiMessages');
            chatAiMessages.scrollTop = chatAiMessages.scrollHeight;
            
            console.log('✅ AI 발음 코치 추가:', username, '-', message);
        }
    } catch (error) {
        console.error('❌ AI 발음 코치 요청 오류:', error);
    }
}

// 채팅에서 신청곡 자동 추가
async function autoAddSongFromChat(title, artist, username) {
    console.log('🔍 YouTube 자동 검색:', title, '-', artist);
    
    try {
        // 서버에 YouTube 검색 요청
        const response = await fetch('https://tikfind.kr/api/youtube/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, artist })
        });
        
        const data = await response.json();
        
        if (!data.success || !data.videoId) {
            console.log('❌ YouTube에서 노래를 찾을 수 없음:', title, '-', artist);
            return;
        }
        
        // 시청자 신청곡 추가 (30분 제한 적용)
        const success = addSongToQueue(title, artist, data.videoId, username, 5, false);
        
        if (success) {
            console.log('✅ 채팅 신청곡 자동 추가:', title, '-', artist);
        }
        
    } catch (error) {
        console.error('❌ YouTube 검색 오류:', error);
    }
}

// HTML 이스케이프
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Enter 키로 연결
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !startBtn.disabled) {
        startBtn.click();
    }
});

// TTS 설정 변경
function updateTTSSettings() {
    const settings = {
        enabled: ttsEnabled.checked,
        volume: parseInt(ttsVolume.value)
    };
    
    window.tikfind.updateTTSSettings(settings);
    console.log('🔊 TTS 설정 업데이트:', settings);
}

// TTS 활성화 체크박스
ttsEnabled.addEventListener('change', updateTTSSettings);

// TTS 볼륨 슬라이더
ttsVolume.addEventListener('input', (e) => {
    ttsVolumeValue.textContent = e.target.value + '%';
});

ttsVolume.addEventListener('change', updateTTSSettings);

// TTS 설정 (웹에서 전달받음)
window.addEventListener('message', (event) => {
    if (event.data.type === 'tts-settings') {
        window.tikfind.updateTTSSettings(event.data.settings);
    }
});

// 신청곡 큐 변수
let songQueue = [];
let songRequestHistory = {}; // 시청자별 마지막 신청 시간 기록
let currentPlayingIndex = -1; // 현재 재생 중인 곡 인덱스
let filteredSongQueue = []; // 검색 필터링된 큐

// AI 어시스턴트 변수
let aiChatHistory = [];
let aiUsageToday = 0;
let aiUsageLimit = 20; // FREE: 20, UNIVERSE: 100

// AI 어시스턴트 질문 전송
async function sendAIQuestion() {
    const input = document.getElementById('aiQuestion');
    const question = input.value.trim();
    
    if (!question) return;
    
    // 사용량 제한 체크
    if (aiUsageToday >= aiUsageLimit) {
        alert(`오늘의 AI 어시스턴트 사용량을 모두 사용했습니다.\n${aiUsageLimit}개/일 제한`);
        return;
    }
    
    // 질문 추가
    addAIMessage('user', question);
    input.value = '';
    
    // 버튼 비활성화
    const sendBtn = document.getElementById('aiSendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    
    try {
        const response = await fetch('https://tikfind.kr/api/ai-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: question,
                history: aiChatHistory.slice(-10) // 최근 10개만 전송
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.answer) {
            addAIMessage('assistant', data.answer);
            aiUsageToday++;
            updateAIUsage();
        } else {
            addAIMessage('assistant', '죄송합니다. 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('❌ AI 어시스턴트 오류:', error);
        addAIMessage('assistant', '서버 연결 오류가 발생했습니다.');
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '전송';
    }
}

// AI 메시지 추가
function addAIMessage(role, content) {
    const historyDiv = document.getElementById('aiChatHistory');
    
    // 빈 메시지 제거
    const emptyMsg = historyDiv.querySelector('.empty-message');
    if (emptyMsg) {
        emptyMsg.remove();
    }
    
    // 메시지 추가
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role}`;
    messageDiv.textContent = content;
    historyDiv.appendChild(messageDiv);
    
    // 히스토리에 저장
    aiChatHistory.push({ role, content });
    
    // 스크롤 하단으로
    historyDiv.scrollTop = historyDiv.scrollHeight;
}

// AI 사용량 업데이트
function updateAIUsage() {
    const usageSpan = document.getElementById('aiUsage');
    usageSpan.textContent = `${aiUsageToday}/${aiUsageLimit}`;
}

// 페이지 로드 완료 후
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 DOM 로드 완료');
    
    // AI 어시스턴트 이벤트
    const aiSendBtn = document.getElementById('aiSendBtn');
    const aiInput = document.getElementById('aiQuestion');
    
    if (aiSendBtn) {
        aiSendBtn.addEventListener('click', sendAIQuestion);
    }
    
    if (aiInput) {
        aiInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendAIQuestion();
            }
        });
    }
    
    setTimeout(() => {
        console.log('🎵 테스트 데이터 추가 시작...');
        addTestSongRequest();
        addTestAICoach();
        
        // 테스트 채팅 메시지도 추가
        addChatMessage('test_user', '#Dynamite#BTS');
        addChatMessage('user123', '#롤린#브레이브걸스');
        addChatMessage('user456', '#HowYouLikeThat#BLACKPINK');
        
        console.log('✅ 테스트 데이터 추가 완료');
    }, 1000);
});

// 신청곡 추가 함수 (30분 제한 체크)
function addSongToQueue(title, artist, videoId, requester, level = 1, isVip = false) {
    const now = Date.now();
    const lastRequestTime = songRequestHistory[requester];
    
    // 30분 제한 체크 (1800000ms = 30분)
    if (lastRequestTime && (now - lastRequestTime) < 1800000) {
        const timeLeft = Math.ceil((1800000 - (now - lastRequestTime)) / 60000);
        console.log(`⏰ @${requester}는 ${timeLeft}분 후에 신청 가능합니다`);
        return false;
    }
    
    // 우선순위 결정
    let priority = 'normal';
    if (isVip) {
        priority = 'vip';
    } else if (level >= 10) {
        priority = 'high';
    }
    
    const song = {
        title: title,
        artist: artist,
        videoId: videoId,
        requester: requester,
        level: level,
        isVip: isVip,
        priority: priority,
        requestTime: now,
        id: Date.now() + Math.random()
    };
    
    songQueue.push(song);
    songRequestHistory[requester] = now;
    
    // 우선순위별 정렬 (VIP > High > Normal, 같은 우선순위는 신청 순서)
    sortSongQueue();
    updateSongQueueUI();
    
    console.log('✅ 신청곡 추가:', title, '-', artist, `(우선순위: ${priority})`);
    return true;
}

// 신청곡 우선순위 정렬
function sortSongQueue() {
    const priorityOrder = { 'vip': 0, 'high': 1, 'normal': 2 };
    songQueue.sort((a, b) => {
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.requestTime - b.requestTime;
    });
}

// 신청곡 큐 UI 업데이트
function updateSongQueueUI() {
    const songQueueList = document.getElementById('songQueueList');
    const songCount = document.getElementById('songCount');
    const nowPlayingBadge = document.getElementById('nowPlayingBadge');
    
    // 총 곡 수 업데이트
    if (songCount) {
        songCount.textContent = `총 ${songQueue.length}곡`;
    }
    
    // 빈 메시지 제거
    const emptyMessage = songQueueList.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    // 기존 리스트 초기화
    songQueueList.innerHTML = '';
    
    if (songQueue.length === 0) {
        songQueueList.innerHTML = '<p class="empty-message">신청곡이 없습니다</p>';
        return;
    }
    
    // 신청곡 리스트 생성
    songQueue.forEach((song, index) => {
        const songItem = document.createElement('div');
        songItem.className = `song-item priority-${song.priority}`;
        songItem.dataset.songId = song.id;
        
        // 우선순위 배지
        let priorityBadge = '';
        if (song.priority === 'vip') {
            priorityBadge = '<span class="song-priority vip">VIP</span>';
        } else if (song.priority === 'high') {
            priorityBadge = '<span class="song-priority high">HIGH</span>';
        } else {
            priorityBadge = '<span class="song-priority normal">NORMAL</span>';
        }
        
        // 다음 신청 가능 시간 계산
        const nextRequestTime = song.requestTime + 1800000; // 30분 후
        const timeLeft = Math.max(0, Math.ceil((nextRequestTime - Date.now()) / 60000));
        const timeLeftText = timeLeft > 0 ? `다음 신청: ${timeLeft}분 후` : '신청 가능';
        
        songItem.innerHTML = `
            <div class="song-info">
                <div class="song-title">
                    ${index + 1}. ${song.title} - ${song.artist}
                    ${priorityBadge}
                </div>
                <div class="song-requester">신청: @${song.requester} (Lv.${song.level})</div>
                <div class="song-time-left">${timeLeftText}</div>
            </div>
            <div class="song-actions">
                <div class="song-order-btns">
                    <button class="btn-order" onclick="moveSongUp(${index})" ${index === 0 ? 'disabled' : ''}>▲</button>
                    <button class="btn-order" onclick="moveSongDown(${index})" ${index === songQueue.length - 1 ? 'disabled' : ''}>▼</button>
                </div>
                <button class="btn-song-play" onclick="playSongAtIndex(${index})" title="재생">
                    ▶️
                </button>
                <button class="btn-song-open" onclick="openYouTubeSong('${song.videoId}', '${song.title}', '${song.artist}')" title="브라우저에서 열기">
                    🔗
                </button>
                <button class="btn-song-remove" onclick="removeSong(${song.id})" title="삭제">
                    ❌
                </button>
            </div>
        `;
        
        songQueueList.appendChild(songItem);
    });
}

// 특정 인덱스의 곡 재생 (재생하면 리스트에서 자동 삭제)
function playSongAtIndex(index) {
    if (index < 0 || index >= songQueue.length) return;
    
    const song = songQueue[index];
    // autoplay=0: 자동 재생 방지 (다음 곡 자동 재생 안 됨)
    const youtubeUrl = `https://www.youtube.com/watch?v=${song.videoId}&autoplay=0`;
    window.tikfind.openYouTube(youtubeUrl);
    
    // 재생한 곡을 리스트에서 삭제
    songQueue.splice(index, 1);
    
    // 현재 재생 중인 곡 인덱스 조정
    if (index === currentPlayingIndex) {
        currentPlayingIndex = -1;
    } else if (index < currentPlayingIndex) {
        currentPlayingIndex--;
    }
    
    updateSongQueueUI();
    console.log('▶️ 재생 + 리스트에서 삭제:', song.title, '-', song.artist);
}

// 전체 재생 (첫 곡부터)
function playAllSongs() {
    if (songQueue.length === 0) {
        alert('재생할 신청곡이 없습니다');
        return;
    }
    
    playSongAtIndex(0);
    console.log('▶️ 전체 재생 시작');
}

// 재생 중지
function stopAllSongs() {
    currentPlayingIndex = -1;
    updateSongQueueUI();
    console.log('⏹️ 재생 중지');
}

// YouTube 링크 외부 브라우저에서 열기 (삭제하지 않음)
function openYouTubeSong(videoId, title, artist) {
    // autoplay=0: 자동 재생 방지 (다음 곡 자동 재생 안 됨)
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}&autoplay=0`;
    window.tikfind.openYouTube(youtubeUrl);
    console.log('🔗 외부 브라우저 열기:', title, '-', artist);
}

// 순서 위로 이동
function moveSongUp(index) {
    if (index > 0) {
        const temp = songQueue[index];
        songQueue[index] = songQueue[index - 1];
        songQueue[index - 1] = temp;
        updateSongQueueUI();
        console.log('⬆️ 순서 변경:', temp.title);
    }
}

// 순서 아래로 이동
function moveSongDown(index) {
    if (index < songQueue.length - 1) {
        const temp = songQueue[index];
        songQueue[index] = songQueue[index + 1];
        songQueue[index + 1] = temp;
        updateSongQueueUI();
        console.log('⬇️ 순서 변경:', temp.title);
    }
}

// 스트리머가 직접 신청곡 추가 (YouTube 자동 검색)
async function streamerAddSong() {
    const songInput = document.getElementById('streamerSongInput');
    const searchText = songInput.value.trim();
    
    if (!searchText) {
        alert('노래 제목과 가수를 입력해주세요\n예: Dynamite BTS');
        return;
    }
    
    // 제목과 가수 분리 (마지막 단어를 가수로 가정)
    const parts = searchText.split(' ');
    const artist = parts.pop() || 'Unknown';
    const title = parts.join(' ') || searchText;
    
    console.log('🔍 YouTube 검색 중:', title, '-', artist);
    
    // 버튼 비활성화 및 로딩 표시
    const addBtn = document.getElementById('streamerAddBtn');
    const originalText = addBtn.textContent;
    addBtn.disabled = true;
    addBtn.textContent = '🔍 검색 중...';
    
    try {
        // 서버에 YouTube 검색 요청
        const response = await fetch('https://tikfind.kr/api/youtube/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, artist })
        });
        
        const data = await response.json();
        
        if (!data.success || !data.videoId) {
            alert('YouTube에서 노래를 찾을 수 없습니다.\n다른 검색어로 시도해주세요.');
            return;
        }
        
        // 스트리머 신청곡은 VIP 우선순위로 추가 (30분 제한 없음)
        const song = {
            title: title,
            artist: artist,
            videoId: data.videoId,
            requester: 'STREAMER',
            level: 99,
            isVip: true,
            priority: 'vip',
            requestTime: Date.now(),
            id: Date.now() + Math.random()
        };
        
        songQueue.unshift(song); // 맨 앞에 추가
        updateSongQueueUI();
        
        // 입력창 초기화
        songInput.value = '';
        
        console.log('✅ 스트리머 신청곡 추가:', title, '-', artist, '(Video ID:', data.videoId + ')');
        
    } catch (error) {
        console.error('❌ YouTube 검색 오류:', error);
        alert('YouTube 검색 중 오류가 발생했습니다.\n서버가 실행 중인지 확인해주세요.');
    } finally {
        // 버튼 복원
        addBtn.disabled = false;
        addBtn.textContent = originalText;
    }
}

// 신청곡 제거
function removeSong(songId) {
    const index = songQueue.findIndex(s => s.id === songId);
    if (index !== -1) {
        const removedSong = songQueue[index];
        songQueue.splice(index, 1);
        
        // 현재 재생 중인 곡 인덱스 조정
        if (index === currentPlayingIndex) {
            currentPlayingIndex = -1;
        } else if (index < currentPlayingIndex) {
            currentPlayingIndex--;
        }
        
        console.log('🗑️ 신청곡 제거:', removedSong.title, '-', removedSong.artist);
        updateSongQueueUI();
    }
}

// 전체 삭제
function clearAllSongs() {
    if (songQueue.length === 0) return;
    
    if (confirm(`총 ${songQueue.length}곡을 모두 삭제하시겠습니까?`)) {
        songQueue = [];
        currentPlayingIndex = -1;
        songRequestHistory = {};
        updateSongQueueUI();
        console.log('🗑️ 전체 삭제 완료');
    }
}

// 신청곡 검색
function searchSongs() {
    const searchInput = document.getElementById('songSearchInput');
    const searchText = searchInput.value.toLowerCase().trim();
    
    if (!searchText) {
        // 검색어가 없으면 전체 표시
        updateSongQueueUI();
        return;
    }
    
    // 검색 필터링
    const songQueueList = document.getElementById('songQueueList');
    songQueueList.innerHTML = '';
    
    let foundCount = 0;
    songQueue.forEach((song, index) => {
        const searchTarget = `${song.title} ${song.artist} ${song.requester}`.toLowerCase();
        
        if (searchTarget.includes(searchText)) {
            foundCount++;
            const songItem = document.createElement('div');
            songItem.className = `song-item priority-${song.priority}`;
            
            // 검색어 하이라이트
            const highlightText = (text) => {
                const regex = new RegExp(`(${searchText})`, 'gi');
                return text.replace(regex, '<mark style="background: #f59e0b; color: #000; padding: 2px 4px; border-radius: 2px;">$1</mark>');
            };
            
            songItem.innerHTML = `
                <div class="song-info">
                    <div class="song-title">
                        ${index + 1}. ${highlightText(song.title)} - ${highlightText(song.artist)}
                    </div>
                    <div class="song-requester">신청: @${highlightText(song.requester)}</div>
                </div>
                <div class="song-actions">
                    <button class="btn-song-play" onclick="playSongAtIndex(${index})">▶️</button>
                    <button class="btn-song-open" onclick="openYouTubeSong('${song.videoId}', '${song.title}', '${song.artist}')">🔗</button>
                    <button class="btn-song-remove" onclick="removeSong(${song.id})">❌</button>
                </div>
            `;
            
            songQueueList.appendChild(songItem);
        }
    });
    
    if (foundCount === 0) {
        songQueueList.innerHTML = '<p class="empty-message">검색 결과가 없습니다</p>';
    }
    
    console.log(`🔍 검색: "${searchText}" - ${foundCount}곡 발견`);
}

// 재생 목록 내보내기 (JSON)
function exportPlaylist() {
    if (songQueue.length === 0) {
        alert('내보낼 신청곡이 없습니다');
        return;
    }
    
    const playlist = {
        exportDate: new Date().toISOString(),
        totalSongs: songQueue.length,
        songs: songQueue.map(song => ({
            title: song.title,
            artist: song.artist,
            videoId: song.videoId,
            requester: song.requester,
            priority: song.priority
        }))
    };
    
    const jsonStr = JSON.stringify(playlist, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `tikfind-playlist-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    console.log('💾 재생 목록 저장 완료:', songQueue.length, '곡');
}

// 테스트용 신청곡 추가 함수
function addTestSongRequest() {
    // 테스트 신청곡 5개 추가 (우선순위 다양하게)
    addSongToQueue('Dynamite', 'BTS', 'gdZLi9oWNZg', 'vip_user', 15, true); // VIP
    addSongToQueue('롤린', '브레이브걸스', '_eCJOj4NLlg', 'high_user', 12, false); // High
    addSongToQueue('How You Like That', 'BLACKPINK', 'ioNng23DkIM', 'normal_user1', 5, false); // Normal
    addSongToQueue('Permission to Dance', 'BTS', 'CmuYC79OYcI', 'normal_user2', 3, false); // Normal
    addSongToQueue('Next Level', 'aespa', '4TWR90KJl84', 'high_user2', 10, false); // High
    
    console.log('✅ 테스트 신청곡 5개 추가 (우선순위별 정렬)');
}

// 테스트용 AI 발음 코치 추가 함수
function addTestAICoach() {
    const aiCoachMessages = document.getElementById('aiCoachMessages');
    
    // 요소가 없으면 함수 종료
    if (!aiCoachMessages) {
        console.log('⚠️ aiCoachMessages 요소를 찾을 수 없습니다');
        return;
    }
    
    // 빈 메시지 제거
    const emptyMessage = aiCoachMessages.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    // AI 발음 코치 메시지 생성
    const coachItem = document.createElement('div');
    coachItem.className = 'ai-coach-item';
    coachItem.innerHTML = `
        <div class="ai-original">원본: HI (안녕)</div>
        <div class="ai-response">답변: Nice to meet you (만나서 반가워)</div>
        <div class="ai-pronunciation">발음: 나이스 투 밋 유</div>
    `;
    
    aiCoachMessages.appendChild(coachItem);
    console.log('✅ 테스트 AI 발음 코치 추가');
}

// 테스트 데이터는 플레이어 준비 완료 후 onPlayerReady에서 추가됨
