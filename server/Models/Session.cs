namespace PulseRealm.Server.Models;

public class Session
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string JoinCode { get; set; } = string.Empty;
    public SessionMode Mode { get; set; }
    public SessionStatus Status { get; set; } = SessionStatus.Lobby;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<string> ConnectedClientIds { get; set; } = new();
    public Dictionary<string, ClientProfile> ClientProfiles { get; set; } = new();

    public int MaxClients => Mode switch
    {
        SessionMode.Competition => 4,
        SessionMode.StreetView => 1,
        _ => 4,
    };
}

public enum SessionMode
{
    Competition,
    StreetView
}

public enum SessionStatus
{
    Lobby,
    Started,
    Ended
}

public class SessionSummary
{
    public double DurationSeconds { get; set; }
    public double TotalDistanceMeters { get; set; }
    public int TotalSteps { get; set; }
    public int AverageHeartRate { get; set; }
    public int MaxHeartRate { get; set; }
    public double AverageSpeedKmh { get; set; }
}
