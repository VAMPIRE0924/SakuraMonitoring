param(
    [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$BackendRoot,
    [switch]$Prune,
    [switch]$RequireSakura
)

$ErrorActionPreference = 'Stop'
$allowedPaths = @('admin-dist', 'user-dist', 'sakura-user-dist')
$requiredPaths = @('admin-dist', 'user-dist')
if ($RequireSakura) {
    $requiredPaths += 'sakura-user-dist'
}

if ([string]::IsNullOrWhiteSpace($BackendRoot)) {
    $BackendRoot = Join-Path $WorkspaceRoot 'upstream\nezha'
}

$backendFull = (Resolve-Path -LiteralPath $BackendRoot).Path
$registryPath = Join-Path $backendFull 'service\singleton\frontend-templates.yaml'
$dashboardRoot = Join-Path $backendFull 'cmd\dashboard'
if (-not (Test-Path -LiteralPath $registryPath)) {
    throw "Frontend template registry not found: $registryPath"
}
if (-not (Test-Path -LiteralPath $dashboardRoot)) {
    throw "Dashboard source not found: $dashboardRoot"
}

$registry = Get-Content -LiteralPath $registryPath -Raw
$blocks = @([regex]::Matches($registry, '(?ms)^-\s+path:\s+"([^"]+)".*?(?=^-\s+path:|\z)'))
if ($blocks.Count -eq 0) {
    throw "No frontend templates found in: $registryPath"
}

$seen = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::Ordinal)
$keptBlocks = New-Object System.Collections.Generic.List[string]
$unexpected = New-Object System.Collections.Generic.List[string]
foreach ($block in $blocks) {
    $path = $block.Groups[1].Value
    if (-not $seen.Add($path)) {
        throw "Duplicate frontend template path: $path"
    }
    if ($path -in $allowedPaths) {
        $keptBlocks.Add($block.Value.TrimEnd())
    } else {
        $unexpected.Add($path)
    }
}

foreach ($path in $requiredPaths) {
    if (-not $seen.Contains($path)) {
        throw "Required frontend template is missing: $path"
    }
}

$unexpectedDirs = @(
    Get-ChildItem -LiteralPath $dashboardRoot -Directory -Filter '*-dist' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notin $allowedPaths }
)

if ($Prune) {
    if ($unexpected.Count -gt 0) {
        $normalized = ($keptBlocks -join "`r`n") + "`r`n"
        [System.IO.File]::WriteAllText($registryPath, $normalized, [System.Text.UTF8Encoding]::new($false))
    }
    foreach ($directory in $unexpectedDirs) {
        $directoryFull = [System.IO.Path]::GetFullPath($directory.FullName)
        $dashboardFull = [System.IO.Path]::GetFullPath($dashboardRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
        if (-not $directoryFull.StartsWith($dashboardFull, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove template directory outside dashboard root: $directoryFull"
        }
        Remove-Item -LiteralPath $directoryFull -Recurse -Force
    }
} elseif ($unexpected.Count -gt 0 -or $unexpectedDirs.Count -gt 0) {
    $items = @($unexpected) + @($unexpectedDirs.Name)
    throw "Unsupported frontend templates found: $($items -join ', ')"
}

$finalRegistry = Get-Content -LiteralPath $registryPath -Raw
$finalPaths = @([regex]::Matches($finalRegistry, '(?m)^-\s+path:\s+"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
$remainingDirs = @(
    Get-ChildItem -LiteralPath $dashboardRoot -Directory -Filter '*-dist' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notin $allowedPaths }
)
if (@($finalPaths | Where-Object { $_ -notin $allowedPaths }).Count -gt 0 -or $remainingDirs.Count -gt 0) {
    throw 'Frontend theme boundary enforcement failed.'
}

Write-Output "Frontend theme boundary passed: $($finalPaths -join ', ')"
