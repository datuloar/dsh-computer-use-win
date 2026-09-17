namespace DshCu
{

public class Indicator : ApplicationContext
{
    private const int TickMs = 33;
    private const int HeartbeatEveryTicks = 10;
    private const double IdleMinutes = 5;
    private const int AnnounceAlpha = 255;
    private const double ControllingPulseSeconds = 2.4;
    private const double GlowBase = 186;
    private const double GlowAmplitude = 64;

    private readonly int _announceSeconds;
    private readonly bool _quiet;
    private readonly Stopwatch _clock = new Stopwatch();
    private readonly PointerRenderer _pointerRenderer;

    private OverlayForm _frame;
    private OverlayForm _pointer;
    private PanelForm _panel;
    private Bitmap _frameBitmap;
    private Timer _timer;
    private IntPtr _hook;
    private Native.LowLevelKeyboardProc _hookProc;
    private bool _finished;
    private bool _touchSeen;
    private int _heartbeatTicks;

    public Indicator(bool quiet, int announceSeconds)
    {
        _quiet = quiet;
        _announceSeconds = announceSeconds;
        _clock.Start();
        _pointerRenderer = new PointerRenderer(System.Windows.Forms.Cursor.Position);
        SystemCursors.Restore();

        StateFiles.Write(StateFiles.Touch, DateTime.UtcNow.ToString("O"));
        StateFiles.Write(StateFiles.Pid, Process.GetCurrentProcess().Id + " " + StartTicks());

        Rectangle screen = Screen.PrimaryScreen.Bounds;
        if (!_quiet) ShowChrome(screen);
        _pointer = new OverlayForm(new Rectangle(0, 0, PointerRenderer.Size, PointerRenderer.Size));
        _pointer.Show();

        _hookProc = OnKeyDown;
        _hook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, _hookProc, IntPtr.Zero, 0);

        _timer = new Timer();
        _timer.Interval = TickMs;
        _timer.Tick += delegate { Tick(); };
        _timer.Start();
    }

    private static string StartTicks()
    {
        try { return Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString(); }
        catch { return "0"; }
    }

    private void ShowChrome(Rectangle screen)
    {
        _frameBitmap = FrameRenderer.Build(screen);
        _frame = new OverlayForm(screen);
        _frame.Show();
        _frame.Present(_frameBitmap, AnnounceAlpha);
        _panel = new PanelForm(screen);
        _panel.Show();
    }

    private IntPtr OnKeyDown(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0 && IsEscapeKeyDown(wParam, lParam))
        {
            _finished = true;
            return (IntPtr)1;
        }
        return Native.CallNextHookEx(_hook, code, wParam, lParam);
    }

    private static bool IsEscapeKeyDown(IntPtr wParam, IntPtr lParam)
    {
        int message = wParam.ToInt32();
        if (message != Native.WM_KEYDOWN && message != Native.WM_SYSKEYDOWN) return false;
        KBDLLHOOKSTRUCT data = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
        bool injected = (data.flags & Native.LLKHF_INJECTED) != 0;

        return data.vkCode == Native.VK_ESCAPE && !injected;
    }

    private void Tick()
    {

        try
        {
            if (StopRequested()) return;
            WriteHeartbeat();
            PresentChrome();
            _pointerRenderer.Track(System.Windows.Forms.Cursor.Position, LeftButtonDown(), RightButtonDown());
            _pointerRenderer.Draw(_pointer);
        }
        catch
        {
            SystemCursors.Restore();
            _finished = true;
        }
    }

    private bool StopRequested()
    {
        if (_finished || System.IO.File.Exists(StateFiles.Stop))
        {
            StateFiles.Delete(StateFiles.Stop);
            ExitThread();
            return true;
        }
        ObserveTouchFile();
        if (IdleTimedOut())
        {
            ExitThread();
            return true;
        }
        return false;
    }

    private void ObserveTouchFile()
    {
        if (_touchSeen) return;
        try { _touchSeen = System.IO.File.Exists(StateFiles.Touch); }
        catch { }
    }

    private bool IdleTimedOut()
    {
        if (!_touchSeen) return _clock.Elapsed.TotalMinutes > IdleMinutes;
        try
        {
            return (DateTime.UtcNow - System.IO.File.GetLastWriteTimeUtc(StateFiles.Touch)).TotalMinutes > IdleMinutes;
        }
        catch
        {
            return false;
        }
    }

    private void WriteHeartbeat()
    {
        if (++_heartbeatTicks < HeartbeatEveryTicks) return;
        _heartbeatTicks = 0;
        StateFiles.Write(StateFiles.Heartbeat, DateTime.UtcNow.Ticks.ToString());
    }

    private void PresentChrome()
    {
        if (_quiet || _frame == null) return;
        double elapsed = _clock.Elapsed.TotalSeconds;
        bool announcing = elapsed < _announceSeconds;
        _frame.Present(_frameBitmap, announcing ? AnnounceAlpha : PulseAlpha(elapsed));
        if (announcing) _panel.ShowAnnouncement(SecondsLeft(elapsed));
        else _panel.ShowControlling();
    }

    private int SecondsLeft(double elapsed)
    {
        return Math.Max(1, (int)Math.Ceiling(_announceSeconds - elapsed));
    }

    private static int PulseAlpha(double elapsed)
    {
        double phase = elapsed * (2 * Math.PI / ControllingPulseSeconds);
        return (int)(GlowBase + GlowAmplitude * (0.5 + 0.5 * Math.Sin(phase)));
    }

    private static bool LeftButtonDown()
    {
        return (Native.GetAsyncKeyState(0x01) & 0x8000) != 0;
    }

    private static bool RightButtonDown()
    {
        return (Native.GetAsyncKeyState(0x02) & 0x8000) != 0;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            StateFiles.Delete(StateFiles.Stop);
            StateFiles.Delete(StateFiles.Pid);
            StateFiles.Delete(StateFiles.Touch);
            StateFiles.Delete(StateFiles.Heartbeat);
            SystemCursors.Restore();
            if (_timer != null) { _timer.Stop(); _timer.Dispose(); }
            if (_hook != IntPtr.Zero) Native.UnhookWindowsHookEx(_hook);
            if (_frameBitmap != null) _frameBitmap.Dispose();
            if (_pointer != null) _pointer.Dispose();
            if (_panel != null) _panel.Dispose();
            if (_frame != null) _frame.Dispose();
        }
        base.Dispose(disposing);
    }
}
}
