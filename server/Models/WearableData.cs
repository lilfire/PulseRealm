namespace PulseRealm.Server.Models;

public class WearableData
{
    public string ClientId { get; set; } = string.Empty;
    public int HeartRate { get; set; }
    public int Steps { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
