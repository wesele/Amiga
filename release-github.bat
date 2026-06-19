@echo off
cd /d "%~dp0"
node scripts/release.cjs %*
pause
