#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory = $false)]
    [string]$ImageRoot = "C:\dm-card-images",

    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 65535)]
    [int]$Port = 8787
)

$ErrorActionPreference = "Stop"
$taskName = "DM Card Image Server"
$firewallName = "DM Card Images HTTP"
$serverScript = Join-Path $ImageRoot "_server\image-server.ps1"

if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
    throw "Server script does not exist: $serverScript"
}

$existingRule = Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue
if ($null -eq $existingRule) {
    New-NetFirewallRule `
        -DisplayName $firewallName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $Port `
        -Action Allow `
        -Profile Private `
        -RemoteAddress LocalSubnet | Out-Null
} else {
    Set-NetFirewallRule -DisplayName $firewallName -Enabled True -Profile Private -Action Allow
    $existingRule |
        Get-NetFirewallPortFilter |
        Set-NetFirewallPortFilter -Protocol TCP -LocalPort $Port | Out-Null
    $existingRule |
        Get-NetFirewallAddressFilter |
        Set-NetFirewallAddressFilter -RemoteAddress LocalSubnet | Out-Null
}

$arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Root "{1}" -Port {2}' -f $serverScript, $ImageRoot, $Port
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Serves Duel Masters card images from $ImageRoot on TCP $Port." `
    -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

$healthy = $false
for ($attempt = 1; $attempt -le 10; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {
        # Retry while the scheduled task and HTTP listener start.
    }
}

if (-not $healthy) {
    throw "The scheduled task was created, but the health check failed. Check Task Scheduler: $taskName"
}

Write-Host "Installation completed successfully."
Write-Host "Health check: http://127.0.0.1:$Port/health"
Write-Host "LAN image URL example: http://192.168.1.9:$Port/official/dm26ex2-MC001.webp"
