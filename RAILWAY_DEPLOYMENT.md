# Railway 배포 가이드

## 🚀 Railway 환경 변수 설정

Railway 대시보드에서 다음 환경 변수를 설정하세요:

### 필수 환경 변수

```bash
# 환경 설정
NODE_ENV=production
PORT=3001

# 데이터베이스
MONGO_URL=mongodb://mongo:ZQOehPvoqCIOhmLVRILmHrGHfCMUGBBq@gondola.proxy.rlwy.net:46784

# 도메인 설정
FRONTEND_URL=https://tickfind.kr
COOKIE_DOMAIN=.tickfind.kr

# Google OAuth
GOOGLE_CLIENT_ID=50636775590-cqu4f8q1rk2jbidksc10a30se2mbi817.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
SESSION_SECRET=tikfind_global_secret_key_2025

# OpenAI API
OPENAI_API_KEY=sk-proj-your-key-here
```

### 선택 환경 변수 (차후 추가)

```bash
# YouTube API (신청곡 기능 사용 시)
YOUTUBE_API_KEY=your_youtube_api_key

# Spotify API (차후 추가 시)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

---

## 📝 도메인 연결 후 작업

### 1. 환경 변수 설정 완료

Railway에 다음 변수들이 설정되어 있는지 확인:

```bash
FRONTEND_URL=https://tickfind.kr
COOKIE_DOMAIN=.tickfind.kr
```

### 2. Google OAuth 콜백 URL 추가 (필수!)

Google Cloud Console (https://console.cloud.google.com):
1. API 및 서비스 > 사용자 인증 정보
2. OAuth 2.0 클라이언트 ID 선택
3. 승인된 리디렉션 URI에 추가:
   - `https://tickfind.kr/auth/google/callback`
   - `http://localhost:3001/auth/google/callback` (개발용 유지)

### 3. Railway 재배포

환경 변수 변경 후 자동으로 재배포됩니다.

---

## 🔧 Railway 설정

### Custom Domain 추가

1. Railway 프로젝트 > Settings > Domains
2. "Add Custom Domain" 클릭
3. 도메인 입력 (예: tikfind.com)
4. DNS 설정 안내에 따라 도메인 제공업체에서 설정:
   - A 레코드 또는 CNAME 레코드 추가
5. SSL 인증서 자동 발급 대기 (최대 24시간)

### 자동 배포 설정

- GitHub 연동 시 main 브랜치 푸시마다 자동 배포
- 수동 배포: Railway 대시보드에서 "Deploy" 버튼 클릭

---

## 📊 배포 후 확인사항

### 1. 서버 상태 확인
```
✅ 서버 실행 중: https://yourdomain.com
✅ MongoDB 연결 확인
✅ AI 발음 코치 캐시 초기화 확인
```

### 2. 기능 테스트
- [ ] 웹사이트 접속
- [ ] Google 로그인
- [ ] Desktop App 연결
- [ ] AI 발음 코치
- [ ] 신청곡 큐

### 3. 로그 모니터링
Railway 대시보드 > Deployments > View Logs

---

## 🆘 문제 해결

### CORS 에러
```
Access to fetch at 'https://yourdomain.com' from origin 'null' has been blocked by CORS policy
```
**해결:** FRONTEND_URL 환경 변수가 올바르게 설정되었는지 확인

### Google 로그인 실패
```
redirect_uri_mismatch
```
**해결:** Google Cloud Console에서 리디렉션 URI 확인

### 세션 유지 안 됨
**해결:** 
- COOKIE_DOMAIN이 올바르게 설정되었는지 확인
- HTTPS 사용 확인 (프로덕션)

---

## 💰 비용 예상

### Railway
- Hobby Plan: $5/월
- Pro Plan: $20/월 (권장)

### 현재 예상 비용 (사용자 10명 기준)
```
Railway Pro:        $20/월
OpenAI API:         $30/월
YouTube API:         $0/월 (무료 범위)
─────────────────────────
총 비용:            $50/월
```

### 사용자 1000명 시
```
Railway Pro:        $20/월
OpenAI API:         $30/월 (캐싱 적용)
YouTube API:         $0/월 (검색 버튼 방식)
─────────────────────────
총 비용:            $50/월
```
