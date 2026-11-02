@echo off
rem todo 터미널 명령. 예: todo list / todo add "우유 사기" --due 2026-11-03 / todo done 3 / todo summary
"%~dp0.venv\Scripts\python.exe" "%~dp0backend\cli.py" %*
