param(
    [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Require-Path([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}

function Assert-UnderPath([string]$Child, [string]$Parent) {
    $childFull = [System.IO.Path]::GetFullPath($Child)
    $parentFull = [System.IO.Path]::GetFullPath($Parent)
    if (-not $parentFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $parentFull += [System.IO.Path]::DirectorySeparatorChar
    }
    if (-not $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Resolved path escapes workspace: $childFull"
    }
}

function Get-TemplateValue([string]$Registry, [string]$Path, [string]$Key) {
    $pattern = "(?ms)-\s+path:\s+`"$([regex]::Escape($Path))`".*?^\s+$([regex]::Escape($Key)):\s+`"([^`"]+)`""
    $match = [regex]::Match($Registry, $pattern)
    if (-not $match.Success) {
        throw "Template '$Path' is missing '$Key' in frontend-templates.yaml."
    }
    return $match.Groups[1].Value
}

function Convert-GitHubRepoToDistUrl([string]$Repository, [string]$Version) {
    $uri = [Uri]$Repository
    $repoPath = $uri.AbsolutePath.Trim('/')
    if ([string]::IsNullOrWhiteSpace($repoPath) -or $repoPath.Split('/').Count -ne 2) {
        throw "Unsupported GitHub repository URL: $Repository"
    }
    return "https://github.com/$repoPath/releases/download/$Version/dist.zip"
}

function Install-TemplateDist(
    [string]$TemplatePath,
    [string]$DownloadUrl,
    [string]$BackendRoot,
    [string]$WorkspaceFull
) {
    $target = [System.IO.Path]::Combine($BackendRoot, 'cmd', 'dashboard', $TemplatePath)
    Assert-UnderPath $target $WorkspaceFull
    New-Item -ItemType Directory -Path $target -Force | Out-Null

    $indexPath = Join-Path $target 'index.html'
    $sourceMarkerPath = Join-Path $target '.sakura-source'
    if ((Test-Path -LiteralPath $indexPath) -and
        (Test-Path -LiteralPath $sourceMarkerPath) -and
        -not $Force) {
        $recordedSource = (Get-Content -LiteralPath $sourceMarkerPath -Raw).Trim()
        if ($recordedSource -eq $DownloadUrl) {
            Write-Output "Keeping current $TemplatePath from $DownloadUrl"
            return
        }
    }

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("sakura-official-dist-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    try {
        $zipPath = Join-Path $tempRoot "$TemplatePath.zip"
        $extractRoot = Join-Path $tempRoot 'extract'
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $zipPath
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force

        $sourceDist = Join-Path $extractRoot 'dist'
        Require-Path (Join-Path $sourceDist 'index.html') "$TemplatePath release index"

        Get-ChildItem -LiteralPath $target -Force |
            Where-Object { $_.Name -ne '.gitkeep' } |
            Remove-Item -Recurse -Force

        Get-ChildItem -LiteralPath $sourceDist -Force |
            Copy-Item -Destination $target -Recurse -Force
        Set-Content -LiteralPath $sourceMarkerPath -Value $DownloadUrl -Encoding Ascii
        Write-Output "Prepared $TemplatePath from $DownloadUrl"
    }
    finally {
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force
        }
    }
}

$workspaceFull = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
$backendRoot = [System.IO.Path]::Combine($workspaceFull, 'upstream', 'nezha')
$registryPath = [System.IO.Path]::Combine($backendRoot, 'service', 'singleton', 'frontend-templates.yaml')
Require-Path $registryPath 'Frontend template registry'

$registry = Get-Content -LiteralPath $registryPath -Raw

foreach ($templatePath in @('admin-dist', 'user-dist')) {
    $repository = Get-TemplateValue $registry $templatePath 'repository'
    $version = Get-TemplateValue $registry $templatePath 'version'
    $downloadUrl = Convert-GitHubRepoToDistUrl $repository $version
    Install-TemplateDist $templatePath $downloadUrl $backendRoot $workspaceFull
}
