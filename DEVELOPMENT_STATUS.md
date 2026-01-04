# TikFind 개발 현황 (2024-12-29)

## ✅ 완료된 작업

### 1. 서버 측 핵심 기능
- **AI 발음 코치 서비스** (`services/PronunciationCoachService.js`)
  - 언어 자동 감지 (OpenAI GPT-3.5)
  - 외국어 메시지 → 스트리머 언어로 발음 안내
  - 빠른 응답 시스템 (자주 사용되는 인사말)
  - OpenAI GPT-4 활용 발음 가이드 생성

- **신청곡 관리 서비스** (`services/SongRequestService.js`)
  - `#노래제목#가수이름` 형식 파싱
  - YouTube Data API 자동 검색
  - 우선순위 시스템 (VIP > 레벨 > 일반)
  - 신청자 재실 확인 및 자동 스킵
  - 신청곡 큐 관리 (추가/삭제/순서변경)

- **서버 API 엔드포인트**
  - `POST /api/live/chat` - 채팅 + AI 발음 코치 + 신청곡 파싱
  - `POST /api/live/status` - 방송 상태
  - `POST /api/live/viewers` - 시청자 수
  - `POST /api/live/gift` - 선물
  - `GET /api/song-queue/:userId` - 신청곡 큐 조회
  - `POST /api/song-queue/remove` - 신청곡 삭제
  - `POST /api/song-queue/played` - 재생 완료
  - `POST /api/song-queue/move` - 순서 변경

### 2. Desktop App 수정
- `collector.js`: uniqueId, badges 정보 서버 전송 추가
- TikTok Live 데이터 수집 (채팅, 선물, 시청자, 좋아요)
- TTS 기능 (say 라이브러리)

### 3. 웹 시스템 (기존 활용)
- Google OAuth 로그인
- 관리자 시스템
- 사용자 관리
- 대시보드 페이지

---

## 🔄 진행 중

### Desktop App UI 개선
- 로그인 화면 추가 필요
- 메인 대시보드 UI 개선
- AI 발음 코치 표시
- 신청곡 큐 UI

---

## 📝 다음 단계

### 1. 구독 확인 미들웨어
```javascript
// 모든 API에 적용
const checkSubscription = async (req, res, next) => {
    const { userId } = req.body;
    const user = await User.findById(userId);
    
    if (!user.subscription || user.subscription.status !== 'active') {
        return res.status(403).json({ 
            error: 'SUBSCRIPTION_REQUIRED' 
        });
    }
    
    next();
};
```

### 2. Desktop App UI 구현
- 로그인 화면 (Google OAuth)
- 메인 대시보드
- AI 발음 코치 표시
- 신청곡 큐 관리

### 3. 웹 초기 설정 페이지
- TikTok ID 등록
- 언어 선택
- 구독 플랜 선택

### 4. 테스트
- AI 발음 코치 테스트
- 신청곡 시스템 테스트
- 전체 플로우 테스트

---

## 🔑 필요한 API 키

### .env 파일에 추가 필요:
```
OPENAI_API_KEY=your_openai_api_key
YOUTUBE_API_KEY=your_youtube_api_key
```

---

## 📊 시스템 구조

```
Desktop App (Electron)
  ↓ HTTPS POST
TikFind 서버 (Node.js + Express)
  ├─ AI 발음 코치 (OpenAI GPT-4)
  ├─ 신청곡 관리 (YouTube API)
  └─ Socket.io
       ↓
웹 대시보드 (브라우저)
```

---

## 🎯 핵심 기능

### AI 발음 코치
```
시청자: "HI" (영어)
↓
AI 발음 코치:
- 원본: HI (안녕)
- 답변: Nice to meet you (만나서 반가워)
- 발음: 나이스 투 밋 유
```

### 신청곡 시스템
```
시청자: #Dynamite#BTS
↓
1. 파싱: title="Dynamite", artist="BTS"
2. YouTube 검색
3. 우선순위 계산 (VIP/레벨)
4. 큐에 추가
5. 신청자 재실 확인
```

---

## 🔒 보안

### 서버 측 구독 확인
- 모든 API 요청마다 구독 상태 확인
- 만료일 체크
- HWID 바인딩 (선택사항)

### Desktop App 보호
- 코드 난독화 (asar)
- 라이선스 키 시스템
- 서버 측 검증

---

## 📱 사용자 플로우

1. **웹에서 초기 설정 (1회)**
   - Google 로그인
   - TikTok ID 등록
   - 언어 선택
   - 구독 플랜 선택

2. **Desktop App 사용**
   - Google 로그인
   - 모든 설정 자동 로드
   - TikTok Live 연결
   - 실시간 채팅 + AI 발음 코치
   - 신청곡 관리
