@echo off
REM RS Dataset Factory - Backend launcher
REM IMPORTANT: keep this file ASCII-only (Chinese chars in .bat get mangled by
REM cmd.exe under GBK before chcp 65001 takes effect).

chcp 65001 >nul

echo ============================================
echo   RS Dataset Factory - Backend Server
echo ============================================
echo.

REM ----- Environment -----
REM Force Python stdout/stderr to UTF-8 so emoji / non-GBK chars
REM (e.g. the warning sign U+26A0) do NOT crash with UnicodeEncodeError.
set "KMP_DUPLICATE_LIB_OK=TRUE"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

REM ----- Load .env (optional) -----
REM Put your OPENAI_API_KEY / JWT_SECRET / etc. into a .env file at the repo
REM root (see .env.example). The block below loads it line-by-line.
if exist ".env" (
    echo [INFO] Loading variables from .env
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        if not "%%a"=="" if not "%%a:~0,1%"=="#" set "%%a=%%b"
    )
)

REM ----- Activate Python environment -----
REM Override CONDA_ENV / PYTHON_ENV via environment if you don't use conda.
REM Defaults assume an Anaconda env called "pytorch" on the user PATH.
if not "%CONDA_ENV%"=="" (
    call conda activate %CONDA_ENV% 2>nul || echo [WARN] conda activate failed - continuing with system Python
) else (
    where conda >nul 2>nul
    if not errorlevel 1 (
        call conda activate pytorch 2>nul || echo [WARN] conda env "pytorch" not found - continuing with system Python
    )
)

cd /d "%~dp0"

python -c "import fastapi" 2>nul
if errorlevel 1 (
    echo [INFO] Installing FastAPI dependencies...
    pip install -r requirements.txt
)

echo [INFO] Starting FastAPI server on 127.0.0.1:8000

cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

pause
