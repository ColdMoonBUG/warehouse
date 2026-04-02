@echo off
setlocal

set "ROOT=D:\Ccode\RuoYi\warehouse"
set "WEB=%ROOT%\apps\admin-web"
set "LOGDIR=%ROOT%\logs"
set "URL=http://localhost:5173"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "WEB_LOG=%LOGDIR%\admin-web.log"
set "WEB_RUNNING="

call :probe_web
if not errorlevel 1 goto OPEN

for /f %%a in ('netstat -ano ^| findstr /R /C:":5173 .*LISTENING"') do set WEB_RUNNING=1
if defined WEB_RUNNING goto WAIT_WEB

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 未安装或未加入 PATH，请先安装 Node.js。
  exit /b 1
)

cd /d "%WEB%"
start "admin-web" /b powershell -NoProfile -Command "cd '%WEB%'; if (Get-Command pnpm -ErrorAction SilentlyContinue) { & pnpm exec vite --host 0.0.0.0 --port 5173 --strictPort } else { & npm run dev -- --host 0.0.0.0 --port 5173 --strictPort } 2>&1 | Tee-Object -FilePath '%WEB_LOG%'"

echo Wait admin-web (%URL%)...
:WAIT_WEB
call :wait_web 30
if errorlevel 1 (
  echo admin-web 未在预期时间内就绪，请检查日志：%WEB_LOG%
  exit /b 1
)

:OPEN
start "" "%URL%"
exit /b 0

:probe_web
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing '%URL%').StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:wait_web
set /a tries=0
:wait_web_loop
call :probe_web
if not errorlevel 1 exit /b 0
set /a tries+=1
if %tries% GEQ %~1 exit /b 1
timeout /t 1 /nobreak >nul
goto :wait_web_loop
