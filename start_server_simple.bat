@echo off
echo ========================================
echo German Vocabulary Practice - Server
echo ========================================
echo.
echo Starting server on http://localhost:8000
echo.
echo After starting, open Chrome and go to:
echo http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

cd /d "%~dp0"
python -m http.server 8000
