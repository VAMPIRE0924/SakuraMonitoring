$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$dashRoot = [System.IO.Path]::Combine($workspaceRoot, 'upstream', 'nezha-dash-v2')

if (-not (Test-Path -LiteralPath $dashRoot)) {
    throw "Frontend source not found: $dashRoot"
}

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    throw 'Missing required command: pnpm'
}

Push-Location $dashRoot
try {
    if ($args.Count -eq 0) {
        & $pnpm.Source --version
    }
    else {
        & $pnpm.Source @args
    }

    if ($LASTEXITCODE) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
