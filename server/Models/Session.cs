namespace PulseRealm.Server.Models;

public class Realm
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string JoinCode { get; set; } = string.Empty;
    public RealmMode Mode { get; set; }
    public RealmStatus Status { get; set; } = RealmStatus.Lobby;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<string> ConnectedClientIds { get; set; } = new();
    public Dictionary<string, ClientProfile> ClientProfiles { get; set; } = new();

    public int MaxClients => Mode switch
    {
        RealmMode.Competition => 4,
        RealmMode.StreetView => 1,
        _ => 4,
    };
}

public enum RealmMode
{
    Competition,
    StreetView
}

public enum RealmStatus
{
    Lobby,
    Started,
    Ended
}

public class RealmSummary
{
    public double DurationSeconds { get; set; }
    public double TotalDistanceMeters { get; set; }
    public int TotalSteps { get; set; }
    public int AverageHeartRate { get; set; }
    public int MaxHeartRate { get; set; }
    public double AverageSpeedKmh { get; set; }
}
