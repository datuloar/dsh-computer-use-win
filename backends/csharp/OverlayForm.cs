namespace DshCu
{
public class OverlayForm : Form
{
    public OverlayForm(Rectangle bounds)
    {
        FormBorderStyle = FormBorderStyle.None;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        Bounds = bounds;
        BackColor = Color.Black;
    }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams parameters = base.CreateParams;
            parameters.ExStyle |= Native.WS_EX_LAYERED | Native.WS_EX_TRANSPARENT | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
            return parameters;
        }
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using (Pen border = new Pen(Color.FromArgb(100, 205, 228, 255), 1f))
        {
            e.Graphics.DrawRectangle(border, 0, 0, Width - 1, Height - 1);
        }
    }

    public void Present(Bitmap bitmap, int constantAlpha)
    {
        if (!IsHandleCreated) return;
        IntPtr screenDc = Native.GetDC(IntPtr.Zero);
        IntPtr memoryDc = Native.CreateCompatibleDC(screenDc);
        IntPtr handle = bitmap.GetHbitmap(Color.FromArgb(0));
        IntPtr previous = Native.SelectObject(memoryDc, handle);
        try
        {
            Native.SIZE size = new Native.SIZE();
            size.cx = bitmap.Width;
            size.cy = bitmap.Height;
            POINT source = new POINT();
            POINT destination = new POINT();
            destination.X = Left;
            destination.Y = Top;
            BLENDFUNCTION blend = new BLENDFUNCTION();
            blend.BlendOp = Native.AC_SRC_OVER;
            blend.SourceConstantAlpha = (byte)Math.Max(0, Math.Min(255, constantAlpha));
            blend.AlphaFormat = Native.AC_SRC_ALPHA;
            Native.UpdateLayeredWindow(Handle, screenDc, ref destination, ref size, memoryDc, ref source, 0, ref blend, Native.ULW_ALPHA);
        }
        finally
        {
            Native.SelectObject(memoryDc, previous);
            Native.DeleteObject(handle);
            Native.DeleteDC(memoryDc);
            Native.ReleaseDC(IntPtr.Zero, screenDc);
        }
    }
}
}
