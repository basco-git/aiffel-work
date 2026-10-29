@echo off
rem 윈도우 로그인 시 Todo 서버가 창 없이 자동으로 켜지도록 시작프로그램에 바로가기를 만든다.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command ^
  "$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Todo 서버.lnk';" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk);" ^
  "$s.TargetPath = (Resolve-Path '.venv\Scripts\pythonw.exe').Path;" ^
  "$s.Arguments = 'backend\app.py';" ^
  "$s.WorkingDirectory = (Get-Location).Path;" ^
  "$s.Description = 'Todo 앱 서버 (localhost:5000)';" ^
  "$s.Save(); Write-Host ('자동 실행을 켰습니다: ' + $lnk)"
ping -n 3 127.0.0.1 >nul
