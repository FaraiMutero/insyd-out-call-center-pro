<#
.SYNOPSIS
  Run this FROM AZURE CLOUD SHELL (PowerShell mode) to manually wire up GitHub Actions
  CD for an already-deployed InsydOut Call Center Pro Web App, and force an immediate
  one-time deploy of the latest commit on GitHub — without touching the App Settings
  you already configured (APP_SECRET, TRANSCRIPTION_PROVIDER, ANALYSIS_PROVIDER, etc.).

.DESCRIPTION
  Context: deploy/azure-deploy.ps1's GitHub Actions step failed when run from a local
  machine (Azure CLI session issues). Cloud Shell is a clean, pre-authenticated `az`
  environment, so this script re-attempts just that step here, plus some safety nets:

    1. Confirms you're logged in (Cloud Shell normally already is).
    2. Snapshots the Web App's current App Settings and startup command to a JSON
       file under $HOME, purely as a safety net / audit trail — connecting GitHub
       Actions does not itself modify App Settings, but this gives you something to
       diff/restore from if anything looks wrong afterwards.
    3. Runs `az webapp deployment github-actions add`, which:
         - commits a new GitHub Actions workflow file to your repo (this commit is
           itself a push, so GitHub immediately runs it — this IS the "one-time fresh
           pull", you don't need a separate trigger for it)
         - wires the repo so every future push to the branch auto-deploys too
    4. Re-reads the Web App's App Settings and startup command immediately after, and
       compares them to the pre-change snapshot. If anything is missing, it's restored
       automatically from the snapshot.
    5. Prints the snapshot file path and where to watch the deploy run.

  This script does NOT recreate the resource group / plan / web app (they already
  exist) and does NOT touch DB_FILE, PORT, or any other settings — only the GitHub
  Actions deployment wiring, plus the safety-net snapshot/restore of App Settings.

.PARAMETER ResourceGroupName
  Existing resource group. Default: insydout-callcenter-pro-rg

.PARAMETER WebAppName
  Existing Web App name. Default: insydout-callcenter-pro

.PARAMETER GitHubRepo
  "<owner>/<repo>" to deploy from. Default: FaraiMutero/insyd-out-call-center-pro

.PARAMETER GitHubBranch
  Branch to deploy from. Default: master

.PARAMETER GitHubToken
  Optional GitHub Personal Access Token (repo + workflow scopes) for non-interactive
  setup. If omitted, falls back to interactive device-code login (--login-with-github)
  — Cloud Shell will print a URL + code to open in any browser.

.EXAMPLE
  ./cloudshell-wire-github-actions.ps1
.EXAMPLE
  ./cloudshell-wire-github-actions.ps1 -GitHubToken $env:GITHUB_PAT
#>

[CmdletBinding()]
param(
  [string]$ResourceGroupName = "insydout-callcenter-pro-rg",
  [string]$WebAppName = "insydout-callcenter-pro",
  [string]$GitHubRepo = "FaraiMutero/insyd-out-call-center-pro",
  [string]$GitHubBranch = "master",
  [string]$GitHubToken = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Invoke-Az {
  param([string[]]$AzArgs, [switch]$AllowFailure)
  Write-Verbose "az $($AzArgs -join ' ')"
  # Deliberately NOT merging stderr (2>&1) here: az writes warnings/deprecation
  # notices to stderr, and merging would prepend that text to stdout — breaking
  # ConvertFrom-Json on any -o json output. Letting stderr stream to the console
  # directly still surfaces it to you; $output stays clean stdout only.
  $output = & az @AzArgs
  if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
    throw "Azure CLI command failed: az $($AzArgs -join ' ')"
  }
  return $output
}

# -- 0. Pre-flight ------------------------------------------------------------

Write-Step "Checking Azure CLI session"
try {
  Invoke-Az @("account", "show", "-o", "none")
} catch {
  throw "Not logged in. Run 'az login' first (Cloud Shell is usually already logged in — if you see this, your session may have expired)."
}

Write-Step "Confirming Web App exists: $WebAppName ($ResourceGroupName)"
$null = Invoke-Az @("webapp", "show", "-n", $WebAppName, "-g", $ResourceGroupName, "-o", "none")

# -- 1. Snapshot current App Settings + startup command (safety net) ---------

Write-Step "Snapshotting current App Settings and startup command"

$backupDir = Join-Path $HOME "insydout-deploy-backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$settingsBackupPath = Join-Path $backupDir "appsettings-$timestamp.json"
$startupBackupPath = Join-Path $backupDir "startup-command-$timestamp.txt"

$currentSettingsJson = Invoke-Az @("webapp", "config", "appsettings", "list", "-n", $WebAppName, "-g", $ResourceGroupName, "-o", "json")
$currentSettingsJson | Out-File -FilePath $settingsBackupPath -Encoding utf8
$currentSettings = $currentSettingsJson | ConvertFrom-Json

$currentStartupCommand = (Invoke-Az @("webapp", "config", "show", "-n", $WebAppName, "-g", $ResourceGroupName, "--query", "siteConfig.appCommandLine", "-o", "tsv")) | Out-String
$currentStartupCommand = $currentStartupCommand.Trim()
$currentStartupCommand | Out-File -FilePath $startupBackupPath -Encoding utf8

Write-Host "Backed up $($currentSettings.Count) app settings to: $settingsBackupPath"
Write-Host "Backed up startup command ('$currentStartupCommand') to: $startupBackupPath"

# -- 2. Determine current runtime (needed by the github-actions add command) -

Write-Step "Reading current Linux runtime stack from the Web App"
$linuxFxVersion = (Invoke-Az @("webapp", "config", "show", "-n", $WebAppName, "-g", $ResourceGroupName, "--query", "linuxFxVersion", "-o", "tsv")) | Out-String
$linuxFxVersion = $linuxFxVersion.Trim()
if (-not $linuxFxVersion) { throw "Could not read the Web App's current runtime (linuxFxVersion) — check the app exists and is a Linux Node app." }
# linuxFxVersion looks like "NODE|22-lts"; az webapp deployment github-actions add wants the same "NODE|22-lts" form.
$runtime = $linuxFxVersion
Write-Host "Using runtime: $runtime"

# -- 3. Wire up GitHub Actions CD ----------------------------------------------

Write-Step "Connecting $GitHubRepo (branch: $GitHubBranch) via GitHub Actions"
Write-Host "This commits a workflow file to your repo, which itself triggers the first deploy of the current latest commit." -ForegroundColor Yellow

$ghArgs = @("webapp", "deployment", "github-actions", "add",
  "--repo", $GitHubRepo,
  "--branch", $GitHubBranch,
  "-n", $WebAppName,
  "-g", $ResourceGroupName,
  "--runtime", $runtime)

if ($GitHubToken) {
  $ghArgs += @("--token", $GitHubToken)
} else {
  $ghArgs += "--login-with-github"
  Write-Host "No -GitHubToken supplied — Cloud Shell will print a device-code URL; open it in any browser to authorize." -ForegroundColor Yellow
}

Invoke-Az $ghArgs

# -- 4. Verify App Settings + startup command survived, restore if not -------

Write-Step "Verifying App Settings and startup command are unchanged"

$afterSettingsJson = Invoke-Az @("webapp", "config", "appsettings", "list", "-n", $WebAppName, "-g", $ResourceGroupName, "-o", "json")
$afterSettings = $afterSettingsJson | ConvertFrom-Json
$afterSettingsMap = @{}
foreach ($s in $afterSettings) { $afterSettingsMap[$s.name] = $s.value }

$missing = @()
foreach ($s in $currentSettings) {
  if (-not $afterSettingsMap.ContainsKey($s.name)) {
    $missing += "$($s.name)=$($s.value)"
  }
}

if ($missing.Count -gt 0) {
  Write-Host "$($missing.Count) app setting(s) went missing after wiring GitHub Actions — restoring from backup now: $($missing -join ', ' -replace '=.*?(,|$)', '$1')" -ForegroundColor Yellow
  Invoke-Az (@("webapp", "config", "appsettings", "set", "-n", $WebAppName, "-g", $ResourceGroupName, "--settings") + $missing + @("-o", "none"))
  Write-Host "Restored." -ForegroundColor Green
} else {
  Write-Host "All $($currentSettings.Count) app settings are intact. No restore needed." -ForegroundColor Green
}

$afterStartupCommand = (Invoke-Az @("webapp", "config", "show", "-n", $WebAppName, "-g", $ResourceGroupName, "--query", "siteConfig.appCommandLine", "-o", "tsv")) | Out-String
$afterStartupCommand = $afterStartupCommand.Trim()

if ($afterStartupCommand -ne $currentStartupCommand -and $currentStartupCommand) {
  Write-Host "Startup command changed ('$afterStartupCommand') — restoring to '$currentStartupCommand'" -ForegroundColor Yellow
  Invoke-Az @("webapp", "config", "set", "-n", $WebAppName, "-g", $ResourceGroupName, "--startup-file", $currentStartupCommand, "-o", "none")
  Write-Host "Restored." -ForegroundColor Green
} else {
  Write-Host "Startup command unchanged ('$afterStartupCommand')." -ForegroundColor Green
}

# -- Done ----------------------------------------------------------------------

Write-Step "Done"
Write-Host "GitHub Actions is now wired up for $GitHubRepo ($GitHubBranch -> $WebAppName)."
Write-Host "The workflow commit just pushed to your repo triggers the first deploy automatically — watch it under the repo's Actions tab on GitHub, or run:"
Write-Host "  az webapp log tail -n $WebAppName -g $ResourceGroupName"
Write-Host ""
Write-Host "Backups saved to (in case you need to manually diff/restore later):"
Write-Host "  $settingsBackupPath"
Write-Host "  $startupBackupPath"
