@echo off
REM RS Dataset Factory - Frontend launcher
REM IMPORTANT: keep this file ASCII-only + CRLF line endings.
REM (Chinese chars in .bat get mangled by cmd.exe under GBK; LF-only line
REM endings cause cmd to mis-parse multi-line commands.)

chcp 65001 >nul

echo ============================================
echo   RS Dataset Factory - Frontend Server
echo ============================================
echo.

REM Node.js is on the system PATH at C:\Program Files\nodejs - no override needed.

cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [INFO] Installing npm dependencies...
    call npm install
)

echo.
echo [INFO] Starting Vite dev server (http://localhost:3000)
echo [INFO] Press Ctrl+C to stop.
echo.

call npm run dev

pause
