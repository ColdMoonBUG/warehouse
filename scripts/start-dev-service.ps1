param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('backend', 'web')]
    [string]$Service,
    [string]$Root,
    [int]$ReadyTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Split-Path -Parent $PSScriptRoot
}
$rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
$rootKey = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($rootPath)).Replace('/', '_').Replace('+', '-').TrimEnd('=')
$mutex = [Threading.Mutex]::new($false, "Local\Warehouse-$rootKey-$Service-launch")
$hasMutex = $false

function Test-HttpReady([string]$Url) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 -ErrorAction Stop
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch { return $false }
}

function Wait-HttpReady([string]$Url, [int]$TimeoutSeconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        if (Test-HttpReady $Url) { return $true }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    return $false
}

try {
    # Cover the complete startup window. Concurrent launches wait here and then
    # reuse the first instance instead of starting another process tree.
    $hasMutex = $mutex.WaitOne([TimeSpan]::FromSeconds($ReadyTimeoutSeconds + 10))
    if (-not $hasMutex) { throw "Timed out waiting for the $Service startup lock" }

    $logDir = Join-Path $rootPath 'logs'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null

    if ($Service -eq 'backend') {
        $readyUrl = 'http://127.0.0.1:8888/api/static/health'
        if (Test-HttpReady $readyUrl) { Write-Output 'backend already ready'; exit 0 }
        $listener = Get-NetTCPConnection -State Listen -LocalPort 8888 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listener) { throw "Port 8888 is owned by PID $($listener.OwningProcess), but the health check failed" }

        $javaHome = 'C:\Program Files\Java\jdk1.8.0_202'
        if (Test-Path (Join-Path $javaHome 'bin\java.exe')) {
            $env:JAVA_HOME = $javaHome
            $env:Path = "$javaHome\bin;$env:Path"
        }
        $stdout = Join-Path $logDir 'backend.log'
        $stderr = Join-Path $logDir 'backend.err.log'
        $command = 'call .\mvnw.cmd spring-boot:run -Dspring-boot.run.jvmArguments="-Dspring.devtools.restart.enabled=false -Dspring.devtools.livereload.enabled=false"'
        $process = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/s', '/c', $command) `
            -WorkingDirectory $rootPath -WindowStyle Hidden `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    } else {
        $readyUrl = 'http://127.0.0.1:5173'
        if (Test-HttpReady $readyUrl) { Write-Output 'web already ready'; exit 0 }
        $listener = Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listener) { throw "Port 5173 is owned by PID $($listener.OwningProcess), but the HTTP check failed" }

        $webDir = Join-Path $rootPath 'apps\admin-web'
        $vite = Join-Path $webDir 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path $vite)) { throw 'admin-web dependencies are missing (Vite was not found)' }
        $node = (Get-Command node.exe -ErrorAction Stop).Source
        $stdout = Join-Path $logDir 'admin-web.log'
        $stderr = Join-Path $logDir 'admin-web.err.log'
        $process = Start-Process -FilePath $node -ArgumentList @($vite, '--host', '0.0.0.0', '--port', '5173', '--strictPort') `
            -WorkingDirectory $webDir -WindowStyle Hidden `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    }

    if (-not (Wait-HttpReady $readyUrl $ReadyTimeoutSeconds)) {
        if ($process.HasExited) { throw "$Service launcher exited with code $($process.ExitCode). Check $stdout and $stderr" }
        throw "$Service was not ready within $ReadyTimeoutSeconds seconds. Check $stdout and $stderr"
    }
    Write-Output "$Service ready (launcher PID $($process.Id))"
} finally {
    if ($hasMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
