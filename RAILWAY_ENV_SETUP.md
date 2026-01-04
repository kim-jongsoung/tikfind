# Railway 환경 변수 설정 가이드 (tickfind.kr)

## 🔐 API 키 보안 처리 방법

### ✅ 안전한 방법: Railway 환경 변수 사용

**중요:** `.env` 파일은 Git에 커밋하지 않습니다!
- `.gitignore`에 `.env`가 이미 추가되어 있음
- 로컬 개발용으로만 사용
- Railway에는 환경 변수로 직접 설정

---

## 🚀 Railway 환경 변수 설정 단계

### 1. Railway 대시보드 접속
1. https://railway.app 로그인
2. TikFind 프로젝트 선택
3. **Variables** 탭 클릭

### 2. 환경 변수 추가

다음 변수들을 **하나씩** 추가하세요:

#### 필수 환경 변수

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

# OpenAI API (실제 키로 교체 필요)
OPENAI_API_KEY=sk-proj-your-actual-key-here
```

#### 선택 환경 변수 (차후 추가)

```bash
# YouTube API (신청곡 기능 사용 시)
YOUTUBE_API_KEY=your_actual_youtube_api_key

# Spotify API (차후 추가 시)
SPOTIFY_CLIENT_ID=your_actual_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_actual_spotify_client_secret
```

---

## 📝 환경 변수 추가 방법

### Railway 대시보드에서:

1. **Variables** 탭 클릭
2. **New Variable** 버튼 클릭
3. 변수 이름 입력 (예: `OPENAI_API_KEY`)
4. 변수 값 입력 (실제 API 키)
5. **Add** 버튼 클릭
6. 모든 변수 추가 완료 후 **Deploy** 버튼 클릭

---

## 🔑 API 키 확인 방법

### OpenAI API 키
1. https://platform.openai.com/api-keys
2. 로그인
3. "Create new secret key" 클릭
4. 키 복사 (한 번만 표시됨!)
5. Railway에 `OPENAI_API_KEY`로 추가

### YouTube API 키 (선택)
1. https://console.cloud.google.com
2. "YouTube Data API v3" 활성화
3. "사용자 인증 정보" > "API 키 만들기"
4. 키 복사
5. Railway에 `YOUTUBE_API_KEY`로 추가

---

## ⚠️ 보안 주의사항

### ❌ 절대 하지 말 것
```bash
# Git에 커밋하지 마세요!
git add .env
git commit -m "Add API keys"  # ❌ 위험!
```

### ✅ 올바른 방법
```bash
# .env는 로컬에서만 사용
# Railway에는 환경 변수로 직접 설정
# Git에는 .env.example만 커밋
git add .env.example
git commit -m "Update environment example"  # ✅ 안전
```

---

## 🔄 환경 변수 변경 시

Railway에서 환경 변수를 변경하면:
1. 자동으로 재배포됨
2. 약 2-3분 소요
3. 배포 로그에서 확인 가능

---

## 🧪 테스트 방법

### 로컬 테스트
```bash
# .env 파일 생성 (로컬용)
cp .env.example .env

# 실제 API 키로 수정
# OPENAI_API_KEY=sk-proj-실제키...

# 서버 시작
npm start
```

### 프로덕션 테스트
```bash
# Railway 배포 후
# https://tickfind.kr 접속
# 기능 테스트
```

---

## 📊 현재 설정 상태

```
✅ .gitignore에 .env 추가됨
✅ .env.example에 tickfind.kr 도메인 설정
✅ Railway 환경 변수 가이드 작성 완료
⏳ Railway에 환경 변수 추가 필요
⏳ Google OAuth 콜백 URL 업데이트 필요
```

---

## 🆘 문제 해결

### "API key not found" 에러
**원인:** Railway 환경 변수가 설정되지 않음
**해결:** Railway Variables 탭에서 API 키 추가

### "Invalid API key" 에러
**원인:** API 키가 잘못되었거나 만료됨
**해결:** API 키 재발급 후 Railway에서 업데이트

### 환경 변수 변경이 적용 안 됨
**원인:** 재배포가 필요함
**해결:** Railway에서 "Deploy" 버튼 클릭
