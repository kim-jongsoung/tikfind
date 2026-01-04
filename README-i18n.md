# 🌍 TikFind 다국어 시스템 가이드

## 📋 개요

TikFind는 **자동 번역 시스템**을 사용하여 6개 언어를 지원합니다:
- 🇺🇸 English (en)
- 🇰🇷 한국어 (ko)
- 🇯🇵 日本語 (ja)
- 🇪🇸 Español (es)
- 🇹🇼 繁體中文 (zh-TW)
- 🇻🇳 Tiếng Việt (vi)

## 🚀 사용 방법

### 1️⃣ 새 페이지에 텍스트 추가하기

**영어만 작성하면 됩니다!**

```json
// locales/en.json에 추가
{
  "newPageTitle": "My New Page",
  "newPageDescription": "This is a description"
}
```

### 2️⃣ 자동 번역 실행

```bash
npm run translate
```

이 명령어는:
- ✅ `en.json`을 읽어서
- ✅ 자동으로 5개 언어로 번역
- ✅ `ko.json`, `ja.json`, `es.json`, `zh-TW.json`, `vi.json` 생성

### 3️⃣ i18n.js 업데이트

```bash
npm run update-i18n
```

이 명령어는:
- ✅ `/locales` 폴더의 모든 JSON 파일을 읽어서
- ✅ `public/js/i18n.js` 자동 생성

### 4️⃣ HTML에서 사용

```html
<h1 data-i18n="newPageTitle">My New Page</h1>
<p data-i18n="newPageDescription">This is a description</p>
```

## 🎯 자동 언어 감지

### IP 기반 국가 감지
사용자가 처음 접속하면:
1. **IP 주소로 국가 감지** (ipapi.co 무료 API 사용)
2. 국가에 맞는 언어 자동 설정
3. localStorage에 저장

### 브라우저 언어 Fallback
IP 감지 실패 시:
1. 브라우저 언어 설정 확인
2. 해당 언어로 자동 설정

### 사용자 선택 우선
- 사용자가 언어를 한 번 선택하면
- **localStorage에 영구 저장**
- 다음 방문 시에도 선택한 언어 유지

## 📁 파일 구조

```
tikfind/
├── locales/                    # 번역 파일 (JSON)
│   ├── en.json                # 영어 (마스터)
│   ├── ko.json                # 한국어 (자동 생성)
│   ├── ja.json                # 일본어 (자동 생성)
│   ├── es.json                # 스페인어 (자동 생성)
│   ├── zh-TW.json             # 중국어 번체 (자동 생성)
│   └── vi.json                # 베트남어 (자동 생성)
├── scripts/
│   ├── auto-translate.js      # 자동 번역 스크립트
│   └── update-i18n.js         # i18n.js 업데이트 스크립트
└── public/js/
    └── i18n.js                # 번역 로직 (자동 생성)
```

## 🔧 고급 사용법

### 번역 품질 개선

자동 번역 후 중요한 마케팅 문구는 수동으로 수정:

```json
// locales/ko.json
{
  "heroTitle": "AI 라이브 스트리밍 어시스턴트",  // 자동 번역
  "ctaButton": "지금 무료로 시작하기"           // 수동 수정 (더 자연스럽게)
}
```

수정 후:
```bash
npm run update-i18n  # i18n.js 재생성
```

### 새 언어 추가

1. `scripts/auto-translate.js`의 `LANGUAGES` 객체에 추가
2. `scripts/update-i18n.js`의 `languages` 배열에 추가
3. `npm run translate` 실행

## 🌐 IP 기반 국가 감지 작동 방식

```javascript
// 자동으로 실행됨
detectCountryByIP()
  ↓
IP: 123.45.67.89 → 국가: KR → 언어: ko
  ↓
localStorage.setItem('tikfind_lang', 'ko')
  ↓
페이지 한국어로 표시
```

**지원 국가 매핑**:
- 🇰🇷 KR → ko (한국어)
- 🇯🇵 JP → ja (일본어)
- 🇪🇸 ES, MX, AR → es (스페인어)
- 🇹🇼 TW, HK → zh-TW (중국어 번체)
- 🇻🇳 VN → vi (베트남어)
- 기타 → en (영어)

## ⚡ 워크플로우 예시

### 새 페이지 추가 시

```bash
# 1. 영어 키만 추가
echo '{"newKey": "New Text"}' >> locales/en.json

# 2. 자동 번역
npm run translate

# 3. i18n.js 업데이트
npm run update-i18n

# 4. 서버 재시작
npm start
```

**총 소요 시간**: 약 2-3분 (자동 번역 포함)

## 🎨 번역 팁

### ✅ 좋은 예
```json
{
  "shortKey": "Short text",           // 짧고 명확
  "actionButton": "Click here",       // 동작 명확
  "errorMessage": "Error occurred"    // 간단명료
}
```

### ❌ 나쁜 예
```json
{
  "text1": "This is a very long sentence with multiple clauses and complex grammar that might not translate well automatically",
  "btn": "Click",  // 너무 짧아서 문맥 파악 어려움
}
```

## 🔍 디버깅

### 번역이 안 보이는 경우

1. **브라우저 콘솔 확인**
   ```javascript
   console.log(window.TikFindI18n.currentLang());  // 현재 언어
   console.log(window.TikFindI18n.t('yourKey'));   // 특정 키 번역
   ```

2. **localStorage 확인**
   ```javascript
   localStorage.getItem('tikfind_lang');  // 저장된 언어
   ```

3. **JSON 파일 확인**
   - `locales/` 폴더에 해당 언어 파일 존재하는지
   - 해당 키가 있는지 확인

## 📊 번역 API 정보

**LibreTranslate** (무료 오픈소스)
- URL: https://libretranslate.de
- Rate Limit: 500ms 딜레이 (스크립트에 내장)
- 비용: 무료
- 품질: 80-90% (마케팅 문구는 수동 보정 권장)

## 🚨 주의사항

1. **API Rate Limit**: 자동 번역 시 500ms 딜레이 적용됨
2. **번역 품질**: 자동 번역은 80-90% 정확도, 중요 문구는 수동 확인 필수
3. **특수 문자**: HTML 태그나 변수는 번역되지 않도록 주의
4. **문맥**: 짧은 단어는 문맥 파악이 어려워 오역 가능

## 💡 베스트 프랙티스

1. **영어를 마스터로 사용**: 모든 새 텍스트는 `en.json`에 먼저 추가
2. **의미 있는 키 이름**: `btn1` 대신 `loginButton` 사용
3. **정기적 검토**: 자동 번역된 내용 주기적으로 검토
4. **네이티브 검수**: 가능하면 각 언어별 네이티브 스피커 검수

## 🎉 완료!

이제 새 페이지를 만들 때:
1. ✅ 영어만 작성
2. ✅ `npm run translate` 실행
3. ✅ `npm run update-i18n` 실행
4. ✅ 끝!

**90% 시간 절약!** 🚀
