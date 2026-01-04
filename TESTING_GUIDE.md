# TikFind 테스트 가이드

## 🧪 로컬 테스트 (개발 환경)

### 1. Python 설치 확인
```bash
python --version
pip --version
```

### 2. Python 라이브러리 설치
```bash
cd C:\Users\kim\Desktop\tikfind\python
pip install -r requirements.txt
```

### 3. Node.js 서버 시작
```bash
cd C:\Users\kim\Desktop\tikfind
npm start
```

서버가 실행되면:
```
🚀 TikFind 서버가 포트 3001에서 실행 중입니다.
📍 http://localhost:3001
```

### 4. 웹 대시보드 접속
브라우저에서:
```
http://localhost:3001/live-dashboard.html
```

로그인 후 사용자 ID 확인 (예: `67910a9b3c8e5b001234abcd`)

### 5. Python Collector 실행
새 터미널에서:
```bash
cd C:\Users\kim\Desktop\tikfind\python
python tiktok_collector.py --username YOUR_TIKTOK_ID --server http://localhost:3001 --user-id YOUR_USER_ID
```

**예시:**
```bash
python tiktok_collector.py --username kimjongsoung --server http://localhost:3001 --user-id 67910a9b3c8e5b001234abcd
```

### 6. 테스트 시나리오

#### ✅ 연결 테스트
1. Python Collector 실행
2. 웹 대시보드에서 "🔴 방송 중" 상태 확인
3. 콘솔에 "✅ TikTok Live 연결 성공" 메시지 확인

#### ✅ 채팅 메시지 테스트
1. TikTok Live에서 채팅 입력
2. 웹 대시보드 "실시간 채팅"에 메시지 표시 확인
3. 외국어 메시지의 경우 "AI 자동응답"에 번역 표시 확인

#### ✅ AI 번역 테스트
**한국어 메시지:**
- 입력: "안녕하세요!"
- 예상: AI 응답 없음 (한국어는 무시)

**영어 메시지:**
- 입력: "Hello! I love this song!"
- 예상: AI 응답 표시
  ```
  📝 AI 번역: "안녕하세요! 이 노래 너무 좋아요!"
  💬 AI 추천 답변: "감사합니다! 더 좋은 노래 들려드릴게요! 🎵"
  🗣️ 발음 가이드: "헬로우! 아이 러브 디스 송!"
  ```

**베트남어 메시지:**
- 입력: "Xin chào! Bạn khỏe không?"
- 예상: AI 응답 표시
  ```
  📝 AI 번역: "안녕하세요! 잘 지내세요?"
  💬 AI 추천 답변: "반가워요! 저도 잘 지내요! 😊"
  🗣️ 발음 가이드: "신 짜오! 반 쿠에 콩?"
  ```

#### ✅ 신청곡 테스트
**신청곡 메시지:**
- 입력: "신청곡: 아이유 - 좋은날"
- 예상: 신청곡 큐에 추가됨

**영어 신청곡:**
- 입력: "song: BTS - Dynamite"
- 예상: 신청곡 큐에 추가됨

#### ✅ 시청자 수 테스트
- TikTok Live 시청자 수 변화 시
- 웹 대시보드 "시청자 수" 실시간 업데이트 확인

---

## 🚀 배포 후 테스트 (Railway)

### 1. Railway 배포 확인
```
https://tikfind-production.up.railway.app
```

### 2. 웹 대시보드 접속
```
https://tikfind-production.up.railway.app/live-dashboard.html
```

### 3. Python Collector 실행 (배포 서버 사용)
```bash
python tiktok_collector.py --username YOUR_TIKTOK_ID --server https://tikfind-production.up.railway.app --user-id YOUR_USER_ID
```

### 4. 동일한 테스트 시나리오 반복

---

## 🐛 문제 해결

### Python Collector 연결 실패
**증상:** "❌ TikTok Live 연결 실패"

**해결:**
1. TikTok 사용자 이름 확인 (@ 제외)
2. 실제로 라이브 방송 중인지 확인
3. 인터넷 연결 확인

### 서버 전송 실패
**증상:** "❌ 서버 전송 실패"

**해결:**
1. 서버 URL 확인
2. 서버가 실행 중인지 확인
3. 방화벽 설정 확인

### AI 응답 없음
**증상:** 외국어 메시지인데 AI 응답이 없음

**해결:**
1. OpenAI API 키 확인
2. 서버 콘솔에서 오류 메시지 확인
3. API 크레딧 잔액 확인

### 웹 대시보드 연결 안 됨
**증상:** "로그인이 필요합니다" 메시지

**해결:**
1. Google 로그인 확인
2. 쿠키 및 세션 확인
3. 브라우저 캐시 삭제

---

## 📊 성능 테스트

### 동시 접속 테스트
- 여러 사용자가 동시에 Python Collector 실행
- 각 사용자의 웹 대시보드에 독립적으로 데이터 표시 확인

### 장시간 연결 테스트
- 30분 이상 연속 방송
- 메모리 누수 없는지 확인
- 연결 안정성 확인

### 대량 메시지 테스트
- 초당 10개 이상의 채팅 메시지
- AI 응답 지연 시간 확인
- 서버 부하 확인

---

## ✅ 테스트 체크리스트

- [ ] Python 설치 및 라이브러리 설치
- [ ] Node.js 서버 시작
- [ ] 웹 대시보드 접속 및 로그인
- [ ] Python Collector 연결 성공
- [ ] 한국어 메시지 (AI 응답 없음)
- [ ] 영어 메시지 (AI 번역 + 추천 답변 + 발음 가이드)
- [ ] 베트남어 메시지 (AI 번역 + 추천 답변 + 발음 가이드)
- [ ] 신청곡 파싱 및 큐 추가
- [ ] 시청자 수 실시간 업데이트
- [ ] 선물 수신 표시
- [ ] 30분 이상 안정적인 연결
- [ ] 여러 사용자 동시 접속

---

**테스트 완료 후 배포 진행!** 🚀
