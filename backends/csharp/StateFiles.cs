namespace DshCu
{

public static class StateFiles
{

    public static readonly string Heartbeat = InTemp("dsh-cu.alive");

    public static readonly string Stop = InTemp("dsh-cu.stop");

    public static readonly string Touch = InTemp("dsh-cu.touch");

    public static readonly string Pid = InTemp("dsh-cu.pid");

    public static readonly string CursorHidden = InTemp("dsh-cu.cursor");

    public static string InTemp(string name)
    {
        return System.IO.Path.Combine(System.IO.Path.GetTempPath(), name);
    }

    public static void Write(string path, string content)
    {
        try { System.IO.File.WriteAllText(path, content); }
        catch { }
    }

    public static void Delete(string path)
    {
        try { System.IO.File.Delete(path); }
        catch { }
    }
}
}
