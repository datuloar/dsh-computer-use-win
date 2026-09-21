param([string]$Folder)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'DSH Computer Use Test ' + (Split-Path $Folder -Leaf)
$form.Size = New-Object System.Drawing.Size(980, 620)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [System.Drawing.Color]::FromArgb(22, 25, 34)
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font('Segoe UI', 12)
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Computer use test workspace'
$label.Location = New-Object System.Drawing.Point(32, 28)
$label.AutoSize = $true
$form.Controls.Add($label)
$edit = New-Object System.Windows.Forms.TextBox
$edit.AccessibleName = 'Test editor'
$edit.Multiline = $true
$edit.AcceptsTab = $true
$edit.ScrollBars = 'Both'
$edit.Location = New-Object System.Drawing.Point(32, 80)
$edit.Size = New-Object System.Drawing.Size(900, 320)
$form.Controls.Add($edit)
$encoding = New-Object System.Text.UTF8Encoding($false, $false)
$edit.Add_TextChanged({ [IO.File]::WriteAllText((Join-Path $Folder 'text.txt'), $edit.Text, $encoding) })
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Test action'
$button.AccessibleName = 'Test action'
$button.Location = New-Object System.Drawing.Point(32, 430)
$button.Size = New-Object System.Drawing.Size(180, 50)
$button.Add_Click({ [IO.File]::WriteAllText((Join-Path $Folder 'clicked.txt'), 'clicked') })
$form.Controls.Add($button)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 100
$script:presented = $false
$timer.Add_Tick({
    if (-not $script:presented) {
        $script:presented = $true
        $form.Hide()
        $form.Show()
        $form.Activate()
    }
    if (Test-Path (Join-Path $Folder 'stop')) { $form.Close() }
})
$form.Add_Shown({
    $edit.Focus()
    [IO.File]::WriteAllText((Join-Path $Folder 'ready.json'), (ConvertTo-Json @{ pid = $PID; title = $form.Text }))
    $timer.Start()
})
try { [System.Windows.Forms.Application]::Run($form) }
finally { $timer.Dispose(); $form.Dispose() }
