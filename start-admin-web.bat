@echo off
setlocal

set ROOT=D:\Ccode\RuoYi\warehouse
set WEB=%ROOT%\apps\admin-web
set LOGDIR=%ROOT%\logs
set URL=http://localhost:5173

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set WEB_LOG=%LOGDIR%\admin-web.log

powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:5173).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto OPEN

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 未安装或未加入 PATH，请先安装 Node.js。
  goto OPEN
)

cd /d "%WEB%"

start "admin-web" /b powershell -NoProfile -Command "cd '%WEB%'; if (Get-Command pnpm -ErrorAction SilentlyContinue) { & pnpm exec vite --host 0.0.0.0 --port 5173 --strictPort } else { & npm run dev -- --host 0.0.0.0 --port 5173 --strictPort } 2>&1 | Tee-Object -FilePath '%WEB_LOG%'"

timeout /t 2 /nobreak >nul

:OPEN
start "" "%URL%"

endlocal
