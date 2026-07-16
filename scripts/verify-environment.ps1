param(
    [switch]$RunGoTests,
    [switch]$RunFrontendSmoke
)

$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$workspaceParent = Split-Path -Parent $workspaceRoot
$toolTemp = Join-Path $workspaceParent '.go-tmp'
$goCache = Join-Path $workspaceParent '.go-cache'
$goPath = Join-Path $workspaceParent '.gopath'
$goModCache = Join-Path $workspaceParent '.gomodcache'
New-Item -ItemType Directory -Path $toolTemp -Force | Out-Null
New-Item -ItemType Directory -Path $goCache -Force | Out-Null
New-Item -ItemType Directory -Path $goPath -Force | Out-Null
New-Item -ItemType Directory -Path $goModCache -Force | Out-Null
$env:TEMP = $toolTemp
$env:TMP = $toolTemp
$env:GOTMPDIR = $toolTemp
$env:GOCACHE = $goCache
$env:GOPATH = $goPath
$env:GOMODCACHE = $goModCache

if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Require-Command([string]$Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Missing required command: $Name"
    }
    return $cmd.Source
}

function Invoke-Native([string]$Command, [string[]]$Arguments = @()) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
    }
}

$required = 'node', 'npm', 'pnpm', 'go', 'gcc', 'g++', 'git'
foreach ($cmd in $required) {
    $source = Require-Command $cmd
    Write-Output ("{0}: {1}" -f $cmd, $source)
}

$nodeVersion = Invoke-Native 'node' @('-v')
$npmVersion = Invoke-Native 'npm' @('-v')
$pnpmVersion = Invoke-Native 'pnpm' @('-v')
$goVersion = Invoke-Native 'go' @('version')
$gccVersion = Invoke-Native 'gcc' @('--version') | Select-Object -First 1
$gxxVersion = Invoke-Native 'g++' @('--version') | Select-Object -First 1
$cgo = Invoke-Native 'go' @('env', 'CGO_ENABLED')
$cc = Invoke-Native 'go' @('env', 'CC')
$cxx = Invoke-Native 'go' @('env', 'CXX')

Write-Output "node: $nodeVersion"
Write-Output "npm: $npmVersion"
Write-Output "pnpm: $pnpmVersion"
Write-Output "go: $goVersion"
Write-Output "gcc: $gccVersion"
Write-Output "g++: $gxxVersion"
Write-Output "go env: CGO_ENABLED=$cgo CC=$cc CXX=$cxx"
Write-Output "temp: TEMP=$env:TEMP GOTMPDIR=$env:GOTMPDIR GOCACHE=$env:GOCACHE"
Write-Output "go paths: GOPATH=$env:GOPATH GOMODCACHE=$env:GOMODCACHE"

if ($cgo -ne '1' -or $cc -ne 'gcc' -or $cxx -ne 'g++') {
    throw 'Go CGO toolchain is not configured as expected. Run: go env -w CGO_ENABLED=1 CC=gcc CXX=g++'
}

if ($RunFrontendSmoke) {
    Push-Location ([System.IO.Path]::Combine($workspaceRoot, 'upstream', 'nezha-dash-v2'))
    try {
        Invoke-Native 'pnpm' @('exec', 'tsc', '-b')
    }
    finally {
        Pop-Location
    }
}

if ($RunGoTests) {
    Push-Location ([System.IO.Path]::Combine($workspaceRoot, 'upstream', 'nezha'))
    try {
        Invoke-Native 'go' @('test', './model', './service/singleton', './cmd/dashboard/controller')
    }
    finally {
        Pop-Location
    }
}

Write-Output 'Environment verification passed.'
