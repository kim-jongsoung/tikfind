# TikFind Desktop App 개발 계획

## 🎯 목표

**로컬 PC에서 TikTok Live 데이터를 수집하여 웹 대시보드로 전송하는 Desktop Application**

---

## 🏗️ 기술 스택

### **Desktop App:**
- **Electron** - Windows/Mac 크로스 플랫폼
- **Node.js** - 백엔드 로직
- **TikTokLive** - TikTok Live 데이터 수집
- **WebSocket (ws)** - 로컬 서버

### **통신 구조:**
```
[TikFind Desktop App]
    ↓
TikTokLive 라이브러리
    ↓
TikTok Live 데이터 수집
    ↓
로컬 WebSocket 서버 (ws://localhost:8082)
    ↓
[웹 대시보드] (브라우저)
    ↓
TikFind 서버 (Railway) - AI 처리
```

---

## 📦 프로젝트 구조

```
tikfind-desktop/
├── package.json
├── main.js                 # Electron 메인 프로세스
├── preload.js             # Preload 스크립트
├── renderer/
│   ├── index.html         # Desktop App UI
│   ├── style.css
│   └── renderer.js        # 렌더러 프로세스
├── src/
│   ├── collector.js       # TikTok Live 데이터 수집
│   ├── websocket.js       # 로컬 WebSocket 서버
│   └── tts.js            # TTS 기능
└── build/                 # 빌드 설정
```

---

## 🔄 작동 흐름

### **1. Desktop App 시작**
```
사용자가 Desktop App 실행
    ↓
TikTok 사용자 이름 입력
    ↓
"연결 시작" 버튼 클릭
```

### **2. 데이터 수집**
```
TikTokLive 라이브러리로 연결
    ↓
채팅, 선물, 참여자 수 실시간 수집
    ↓
로컬 WebSocket 서버로 브로드캐스트
```

### **3. 웹 대시보드 연결**
```
웹 대시보드 열기
    ↓
ws://localhost:8082 연결
    ↓
실시간 데이터 수신
    ↓
TikFind 서버로 전송 (AI 처리)
```

---

## 🛠️ 개발 단계

### **Phase 1: 기본 구조 (1-2일)**
- [x] Electron 프로젝트 초기화
- [ ] TikTokLive 라이브러리 통합
- [ ] 로컬 WebSocket 서버 구현
- [ ] 기본 UI (연결 버튼, 상태 표시)

### **Phase 2: 데이터 수집 (1-2일)**
- [ ] 채팅 메시지 수집
- [ ] 선물 데이터 수집
- [ ] 참여자 수 수집
- [ ] 좋아요 수 수집

### **Phase 3: 웹 대시보드 연동 (1일)**
- [ ] WebSocket 클라이언트 (웹 대시보드)
- [ ] 실시간 데이터 표시
- [ ] TikFind 서버 API 연동

### **Phase 4: TTS 기능 (1-2일)**
- [ ] TTS 엔진 통합 (Windows TTS / Google TTS)
- [ ] 채팅 메시지 음성 출력
- [ ] 음성 설정 (속도, 음높이)

### **Phase 5: 배포 (1일)**
- [ ] Windows 빌드 (.exe)
- [ ] Mac 빌드 (.dmg)
- [ ] 자동 업데이트 설정

---

## 📋 필요한 라이브러리

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "tiktoklive": "^6.6.5",
    "ws": "^8.16.0",
    "say": "^0.16.0",
    "electron-updater": "^6.1.7"
  }
}
```

---

## 🎨 Desktop App UI

```
┌─────────────────────────────────────┐
│  TikFind Desktop Collector          │
├─────────────────────────────────────┤
│                                     │
│  TikTok 사용자 이름:                │
│  [________________]                 │
│                                     │
│  상태: ⚫ 연결 안 됨                │
│                                     │
│  [🚀 연결 시작]  [⏹️ 중지]         │
│                                     │
├─────────────────────────────────────┤
│  📊 실시간 통계                     │
│  - 시청자: 0명                      │
│  - 메시지: 0개                      │
│  - 선물: 0개                        │
│                                     │
│  💬 최근 채팅:                      │
│  [채팅 메시지들...]                 │
│                                     │
└─────────────────────────────────────┘
```

---

## 🚀 시작하기

### **1. 프로젝트 생성**
```bash
mkdir tikfind-desktop
cd tikfind-desktop
npm init -y
npm install electron tiktoklive ws say
```

### **2. 개발 실행**
```bash
npm run dev
```

### **3. 빌드**
```bash
npm run build
```

---

## ✅ 장점

1. **안정적인 데이터 수집** - TikTok API 직접 사용
2. **로컬 실행** - 서버 없이 PC에서만 작동
3. **모든 데이터 지원** - 채팅, 선물, 참여자, 좋아요
4. **TTS 통합** - 음성 출력 가능
5. **크로스 플랫폼** - Windows/Mac 지원

---

## 📅 예상 일정

- **Phase 1-2:** 3-4일 (기본 구조 + 데이터 수집)
- **Phase 3:** 1일 (웹 대시보드 연동)
- **Phase 4:** 1-2일 (TTS)
- **Phase 5:** 1일 (배포)

**총 6-8일 예상**

---

**지금 바로 시작할까요?** 🚀
