using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace PulseRealm.Server.Services;

/// <summary>
/// Background service that broadcasts the server's presence via UDP on the local network.
/// Clients on the same network can listen for these broadcasts to auto-discover the server.
/// </summary>
public class ServerDiscoveryService : BackgroundService
{
    private const int BroadcastPort = 5063;
    private const int BroadcastIntervalMs = 3000;

    private readonly ILogger<ServerDiscoveryService> _logger;
    private readonly IConfiguration _configuration;

    public ServerDiscoveryService(ILogger<ServerDiscoveryService> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Allow opt-out via configuration
        var enabled = _configuration.GetValue("Discovery:Enabled", true);
        if (!enabled)
        {
            _logger.LogInformation("Server discovery broadcasting is disabled");
            return;
        }

        var broadcastPort = _configuration.GetValue("Discovery:BroadcastPort", BroadcastPort);

        _logger.LogInformation("Server discovery broadcasting on UDP port {Port}", broadcastPort);

        using var udpClient = new UdpClient();
        udpClient.EnableBroadcast = true;

        var endpoint = new IPEndPoint(IPAddress.Broadcast, broadcastPort);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var serverUrls = _configuration["ASPNETCORE_URLS"]
                    ?? _configuration["urls"]
                    ?? "http://+:5062";

                var payload = JsonSerializer.Serialize(new
                {
                    service = "PulseRealm",
                    version = "1.0.0",
                    urls = serverUrls,
                    hostname = Environment.MachineName,
                });

                var data = Encoding.UTF8.GetBytes(payload);
                await udpClient.SendAsync(data, data.Length, endpoint);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Discovery broadcast failed");
            }

            await Task.Delay(BroadcastIntervalMs, stoppingToken);
        }
    }
}
