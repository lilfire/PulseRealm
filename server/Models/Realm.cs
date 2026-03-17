namespace PulseRealm.Server.Models;

public class Realm
{
    private readonly object _lock = new();

    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string JoinCode { get; set; } = string.Empty;
    public string HostSecret { get; set; } = string.Empty;
    public RealmMode Mode { get; set; }
    public RealmStatus Status { get; set; } = RealmStatus.Lobby;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<string> ConnectedClientIds { get; set; } = new();
    public HashSet<string> KnownClientIds { get; set; } = new();
    public Dictionary<string, ClientProfile> ClientProfiles { get; set; } = new();

    /// <summary>JSON blob of mode-specific config, set when the realm starts.</summary>
    public string? RealmConfig { get; set; }

    public int MaxClients => Mode switch
    {
        RealmMode.Competition => 8,
        RealmMode.StreetView => 1,
        RealmMode.YouTubeTrail => 1,
        RealmMode.Route => 1,
        RealmMode.Dungeon => 4,
        RealmMode.Social => 4,
        _ => 4,
    };

    /// <summary>
    /// Executes the given action while holding the realm's lock.
    /// Use for all mutations to ConnectedClientIds, KnownClientIds, and ClientProfiles.
    /// </summary>
    public void WithLock(Action<Realm> action)
    {
        lock (_lock)
        {
            action(this);
        }
    }

    /// <summary>
    /// Executes the given function while holding the realm's lock and returns the result.
    /// </summary>
    public T WithLock<T>(Func<Realm, T> func)
    {
        lock (_lock)
        {
            return func(this);
        }
    }
}

public enum RealmMode
{
    Competition,
    StreetView,
    YouTubeTrail,
    Route,
    Dungeon,
    Social
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
    public double AvgCadenceSpm { get; set; }
    public Dictionary<string, int> TimeInZone { get; set; } = new();
    public double ActivePeriodSeconds { get; set; }
    public int ParticipantCount { get; set; }
    public bool IsTeamFormat { get; set; }
    public List<ClientSummaryDto>? ClientSummaries { get; set; }
}

public class ClientSummaryDto
{
    public string ClientId { get; set; } = "";
    public string Name { get; set; } = "";
    public int Steps { get; set; }
    public double DistanceMeters { get; set; }
    public int AverageHeartRate { get; set; }
    public int MaxHeartRate { get; set; }
    public double AvgCadenceSpm { get; set; }
    public Dictionary<string, int> TimeInZone { get; set; } = new();
    public string? TeamName { get; set; }
    public string? TeamColor { get; set; }
}
