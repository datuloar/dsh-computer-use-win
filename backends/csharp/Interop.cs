using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DshCu
{
public struct POINT { public int X; public int Y; }

[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

[StructLayout(LayoutKind.Sequential)]
public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

[StructLayout(LayoutKind.Sequential)]
public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

[StructLayout(LayoutKind.Explicit)]
public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }

[StructLayout(LayoutKind.Sequential)]
public struct INPUT { public uint type; public INPUTUNION u; }

[StructLayout(LayoutKind.Sequential)]
public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }

[StructLayout(LayoutKind.Sequential)]
public struct KBDLLHOOKSTRUCT { public uint vkCode; public uint scanCode; public uint flags; public uint time; public IntPtr dwExtraInfo; }

[StructLayout(LayoutKind.Sequential)]
public struct BLENDFUNCTION { public byte BlendOp; public byte BlendFlags; public byte SourceConstantAlpha; public byte AlphaFormat; }

[StructLayout(LayoutKind.Sequential)]
public struct CURSORINFO { public int cbSize; public int flags; public IntPtr hCursor; public POINT ptScreenPos; }

public static class Native
{
    public const int WH_KEYBOARD_LL = 13;
    public const int WM_KEYDOWN = 0x0100;
    public const int WM_SYSKEYDOWN = 0x0104;
    public const uint LLKHF_INJECTED = 0x10;
    public const uint VK_ESCAPE = 0x1B;
    public const int ULW_ALPHA = 0x02;
    public const byte AC_SRC_OVER = 0x00;
    public const byte AC_SRC_ALPHA = 0x01;
    public const int WS_EX_LAYERED = 0x00080000;
    public const int WS_EX_TRANSPARENT = 0x00000020;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_NOACTIVATE = 0x08000000;

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;
    public const uint MOUSEEVENTF_HWHEEL = 0x1000;
    public const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;

    public const int CursorShowing = 0x00000001;

    public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT p);

    [DllImport("user32.dll")]
    public static extern ushort MapVirtualKey(uint uCode, uint uMapType);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc proc, IntPtr module, uint threadId);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    public static extern IntPtr CallNextHookEx(IntPtr hook, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT dst, ref SIZE size, IntPtr hdcSrc, ref POINT src, int key, ref BLENDFUNCTION blend, int flags);

    [StructLayout(LayoutKind.Sequential)]
    public struct SIZE { public int cx; public int cy; }

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteDC(IntPtr hdc);

    [DllImport("gdi32.dll")]
    public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr hObject);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr CreateCursor(IntPtr hInst, int x, int y, int width, int height, byte[] andMask, byte[] xorMask);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool DestroyCursor(IntPtr cursor);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetSystemCursor(IntPtr cursor, uint id);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SystemParametersInfo(uint action, uint param, IntPtr data, uint winIni);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr context);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern uint GetDpiForSystem();

    public static void EnableDpiAwareness()
    {
        try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; }
        catch (EntryPointNotFoundException) { }
        try { SetProcessDPIAware(); }
        catch (EntryPointNotFoundException) { }
    }

    public static int SystemDpi()
    {
        try { return (int)GetDpiForSystem(); }
        catch (EntryPointNotFoundException) { return 96; }
    }

    [DllImport("user32.dll")]
    private static extern bool GetCursorInfo(ref CURSORINFO info);

    public static bool CursorIsShowing()
    {
        CURSORINFO info = new CURSORINFO();
        info.cbSize = Marshal.SizeOf(typeof(CURSORINFO));
        if (!GetCursorInfo(ref info)) return false;
        return (info.flags & CursorShowing) != 0;
    }

    public static int LastInputTick()
    {
        LASTINPUTINFO info = new LASTINPUTINFO();
        info.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        GetLastInputInfo(ref info);
        return unchecked((int)info.dwTime);
    }

    public static string ForegroundWindowTitle()
    {
        IntPtr handle = GetForegroundWindow();
        System.Text.StringBuilder buffer = new System.Text.StringBuilder(512);
        GetWindowText(handle, buffer, 512);
        return handle.ToInt64() + " " + buffer.ToString();
    }

    public static bool FocusVerified(IntPtr handle)
    {
        uint holder;
        uint target = GetWindowThreadProcessId(handle, out holder);
        uint current = GetCurrentThreadId();
        IntPtr foreground = GetForegroundWindow();
        uint foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, out holder);

        ShowWindow(handle, 9);
        List<uint> attached = new List<uint>();
        foreach (uint thread in new uint[] { target, foregroundThread })
        {
            if (thread != 0 && thread != current && !attached.Contains(thread))
            {
                AttachThreadInput(current, thread, true);
                attached.Add(thread);
            }
        }
        BringWindowToTop(handle);
        SetForegroundWindow(handle);
        foreach (uint thread in attached) AttachThreadInput(current, thread, false);
        return GetForegroundWindow() == handle;
    }
}
}
