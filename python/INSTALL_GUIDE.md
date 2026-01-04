# TikFind Python Collector 설치 가이드

## 📦 Python 설치 (Windows)

### 1. Python 다운로드
1. https://www.python.org/downloads/ 접속
2. **"Download Python 3.12.x"** 버튼 클릭 (최신 버전)
3. 다운로드된 `python-3.12.x-amd64.exe` 실행

### 2. Python 설치
⚠️ **중요**: 설치 시 반드시 체크해야 할 옵션!

1. 설치 창 하단의 **"Add Python to PATH"** 체크 ✅
2. **"Install Now"** 클릭
3. 설치 완료 후 **"Close"** 클릭

### 3. 설치 확인
명령 프롬프트(CMD) 또는 PowerShell에서:
```bash
python --version
```
출력 예시: `Python 3.12.1`

```bash
pip --version
```
출력 예시: `pip 23.3.1`

---

## 🚀 TikFind Collector 설정

### 1. 필요한 라이브러리 설치
```bash
cd C:\Users\kim\Desktop\tikfind\python
pip install -r requirements.txt
```

설치되는 라이브러리:
- `TikTokLive`: TikTok Live 데이터 수집
- `aiohttp`: 비동기 HTTP 통신

### 2. 설치 확인
```bash
pip list
```
`TikTokLive`와 `aiohttp`가 목록에 있으면 성공!

---

## 🎯 사용 방법

### 로컬 테스트 (개발 중)
```bash
python tiktok_collector.py --username YOUR_TIKTOK_ID --server http://localhost:3001 --user-id test-user
```

### 실제 사용 (배포 후)
```bash
python tiktok_collector.py --username YOUR_TIKTOK_ID --server https://tikfind.railway.app --user-id YOUR_USER_ID
```

**파라미터 설명:**
- `--username`: TikTok 사용자 이름 (@ 제외)
- `--server`: TikFind 서버 주소
- `--user-id`: TikFind 웹사이트에서 확인한 사용자 ID

---

## 🔧 exe 파일 만들기 (사용자 배포용)

### 1. PyInstaller 설치
```bash
pip install pyinstaller
```

### 2. exe 생성
```bash
pyinstaller --onefile --name TikFind-Collector --icon=icon.ico tiktok_collector.py
```

### 3. 생성된 파일 위치
```
dist/TikFind-Collector.exe
```

### 4. exe 실행 방법
```bash
TikFind-Collector.exe --username kimjongsoung --server https://tikfind.railway.app --user-id 12345
```

또는 **배치 파일 생성** (더 쉬운 실행):

**start_collector.bat** 파일 생성:
```batch
@echo off
TikFind-Collector.exe --username YOUR_TIKTOK_ID --server https://tikfind.railway.app --user-id YOUR_USER_ID
pause
```

더블클릭으로 실행 가능!

---

## 🐛 문제 해결

### "python을 찾을 수 없습니다"
- Python 설치 시 **"Add Python to PATH"** 체크했는지 확인
- 컴퓨터 재시작 후 다시 시도
- 수동으로 PATH 추가:
  1. 시스템 환경 변수 편집
  2. Path에 `C:\Users\사용자명\AppData\Local\Programs\Python\Python312` 추가

### "TikTokLive 모듈을 찾을 수 없습니다"
```bash
pip install TikTokLive
```

### "aiohttp 모듈을 찾을 수 없습니다"
```bash
pip install aiohttp
```

### "연결 실패"
- TikTok 사용자 이름이 정확한지 확인 (@ 제외)
- 실제로 라이브 방송 중인지 확인
- 서버 URL이 올바른지 확인

### "서버 전송 실패"
- 인터넷 연결 확인
- 서버가 실행 중인지 확인
- 방화벽 설정 확인

---

## 📞 지원

문제가 계속되면 TikFind 웹사이트에서 문의하세요.
