@echo off
rem Todo 앱 실행: 서버가 꺼져 있으면 창 없이 켜고, 브라우저로 연다.
chcp 65001 >nul
cd /d "%~dp0"

if not exist ".venv\Scripts\pythonw.exe" (
  echo [오류] 가상환경이 없습니다. README의 "실행" 순서대로 설치해 주세요.
  pause
  exit /b 1
)
if not exist ".env" copy ".env.example" ".env" >nul

curl -s -o nul http://127.0.0.1:5000/api/tags
if not errorlevel 1 goto open

start "" ".venv\Scripts\pythonw.exe" backend\app.py
for /l %%i in (1,1,15) do (
  ping -n 2 127.0.0.1 >nul
  curl -s -o nul http://127.0.0.1:5000/api/tags && goto open
)
echo [오류] 서버가 켜지지 않았습니다. server.log 를 확인해 주세요.
pause
exit /b 1

:open
start "" http://localhost:5000
