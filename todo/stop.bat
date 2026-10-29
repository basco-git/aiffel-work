@echo off
rem Todo 앱 서버 종료
chcp 65001 >nul
powershell -NoProfile -Command ^
  "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -match 'backend[\\/]app\.py' };" ^
  "if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Write-Host 'Todo 서버를 종료했습니다.' } else { Write-Host '실행 중인 Todo 서버가 없습니다.' }"
ping -n 3 127.0.0.1 >nul
