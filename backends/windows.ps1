param(
    [Parameter(Position = 0)][string]$Command,
    [Parameter(Position = 1)][string]$A1,
    [Parameter(Position = 2)][string]$A2,
    [Parameter(Position = 3)][string]$A3,
    [int]$Announce = 8,
    [switch]$Quiet,
    [switch]$Horizontal
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if ($env:DSH_CU_ARGV) {
    $argv = @((ConvertFrom-Json $env:DSH_CU_ARGV))
    $Command = [string]$argv[0]
    $operands = New-Object System.Collections.ArrayList
    for ($index = 1; $index -lt $argv.Count; $index++) {
        $argument = [string]$argv[$index]
        switch -Regex ($argument) {
            '^-Announce$' { $index++; $Announce = [int]$argv[$index] }
            '^-Quiet$' { $Quiet = $true }
            '^--horizontal$' { $Horizontal = $true }
            default { [void]$operands.Add($argument) }
        }
    }
    if ($operands.Count -gt 0) { $A1 = $operands[0] }
    if ($operands.Count -gt 1) { $A2 = $operands[1] }
    if ($operands.Count -gt 2) { $A3 = $operands[2] }

    Remove-Item Env:\DSH_CU_ARGV -ErrorAction SilentlyContinue
}

$sources = @('Interop', 'StateFiles', 'Input', 'OverlayForm', 'PanelForm', 'PointerRenderer', 'FrameRenderer', 'Indicator', 'SystemCursors')
$source = ($sources | ForEach-Object { Get-Content -Raw (Join-Path $PSScriptRoot "csharp\$_.cs") }) -join "`n"
Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing, System.Windows.Forms
[DshCu.Native]::EnableDpiAwareness()

$FreshSeconds = 5

$stopFile = Join-Path $env:TEMP 'dsh-cu.stop'
$aliveFile = Join-Path $env:TEMP 'dsh-cu.alive'
$pidFile = Join-Path $env:TEMP 'dsh-cu.pid'
$touchFile = Join-Path $env:TEMP 'dsh-cu.touch'
$brokerReady = Join-Path $env:TEMP 'dsh-cu.broker.ready'
$brokerStop = Join-Path $env:TEMP 'dsh-cu.broker.stop'

function Get-VisibleWindow {
    param([string]$TitleLike)
    $windows = Get-Process | Where-Object {
        $_.MainWindowHandle -ne 0 -and
        [DshCu.Native]::IsWindowVisible($_.MainWindowHandle) -and
        $_.MainWindowTitle -ne ''
    }
    if ($TitleLike) {
        $pattern = '*' + [System.Management.Automation.WildcardPattern]::Escape($TitleLike) + '*'
        $windows = $windows | Where-Object { $_.MainWindowTitle -like $pattern }
    }
    return $windows | Sort-Object ProcessName
}

function Test-Integer([string]$value, [string]$name) {
    if ([string]::IsNullOrWhiteSpace($value)) { throw "$name is required" }
    if ($value -notmatch '^-?\d+$') { throw "$name must be an integer, got `"$value`"" }
    return [int]$value
}

trap {
    Write-Output ("ERROR " + $_.Exception.Message)
    exit 1
}

function Focus-Process($process) {
    $handle = $process.MainWindowHandle
    if ($handle -eq [IntPtr]::Zero) { throw "process $($process.Id) has no window" }
    for ($attempt = 1; $attempt -le 6; $attempt++) {
        if ($attempt -eq 1) { (New-Object -ComObject WScript.Shell).AppActivate($process.Id) | Out-Null }
        if ([DshCu.Native]::FocusVerified($handle)) {
            Write-Output ("FOCUSED " + $process.MainWindowTitle)
            return
        }
        Start-Sleep -Milliseconds 180
    }
    throw "could not bring pid $($process.Id) to the foreground: another window keeps focus"
}

function Get-StateAge([string]$path) {
    try {
        if (-not (Test-Path $path)) { return [double]::MaxValue }
        return ((Get-Date) - (Get-Item $path -ErrorAction Stop).LastWriteTime).TotalSeconds
    } catch {
        return [double]::MaxValue
    }
}
function Get-StateText([string]$path) {
    try { return (Get-Content $path -Raw -ErrorAction Stop).Trim() }
    catch { return '' }
}
function Test-IndicatorProcess($process, [long]$startedTicks) {
    if (-not $process) { return $false }
    if ($process.ProcessName -ne 'powershell') { return $false }
    if ($startedTicks -le 0) { return $true }
    try {
        $drift = [Math]::Abs($process.StartTime.ToUniversalTime().Ticks - $startedTicks)
        return ($drift -lt (5 * [TimeSpan]::TicksPerSecond))
    } catch {
        return $false
    }
}
function Clear-Indicator {
    $fields = (Get-StateText $pidFile) -split '\s+'
    $owner = 0
    $ownerStarted = 0
    [void][int]::TryParse($fields[0], [ref]$owner)
    if ($fields.Count -ge 2) { [void][long]::TryParse($fields[1], [ref]$ownerStarted) }
    $process = if ($owner -gt 0) { Get-Process -Id $owner -ErrorAction SilentlyContinue } else { $null }
    if (Test-IndicatorProcess $process $ownerStarted) {
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 100
            if (-not (Get-Process -Id $owner -ErrorAction SilentlyContinue)) { break }
        }
        Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    }
    [DshCu.SystemCursors]::Restore() | Out-Null
    Remove-Item $aliveFile, $stopFile, $pidFile -Force -ErrorAction SilentlyContinue
}
switch ($Command) {
    'shot' {
        if ([string]::IsNullOrWhiteSpace($A1)) { throw 'shot needs a destination path' }
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bitmap.Size)
        $graphics.Dispose()
        $bitmap.Save($A1, [System.Drawing.Imaging.ImageFormat]::Png)
        $bitmap.Dispose()
        Write-Output ("CAPTURED " + $bounds.Width + "x" + $bounds.Height)
    }
    'move' { [DshCu.Input]::Move((Test-Integer $A1 'x'), (Test-Integer $A2 'y')) }
    'click' { [DshCu.Input]::Click((Test-Integer $A1 'x'), (Test-Integer $A2 'y'), $(if ($A3) { $A3 } else { 'left' })) }
    'wheel' {
        $delta = Test-Integer $A1 'delta'
        $at = ($A2 -and $A3)
        if ($Horizontal) {
            if ($at) { [DshCu.Input]::WheelHorizontalAt((Test-Integer $A2 'x'), (Test-Integer $A3 'y'), $delta) }
            else { [DshCu.Input]::WheelHorizontal($delta) }
        }
        elseif ($at) { [DshCu.Input]::WheelAt((Test-Integer $A2 'x'), (Test-Integer $A3 'y'), $delta) }
        else { [DshCu.Input]::Wheel($delta) }
    }
    'type' { [DshCu.Input]::Type($A1) }
    'key' { [DshCu.Input]::Key($A1, $(if ($A2) { $A2 } else { '' })) }
    'pos' {
        $point = New-Object DshCu.POINT
        [void][DshCu.Native]::GetCursorPos([ref]$point)
        Write-Output ("CURSOR " + $point.X + "," + $point.Y)
        Write-Output ("FOREGROUND " + [DshCu.Native]::ForegroundWindowTitle())
    }
    'windows' {
        Get-VisibleWindow | Select-Object Id, ProcessName, MainWindowTitle |
            Format-Table -AutoSize | Out-String -Width 200
    }
    'display' {
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        Write-Output ("DISPLAY " + $bounds.Width + "x" + $bounds.Height + " dpi=" + [DshCu.Native]::SystemDpi())
    }
    'focus' {
        $process = Get-Process -Id (Test-Integer $A1 'pid') -ErrorAction Stop
        if ($process.MainWindowHandle -eq [IntPtr]::Zero) { throw "process $A1 has no window" }
        for ($attempt = 1; $attempt -le 6; $attempt++) {
            if ($attempt -eq 1) {
                (New-Object -ComObject WScript.Shell).AppActivate($process.Id) | Out-Null
            }
            if ([DshCu.Native]::FocusVerified($process.MainWindowHandle)) {
                Write-Output ("FOCUSED " + $process.MainWindowTitle)
                exit 0
            }
            Start-Sleep -Milliseconds 180
        }
        throw "could not bring pid $A1 to the foreground: another window keeps focus"
    }
    'windows-json' {
        $entries = @(Get-VisibleWindow | ForEach-Object {
            $rect = New-Object DshCu.RECT
            [void][DshCu.Native]::GetWindowRect($_.MainWindowHandle, [ref]$rect)
            [pscustomobject]@{
                pid = $_.Id
                title = $_.MainWindowTitle
                left = $rect.Left
                top = $rect.Top
                width = $rect.Right - $rect.Left
                height = $rect.Bottom - $rect.Top
            }
        })

        if ($entries.Count -eq 0) { Write-Output '[]' }
        else { Write-Output (ConvertTo-Json -InputObject $entries -Compress) }
    }
    'focus-title' {
        $match = Get-VisibleWindow $A1 | Select-Object -First 1
        if (-not $match) { throw "no window title contains $A1" }
        Focus-Process $match
    }
    'wait-window' {
        $seconds = if ($A2) { [int]$A2 } else { 15 }
        $deadline = (Get-Date).AddSeconds($seconds)
        while ((Get-Date) -lt $deadline) {
            $match = Get-VisibleWindow $A1 | Select-Object -First 1
            if ($match) { Focus-Process $match; exit 0 }
            Start-Sleep -Milliseconds 400
        }
        throw "no window title contains $A1 within $seconds seconds"
    }
    'keys' {
        $parts = $A1 -split '\+'
        $modifiers = @('ctrl', 'shift', 'alt', 'win')
        $held = @()
        for ($index = 0; $index -lt $parts.Count - 1; $index++) {
            $name = $parts[$index].Trim()
            if ($modifiers -notcontains $name.ToLowerInvariant()) { throw "unknown modifier: $name" }
            [DshCu.Input]::Press($name)
            $held += $name
        }
        $tapKey = $parts[-1].Trim(); [DshCu.Input]::Press($tapKey); [DshCu.Input]::Release($tapKey)
        for ($index = $held.Count - 1; $index -ge 0; $index--) { [DshCu.Input]::Release($held[$index]) }
        Write-Output ('KEYS ' + $A1)
    }
    'clipboard' {
        if ($A1 -eq 'set') { Set-Clipboard -Value $A2; Write-Output 'CLIPBOARD SET' }
        elseif ($A1 -eq 'clear') { Set-Clipboard -Value 'dsh-cu-cleared'; Write-Output 'CLIPBOARD CLEARED' }
        else { Write-Output ('CLIPBOARD ' + (Get-Clipboard -Raw)) }
    }
    'broker-start' {
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, 'broker-loop')
        Start-Process powershell -Verb RunAs -ArgumentList $arguments | Out-Null
        Write-Output 'BROKER_STARTED'
    }
    'broker-loop' {
        Remove-Item $brokerStop -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $env:TEMP 'dsh-cu.broker.res.*') -Force -ErrorAction SilentlyContinue
        while (-not (Test-Path $brokerStop)) {
            Set-Content -Path $brokerReady -Value ([DateTime]::Now.ToString('O'))
            $request = Get-ChildItem (Join-Path $env:TEMP 'dsh-cu.broker.req.*') -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime | Select-Object -First 1
            if (-not $request) { Start-Sleep -Milliseconds 150; continue }
            $payload = Get-StateText $request.FullName
            $responsePath = Join-Path $env:TEMP ($request.Name -replace '\.req\.', '.res.')
            Remove-Item $request.FullName -Force -ErrorAction SilentlyContinue
            $result = ''
            try {
                $env:DSH_CU_ARGV = $payload
                $result = (& powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath 2>&1 | Out-String)
                Remove-Item Env:\DSH_CU_ARGV -ErrorAction SilentlyContinue
            } catch {
                $result = 'ERROR ' + $_.Exception.Message
            }
            Set-Content -Path $responsePath -Value $result -Encoding UTF8
        }
        Remove-Item $brokerReady, $brokerStop -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $env:TEMP 'dsh-cu.broker.res.*') -Force -ErrorAction SilentlyContinue
        Write-Output 'BROKER_STOPPED'
    }
    'broker-stop' {
        Set-Content -Path $brokerStop -Value 'stop'
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 150
            if (-not (Test-Path $brokerReady)) { break }
        }
        Remove-Item $brokerReady, $brokerStop -Force -ErrorAction SilentlyContinue
        Write-Output 'BROKER_STOPPED'
    }
    'broker-state' {
        if ((Get-StateAge $brokerReady) -lt $FreshSeconds) { Write-Output 'BROKER_RUNNING' }
        else { Write-Output 'BROKER_STOPPED' }
    }
    'run' {
        $output = (& cmd /c $A1 2>&1 | Out-String)
        Write-Output $output
    }
    'overlay-start' {
        Clear-Indicator
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, 'overlay', '-Announce', "$Announce")
        if ($Quiet) { $arguments += '-Quiet' }
        Start-Process powershell -ArgumentList $arguments -WindowStyle Hidden | Out-Null
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            Start-Sleep -Milliseconds 250
            if ((Get-StateAge $aliveFile) -lt $FreshSeconds) {
                Write-Output 'RUNNING'
                exit 0
            }
        }
        throw 'the indicator did not come up'
    }
    'overlay-state' {
        if ((Get-StateAge $aliveFile) -gt $FreshSeconds) { Write-Output 'STOPPED' } else { Write-Output 'RUNNING' }
        exit 0
    }
    'overlay' {
        if ($A1 -eq 'stop' -or $A1 -eq 'restore-cursor') {
            if ($A1 -eq 'stop') { Set-Content -Path $stopFile -Value ([DateTime]::Now.ToString('O')) }
            Clear-Indicator
            if ($A1 -eq 'stop') { Write-Output 'STOPPED' } else { Write-Output 'CURSOR_RESTORED' }
            exit 0
        }
        if (Test-Path $stopFile) { Remove-Item $stopFile -Force }
        Clear-Indicator
        $context = New-Object DshCu.Indicator($Quiet, $Announce)
        [System.Windows.Forms.Application]::Run($context)
        [DshCu.SystemCursors]::Restore() | Out-Null
        Write-Output 'OVERLAY_CLOSED'
    }
    default { throw "unknown command: $Command" }
}
