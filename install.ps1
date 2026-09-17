[CmdletBinding()]
param(
    [string]$DshHome = $env:DSH_HOME,
    [switch]$SkipSkill,
    [switch]$SkipLink
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Say([string]$text) { Write-Host $text }

Say "dsh-computer-use -> installing from $here"

if (-not $SkipSkill) {
    if (-not $DshHome) {
        Say 'DSH_HOME is not set and -DshHome was not given: skipping the skill copy.'
        Say 'Copy SKILL.md to <dsh home>\skills\dsh-computer-use\SKILL.md by hand, or set DSH_HOME.'
    } else {

        $target = Join-Path $DshHome 'skills\dsh-computer-use'
        New-Item -ItemType Directory -Force -Path $target | Out-Null
        Copy-Item (Join-Path $here 'SKILL.md') (Join-Path $target 'SKILL.md') -Force
        Say "skill installed: $target\SKILL.md"
    }
}

if (-not $SkipLink) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Say 'npm is not available: skipping the PATH link. Call the CLI as: node <repo>\src\cli.js'
    } else {
        & npm link --silent 2>&1 | ForEach-Object { Say $_ }
        if ($LASTEXITCODE -eq 0) { Say 'CLI linked: dsh-cu' }
        else { Say 'npm link failed (a global prefix you cannot write to?): call the CLI as node <repo>\src\cli.js' }
    }
}

Say ''
Say 'Verify the installation:'
& node (Join-Path $here 'src\verify.js')
Say '  node src\cli.js doctor'
Say '  node src\cli.js self-test     (takes over the mouse and keyboard for ~40s)'
