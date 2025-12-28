# TikFind

## 프로젝트 설명
TikFind 웹 애플리케이션

## 기술 스택
- **Backend**: Node.js + Express
- **View Engine**: EJS
- **Database**: PostgreSQL
- **Session**: express-session

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm start

# 또는
node server.js
```

## 환경변수 설정
`.env` 파일을 생성하고 다음 내용을 설정하세요:

```
PORT=3001
SESSION_SECRET=your-secret-key
DATABASE_URL=your-postgresql-url
```

## 포트
- 개발 서버: http://localhost:3001

## 폴더 구조
```
tikfind/
├── server.js           # 메인 서버 파일
├── views/              # EJS 템플릿
├── public/             # 정적 파일
│   └── css/
├── routes/             # 라우트 파일
├── .env                # 환경변수
└── package.json
```
