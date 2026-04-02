@echo off
setlocal

set "ROOT=%~dp0"
set "JAVA_HOME=C:\Program Files\Java\jdk1.8.0_202"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "LOGDIR=%ROOT%logs"
set "BACKEND_LOG=%LOGDIR%\backend.log"
set "WEB_LOG=%LOGDIR%\admin-web.log"
set "URL=http://localhost:5173"
set "WEB_CHECK_URL=http://127.0.0.1:5173"
set "WEB_CHECK_URL_IPV6=http://[::1]:5173"
set "BACKEND_HEALTH_URL=http://127.0.0.1:8888/api/static/health"
set "BACKEND_PRODUCT_URL=http://127.0.0.1:8888/api/product/list"
set "BACKEND_STORE_URL=http://127.0.0.1:8888/api/store/list"
set "BACKEND_WAREHOUSE_URL=http://127.0.0.1:8888/api/warehouse/list"
set "BACKEND_SALE_STATS_URL=http://127.0.0.1:8888/api/sale/storeSaleQty?days=30"
set "MIGRATION_SQL=%ROOT%sql\20260401_normalize_bag_unit_and_box_qty.sql"
set "SCHEMA_SQL=%ROOT%sql\warehouse_schema.sql"
set "SEED_SQL=%ROOT%sql\seed_from_mock.sql"
set "BACKEND_STATUS="
set "BACKEND_REASON="

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [1/6] Use JDK 8...
java -version

set "BACKEND_RUNNING="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":8888 .*LISTENING"') do set "BACKEND_RUNNING=1"

if not defined BACKEND_RUNNING (
  echo [2/6] Start backend...
  start "backend" /b powershell -NoProfile -Command "Set-Location '%ROOT%'; & '.\mvnw.cmd' spring-boot:run 2>&1 | Tee-Object -FilePath '%BACKEND_LOG%'"
) else (
  echo [2/6] Backend already running.
  call :follow_backend_log
)

set "WEB_RUNNING="
set "WEB_LISTENING="
set "WEB_PID="
call :probe_web
if not errorlevel 1 set "WEB_RUNNING=1"
if not defined WEB_RUNNING call :probe_web_ipv6
if not errorlevel 1 set "WEB_RUNNING=1"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5173 .*LISTENING"') do (
  set "WEB_LISTENING=1"
  set "WEB_PID=%%a"
)

if defined WEB_RUNNING (
  echo [3/6] Admin-web already running.
) else if defined WEB_LISTENING (
  echo [3/6] Found existing 5173 listener, but HTTP probe failed.
  goto :web_stale
) else (
  echo [3/6] Start admin-web...
  start "admin-web" /b powershell -NoProfile -Command "Set-Location '%ROOT%apps\admin-web'; if (Get-Command pnpm -ErrorAction SilentlyContinue) { & pnpm exec vite --host 0.0.0.0 --port 5173 --strictPort } else { & npm run dev -- --host 0.0.0.0 --port 5173 --strictPort } 2>&1 | Tee-Object -FilePath '%WEB_LOG%'"
)

echo [4/6] Wait admin-web (%WEB_CHECK_URL%)...
call :wait_web 30
if errorlevel 1 goto :web_err

echo [5/6] Wait backend API (%BACKEND_HEALTH_URL%)...
call :wait_backend 30
if errorlevel 1 goto :backend_err
if /I "%BACKEND_STATUS%"=="db_error" goto :backend_db_err
if /I "%BACKEND_STATUS%"=="http_error" goto :backend_http_err
if /I "%BACKEND_STATUS%"=="port_conflict" goto :backend_port_conflict
if /I "%BACKEND_STATUS%"=="ready" (
  call :test_api
  if errorlevel 1 exit /b %errorlevel%
) else (
  goto :backend_err
)

echo [6/6] Open browser...
start "" "%URL%"
echo Done.
exit /b 0

:follow_backend_log
echo [log] Backend log: %BACKEND_LOG%
if not exist "%BACKEND_LOG%" (
  echo [log] backend log not found yet.
  exit /b 0
)
echo [log] Use PowerShell Get-Content -Wait if you need to follow the log.
exit /b 0

:web_stale
echo Existing 5173 listener is not serving HTTP.
echo PID: %WEB_PID%
echo Please stop that process and rerun this script.
exit /b 3

:web_err
echo Admin-web did not become ready. Check log: %WEB_LOG%
exit /b 1

:backend_err
echo Admin-web is ready, but backend service is not ready yet.
if defined BACKEND_REASON echo Reason: %BACKEND_REASON%
echo Check log: %BACKEND_LOG%
exit /b 2

:backend_db_err
echo Backend started, but database is not ready.
if defined BACKEND_REASON echo Reason: %BACKEND_REASON%
if exist "%SCHEMA_SQL%" echo Init schema: %SCHEMA_SQL%
if exist "%SEED_SQL%" echo Init seed: %SEED_SQL%
if exist "%MIGRATION_SQL%" echo Migration hint: %MIGRATION_SQL%
echo Check log: %BACKEND_LOG%
exit /b 4

