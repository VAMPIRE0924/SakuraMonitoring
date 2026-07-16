param(
    [switch]$SkipInstall,
    [ValidateSet('amd64', 'arm64')]
    [string]$Goarch = 'amd64',
    [string]$WslDistribution = 'Ubuntu-24.04',
    [string]$GoToolchain = 'go1.26.5+auto',
    [string]$Version = '',
    [string]$Output = ''
)

$ErrorActionPreference = 'Stop'

function Invoke-Native([string]$Command, [string[]]$Arguments = @()) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
    }
}

function Convert-ToWslPath([string]$WindowsPath) {
    $fullPath = [System.IO.Path]::GetFullPath($WindowsPath)
    if ($fullPath -notmatch '^([A-Za-z]):\\(.*)$') {
        throw "WSL path conversion requires an absolute drive path: $WindowsPath"
    }

    $drive = $matches[1].ToLowerInvariant()
    $relative = $matches[2] -replace '\\', '/'
    return "/mnt/$drive/$relative"
}

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$Goos = 'linux'
$CgoEnabled = '1'
if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

$backendRoot = [System.IO.Path]::Combine($workspaceRoot, 'upstream', 'nezha')
$goHostOS = (Invoke-Native 'go' @('env', 'GOHOSTOS') | Select-Object -Last 1).Trim()
$configuredCC = (Invoke-Native 'go' @('env', 'CC') | Select-Object -Last 1).Trim()
$useWsl = $Goos -eq 'linux' -and $goHostOS -ne 'linux' -and $configuredCC -notmatch '(linux|musl|zig)'
if ($useWsl) {
    Invoke-Native 'wsl.exe' @(
        '-d', $WslDistribution, '--', 'env', "GOTOOLCHAIN=$GoToolchain",
        'bash', '-lc', 'command -v go >/dev/null && command -v gcc >/dev/null && command -v file >/dev/null && go version'
    )
}

if (-not $Version) {
    $lockPath = Join-Path $workspaceRoot 'upstreams.lock.json'
    if (-not (Test-Path -LiteralPath $lockPath)) {
        throw "Missing upstream lock file for release version: $lockPath"
    }
    $Version = (Get-Content -LiteralPath $lockPath -Raw -Encoding utf8 | ConvertFrom-Json).backend.version
}
if ($Version -notmatch '^v?\d+\.\d+\.\d+$') {
    throw "Version must be a semantic release version such as v2.2.9: $Version"
}

& (Join-Path $PSScriptRoot 'verify-environment.ps1')
& (Join-Path $PSScriptRoot 'enforce-theme-boundary.ps1') -WorkspaceRoot $workspaceRoot -Prune -RequireSakura
& (Join-Path $PSScriptRoot 'prepare-official-frontend-dists.ps1') -WorkspaceRoot $workspaceRoot -Force
& (Join-Path $PSScriptRoot 'build-sakura-user-dist.ps1') -WorkspaceRoot $workspaceRoot -SkipInstall:$SkipInstall
& (Join-Path $PSScriptRoot 'check-sakura-template.ps1') -WorkspaceRoot $workspaceRoot

if (-not $Output) {
    $Output = "dist\dashboard-linux-$Goarch"
}
$outputPath = Join-Path $workspaceRoot $Output
New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null

if ($useWsl) {
    $wslWorkspace = Convert-ToWslPath $workspaceRoot
    $wslOutput = Convert-ToWslPath $outputPath
    $wslScript = "$wslWorkspace/scripts/build-linux-backend.sh"
    Invoke-Native 'wsl.exe' @(
        '-d', $WslDistribution, '--', 'env', "GOTOOLCHAIN=$GoToolchain",
        'bash', $wslScript, $wslWorkspace, $Version, $wslOutput, $Goarch
    )

    $file = Get-Item -LiteralPath $outputPath
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath).Hash
    Write-Output "Built: $($file.FullName)"
    Write-Output "Version: $Version"
    Write-Output "Size: $($file.Length)"
    Write-Output "SHA256: $hash"
    Write-Output "Archive: $outputPath.zip"
    return
}

$previousGoos = $env:GOOS
$previousGoarch = $env:GOARCH
$previousCgoEnabled = $env:CGO_ENABLED

Push-Location $backendRoot
try {
    if (-not (Test-Path -LiteralPath 'cmd\dashboard\docs\docs.go')) {
        Invoke-Native 'go' @('run', 'github.com/swaggo/swag/cmd/swag@v1.16.6', 'init', '-g', 'cmd/dashboard/main.go', '-o', 'cmd/dashboard/docs', '--parseDependency', '--parseInternal')
    }
    $env:GOOS = $Goos
    $env:GOARCH = $Goarch
    $env:CGO_ENABLED = $CgoEnabled
	$ldflags = "-s -w -X github.com/nezhahq/nezha/service/singleton.Version=$Version"
	Invoke-Native 'go' @('build', '-buildvcs=false', '-trimpath', '-ldflags', $ldflags, '-o', $outputPath, './cmd/dashboard')
}
finally {
    Pop-Location
    $env:GOOS = $previousGoos
    $env:GOARCH = $previousGoarch
    $env:CGO_ENABLED = $previousCgoEnabled
}

$file = Get-Item -LiteralPath $outputPath
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath).Hash
[System.IO.File]::WriteAllText("$outputPath.sha256", "$hash *$($file.Name)`n")
Write-Output "Built: $($file.FullName)"
Write-Output "Version: $Version"
Write-Output "Size: $($file.Length)"
Write-Output "SHA256: $hash"
