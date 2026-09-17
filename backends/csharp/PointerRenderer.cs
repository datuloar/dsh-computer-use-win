namespace DshCu
{

public sealed class PointerRenderer
{

    public const int Size = 300;

    private const int TickMs = 33;
    private const int MaxTrail = 16;
    private const int TrailFadeAfterTicks = 6;
    private const float GlideFactor = 0.22f;
    private const float ArrowScale = 2.0f;
    private static readonly Color MarkerColor = Color.FromArgb(120, 180, 255);
    private static readonly Color RightClickColor = Color.FromArgb(255, 190, 150);

    private readonly List<PointF> _trail = new List<PointF>();
    private readonly List<double> _ripples = new List<double>();
    private readonly List<bool> _rippleRight = new List<bool>();
    private PointF _glide;
    private Point _cursor;
    private int _idleTicks;
    private double _clickFlash;
    private bool _leftWasDown;
    private bool _rightWasDown;

    public PointerRenderer(Point cursor)
    {
        _cursor = cursor;
        _glide = new PointF(cursor.X, cursor.Y);
    }

    public void Track(Point cursor, bool leftDown, bool rightDown)
    {
        bool moved = Math.Abs(cursor.X - _cursor.X) + Math.Abs(cursor.Y - _cursor.Y) > 1;
        _cursor = cursor;
        _glide = new PointF(
            _glide.X + (cursor.X - _glide.X) * GlideFactor,
            _glide.Y + (cursor.Y - _glide.Y) * GlideFactor);

        UpdateTrail(moved);
        UpdateClicks(leftDown, rightDown);
    }

    public void Draw(OverlayForm window)
    {
        window.Location = new Point((int)Math.Round(_glide.X) - Size / 2, (int)Math.Round(_glide.Y) - Size / 2);
        using (Bitmap bitmap = new Bitmap(Size, Size, PixelFormat.Format32bppArgb))
        {
            using (Graphics graphics = Graphics.FromImage(bitmap))
            {
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.Clear(Color.Transparent);
                PointF center = new PointF(Size / 2f, Size / 2f);
                DrawTrail(graphics, center);
                DrawRipples(graphics, center);
                DrawArrow(graphics, center);
            }
            window.Present(bitmap, 255);
        }
    }

    private void UpdateTrail(bool moved)
    {
        if (moved)
        {
            _idleTicks = 0;
            _trail.Insert(0, _glide);
            if (_trail.Count > MaxTrail) _trail.RemoveAt(_trail.Count - 1);
            return;
        }
        if (++_idleTicks > TrailFadeAfterTicks && _trail.Count > 0) _trail.RemoveAt(_trail.Count - 1);
    }

    private void UpdateClicks(bool leftDown, bool rightDown)
    {
        if (leftDown && !_leftWasDown) AddRipple(false);
        if (rightDown && !_rightWasDown) AddRipple(true);
        _leftWasDown = leftDown;
        _rightWasDown = rightDown;

        _clickFlash = Math.Max(0, _clickFlash - TickMs / 260.0);
        for (int index = _ripples.Count - 1; index >= 0; index--)
        {
            _ripples[index] += TickMs / 640.0;
            if (_ripples[index] > 1) RemoveRipple(index);
        }
    }

    private void AddRipple(bool rightClick)
    {
        _ripples.Add(0);
        _rippleRight.Add(rightClick);
        _clickFlash = 1;
    }

    private void RemoveRipple(int index)
    {
        _ripples.RemoveAt(index);
        _rippleRight.RemoveAt(index);
    }

    private void DrawTrail(Graphics graphics, PointF center)
    {
        for (int index = 1; index < _trail.Count; index++)
        {
            PointF history = _trail[index];
            PointF local = new PointF(center.X + (history.X - _glide.X), center.Y + (history.Y - _glide.Y));
            double progress = 1.0 - (double)index / _trail.Count;
            int alpha = (int)(95 * progress * progress);
            if (alpha <= 2) continue;
            float radius = 1.6f + 2.6f * (float)progress;
            using (SolidBrush dot = new SolidBrush(Color.FromArgb(alpha, MarkerColor)))
                graphics.FillEllipse(dot, local.X - radius, local.Y - radius, radius * 2, radius * 2);
        }
    }

    private void DrawRipples(Graphics graphics, PointF center)
    {
        for (int index = 0; index < _ripples.Count; index++)
        {
            Color accent = _rippleRight[index] ? RightClickColor : MarkerColor;
            for (int ring = 0; ring < 2; ring++)
            {
                double age = _ripples[index] - ring * 0.16;
                if (age <= 0) continue;
                float radius = 13 + (float)(age * 52);
                int alpha = (int)(165 * (1 - age) * (1 - ring * 0.45));
                if (alpha <= 2) continue;
                using (Pen pen = new Pen(Color.FromArgb(alpha, accent), 2.6f - ring * 0.9f))
                    graphics.DrawEllipse(pen, center.X - radius, center.Y - radius, radius * 2, radius * 2);
            }
        }
    }

    private void DrawArrow(Graphics graphics, PointF center)
    {
        using (GraphicsPath arrow = ArrowPath(center, ArrowScale))
        {
            using (PathGradientBrush halo = new PathGradientBrush(arrow))
            {
                halo.CenterColor = Color.FromArgb((int)(70 + 60 * _clickFlash), MarkerColor);
                halo.CenterPoint = center;
                halo.SurroundColors = new Color[] { Color.FromArgb(0, MarkerColor) };
                graphics.FillPath(halo, arrow);
            }
            using (Pen shadow = new Pen(Color.FromArgb(150, 12, 18, 30), 3.4f))
            {
                shadow.LineJoin = LineJoin.Round;
                graphics.DrawPath(shadow, arrow);
            }
            using (Pen edge = new Pen(_clickFlash > 0.2 ? Color.White : Color.FromArgb(205, 228, 255), 1.9f))
            {
                edge.LineJoin = LineJoin.Round;
                graphics.DrawPath(edge, arrow);
            }
            using (SolidBrush body = new SolidBrush(Color.FromArgb(60, 20, 34, 56))) graphics.FillPath(body, arrow);
        }
    }

    private static GraphicsPath ArrowPath(PointF tip, float scale)
    {
        float[] unit = new float[] { 0f, 0f, 0f, 17f, 4.2f, 13.2f, 6.9f, 19.4f, 9.6f, 18.2f, 6.9f, 12.2f, 11.6f, 12.0f };
        PointF[] points = new PointF[unit.Length / 2];
        for (int index = 0; index < points.Length; index++)
            points[index] = new PointF(tip.X + unit[index * 2] * scale, tip.Y + unit[index * 2 + 1] * scale);
        GraphicsPath path = new GraphicsPath();
        path.AddPolygon(points);
        return path;
    }
}
}
