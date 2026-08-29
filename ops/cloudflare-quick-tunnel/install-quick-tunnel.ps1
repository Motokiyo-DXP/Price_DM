#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory = $false)]
    [string]$TunnelRoot = "C:\dm-card-images\_tunnel",

    [Parameter(Mandatory = $false)]
    [string]$Origin = "http://127.0.0.1:8787"
)

$ErrorActionPreference = "Stop"
$taskName = "DM Card Image Quick Tunnel"
$runner = Join-Path $TunnelRoot "run-quick-tunnel.ps1"
$cloudflared = Join-Path $TunnelRoot "cloudflared.exe"
$logPath = Join-Path $TunnelRoot "quick-tunnel.log"

if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    throw "Tunnel runner does not exist: $runner"
}
if (-not (Test-Path -LiteralPath $cloudflared -PathType Leaf)) {
    throw "cloudflared.exe does not exist: $cloudflared"
}

$signature = Get-AuthenticodeSignature -LiteralPath $cloudflared
if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Cloudflare, Inc\.") {
    throw "cloudflared.exe does not have a valid Cloudflare signature."
}

$arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Origin "{1}"' -f $runner, $Origin
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Development-only Cloudflare Quick Tunnel for DM card images." `
    -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

$publicUrl = $null
for ($attempt = 1; $attempt -le 30; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-Path -LiteralPath $logPath) {
        $content = Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue
        $match = [regex]::Match($content, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
            $publicUrl = $match.Value
            break
        }
    }
}

if ($null -eq $publicUrl) {
    throw "The task started, but a Quick Tunnel URL was not issued within 30 seconds. Check: $logPath"
}

Write-Host "Quick Tunnel started successfully."
Write-Host "Public URL: $publicUrl"
Write-Host "Health check: $publicUrl/health"
Write-Warning "This random URL is for development testing only and can change after a restart."
