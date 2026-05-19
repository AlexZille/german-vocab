@echo off
echo Starting German Vocabulary Practice Server...
echo.
cd /d "%~dp0"
python -m http.server 8000
pause
