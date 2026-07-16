param(
    [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

function Invoke-Native([string]$Command, [string[]]$Arguments = @()) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
    }
}

if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

$dashRoot = [System.IO.Path]::Combine($WorkspaceRoot, 'upstream', 'nezha-dash-v2')
$frontendDist = Join-Path $dashRoot 'dist'
$targetDist = [System.IO.Path]::Combine($WorkspaceRoot, 'upstream', 'nezha', 'cmd', 'dashboard', 'sakura-user-dist')

if (-not (Test-Path -LiteralPath $dashRoot)) {
    throw "Frontend source not found: $dashRoot"
}

Push-Location $dashRoot
try {
    if (-not $SkipInstall) {
        Invoke-Native 'pnpm' @('install', '--frozen-lockfile')
    }
    Invoke-Native 'pnpm' @('run', 'build')
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $frontendDist)) {
    throw "Frontend build output not found: $frontendDist"
}

$workspaceFull = (Resolve-Path -LiteralPath $WorkspaceRoot).Path.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
)
if (Test-Path -LiteralPath $targetDist) {
    $targetFull = (Resolve-Path -LiteralPath $targetDist).Path
    if (-not $targetFull.StartsWith($workspaceFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove path outside workspace: $targetFull"
    }
    Remove-Item -LiteralPath $targetDist -Recurse -Force
}

New-Item -ItemType Directory -Path $targetDist -Force | Out-Null
Get-ChildItem -LiteralPath $frontendDist -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $targetDist -Recurse -Force
}

Write-Output "Built Sakura frontend template: $targetDist"
