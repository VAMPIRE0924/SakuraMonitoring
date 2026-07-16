param(
    [switch]$Prepare,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Invoke-Git([string[]]$Arguments) {
    $output = & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed ($LASTEXITCODE): git $($Arguments -join ' ')"
    }
    return $output
}

function Assert-UnderWorkspace([string]$Path, [string]$WorkspaceRoot) {
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    $resolvedRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar

    if (-not $resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Resolved path escapes workspace: $resolvedPath"
    }
}

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $workspaceRoot 'upstreams.lock.json'
if (-not (Test-Path -LiteralPath $lockPath)) {
    throw "Missing upstream lock file: $lockPath"
}

$lock = Get-Content -LiteralPath $lockPath -Raw -Encoding utf8 | ConvertFrom-Json
$reviewRoot = Join-Path $workspaceRoot '.upstream-review'
$sources = @(
    @{ Name = 'backend'; Config = $lock.backend },
    @{ Name = 'frontend'; Config = $lock.frontend }
)

foreach ($source in $sources) {
    $name = $source.Name
    $config = $source.Config
    $remoteRef = "refs/heads/$($config.branch)"
    $remoteLine = @(Invoke-Git @('ls-remote', $config.repository, $remoteRef) | Select-Object -First 1)
    if ($remoteLine.Count -eq 0) {
        throw "Unable to resolve $name branch $remoteRef from $($config.repository)"
    }

    $latestCommit = ($remoteLine[0] -split '\s+')[0]
    Write-Output ""
    Write-Output "== $name =="
    Write-Output "Repository: $($config.repository)"
    Write-Output "Branch: $($config.branch)"
    Write-Output "Locked: $($config.commit) ($($config.version))"
    Write-Output "Latest: $latestCommit"

    if ($latestCommit -eq $config.commit) {
        Write-Output 'State: up to date'
        continue
    }

    Write-Output 'State: upstream update available'
    if (-not $Prepare) {
        continue
    }

    $target = Join-Path $reviewRoot $name
    Assert-UnderWorkspace $target $workspaceRoot
    if (Test-Path -LiteralPath $target) {
        if (-not $Force) {
            throw "Review directory already exists; pass -Force to refresh: $target"
        }
        Remove-Item -LiteralPath $target -Recurse -Force
    }

    New-Item -ItemType Directory -Path $reviewRoot -Force | Out-Null
    Invoke-Git @('clone', '--filter=blob:none', '--branch', $config.branch, $config.repository, $target) | Write-Output
    Invoke-Git @('-C', $target, 'fetch', 'origin', $config.commit) | Write-Output

    $patchPath = Join-Path $target 'upstream-changes.patch'
    Invoke-Git @('-C', $target, 'diff', '--binary', $config.commit, $latestCommit, "--output=$patchPath") | Out-Null
    $commits = @(Invoke-Git @('-C', $target, 'log', '--oneline', "$($config.commit)..$latestCommit"))
    [System.IO.File]::WriteAllLines((Join-Path $target 'upstream-commits.txt'), $commits)

    if ($name -eq 'backend') {
        & (Join-Path $PSScriptRoot 'enforce-theme-boundary.ps1') -BackendRoot $target -Prune
    }

    Write-Output "Prepared isolated review source: $target"
    Write-Output "Change patch: $patchPath"
}

if (-not $Prepare) {
    Write-Output ""
    Write-Output 'Use -Prepare to clone changed upstreams into .upstream-review without modifying active Sakura source.'
}
