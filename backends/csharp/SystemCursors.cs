namespace DshCu
{

public static class SystemCursors
{
    private const uint SpiSetCursors = 0x0057;

    public static void Restore()
    {
        StateFiles.Delete(StateFiles.CursorHidden);
        Native.SystemParametersInfo(SpiSetCursors, 0, IntPtr.Zero, 0);
    }
}
}
