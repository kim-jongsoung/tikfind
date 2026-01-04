# Python 설치 단계별 가이드 (Windows)

## 📥 1단계: Python 다운로드

1. 웹브라우저에서 https://www.python.org/downloads/ 접속
2. 노란색 **"Download Python 3.12.x"** 버튼 클릭
3. `python-3.12.x-amd64.exe` 파일 다운로드 완료 대기

---

## 🔧 2단계: Python 설치 (중요!)

### ⚠️ 매우 중요한 단계!

1. 다운로드한 `python-3.12.x-amd64.exe` 파일을 **더블클릭**하여 실행

2. **설치 창이 열리면 제일 먼저 해야 할 일:**

   ```
   ┌─────────────────────────────────────────────────┐
   │  Install Python 3.12.x                          │
   │                                                 │
   │  ✅ Add python.exe to PATH  ← 이거 체크!       │
   │  ✅ Install launcher for all users              │
   │                                                 │
   │  [Install Now]                                  │
   │  [Customize installation]                       │
   └─────────────────────────────────────────────────┘
   ```

   **"Add python.exe to PATH"** 옆의 체크박스를 **반드시 클릭**하여 체크 표시(✅)가 되도록 합니다!

3. 체크 확인 후 **"Install Now"** 버튼 클릭

4. 설치 진행 (1-2분 소요)

5. "Setup was successful" 메시지가 나오면 **"Close"** 클릭

---

## ✅ 3단계: 설치 확인

### 명령 프롬프트(CMD) 열기:
- **방법 1**: `Windows 키 + R` → `cmd` 입력 → Enter
- **방법 2**: 시작 메뉴 → "명령 프롬프트" 검색

### Python 설치 확인:
```bash
python --version
```

**예상 출력:**
```
Python 3.12.1
```

### pip 설치 확인:
```bash
pip --version
```

**예상 출력:**
```
pip 23.3.1 from C:\Users\...\Python312\lib\site-packages\pip (python 3.12)
```

---

## 🚨 "Add Python to PATH"를 체크 안 했다면?

### 증상:
```bash
python --version
```
실행 시:
```
'python'은(는) 내부 또는 외부 명령, 실행할 수 있는 프로그램, 또는
배치 파일이 아닙니다.
```

### 해결 방법 1: Python 재설치 (추천)
1. 제어판 → 프로그램 제거 → Python 제거
2. 위의 설치 과정을 다시 진행하되, **"Add Python to PATH" 체크 필수!**

### 해결 방법 2: 수동으로 PATH 추가
1. **시스템 환경 변수 편집** 열기:
   - `Windows 키 + R` → `sysdm.cpl` 입력 → Enter
   - "고급" 탭 → "환경 변수" 버튼 클릭

2. **시스템 변수**에서 "Path" 선택 → "편집" 클릭

3. **"새로 만들기"** 클릭 후 다음 경로 추가:
   ```
   C:\Users\사용자명\AppData\Local\Programs\Python\Python312
   C:\Users\사용자명\AppData\Local\Programs\Python\Python312\Scripts
   ```
   (사용자명은 본인의 Windows 사용자 이름으로 변경)

4. **확인** → **확인** → **확인** 클릭

5. **컴퓨터 재시작** (중요!)

6. 재시작 후 CMD에서 `python --version` 다시 확인

---

## 🎯 다음 단계

Python 설치가 완료되면:

```bash
# TikFind 프로젝트 폴더로 이동
cd C:\Users\kim\Desktop\tikfind\python

# 필요한 라이브러리 설치
pip install -r requirements.txt
```

설치 완료 후:
```bash
pip list
```

다음 라이브러리가 보이면 성공:
- TikTokLive
- aiohttp

---

## 💡 팁

### Python 버전 확인이 안 될 때:
- CMD 창을 닫고 다시 열기
- 컴퓨터 재시작
- PATH 설정 다시 확인

### 관리자 권한으로 설치:
- Python 설치 파일을 **우클릭** → **관리자 권한으로 실행**
- "Add Python to PATH" 체크 후 설치

---

**설치 완료 후 TikFind Collector를 실행할 수 있습니다!** 🚀