:backend_http_err
echo Backend started, but API returned an unexpected HTTP error.
if defined BACKEND_REASON echo Reason: %BACKEND_REASON%
echo Check log: %BACKEND_LOG%
exit /b 5

:backend_port_conflict
echo Port 8888 is occupied by another process, and the backend health endpoint is unavailable.
if defined BACKEND_REASON echo Reason: %BACKEND_REASON%
echo Check log: %BACKEND_LOG%
exit /b 6

:backend_api_err
echo Backend health check passed, but business API verification failed.
if defined BACKEND_REASON echo Reason: %BACKEND_REASON%
if exist "%SCHEMA_SQL%" echo Init schema: %SCHEMA_SQL%
if exist "%SEED_SQL%" echo Init seed: %SEED_SQL%
if exist "%MIGRATION_SQL%" echo Migration hint: %MIGRATION_SQL%
echo Check log: %BACKEND_LOG%
exit /b 7

:backend_sale_warn
echo [warn] /api/sale/storeSaleQty returned 500.
if defined BACKEND_REASON echo [warn] %BACKEND_REASON%
if exist "%MIGRATION_SQL%" (
  echo [warn] Run migration: %MIGRATION_SQL%
) else (
  echo [warn] Missing migration file: %MIGRATION_SQL%
)
exit /b 0

:backend_api_ok
exit /b 0

:probe_web
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing '%WEB_CHECK_URL%' -TimeoutSec 2).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:probe_web_ipv6
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing '%WEB_CHECK_URL_IPV6%' -TimeoutSec 2).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:show_web_debug
echo [debug] admin-web probe attempt %tries%/%~1
powershell -NoProfile -Command "try { $resp = Invoke-WebRequest -UseBasicParsing '%WEB_CHECK_URL%' -TimeoutSec 2 -ErrorAction Stop; Write-Host ('[debug] HTTP ' + $resp.StatusCode + ' from %WEB_CHECK_URL%'); exit 0 } catch { Write-Host ('[debug] IPv4 probe failed: ' + $_.Exception.Message); exit 1 }"
powershell -NoProfile -Command "try { $resp = Invoke-WebRequest -UseBasicParsing '%WEB_CHECK_URL_IPV6%' -TimeoutSec 2 -ErrorAction Stop; Write-Host ('[debug] HTTP ' + $resp.StatusCode + ' from %WEB_CHECK_URL_IPV6%'); exit 0 } catch { Write-Host ('[debug] IPv6 probe failed: ' + $_.Exception.Message); exit 1 }"
echo [debug] netstat 5173:
netstat -ano | findstr /R /C:":5173 .*LISTENING" || echo [debug] no LISTENING socket on 5173
if exist "%WEB_LOG%" (
  echo [debug] last 20 lines of %WEB_LOG%
  powershell -NoProfile -Command "Get-Content '%WEB_LOG%' -Tail 20"
) else (
  echo [debug] admin-web log not found: %WEB_LOG%
)
exit /b 0

:probe_backend
set "BACKEND_STATUS="
set "BACKEND_REASON="
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $resp = Invoke-WebRequest -UseBasicParsing '%BACKEND_HEALTH_URL%' -TimeoutSec 2 -ErrorAction Stop; if ($resp.StatusCode -eq 200) { Write-Host 'ready'; exit 0 } Write-Host ('http_error|health endpoint returned HTTP ' + $resp.StatusCode); exit 2 } catch { if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode.value__; if ($code -eq 500) { Write-Host 'db_error|health endpoint returned HTTP 500'; exit 3 } Write-Host ('http_error|health endpoint returned HTTP ' + $code); exit 2 } Write-Host 'connect_error|backend health endpoint unreachable'; exit 1 }" > "%TEMP%\warehouse_backend_probe.txt" 2>nul
if exist "%TEMP%\warehouse_backend_probe.txt" (
  set /p BACKEND_PROBE_RESULT=<"%TEMP%\warehouse_backend_probe.txt"
  del "%TEMP%\warehouse_backend_probe.txt" >nul 2>nul
) else (
  set "BACKEND_PROBE_RESULT=connect_error|backend probe output missing"
)
for /f "tokens=1* delims=|" %%a in ("%BACKEND_PROBE_RESULT%") do (
  set "BACKEND_STATUS=%%a"
  set "BACKEND_REASON=%%b"
)
if /I "%BACKEND_STATUS%"=="ready" exit /b 0
if /I "%BACKEND_STATUS%"=="connect_error" exit /b 1
if /I "%BACKEND_STATUS%"=="http_error" exit /b 2
if /I "%BACKEND_STATUS%"=="db_error" exit /b 3
set "BACKEND_STATUS=unknown"
set "BACKEND_REASON=backend probe returned unexpected result"
exit /b 1

