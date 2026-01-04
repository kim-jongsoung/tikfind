# TikFind 배포 체크리스트

## 📋 배포 전 준비사항

### 1. 도메인 설정 (사용자 작업)
- [ ] 도메인 구매 완료
- [ ] Railway에 도메인 연결
- [ ] DNS 설정 완료 (A 레코드 또는 CNAME)
- [ ] SSL 인증서 자동 발급 확인

### 2. 환경 변수 설정 (Railway)

#### 필수 환경 변수
```
MONGO_URL=mongodb://mongo:ZQOehPvoqCIOhmLVRILmHrGHfCMUGBBq@gondola.proxy.rlwy.net:46784
GOOGLE_CLIENT_ID=50636775590-cqu4f8q1rk2jbidksc10a30se2mbi817.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
SESSION_SECRET=tikfind_global_secret_key_2025
OPENAI_API_KEY=sk-proj-...
NODE_ENV=production
PORT=3001
```

#### 선택 환경 변수
```
YOUTUBE_API_KEY=your_youtube_api_key (차후 추가)
SPOTIFY_CLIENT_ID=your_spotify_client_id (차후 추가)
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret (차후 추가)
```

### 3. Google OAuth 설정 업데이트

#### Google Cloud Console
- [ ] https://console.cloud.google.com 접속
- [ ] OAuth 2.0 클라이언트 ID 설정
- [ ] 승인된 리디렉션 URI 추가:
  - `https://yourdomain.com/auth/google/callback`
  - `http://localhost:3001/auth/google/callback` (개발용 유지)

### 4. 코드 수정 필요사항

#### server.js - CORS 설정
```javascript
app.use(cors({
    origin: [
        'https://yourdomain.com',
        'http://localhost:3001'
    ],
    credentials: true
}));
```

#### server.js - 세션 쿠키 설정
```javascript
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // HTTPS에서만 true
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : undefined
    }
}));
```

### 5. Desktop App 설정 업데이트

#### tikfind-desktop/renderer/renderer.js
```javascript
// 서버 URL 환경별 설정
const SERVER_URL = process.env.NODE_ENV === 'production' 
    ? 'https://yourdomain.com' 
    : 'http://localhost:3001';
```

---

## 🚀 배포 순서

### 1단계: 코드 수정
- [ ] CORS 설정 업데이트 (도메인 추가)
- [ ] 세션 쿠키 설정 업데이트
- [ ] Desktop App 서버 URL 설정

### 2단계: Git 푸시
```bash
git add .
git commit -m "Production deployment settings"
git push origin main
```

### 3단계: Railway 배포
- [ ] Railway 대시보드 접속
- [ ] 환경 변수 설정 확인
- [ ] 자동 배포 확인
- [ ] 배포 로그 확인

### 4단계: 도메인 연결
- [ ] Railway에서 Custom Domain 추가
- [ ] DNS 설정 완료 대기 (최대 24시간)
- [ ] SSL 인증서 발급 확인

### 5단계: Google OAuth 업데이트
- [ ] Google Cloud Console에서 리디렉션 URI 추가
- [ ] 변경사항 저장

### 6단계: 테스트
- [ ] 웹사이트 접속 확인 (https://yourdomain.com)
- [ ] Google 로그인 테스트
- [ ] Desktop App 연결 테스트
- [ ] AI 발음 코치 테스트
- [ ] 신청곡 큐 테스트

---

## 🔧 배포 후 작업

### 웹사이트 개선
- [ ] 랜딩 페이지 디자인 개선
- [ ] 기능 소개 페이지
- [ ] 가격 정책 페이지
- [ ] FAQ 페이지

### 관리자 페이지
- [ ] 사용자 목록 조회
- [ ] 구독 상태 관리
- [ ] 사용량 통계
- [ ] 로그 모니터링

### 고객 정보 설정
- [ ] 이용약관 작성
- [ ] 개인정보처리방침 작성
- [ ] 환불 정책 작성
- [ ] 고객 지원 이메일 설정

---

## 📊 모니터링

### Railway 대시보드
- [ ] CPU/메모리 사용량 확인
- [ ] 에러 로그 모니터링
- [ ] API 응답 시간 확인

### MongoDB
- [ ] 데이터베이스 연결 상태
- [ ] 스토리지 사용량
- [ ] 쿼리 성능

### OpenAI API
- [ ] 사용량 모니터링
- [ ] 비용 확인
- [ ] Rate Limit 확인

---

## 🆘 트러블슈팅

### CORS 에러
- 도메인이 CORS 설정에 추가되었는지 확인
- credentials: true 설정 확인

### Google 로그인 실패
- 리디렉션 URI가 정확한지 확인
- HTTPS 사용 확인 (프로덕션)

### Desktop App 연결 실패
- 서버 URL이 올바른지 확인
- CORS 설정 확인

### 세션 유지 안 됨
- 쿠키 설정 확인 (secure, sameSite)
- 도메인 설정 확인

---

## 📞 연락처

- Railway 지원: https://railway.app/help
- Google Cloud 지원: https://cloud.google.com/support
- MongoDB 지원: https://www.mongodb.com/support
