@echo off
rem 시작프로그램에서 Todo 서버 바로가기를 지운다. (지금 켜진 서버는 stop.bat 으로 종료)
chcp 65001 >nul
powershell -NoProfile -Command ^
  "$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Todo 서버.lnk';" ^
  "if (Test-Path $lnk) { Remove-Item $lnk; Write-Host '자동 실행을 껐습니다.' } else { Write-Host '자동 실행이 설정되어 있지 않습니다.' }"
ping -n 3 127.0.0.1 >nul
