param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot
$LogPath = Join-Path $ProjectRoot 'motion-audit-log.txt'
$Failed = $false
$TranscriptStarted = $false

function Invoke-NpmStep {
  param([string]$Label, [string[]]$Arguments)
  Write-Host "`n========== $Label ==========" -ForegroundColor Cyan
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE. See motion-audit-log.txt."
  }
}

try {
  Start-Transcript -Path $LogPath -Force | Out-Null
  $TranscriptStarted = $true
  Write-Host 'Mیتی / Motion audit' -ForegroundColor Green
  Write-Host 'این اسکریپت نصب وابستگی‌ها، دریافت مدل، تست‌های حرکت و ساخت نسخه آفلاین را اجرا می‌کند.'
  Write-Host "Project: $ProjectRoot"

  $NodeVersionText = (& node.exe --version).Trim()
  $NodeVersion = [version]($NodeVersionText.TrimStart('v'))
  Write-Host "Node.js: $NodeVersionText"
  if ($NodeVersion -lt [version]'22.12.0') {
    throw "Node.js 22.12.0+ required; found $NodeVersionText. Install a current Node.js LTS release and run again."
  }
  $NpmVersion = (& npm.cmd --version).Trim()
  Write-Host "npm: $NpmVersion"

  if (-not $SkipInstall) {
    Invoke-NpmStep 'Install exact dependencies from lockfile' @('ci', '--no-audit', '--no-fund')
  } elseif (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
    throw '-SkipInstall was provided but node_modules does not exist. Run without -SkipInstall.'
  }

  if (-not (Test-Path (Join-Path $ProjectRoot 'public/models/human.glb'))) {
    Invoke-NpmStep 'Fetch pinned CC0 model (internet required for this step)' @('run', 'fetch:model')
  }
  Write-Host "`n========== Verify GLB and SHA-256 ==========" -ForegroundColor Cyan
  & node.exe tools/verify-model.mjs
  if ($LASTEXITCODE -ne 0) { throw "Model verification failed with exit code $LASTEXITCODE." }

  Write-Host "`n========== Static source preflight ==========" -ForegroundColor Cyan
  & node.exe tools/audit-motion-source.mjs
  if ($LASTEXITCODE -ne 0) { throw "Static source preflight failed with exit code $LASTEXITCODE." }

  Invoke-NpmStep 'Focused movement/anatomy tests' @('test', '--', 'tests/motion-library.test.ts', 'tests/motion-grip.test.ts', 'tests/motion-anatomy.test.ts', 'tests/model-path.test.ts')
  Invoke-NpmStep 'Complete test suite' @('test')
  Invoke-NpmStep 'Production build' @('run', 'build')
  Invoke-NpmStep 'Single-file offline build' @('run', 'build:offline')

  Write-Host "`n========== Verify single-file offline bundle ==========" -ForegroundColor Cyan
  & node.exe tools/verify-offline-bundle.mjs
  if ($LASTEXITCODE -ne 0) { throw "Offline bundle verification failed with exit code $LASTEXITCODE." }

  Write-Host "`nSUCCESS: all automated gates passed. Inspect front and side views manually before calling the motions visually accurate." -ForegroundColor Green
} catch {
  $Failed = $true
  Write-Host "`nFAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'The log has been saved to motion-audit-log.txt (if logging was available).'
} finally {
  if ($TranscriptStarted) {
    Stop-Transcript | Out-Null
  }
}

if ($Failed) { exit 1 }
exit 0
