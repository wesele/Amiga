@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [Amiga] 正在启动 Windows 开发服务器...
echo.
npm run tauri dev
pause
