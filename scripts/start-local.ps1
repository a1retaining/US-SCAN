$ErrorActionPreference = 'Stop'
$stockRoot = Split-Path -Parent $PSScriptRoot
$stockAddress = 'http://127.0.0.1:10000'
try {
    $existing = Invoke-RestMethod "$stockAddress/api/health" -TimeoutSec 2
    if ($existing.market -eq 'US') {
        Write-Host 'The US app is already running. Opening it; its existing operator key still applies.'
        Start-Process $stockAddress
        exit 0
    }
    throw 'Another app is using port 10000. Close that app before starting Stock learner.'
} catch {
    if ($_.Exception.Message -like 'Another app*') { throw }
}
$stockNode = (Get-Command node -ErrorAction Stop).Source
if (!(Test-Path -LiteralPath (Join-Path $stockRoot 'node_modules\express'))) {
    throw 'Install the project dependencies before launching (npm ci).'
}
Write-Host 'This runs simulated US trades only. Your computer must stay on for this local copy.'
Write-Host 'Choose an operator passphrase of at least 24 characters. Enter the same phrase in the site to start or pause paper trading.'
$stockSecure = Read-Host 'Operator passphrase' -AsSecureString
$stockPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stockSecure)
try { $stockToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($stockPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($stockPointer) }
if ($stockToken.Length -lt 24) { throw 'Use a passphrase with at least 24 characters.' }
$stockPrevious = @{Token=$env:PAPER_ADMIN_TOKEN;Port=$env:PORT;Bind=$env:STOCK_BIND_HOST;Data=$env:STOCK_DATA_DIR}
try {
    $env:PAPER_ADMIN_TOKEN = $stockToken
    $env:PORT = '10000'
    $env:STOCK_BIND_HOST = '127.0.0.1'
    $env:STOCK_DATA_DIR = Join-Path $stockRoot '.local-data'
    New-Item -ItemType Directory -Force -Path $env:STOCK_DATA_DIR | Out-Null
    $stockServer = Start-Process -FilePath $stockNode -ArgumentList 'src/server.js' -WorkingDirectory $stockRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $env:STOCK_DATA_DIR 'local-server.log') -RedirectStandardError (Join-Path $env:STOCK_DATA_DIR 'local-server-error.log')
} finally {
    $env:PAPER_ADMIN_TOKEN=$stockPrevious.Token
    $env:PORT=$stockPrevious.Port
    $env:STOCK_BIND_HOST=$stockPrevious.Bind
    $env:STOCK_DATA_DIR=$stockPrevious.Data
    $stockToken=$null
}
for ($stockAttempt=0; $stockAttempt -lt 20; $stockAttempt++) {
    if ($stockServer.HasExited) { throw 'The app could not start. Check .local-data/local-server-error.log.' }
    try {
        $stockHealth=Invoke-RestMethod "$stockAddress/api/health" -TimeoutSec 2
        if ($stockHealth.market -eq 'US') {
            Write-Host "Stock learner is running at $stockAddress (process $($stockServer.Id))."
            Write-Host 'Open SERVER PAPER, enter your passphrase, then Start paper worker. Pause it before stopping this process.'
            Start-Process "$stockAddress/#serverPaper"
            exit 0
        }
    } catch {}
    Start-Sleep -Milliseconds 500
}
throw 'The app did not become ready. Check .local-data/local-server-error.log.'
