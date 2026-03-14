namespace PulseRealm.Server.Models;

public class Session
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string JoinCode { get; set; } = string.Empty;
    public SessionMode Mode { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<string> ConnectedClientIds { get; set; } = new();
    public Dictionary<string, ClientProfile> ClientProfiles { get; set; } = new();
}

public enum SessionMode
{
    Competition,
    StreetView
    // TODO: Add new modes here as they are implemented
}
