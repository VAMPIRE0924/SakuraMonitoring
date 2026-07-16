param(
    [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

function Require-Path([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}

function Get-RelativeAssetPath([string]$Url) {
    if ([string]::IsNullOrWhiteSpace($Url)) {
        return $null
    }

    if ($Url.StartsWith('http://', [System.StringComparison]::OrdinalIgnoreCase) -or
        $Url.StartsWith('https://', [System.StringComparison]::OrdinalIgnoreCase) -or
        $Url.StartsWith('data:', [System.StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }

    $pathOnly = ($Url -split '[?#]', 2)[0]
    if ([string]::IsNullOrWhiteSpace($pathOnly)) {
        return $null
    }

    return $pathOnly.TrimStart('/')
}

$workspaceFull = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
$backendRoot = [System.IO.Path]::Combine($workspaceFull, 'upstream', 'nezha')
$templateRegistry = [System.IO.Path]::Combine($backendRoot, 'service', 'singleton', 'frontend-templates.yaml')
$dashboardMain = [System.IO.Path]::Combine($backendRoot, 'cmd', 'dashboard', 'main.go')
$templateDist = [System.IO.Path]::Combine($backendRoot, 'cmd', 'dashboard', 'sakura-user-dist')
$indexPath = Join-Path $templateDist 'index.html'
$adminDist = [System.IO.Path]::Combine($backendRoot, 'cmd', 'dashboard', 'admin-dist')
$userDist = [System.IO.Path]::Combine($backendRoot, 'cmd', 'dashboard', 'user-dist')

Require-Path $templateRegistry 'Frontend template registry'
Require-Path $dashboardMain 'Dashboard main.go'
Require-Path $templateDist 'Sakura template dist'
Require-Path $indexPath 'Sakura template index'
Require-Path (Join-Path $adminDist 'index.html') 'Official admin template index'
Require-Path (Join-Path $userDist 'index.html') 'Official user template index'

$registry = Get-Content -LiteralPath $templateRegistry -Raw
if ($registry -notmatch 'path:\s*"sakura-user-dist"' -or $registry -notmatch 'name:\s*"Sakura"') {
    throw 'Sakura user template is not registered in frontend-templates.yaml.'
}

if ($registry -match 'SakuraAdmin') {
    throw 'SakuraAdmin must not be registered as a binary admin template.'
}

$main = Get-Content -LiteralPath $dashboardMain -Raw
if ($main -notmatch '//go:embed\s+\*-dist') {
    throw 'Dashboard embed rule does not include *-dist templates.'
}

foreach ($officialDist in @($adminDist, $userDist)) {
    $officialIndex = Get-Content -LiteralPath (Join-Path $officialDist 'index.html') -Raw
    if ($officialIndex -match 'Sakura Monitoring' -or $officialIndex -match 'sakura-assets') {
        throw "Official template appears to contain Sakura assets: $officialDist"
    }

    if (Test-Path -LiteralPath (Join-Path $officialDist 'sakura-assets')) {
        throw "Official template must not contain sakura-assets: $officialDist"
    }

    if (Test-Path -LiteralPath (Join-Path $officialDist 'h7q2m')) {
        throw "Official template must not contain legacy Nginx external assets: $officialDist"
    }
}

$requiredAssets = @(
    'manifest.json',
    'apple-touch-icon.png',
	'sakura-assets/sakura-mark.png',
    'sakura-assets/sakura-background.jpg',
    'sakura-assets/sakura-illustration.webp'
)

foreach ($asset in $requiredAssets) {
    Require-Path (Join-Path $templateDist $asset) 'Required Sakura asset'
}

if (Test-Path -LiteralPath (Join-Path $templateDist 'android-chrome-192x192.png')) {
    throw 'Unreferenced android-chrome-192x192.png should not be present in the built Sakura template.'
}

$index = Get-Content -LiteralPath $indexPath -Raw
$assetMatches = [regex]::Matches($index, '(?:src|href)="([^"]+)"')
$missing = New-Object System.Collections.Generic.List[string]

foreach ($match in $assetMatches) {
    $relative = Get-RelativeAssetPath $match.Groups[1].Value
    if ($null -eq $relative) {
        continue
    }

    if ($relative -eq 'src/main.tsx') {
        continue
    }

    $assetPath = Join-Path $templateDist $relative
    if (-not (Test-Path -LiteralPath $assetPath)) {
        $missing.Add($match.Groups[1].Value)
    }
}

if ($missing.Count -gt 0) {
    throw ("Built index references missing local assets: {0}" -f ($missing -join ', '))
}

Write-Output "Sakura template registry and embedded dist checks passed: $templateDist"
