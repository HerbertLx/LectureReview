param(
  [ValidateRange(1024,65535)][int]$Port = 8767,
  [switch]$NoBrowser,
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$env:PYTHONUTF8 = '1'
$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
Write-Host 'LectureReview | Local PDF study workspace' -ForegroundColor Cyan
if (-not (Test-Path -LiteralPath $venvPython)) {
  $candidates = @()
  foreach ($name in @('py.exe', 'python.exe', 'python3.exe')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      $arguments = @()
      if ($name -eq 'py.exe') { $arguments = @('-3') }
      $candidates += [pscustomobject]@{Executable=$command.Source; Arguments=$arguments}
    }
  }
  $selected = $null
  foreach ($candidate in $candidates) {
    try {
      $candidateArguments = @($candidate.Arguments) + @('-c', 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)')
      & $candidate.Executable @candidateArguments 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { $selected=$candidate; break }
    } catch { }
  }
  if (-not $selected) {
    Write-Host 'Python 3.10+ was not found.' -ForegroundColor Yellow
    Write-Host 'Install Python from https://www.python.org/downloads/windows/'
    Write-Host 'Enable "Add python.exe to PATH", then double-click start.bat again.'
    exit 1
  }
  Write-Host '[1/3] Creating the project Python environment...'
  $createArguments = @($selected.Arguments) + @('-m', 'venv', (Join-Path $projectRoot '.venv'))
  & $selected.Executable @createArguments
  if ($LASTEXITCODE -ne 0) { throw 'Could not create .venv. Check folder write permission.' }
}
Write-Host '[2/3] Checking dependencies...'
$requirementsPath = Join-Path $projectRoot 'requirements.txt'
$stampPath = Join-Path $projectRoot '.venv\requirements.sha256'
$hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
try { $requirementsHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash([IO.File]::ReadAllBytes($requirementsPath))).Replace('-', '') }
finally { $hashAlgorithm.Dispose() }
$previousHash = ''
if (Test-Path -LiteralPath $stampPath) { $previousHash=(Get-Content -LiteralPath $stampPath -Raw).Trim() }
$dependenciesReady = $false
try {
  & $venvPython -c 'import pymupdf; v=tuple(int(n) for n in pymupdf.VersionBind.split(chr(46))[:2]); assert (1,24)<=v<(2,0)' 2>$null | Out-Null
  $dependenciesReady = $LASTEXITCODE -eq 0
} catch { $dependenciesReady = $false }
if (-not $dependenciesReady -or $previousHash -ne $requirementsHash) {
  Write-Host 'Installing PDF support. Internet is required for the first setup...'
  & $venvPython -m pip install --disable-pip-version-check -r $requirementsPath
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your network or pip proxy settings, then retry.' }
  [System.IO.File]::WriteAllText($stampPath, $requirementsHash)
}
if ($CheckOnly) { Write-Host 'Ready. Python and PDF dependencies are available.' -ForegroundColor Green; exit 0 }
Write-Host '[3/3] Starting the reader...'
$launchArguments = @((Join-Path $projectRoot 'launcher.py'), '--port', [string]$Port)
if ($NoBrowser) { $launchArguments += '--no-browser' }
& $venvPython @launchArguments
exit $LASTEXITCODE
