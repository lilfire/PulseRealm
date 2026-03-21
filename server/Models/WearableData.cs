namespace PulseRealm.Server.Models;

public class WearableData
{
    public string ClientId { get; set; } = string.Empty;
    public int HeartRate { get; set; }
    public int Steps { get; set; }
    // Note: This field is set by the client but not used server-side for calculations. Server uses DateTime.UtcNow internally.
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>Estimated speed in km/h, calculated server-side from steps and client height.</summary>
    public double SpeedKmh { get; set; }
}
