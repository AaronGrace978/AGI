# ═══════════════════════════════════════════════════════════════
#  AGI PRIME — Persistent Input Daemon
#  Stays alive. Reads JSON commands from stdin (one per line).
#  Writes JSON responses to stdout (one per line).
#  ~500ms faster per action vs cold-starting PowerShell each time.
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
"@ -Name NativeMethods -Namespace AGIPrimeDaemon -ErrorAction SilentlyContinue

# Signal ready
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if ($line -eq "" -or $line -eq "EXIT") { break }

    $result = @{ success = $true; output = "" }
    try {
        $input_data = $line | ConvertFrom-Json

        switch ($input_data.action) {
            "mouse_move" {
                $targetX = [int]$input_data.x
                $targetY = [int]$input_data.y
                $smooth = if ($input_data.smooth -eq $true) { $true } else { $false }

                if ($smooth) {
                    $startPoint = New-Object AGIPrimeDaemon.NativeMethods+POINT
                    [AGIPrimeDaemon.NativeMethods]::GetCursorPos([ref]$startPoint) | Out-Null
                    $startX = $startPoint.X
                    $startY = $startPoint.Y
                    $dist = [Math]::Sqrt(($targetX - $startX) * ($targetX - $startX) + ($targetY - $startY) * ($targetY - $startY))
                    $steps = [Math]::Max(15, [Math]::Min(60, [int]($dist / 15)))
                    $duration = [Math]::Max(200, [Math]::Min(800, [int]($dist * 0.8)))
                    $sleepPerStep = [Math]::Max(3, [int]($duration / $steps))

                    for ($i = 1; $i -le $steps; $i++) {
                        $t = $i / $steps
                        if ($t -lt 0.5) { $ease = 4 * $t * $t * $t }
                        else { $ease = 1 - [Math]::Pow(-2 * $t + 2, 3) / 2 }
                        $cx = [int]($startX + ($targetX - $startX) * $ease)
                        $cy = [int]($startY + ($targetY - $startY) * $ease)
                        [AGIPrimeDaemon.NativeMethods]::SetCursorPos($cx, $cy) | Out-Null
                        Start-Sleep -Milliseconds $sleepPerStep
                    }
                    [AGIPrimeDaemon.NativeMethods]::SetCursorPos($targetX, $targetY) | Out-Null
                    $result.output = "Smoothly moved mouse to $targetX,$targetY (${steps} steps, ${duration}ms)"
                } else {
                    [AGIPrimeDaemon.NativeMethods]::SetCursorPos($targetX, $targetY) | Out-Null
                    $result.output = "Moved mouse to $targetX,$targetY"
                }
            }
            "mouse_click" {
                $clickX = [int]$input_data.x
                $clickY = [int]$input_data.y
                $startPoint = New-Object AGIPrimeDaemon.NativeMethods+POINT
                [AGIPrimeDaemon.NativeMethods]::GetCursorPos([ref]$startPoint) | Out-Null
                $dist = [Math]::Sqrt(($clickX - $startPoint.X) * ($clickX - $startPoint.X) + ($clickY - $startPoint.Y) * ($clickY - $startPoint.Y))
                if ($dist -gt 20) {
                    $steps = [Math]::Max(10, [Math]::Min(40, [int]($dist / 20)))
                    $sleepPerStep = [Math]::Max(3, [int](400 / $steps))
                    for ($i = 1; $i -le $steps; $i++) {
                        $t = $i / $steps
                        if ($t -lt 0.5) { $ease = 4 * $t * $t * $t } else { $ease = 1 - [Math]::Pow(-2 * $t + 2, 3) / 2 }
                        $cx = [int]($startPoint.X + ($clickX - $startPoint.X) * $ease)
                        $cy = [int]($startPoint.Y + ($clickY - $startPoint.Y) * $ease)
                        [AGIPrimeDaemon.NativeMethods]::SetCursorPos($cx, $cy) | Out-Null
                        Start-Sleep -Milliseconds $sleepPerStep
                    }
                }
                [AGIPrimeDaemon.NativeMethods]::SetCursorPos($clickX, $clickY) | Out-Null
                Start-Sleep -Milliseconds 30
                $btn = if ($input_data.button) { $input_data.button } else { "left" }
                switch ($btn) {
                    "right" {
                        [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0008, 0, 0, 0, 0)
                        [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0010, 0, 0, 0, 0)
                    }
                    "middle" {
                        [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0020, 0, 0, 0, 0)
                        [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0040, 0, 0, 0, 0)
                    }
                    default {
                        [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0002, 0, 0, 0, 0)
                        [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0004, 0, 0, 0, 0)
                    }
                }
                if ($input_data.doubleClick -eq $true) {
                    Start-Sleep -Milliseconds 60
                    switch ($btn) {
                        "right" {
                            [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0008, 0, 0, 0, 0)
                            [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0010, 0, 0, 0, 0)
                        }
                        default {
                            [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0002, 0, 0, 0, 0)
                            [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0004, 0, 0, 0, 0)
                        }
                    }
                }
                $result.output = "Clicked $btn at $($input_data.x),$($input_data.y)"
            }
            "mouse_scroll" {
                [AGIPrimeDaemon.NativeMethods]::SetCursorPos([int]$input_data.x, [int]$input_data.y) | Out-Null
                Start-Sleep -Milliseconds 30
                $amt = if ($input_data.amount) { [int]$input_data.amount } else { -120 }
                [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0800, 0, 0, $amt, 0)
                $dir = if ($amt -gt 0) { "up" } else { "down" }
                $result.output = "Scrolled $dir at $($input_data.x),$($input_data.y)"
            }
            "mouse_drag" {
                [AGIPrimeDaemon.NativeMethods]::SetCursorPos([int]$input_data.fromX, [int]$input_data.fromY) | Out-Null
                Start-Sleep -Milliseconds 50
                [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0002, 0, 0, 0, 0)
                Start-Sleep -Milliseconds 50
                $steps = 20
                $dx = ($input_data.toX - $input_data.fromX) / $steps
                $dy = ($input_data.toY - $input_data.fromY) / $steps
                for ($i = 1; $i -le $steps; $i++) {
                    $cx = [int]($input_data.fromX + $dx * $i)
                    $cy = [int]($input_data.fromY + $dy * $i)
                    [AGIPrimeDaemon.NativeMethods]::SetCursorPos($cx, $cy) | Out-Null
                    Start-Sleep -Milliseconds 10
                }
                [AGIPrimeDaemon.NativeMethods]::mouse_event(0x0004, 0, 0, 0, 0)
                $result.output = "Dragged from $($input_data.fromX),$($input_data.fromY) to $($input_data.toX),$($input_data.toY)"
            }
            "keyboard_type" {
                $text = $input_data.text
                $escaped = $text -replace '\+','{+}' -replace '\^','{^}' -replace '%','{%}' -replace '~','{~}' -replace '\(','{(}' -replace '\)','{)}'
                [System.Windows.Forms.SendKeys]::SendWait($escaped)
                $result.output = "Typed $($text.Length) characters"
            }
            "keyboard_press" {
                $keyMap = @{
                    "enter"="{ENTER}"; "return"="{ENTER}"; "tab"="{TAB}";
                    "escape"="{ESC}"; "esc"="{ESC}"; "backspace"="{BACKSPACE}";
                    "delete"="{DELETE}"; "space"=" "; "up"="{UP}"; "down"="{DOWN}";
                    "left"="{LEFT}"; "right"="{RIGHT}"; "home"="{HOME}"; "end"="{END}";
                    "pageup"="{PGUP}"; "pagedown"="{PGDN}"; "insert"="{INSERT}";
                    "f1"="{F1}"; "f2"="{F2}"; "f3"="{F3}"; "f4"="{F4}"; "f5"="{F5}";
                    "f6"="{F6}"; "f7"="{F7}"; "f8"="{F8}"; "f9"="{F9}"; "f10"="{F10}";
                    "f11"="{F11}"; "f12"="{F12}"; "capslock"="{CAPSLOCK}";
                    "numlock"="{NUMLOCK}"; "scrolllock"="{SCROLLLOCK}";
                    "printscreen"="{PRTSC}";
                }
                $k = $input_data.key.ToLower()
                $sendKey = if ($keyMap.ContainsKey($k)) { $keyMap[$k] } else { $input_data.key }
                [System.Windows.Forms.SendKeys]::SendWait($sendKey)
                $result.output = "Pressed $($input_data.key)"
            }
            "keyboard_shortcut" {
                $prefix = ""
                foreach ($mod in $input_data.modifiers) {
                    switch ($mod.ToLower()) {
                        "ctrl"    { $prefix += "^" }
                        "control" { $prefix += "^" }
                        "alt"     { $prefix += "%" }
                        "shift"   { $prefix += "+" }
                    }
                }
                $keyMap = @{
                    "enter"="{ENTER}"; "tab"="{TAB}"; "escape"="{ESC}"; "esc"="{ESC}";
                    "delete"="{DELETE}"; "backspace"="{BACKSPACE}"; "home"="{HOME}"; "end"="{END}";
                    "up"="{UP}"; "down"="{DOWN}"; "left"="{LEFT}"; "right"="{RIGHT}";
                    "f1"="{F1}"; "f2"="{F2}"; "f3"="{F3}"; "f4"="{F4}"; "f5"="{F5}";
                    "f6"="{F6}"; "f7"="{F7}"; "f8"="{F8}"; "f9"="{F9}"; "f10"="{F10}";
                    "f11"="{F11}"; "f12"="{F12}";
                }
                $k = $input_data.key.ToLower()
                $sendKey = if ($keyMap.ContainsKey($k)) { $keyMap[$k] } else { $input_data.key }
                [System.Windows.Forms.SendKeys]::SendWait("$prefix$sendKey")
                $result.output = "Shortcut $($input_data.modifiers -join '+')+$($input_data.key)"
            }
            "get_mouse_position" {
                $point = New-Object AGIPrimeDaemon.NativeMethods+POINT
                [AGIPrimeDaemon.NativeMethods]::GetCursorPos([ref]$point) | Out-Null
                $result.output = "$($point.X),$($point.Y)"
            }
            "get_foreground_window" {
                $hwnd = [AGIPrimeDaemon.NativeMethods]::GetForegroundWindow()
                $sb = New-Object System.Text.StringBuilder 256
                [AGIPrimeDaemon.NativeMethods]::GetWindowText($hwnd, $sb, 256) | Out-Null
                $result.output = $sb.ToString()
            }
            "ping" {
                $result.output = "pong"
            }
            default {
                $result.success = $false
                $result.output = "Unknown action: $($input_data.action)"
            }
        }
    } catch {
        $result.success = $false
        $result.output = $_.Exception.Message
    }

    $json = $result | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}
