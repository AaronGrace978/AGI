# ═══════════════════════════════════════════════════════════════
#  AGI PRIME — Input Simulation Helper
#  Mouse & keyboard control via .NET interop.
#  Receives JSON payload via stdin, returns JSON result via stdout.
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$input_data = [Console]::In.ReadToEnd() | ConvertFrom-Json

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
"@ -Name NativeMethods -Namespace AGIPrime -ErrorAction SilentlyContinue

$result = @{ success = $true; output = "" }

try {
    switch ($input_data.action) {
        "mouse_move" {
            # Smooth human-like mouse movement with easing
            $targetX = [int]$input_data.x
            $targetY = [int]$input_data.y
            $smooth = if ($input_data.smooth -eq $true) { $true } else { $false }

            if ($smooth) {
                # Get current position
                $startPoint = New-Object AGIPrime.NativeMethods+POINT
                [AGIPrime.NativeMethods]::GetCursorPos([ref]$startPoint) | Out-Null
                $startX = $startPoint.X
                $startY = $startPoint.Y

                # Calculate distance for adaptive step count
                $dist = [Math]::Sqrt(($targetX - $startX) * ($targetX - $startX) + ($targetY - $startY) * ($targetY - $startY))
                $steps = [Math]::Max(15, [Math]::Min(60, [int]($dist / 15)))
                $duration = [Math]::Max(200, [Math]::Min(800, [int]($dist * 0.8)))
                $sleepPerStep = [Math]::Max(3, [int]($duration / $steps))

                for ($i = 1; $i -le $steps; $i++) {
                    # Ease-in-out cubic: slow start, fast middle, slow end
                    $t = $i / $steps
                    if ($t -lt 0.5) {
                        $ease = 4 * $t * $t * $t
                    } else {
                        $ease = 1 - [Math]::Pow(-2 * $t + 2, 3) / 2
                    }
                    $cx = [int]($startX + ($targetX - $startX) * $ease)
                    $cy = [int]($startY + ($targetY - $startY) * $ease)
                    [AGIPrime.NativeMethods]::SetCursorPos($cx, $cy) | Out-Null
                    Start-Sleep -Milliseconds $sleepPerStep
                }
                # Ensure we land exactly on target
                [AGIPrime.NativeMethods]::SetCursorPos($targetX, $targetY) | Out-Null
                $result.output = "Smoothly moved mouse to $targetX,$targetY (${steps} steps, ${duration}ms)"
            } else {
                [AGIPrime.NativeMethods]::SetCursorPos($targetX, $targetY) | Out-Null
                $result.output = "Moved mouse to $targetX,$targetY"
            }
        }
        "mouse_click" {
            $clickX = [int]$input_data.x
            $clickY = [int]$input_data.y

            # Smooth glide to click target (like a human would)
            $startPoint = New-Object AGIPrime.NativeMethods+POINT
            [AGIPrime.NativeMethods]::GetCursorPos([ref]$startPoint) | Out-Null
            $dist = [Math]::Sqrt(($clickX - $startPoint.X) * ($clickX - $startPoint.X) + ($clickY - $startPoint.Y) * ($clickY - $startPoint.Y))
            if ($dist -gt 20) {
                $steps = [Math]::Max(10, [Math]::Min(40, [int]($dist / 20)))
                $sleepPerStep = [Math]::Max(3, [int](400 / $steps))
                for ($i = 1; $i -le $steps; $i++) {
                    $t = $i / $steps
                    if ($t -lt 0.5) { $ease = 4 * $t * $t * $t } else { $ease = 1 - [Math]::Pow(-2 * $t + 2, 3) / 2 }
                    $cx = [int]($startPoint.X + ($clickX - $startPoint.X) * $ease)
                    $cy = [int]($startPoint.Y + ($clickY - $startPoint.Y) * $ease)
                    [AGIPrime.NativeMethods]::SetCursorPos($cx, $cy) | Out-Null
                    Start-Sleep -Milliseconds $sleepPerStep
                }
            }
            [AGIPrime.NativeMethods]::SetCursorPos($clickX, $clickY) | Out-Null
            Start-Sleep -Milliseconds 30
            $btn = if ($input_data.button) { $input_data.button } else { "left" }
            switch ($btn) {
                "right" {
                    [AGIPrime.NativeMethods]::mouse_event(0x0008, 0, 0, 0, 0)
                    [AGIPrime.NativeMethods]::mouse_event(0x0010, 0, 0, 0, 0)
                }
                "middle" {
                    [AGIPrime.NativeMethods]::mouse_event(0x0020, 0, 0, 0, 0)
                    [AGIPrime.NativeMethods]::mouse_event(0x0040, 0, 0, 0, 0)
                }
                default {
                    [AGIPrime.NativeMethods]::mouse_event(0x0002, 0, 0, 0, 0)
                    [AGIPrime.NativeMethods]::mouse_event(0x0004, 0, 0, 0, 0)
                }
            }
            if ($input_data.doubleClick -eq $true) {
                Start-Sleep -Milliseconds 60
                switch ($btn) {
                    "right" {
                        [AGIPrime.NativeMethods]::mouse_event(0x0008, 0, 0, 0, 0)
                        [AGIPrime.NativeMethods]::mouse_event(0x0010, 0, 0, 0, 0)
                    }
                    default {
                        [AGIPrime.NativeMethods]::mouse_event(0x0002, 0, 0, 0, 0)
                        [AGIPrime.NativeMethods]::mouse_event(0x0004, 0, 0, 0, 0)
                    }
                }
            }
            $result.output = "Clicked $btn at $($input_data.x),$($input_data.y)"
        }
        "mouse_scroll" {
            [AGIPrime.NativeMethods]::SetCursorPos([int]$input_data.x, [int]$input_data.y) | Out-Null
            Start-Sleep -Milliseconds 30
            $amt = if ($input_data.amount) { [int]$input_data.amount } else { -120 }
            [AGIPrime.NativeMethods]::mouse_event(0x0800, 0, 0, $amt, 0)
            $dir = if ($amt -gt 0) { "up" } else { "down" }
            $result.output = "Scrolled $dir at $($input_data.x),$($input_data.y)"
        }
        "mouse_drag" {
            [AGIPrime.NativeMethods]::SetCursorPos([int]$input_data.fromX, [int]$input_data.fromY) | Out-Null
            Start-Sleep -Milliseconds 50
            [AGIPrime.NativeMethods]::mouse_event(0x0002, 0, 0, 0, 0)
            Start-Sleep -Milliseconds 50
            $steps = 20
            $dx = ($input_data.toX - $input_data.fromX) / $steps
            $dy = ($input_data.toY - $input_data.fromY) / $steps
            for ($i = 1; $i -le $steps; $i++) {
                $cx = [int]($input_data.fromX + $dx * $i)
                $cy = [int]($input_data.fromY + $dy * $i)
                [AGIPrime.NativeMethods]::SetCursorPos($cx, $cy) | Out-Null
                Start-Sleep -Milliseconds 10
            }
            [AGIPrime.NativeMethods]::mouse_event(0x0004, 0, 0, 0, 0)
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
            $point = New-Object AGIPrime.NativeMethods+POINT
            [AGIPrime.NativeMethods]::GetCursorPos([ref]$point) | Out-Null
            $result.output = "$($point.X),$($point.Y)"
        }
        "get_foreground_window" {
            $hwnd = [AGIPrime.NativeMethods]::GetForegroundWindow()
            $sb = New-Object System.Text.StringBuilder 256
            [AGIPrime.NativeMethods]::GetWindowText($hwnd, $sb, 256) | Out-Null
            $result.output = $sb.ToString()
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

$result | ConvertTo-Json -Compress
