# 📚 신청곡 DB 자동 수집 시스템

## 🎯 목적
YouTube API 비용 절감을 위한 하이브리드 신청곡 시스템
- **DB 우선 검색** (무료, 0.001초)
- **YouTube API 백업** (유료, 필요시만)
- **자동 DB 저장** (다음번엔 무료)

---

## 💰 비용 절감 효과

### 기존 방식 (YouTube API만 사용)
- 1,000명 × 5시간 × 10곡/시간 = 50,000곡/일
- 비용: **$500~1,000/일** ($15K~30K/월)

### 하이브리드 방식 (DB + YouTube API)
- DB에서 90% 처리 (무료)
- YouTube API 10%만 사용
- 비용: **$50~100/일** ($1.5K~3K/월)
- **90% 비용 절감!** ✅

---

## 📅 20일 무료 DB 구축 계획

### YouTube API 무료 할당량
- 하루: 10,000 quota
- 신청곡 1개: 101 quota (검색 100 + 정보 1)
- **하루 99곡까지 무료**

### 수집 계획
```
Day 1-5:   K-POP, 팝 중심 (495곡)
Day 6-10:  발라드, 댄스, R&B (495곡)
Day 11-15: J-POP, 트로트, 힙합 (495곡)
Day 16-20: 글로벌 믹스, 최신곡 (495곡)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
총: 1,980곡 (무료)
```

---

## 🚀 사용 방법

### 1. 매일 자동 수집 실행

```bash
# 수동 실행
node scripts/collectDailySongs.js

# 또는 npm script 사용
npm run collect-songs
```

### 2. 크론잡 설정 (자동화)

**Windows (작업 스케줄러):**
1. 작업 스케줄러 열기
2. 기본 작업 만들기
3. 트리거: 매일 오전 3시
4. 작업: `node C:\Users\kim\Desktop\tikfind\scripts\collectDailySongs.js`

**Linux/Mac (crontab):**
```bash
# crontab -e
0 3 * * * cd /path/to/tikfind && node scripts/collectDailySongs.js
```

### 3. 수집 진행 상황 확인

스크립트 실행 시 자동으로 표시:
```
🚀 매일 자동 수집 시작...
📅 날짜: 2026-01-15

🎵 KPOP 수집 중...
  🔍 검색: BTS popular songs
  ✅ 저장: Dynamite - BTS
  ...
✅ kpop 완료: 16곡

🎉 수집 완료!
📊 오늘 수집: 99곡
📚 전체 DB: 99곡
📅 예상 완료: 19일 후
```

---

## 📊 DB 스키마

```javascript
{
  number: 1,                    // 곡 번호 (옵션)
  videoId: "gdZLi9oWNZg",       // YouTube 비디오 ID
  title: "Dynamite",            // 곡 제목
  artist: "BTS",                // 가수
  thumbnail: "https://...",     // 썸네일 URL
  genre: "kpop",                // 장르
  country: "KR",                // 국가
  year: 2020,                   // 발매년도
  keywords: [...],              // 검색 키워드
  popularity: 100,              // 인기도
  requestCount: 0,              // 신청 횟수
  lastRequestedAt: Date,        // 마지막 신청 시간
  source: "auto",               // 수집 방법
  isActive: true                // 활성 상태
}
```

---

## 🔧 설정

### 환경 변수 (.env)
```
YOUTUBE_API_KEY=your_youtube_api_key
MONGODB_URI=your_mongodb_connection_string
```

### 수집 설정 (collectDailySongs.js)
```javascript
const DAILY_QUOTA_LIMIT = 99;  // 하루 수집 곡 수

const genreSearchTerms = {
  kpop: [...],   // K-POP 검색 키워드
  pop: [...],    // 팝 검색 키워드
  // 원하는 장르 추가
};
```

---

## 📈 통계 확인

### MongoDB에서 직접 확인
```javascript
// 전체 곡 수
db.popularsongs.countDocuments()

// 장르별 곡 수
db.popularsongs.aggregate([
  { $group: { _id: "$genre", count: { $sum: 1 } } }
])

// 인기곡 Top 10
db.popularsongs.find().sort({ requestCount: -1 }).limit(10)
```

---

## ⚠️ 주의사항

1. **API 키 보안**: .env 파일을 git에 커밋하지 마세요
2. **할당량 초과**: 하루 99곡 이상 수집하지 마세요
3. **중복 체크**: 스크립트가 자동으로 중복 체크하지만, 수동 추가 시 주의
4. **삭제된 영상**: 주기적으로 삭제된 영상 확인 필요

---

## 🎵 시청자 신청 방식

### 현재 지원하는 형식
```
#노래제목#가수이름
예: #Dynamite#BTS
```

### 작동 방식
1. DB에서 먼저 검색 (무료)
2. DB에 있으면 즉시 추가
3. DB에 없으면 YouTube API 검색 (유료)
4. 검색 결과를 DB에 자동 저장 (다음번엔 무료)

---

## 📞 문제 해결

### 수집이 안될 때
1. YouTube API 키 확인
2. MongoDB 연결 확인
3. 할당량 초과 확인 (Google Cloud Console)

### DB 연결 오류
```bash
# MongoDB 연결 테스트
node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('OK'))"
```

---

## 🎉 완료 후

20일 후 1,980곡 수집 완료 시:
1. 크론잡 중지 (또는 주 1회로 변경)
2. 서비스 시작
3. 시청자 신청으로 자연스럽게 DB 확장
4. 1개월 후 5,000~10,000곡 예상

**비용: 90% 절감!** ✅
