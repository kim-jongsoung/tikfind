# TikFind 개발 TODO (2024-12-29)

## ✅ 완료된 작업

### 1. Python TikTok Live Collector 구현 ✅
**목표**: PC에서 TikTok Live 데이터 수집하여 서버로 전송

#### 완료 항목:
- ✅ `python/tiktok_collector.py` 작성
- ✅ TikTokLive 라이브러리 사용
- ✅ 비동기 HTTP 통신 (aiohttp)
- ✅ 채팅, 시청자 수, 선물 데이터 수집
- ✅ 서버 API로 실시간 전송

### 2. Node.js 서버 API 엔드포인트 추가 ✅
**목표**: Python에서 전송된 데이터 수신 및 처리

#### 완료 항목:
- ✅ POST `/api/live/status` - 방송 상태
- ✅ POST `/api/live/chat` - 채팅 메시지
- ✅ POST `/api/live/viewers` - 시청자 수
- ✅ POST `/api/live/gift` - 선물
- ✅ AI 번역 + 추천 답변 + 발음 가이드 통합
- ✅ 신청곡 자동 파싱
- ✅ Socket.io 실시간 브로드캐스트

### 3. 웹 대시보드 구현 ✅
**목표**: 실시간 데이터 표시

#### 완료 항목:
- ✅ `public/live-dashboard.html` 작성
- ✅ 사용자 정보 표시
- ✅ Python 명령어 자동 생성 및 복사 기능
- ✅ 실시간 채팅 표시
- ✅ AI 응답 표시
- ✅ 신청곡 큐 관리
- ✅ 방송 상태 및 시청자 수 표시

---

## 🎯 남은 작업

### 1. Python 설치 및 테스트 ⭐⭐⭐
**목표**: 로컬 환경에서 Python Collector 테스트

#### 필요한 작업:
- [ ] TikTok Developer 계정 생성 및 앱 등록
  - https://developers.tiktok.com/
  - Client Key, Client Secret 발급
  - Redirect URI: `http://localhost:3001/auth/tiktok/callback` (개발)
  - Redirect URI: `https://your-domain.railway.app/auth/tiktok/callback` (배포)

- [ ] `passport-tiktok` 또는 수동 OAuth 구현
  ```bash
  npm install passport-tiktok
  ```

- [ ] `config/passport.js`에 TikTok 전략 추가
  ```javascript
  const TikTokStrategy = require('passport-tiktok').Strategy;
  
  passport.use(new TikTokStrategy({
      clientID: process.env.TIKTOK_CLIENT_KEY,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
      callbackURL: process.env.TIKTOK_CALLBACK_URL,
      scope: ['user.info.basic', 'video.list']
  }, async (accessToken, refreshToken, profile, done) => {
      // 사용자 정보 저장 + 세션 ID 저장
  }));
  ```

- [ ] User 모델에 `tiktokSessionId` 필드 추가
  ```javascript
  tiktokSessionId: { type: String, default: '' }
  ```

---

### 2. 테스트 라이브 페이지와 로그인 연동 ⭐⭐
**목표**: 로그인한 사용자의 TikTok ID를 자동으로 가져와서 Live 연결

#### 필요한 작업:
- [ ] `/test-live.html` 페이지에서 현재 로그인한 사용자 정보 가져오기
  ```javascript
  // 페이지 로드 시 사용자 정보 가져오기
  const response = await fetch('/api/current_user');
  const { user } = await response.json();
  
  if (user && user.tiktokId) {
      document.getElementById('tiktok-username').value = user.tiktokId;
      // 자동으로 Live 시작 버튼 활성화
  }
  ```

- [ ] TikTok Live 연결 시 저장된 세션 ID 사용
  ```javascript
  // services/TikTokLiveService.js
  this.connection = new WebcastPushConnection(this.username, {
      sessionId: userTiktokSessionId, // DB에서 가져온 세션 ID
      enableExtendedGiftInfo: true
  });
  ```

---

### 3. 봇 차단 방지 테스트 ⭐⭐⭐
**목표**: TikTok 세션 ID 사용으로 안정적인 연결 확인

#### 테스트 시나리오:
- [ ] TikTok 로그인 후 세션 ID 저장 확인
- [ ] 테스트 페이지에서 자동으로 TikTok ID 입력 확인
- [ ] Live 시작 버튼 클릭 시 연결 성공 확인
- [ ] 실시간 채팅 메시지 수신 확인
- [ ] 외국어 메시지 번역 + 추천 답변 + 발음 가이드 확인
- [ ] 신청곡 자동 파싱 확인
- [ ] 30분 이상 안정적인 연결 유지 확인

---

### 4. Railway 배포 준비 ⭐
**목표**: 실제 도메인으로 배포하여 TikTok OAuth 정식 등록

#### 필요한 작업:
- [ ] GitHub 저장소 생성
  ```bash
  git init
  git add .
  git commit -m "Initial commit - TikFind v1.0"
  git remote add origin https://github.com/your-username/tikfind.git
  git push -u origin main
  ```

- [ ] Railway 프로젝트 생성 및 배포
  - GitHub 저장소 연동
  - 환경 변수 설정 (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET 추가)

- [ ] 배포 후 도메인 확인 및 TikTok Developer 앱 업데이트
  - Redirect URI를 실제 도메인으로 변경

---

## 📋 환경 변수 (.env)

배포 시 추가해야 할 환경 변수:

```env
# TikTok OAuth
TIKTOK_CLIENT_KEY=your-tiktok-client-key
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret
TIKTOK_CALLBACK_URL=https://your-domain.railway.app/auth/tiktok/callback
```

---

## 🎯 최종 목표

1. ✅ TikTok 로그인으로 사용자 인증
2. ✅ 자동으로 세션 ID 획득 및 저장
3. ✅ 테스트 페이지에서 원클릭으로 Live 연결
4. ✅ 봇 차단 없이 안정적인 연결
5. ✅ 외국어 자동 번역 + 추천 답변 + 발음 가이드
6. ✅ 신청곡 자동 파싱 및 큐 관리
7. ✅ Railway 배포 완료

---

## 🔧 기술 스택

- **Backend**: Node.js, Express.js
- **Database**: MongoDB (Railway)
- **Authentication**: Passport.js (TikTok OAuth)
- **Real-time**: Socket.io
- **AI**: OpenAI GPT-3.5-turbo
- **TikTok Live**: tiktok-live-connector
- **Deployment**: Railway

---

## 📝 참고 링크

- TikTok Developer: https://developers.tiktok.com/
- TikTok Login Kit: https://developers.tiktok.com/doc/login-kit-web
- Railway Docs: https://docs.railway.app/
- tiktok-live-connector: https://github.com/zerodytrash/TikTok-Live-Connector

---

## ⚠️ 주의사항

1. **TikTok 세션 ID는 민감한 정보**
   - 암호화하여 저장
   - HTTPS 사용 필수

2. **TikTok API Rate Limit**
   - 과도한 요청 방지
   - 적절한 캐싱 전략

3. **개인정보 보호**
   - GDPR, 개인정보보호법 준수
   - 사용자 동의 필수

---

**작성일**: 2024-12-29  
**작성자**: Cascade AI  
**프로젝트**: TikFind v1.0
