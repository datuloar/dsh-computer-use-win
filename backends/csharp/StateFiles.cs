namespace DshCu
{

public static class StateFiles
{
    public static readonly string Heartbeat = InTemp("dsh-cu.alive");

    public static readonly string Stop = InTemp("dsh-cu.stop");

    public static readonly string Touch = InTemp("dsh-cu.touch");

    public static readonly string Pid = InTemp("dsh-cu.pid");

    public static readonly string CursorHidden = InTemp("dsh-cu.cursor");

    public static readonly string Action = InTemp("dsh-cu.action");

    public static readonly string HumanStop = InTemp("dsh-cu.cancelled");

    public static readonly string BrokerReady = InTemp("dsh-cu.broker.ready");

    public static readonly string BrokerStop = InTemp("dsh-cu.broker.stop");

    public static string InTemp(string name)
    {
        return System.IO.Path.Combine(System.IO.Path.GetTempPath(), name);
    }

    public static void Write(string path, string content)
    {
        try { System.IO.File.WriteAllText(path, content); }
        catch { }
    }

    public static string Read(string path)
    {
        try { return System.IO.File.ReadAllText(path).Trim(); }
        catch { return ""; }
    }

    public static void Delete(string path)
    {
        try { System.IO.File.Delete(path); }
        catch { }
    }

    public static long Stamp(string path)
    {
        try
        {
            if (!System.IO.File.Exists(path)) return 0;
            return System.IO.File.GetLastWriteTimeUtc(path).Ticks;
        }
        catch
        {
            return 0;
        }
    }

    public static double AgeSeconds(string path)
    {
        long stamp = Stamp(path);
        if (stamp == 0) return double.MaxValue;
        return (DateTime.UtcNow - new DateTime(stamp, DateTimeKind.Utc)).TotalSeconds;
    }
}
}
