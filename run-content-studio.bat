@echo off
cd /d "%~dp0"

echo [Content Studio] Starting dev server on port 5180...
echo.

:: Open browser after a short delay
start /b "" cmd /c "timeout /t 3 >nul && start http://localhost:5180"

cd /d "%~dp0content-studio"
npm run dev
pause
