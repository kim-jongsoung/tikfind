# TikFind Python Collector

TikTok Live 데이터를 수집하여 TikFind 서버로 전송하는 Python 스크립트입니다.

## 📦 설치 방법

### 1. Python 설치
- Python 3.8 이상 필요
- https://www.python.org/downloads/

### 2. 라이브러리 설치
```bash
pip install -r requirements.txt
```

## 🚀 사용 방법

### 기본 실행
```bash
python tiktok_collector.py --username YOUR_TIKTOK_ID --server https://tikfind.railway.app --user-id YOUR_USER_ID
```

### 예시
```bash
python tiktok_collector.py --username kimjongsoung --server https://tikfind.railway.app --user-id 12345
```

### 로컬 테스트
```bash
python tiktok_collector.py --username kimjongsoung --server http://localhost:3001 --user-id test-user
```

## 📋 파라미터

- `--username`: TikTok 사용자 이름 (@ 제외)
- `--server`: TikFind 서버 URL
- `--user-id`: TikFind 사용자 ID (웹사이트에서 확인)

## 🔧 exe 파일 생성 (배포용)

### PyInstaller 설치
```bash
pip install pyinstaller
```

### exe 생성
```bash
pyinstaller --onefile --name TikFind-Collector tiktok_collector.py
```

생성된 파일: `dist/TikFind-Collector.exe`

### exe 실행
```bash
TikFind-Collector.exe --username kimjongsoung --server https://tikfind.railway.app --user-id 12345
```

## 📝 주의사항

1. **PC에서만 작동**: 모바일 방송은 지원하지 않습니다.
2. **방송 중에만 실행**: TikTok Live 방송이 시작된 후 실행하세요.
3. **안정적인 인터넷 연결**: 실시간 데이터 전송을 위해 안정적인 연결이 필요합니다.

## 🐛 문제 해결

### "TikTokLive 모듈을 찾을 수 없습니다"
```bash
pip install TikTokLive
```

### "연결 실패"
- TikTok 사용자 이름이 정확한지 확인
- 방송이 실제로 진행 중인지 확인
- 서버 URL이 올바른지 확인

## 📞 지원

문제가 발생하면 TikFind 웹사이트에서 문의하세요.
