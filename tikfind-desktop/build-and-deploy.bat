@echo off
chcp 65001 >nul
echo ========================================
echo TikFind Desktop App 빌드 및 배포 자동화
echo ========================================
echo.

:: 관리자 권한 확인
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ 관리자 권한이 필요합니다!
    echo 이 파일을 우클릭하여 "관리자 권한으로 실행"을 선택해주세요.
    pause
    exit /b 1
)

echo ✅ 관리자 권한 확인 완료
echo.

:: 현재 디렉토리 확인
cd /d "%~dp0"
echo 📁 현재 위치: %CD%
echo.

:: 1단계: 실행 중인 Electron 프로세스 종료
echo [1/6] 실행 중인 프로세스 종료...
taskkill /F /IM electron.exe /T >nul 2>&1
taskkill /F /IM TikFind.exe /T >nul 2>&1
echo ✅ 프로세스 종료 완료
echo.

:: 2단계: dist 폴더 삭제
echo [2/6] 이전 빌드 파일 삭제...
if exist "dist" (
    rmdir /s /q "dist"
    echo ✅ dist 폴더 삭제 완료
) else (
    echo ⚠️  dist 폴더가 없습니다 (정상)
)
echo.

:: 3단계: 빌드 실행
echo [3/6] Desktop App 빌드 중... (2-3분 소요)
call npm run build:win
if %errorLevel% neq 0 (
    echo ❌ 빌드 실패!
    pause
    exit /b 1
)
echo ✅ 빌드 완료
echo.

:: 4단계: 빌드 파일 확인
echo [4/6] 빌드 파일 확인...
for /f "delims=" %%i in ('dir /b "dist\TikFind Setup*.exe" 2^>nul') do set BUILD_FILE=%%i
if not defined BUILD_FILE (
    echo ❌ 빌드 파일을 찾을 수 없습니다!
    pause
    exit /b 1
)
echo ✅ 빌드 파일 발견: %BUILD_FILE%
echo.

:: 5단계: 서버에 복사
echo [5/6] 서버에 복사 중...
copy /Y "dist\%BUILD_FILE%" "..\public\downloads\TikFind-Setup.exe" >nul
if %errorLevel% neq 0 (
    echo ❌ 파일 복사 실패!
    pause
    exit /b 1
)
echo ✅ 서버에 복사 완료
echo.

:: 6단계: Git 커밋 및 푸시
echo [6/6] Git 커밋 및 푸시...
cd ..
git add .
git commit -m "release: Desktop App 자동 빌드 및 배포"
git push origin main
if %errorLevel% neq 0 (
    echo ⚠️  Git 푸시 실패 (수동으로 확인 필요)
) else (
    echo ✅ Git 푸시 완료
)
echo.

echo ========================================
echo 🎉 모든 작업 완료!
echo ========================================
echo.
echo 빌드 파일: %BUILD_FILE%
echo 배포 위치: public\downloads\TikFind-Setup.exe
echo.
echo Railway에서 자동 배포가 진행됩니다 (2-5분 소요)
echo.
pause
