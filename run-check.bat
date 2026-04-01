@echo off
setlocal

set "ROOT=%~dp0"
set "SQL=%ROOT%sql\warehouse_schema.sql"
set "SQL=%SQL:\=/%"
set "JAVA_HOME=C:\Program Files\Java\jdk1.8.0_202"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "LOGDIR=%ROOT%logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "BACKEND_LOG=%LOGDIR%\backend.log"
set "WEB_LOG=%LOGDIR%\admin-web.log"
set "URL=http://localhost:5173"

echo [1/6] Use JDK 8...
java -version

rem Check backend
set BACKEND_RUNNING=
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":8888 .*LISTENING"') do set BACKEND_RUNNING=1

if not defined BACKEND_RUNNING (
  echo [2/6] Start backend...
  start "backend" /b powershell -NoProfile -Command "& '%ROOT%mvnw.cmd' spring-boot:run 2>&1 | Tee-Object -FilePath '%BACKEND_LOG%'"
) else (
  echo [2/6] Backend already running.
)

rem Check admin-web
set WEB_RUNNING=
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:5173).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 set WEB_RUNNING=1

if not defined WEB_RUNNING (
  echo [3/6] Start admin-web...
  start "admin-web" /b powershell -NoProfile -Command "cd '%ROOT%apps\admin-web'; if (Get-Command pnpm -ErrorAction SilentlyContinue) { & pnpm exec vite --host 0.0.0.0 --port 5173 --strictPort } else { & npm run dev -- --host 0.0.0.0 --port 5173 --strictPort } 2>&1 | Tee-Object -FilePath '%WEB_LOG%'"
) else (
  echo [3/6] Admin-web already running.
)

rem Open browser
start "" "%URL%"

if defined BACKEND_RUNNING goto :test_api

echo [4/6] Wait backend (http://localhost:8888)...
set /a tries=0
:wait_backend
powershell -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8888/api/product/list).StatusCode } catch { exit 1 }" && goto :test_api
set /a tries+=1
if %tries% GEQ 30 goto :err
timeout /t 2 >nul
goto :wait_backend

:test_api
echo [5/6] Test APIs (http://localhost:8888)...
powershell -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8888/api/product/list).StatusCode } catch { $_.Exception.Message; exit 1 }" || goto :err
powershell -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8888/api/store/list).StatusCode } catch { $_.Exception.Message; exit 1 }" || goto :err
powershell -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8888/api/warehouse/list).StatusCode } catch { $_.Exception.Message; exit 1 }" || goto :err
powershell -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8888/api/sale/storeSaleQty?days=30).StatusCode } catch { $_.Exception.Message; exit 1 }" || goto :err

echo [6/6] Done.
exit /b 0

:err
echo Failed. Check errors above.
exit /b 1
