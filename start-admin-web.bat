@echo off
setlocal

set "ROOT=%~dp0"
set "URL=http://localhost:5173"

echo Ensure single admin-web instance...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\start-dev-service.ps1" -Service web
if errorlevel 1 exit /b 1

start "" "%URL%"
exit /b 0
