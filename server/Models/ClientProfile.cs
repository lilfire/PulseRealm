namespace PulseRealm.Server.Models;

public class ClientProfile
{
    public string ClientId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public double HeightCm { get; set; }
    public double WeightKg { get; set; }
}
