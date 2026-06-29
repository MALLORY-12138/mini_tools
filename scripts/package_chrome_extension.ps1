param(
  [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ManifestPath = Join-Path $RootDir "manifest.json"
$Manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
$Version = $Manifest.version
$PackageName = "mini-tools-chrome-extension-v$Version"
$StageDir = Join-Path $OutputDir $PackageName
$ZipPath = Join-Path $OutputDir "$PackageName.zip"

$AbsoluteOutputDir = Join-Path $RootDir $OutputDir
$AbsoluteStageDir = Join-Path $RootDir $StageDir
$AbsoluteZipPath = Join-Path $RootDir $ZipPath

New-Item -ItemType Directory -Force -Path $AbsoluteOutputDir | Out-Null
if (Test-Path -LiteralPath $AbsoluteStageDir) {
  Remove-Item -LiteralPath $AbsoluteStageDir -Recurse -Force
}
if (Test-Path -LiteralPath $AbsoluteZipPath) {
  Remove-Item -LiteralPath $AbsoluteZipPath -Force
}

New-Item -ItemType Directory -Force -Path $AbsoluteStageDir | Out-Null

$RuntimeItems = @(
  "manifest.json",
  "src",
  "data"
)

foreach ($Item in $RuntimeItems) {
  $Source = Join-Path $RootDir $Item
  $Destination = Join-Path $AbsoluteStageDir $Item

  if ((Get-Item -LiteralPath $Source).PSIsContainer) {
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse
  } else {
    Copy-Item -LiteralPath $Source -Destination $Destination
  }
}

Compress-Archive -Path (Join-Path $AbsoluteStageDir "*") -DestinationPath $AbsoluteZipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $AbsoluteStageDir -Recurse -Force

Write-Output "Created $ZipPath"