:diagnose_backend_log
set "BACKEND_REASON="
if not exist "%BACKEND_LOG%" (
  set "BACKEND_REASON=backend log not found yet"
  exit /b 0
)
for /f "tokens=2 delims='" %%a in ('findstr /C:"doesn't exist" "%BACKEND_LOG%"') do set "BACKEND_REASON=缺少数据表: %%a"
if defined BACKEND_REASON exit /b 0
for /f "tokens=2 delims='" %%a in ('findstr /C:"Unknown column '" "%BACKEND_LOG%"') do set "BACKEND_REASON=缺少数据列: %%a"
if defined BACKEND_REASON exit /b 0
findstr /C:"Port 8888 was already in use" "%BACKEND_LOG%" >nul 2>nul && set "BACKEND_REASON=8888 端口已被占用"
if defined BACKEND_REASON exit /b 0
findstr /C:"Communications link failure" "%BACKEND_LOG%" >nul 2>nul && set "BACKEND_REASON=数据库连接失败"
if defined BACKEND_REASON exit /b 0
findstr /C:"Access denied for user" "%BACKEND_LOG%" >nul 2>nul && set "BACKEND_REASON=数据库账号或密码错误"
if defined BACKEND_REASON exit /b 0
for /f "tokens=2 delims='" %%a in ('findstr /C:"Unknown database '" "%BACKEND_LOG%"') do set "BACKEND_REASON=数据库不存在: %%a"
exit /b 0

:wait_web
set /a tries=0
:wait_web_loop
call :probe_web
if not errorlevel 1 exit /b 0
set /a tries+=1
call :show_web_debug %~1
if %tries% GEQ %~1 exit /b 1
powershell -NoProfile -Command "Start-Sleep -Seconds 1" >nul
goto :wait_web_loop

:wait_backend
set /a tries=0
:wait_backend_loop
call :probe_backend
if not errorlevel 1 (
  set "BACKEND_STATUS=ready"
  exit /b 0
)
if errorlevel 3 (
  set "BACKEND_STATUS=db_error"
  call :diagnose_backend_log
  exit /b 0
)
if errorlevel 2 (
  set "BACKEND_STATUS=http_error"
  call :diagnose_backend_log
  exit /b 0
)
set /a tries+=1
if %tries% GEQ %~1 (
  call :diagnose_backend_log
  if /I "%BACKEND_REASON%"=="8888 端口已被占用" set "BACKEND_STATUS=port_conflict"
  exit /b 1
)
powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul
goto :wait_backend_loop

:test_api
echo Test APIs (http://127.0.0.1:8888)...
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { (Invoke-WebRequest -UseBasicParsing '%BACKEND_PRODUCT_URL%' -TimeoutSec 5 -ErrorAction Stop).StatusCode | Out-Null; exit 0 } catch { if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 500) { exit 2 } exit 1 }" >nul 2>nul
if errorlevel 2 (
  call :diagnose_backend_log
  goto :backend_api_err
)
if errorlevel 1 (
  set "BACKEND_REASON=/api/product/list 请求失败"
  goto :backend_api_err
)
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { (Invoke-WebRequest -UseBasicParsing '%BACKEND_STORE_URL%' -TimeoutSec 5 -ErrorAction Stop).StatusCode | Out-Null; exit 0 } catch { if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 500) { exit 2 } exit 1 }" >nul 2>nul
if errorlevel 2 (
  call :diagnose_backend_log
  goto :backend_api_err
)
if errorlevel 1 (
  set "BACKEND_REASON=/api/store/list 请求失败"
  goto :backend_api_err
)
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { (Invoke-WebRequest -UseBasicParsing '%BACKEND_WAREHOUSE_URL%' -TimeoutSec 5 -ErrorAction Stop).StatusCode | Out-Null; exit 0 } catch { if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 500) { exit 2 } exit 1 }" >nul 2>nul
if errorlevel 2 (
  call :diagnose_backend_log
  goto :backend_api_err
)
if errorlevel 1 (
  set "BACKEND_REASON=/api/warehouse/list 请求失败"
  goto :backend_api_err
)
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { (Invoke-WebRequest -UseBasicParsing '%BACKEND_SALE_STATS_URL%' -TimeoutSec 5 -ErrorAction Stop).StatusCode | Out-Null; exit 0 } catch { if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 500) { exit 2 } exit 1 }" >nul 2>nul
if errorlevel 2 (
  call :diagnose_backend_log
  set "BACKEND_REASON=/api/sale/storeSaleQty 返回 500，通常表示数据库结构落后于当前后端代码"
  goto :backend_sale_warn
)
if errorlevel 1 (
  set "BACKEND_REASON=/api/sale/storeSaleQty 请求失败"
  goto :backend_api_err
)
goto :backend_api_ok
