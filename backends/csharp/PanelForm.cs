namespace DshCu
{

public class PanelForm : Form
{
    private const int PanelWidth = 540;
    private const int PanelHeight = 38;
    private const int ScreenMargin = 14;
    private const double PanelOpacity = 0.62;

    private readonly Label _status;

    public PanelForm(Rectangle screen)
    {
        FormBorderStyle = FormBorderStyle.None;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(10, 13, 22);
        Size = new Size(PanelWidth, PanelHeight);
        Location = new Point(screen.X + (screen.Width - Width) / 2, screen.Y + ScreenMargin);
        try { Opacity = PanelOpacity; }
        catch { }

        _status = new Label();
        _status.Font = new Font("Segoe UI Semibold", 10.5f);
        _status.ForeColor = Color.FromArgb(242, 198, 232, 255);
        _status.AutoSize = false;
        _status.TextAlign = ContentAlignment.MiddleCenter;
        _status.Bounds = new Rectangle(8, 6, PanelWidth - 16, PanelHeight - 12);
        Controls.Add(_status);
        ShowControlling();
    }

    public void ShowAnnouncement(int secondsLeft)
    {

        Show("DeepSeek will take control in " + (secondsLeft < 10 ? " " : "") + secondsLeft + "s   -   ESC to cancel");
    }

    public void ShowControlling()
    {
        Show("DeepSeek is controlling your computer   -   ESC to stop");
    }

    private void Show(string text)
    {
        if (_status.Text != text) _status.Text = text;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.None;
        using (Pen outer = new Pen(Color.FromArgb(215, 208, 236, 255), 2f))
        {
            e.Graphics.DrawRectangle(outer, 1, 1, Width - 3, Height - 3);
        }
        using (Pen inner = new Pen(Color.FromArgb(70, 255, 255, 255), 1f))
        {
            e.Graphics.DrawRectangle(inner, 4, 4, Width - 9, Height - 9);
        }
        using (Pen accent = new Pen(Color.FromArgb(205, 77, 107, 254), 3f))
        {
            e.Graphics.DrawLine(accent, 5, 5, Width - 6, 5);
        }
    }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams parameters = base.CreateParams;
            parameters.ExStyle |= Native.WS_EX_TRANSPARENT | Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW;
            return parameters;
        }
    }

    protected override bool ShowWithoutActivation { get { return true; } }
}
}
