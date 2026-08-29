param(
    [Parameter(Mandatory = $false)]
    [string]$Origin = "http://127.0.0.1:8787"
)

$ErrorActionPreference = "Stop"
$cloudflared = Join-Path $PSScriptRoot "cloudflared.exe"
$logPath = Join-Path $PSScriptRoot "quick-tunnel.log"

if (-not (Test-Path -LiteralPath $cloudflared -PathType Leaf)) {
    throw "cloudflared.exe does not exist: $cloudflared"
}

if (Test-Path -LiteralPath $logPath) {
    Remove-Item -LiteralPath $logPath -Force
}

& $cloudflared tunnel `
    --no-autoupdate `
    --url $Origin `
    --logfile $logPath `
    --loglevel info

exit $LASTEXITCODE
