@echo off
REM RS Dataset Factory - Launch backend and frontend together

echo ============================================
echo   RS Dataset Factory - Full Stack
echo ============================================
echo.
echo Starting both backend and frontend servers...
echo.

start "RS Dataset Factory - Backend" cmd /c "%~dp0start_backend.bat"

REM Give the backend a moment to come up before starting the frontend.
timeout /t 5 /nobreak > nul

start "RS Dataset Factory - Frontend" cmd /c "%~dp0start_frontend.bat"

echo.
echo [INFO] Backend:  http://localhost:8000
echo [INFO] Frontend: http://localhost:3000
echo [INFO] API Docs: http://localhost:8000/docs
echo.
echo Both servers are starting in separate windows.
echo Close this window or press any key to exit this launcher.
echo.

pause
