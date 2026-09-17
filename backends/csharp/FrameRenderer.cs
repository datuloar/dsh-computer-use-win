namespace DshCu
{

public static class FrameRenderer
{
    private const int FadeDepth = 68;
    private const int CoreWidth = 4;
    private const int GlowPeak = 168;

    public static Bitmap Build(Rectangle screen)
    {
        Bitmap bitmap = new Bitmap(screen.Width, screen.Height, PixelFormat.Format32bppArgb);
        BitmapData data = bitmap.LockBits(
            new Rectangle(0, 0, screen.Width, screen.Height),
            ImageLockMode.WriteOnly,
            PixelFormat.Format32bppArgb);
        try
        {
            int rowBytes = Math.Abs(data.Stride);
            byte[] buffer = new byte[rowBytes * screen.Height];
            for (int y = 0; y < screen.Height; y++)
            {
                int row = y * rowBytes;
                for (int x = 0; x < screen.Width; x++)
                {
                    double distance = DistanceToEdge(x, y, screen.Width, screen.Height);
                    if (distance >= FadeDepth) continue;
                    int pixel = row + x * 4;
                    if (distance < CoreWidth)
                    {

                        buffer[pixel] = 255;
                        buffer[pixel + 1] = 214;
                        buffer[pixel + 2] = 158;
                        buffer[pixel + 3] = (byte)(186 - distance * 26);
                        continue;
                    }
                    double t = 1.0 - distance / FadeDepth;
                    double smooth = t * t * (3 - 2 * t);
                    buffer[pixel] = 254;
                    buffer[pixel + 1] = 107;
                    buffer[pixel + 2] = 77;
                    buffer[pixel + 3] = (byte)(int)(GlowPeak * smooth);
                }
            }
            Marshal.Copy(buffer, 0, data.Scan0, buffer.Length);
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
        return bitmap;
    }

    private static double DistanceToEdge(int x, int y, int width, int height)
    {
        int left = x;
        int right = width - 1 - x;
        int top = y;
        int bottom = height - 1 - y;
        return Math.Min(Math.Min(left, right), Math.Min(top, bottom));
    }
}
}
