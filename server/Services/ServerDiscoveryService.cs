using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace PulseRealm.Server.Services;

/// <summary>
/// Background service that broadcasts the server's presence via UDP on the local network.
/// Clients on the same network can listen for these broadcasts to auto-discover the server.
/// Sends to both the limited broadcast address (255.255.255.255) and each interface's
/// directed broadcast address (e.g. 10.255.255.255 for a /8) to support large subnets.
/// Also listens for UDP discovery requests from clients and responds directly.
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
        var enabled = _configuration.GetValue("Discovery:Enabled", true);
        if (!enabled)
        {
            _logger.LogInformation("Server discovery broadcasting is disabled");
            return;
        }

        var broadcastPort = _configuration.GetValue("Discovery:BroadcastPort", BroadcastPort);

        _logger.LogInformation("Server discovery broadcasting on UDP port {Port}", broadcastPort);

        // Run broadcaster and listener concurrently
        await Task.WhenAll(
            BroadcastLoop(broadcastPort, stoppingToken),
            ListenForRequests(broadcastPort, stoppingToken)
        );
    }

    /// <summary>
    /// Periodically broadcasts the server's presence on all network interfaces.
    /// </summary>
    private async Task BroadcastLoop(int broadcastPort, CancellationToken stoppingToken)
    {
        using var udpClient = new UdpClient();
        udpClient.EnableBroadcast = true;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var data = Encoding.UTF8.GetBytes(BuildPayload());
                var endpoints = GetBroadcastEndpoints(broadcastPort);

                foreach (var ep in endpoints)
                {
                    try
                    {
                        await udpClient.SendAsync(data, data.Length, ep);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Broadcast to {Endpoint} failed", ep);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Discovery broadcast cycle failed");
            }

            await Task.Delay(BroadcastIntervalMs, stoppingToken);
        }
    }

    /// <summary>
    /// Listens for UDP discovery request packets from clients and responds directly.
    /// Clients send {"discover":"PulseRealm"} to the broadcast port, and the server
    /// responds with its info so they don't have to wait for the next broadcast cycle.
    /// </summary>
    private async Task ListenForRequests(int broadcastPort, CancellationToken stoppingToken)
    {
        try
        {
            using var listener = new UdpClient(broadcastPort);
            listener.EnableBroadcast = true;

            _logger.LogInformation("Listening for discovery requests on UDP port {Port}", broadcastPort);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var result = await listener.ReceiveAsync(stoppingToken);
                    var message = Encoding.UTF8.GetString(result.Buffer);

                    // Only respond to valid discovery requests, not our own broadcasts
                    if (IsDiscoveryRequest(message))
                    {
                        var responseData = Encoding.UTF8.GetBytes(BuildPayload());
                        await listener.SendAsync(responseData, responseData.Length, result.RemoteEndPoint);
                        _logger.LogDebug("Responded to discovery request from {Remote}", result.RemoteEndPoint);
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Error handling discovery request");
                }
            }
        }
        catch (SocketException ex)
        {
            // Port may already be in use (e.g. running multiple instances)
            _logger.LogWarning(ex, "Could not bind discovery listener on port {Port}", broadcastPort);
        }
    }

    private string BuildPayload()
    {
        var serverUrls = _configuration["ASPNETCORE_URLS"]
            ?? _configuration["urls"]
            ?? "http://+:5062";

        var serverName = _configuration["SERVER_NAME"] ?? "PulseRealm";

        return JsonSerializer.Serialize(new
        {
            service = "PulseRealm",
            version = ServerVersion.Current,
            name = serverName,
            urls = serverUrls,
            hostname = Environment.MachineName,
        });
    }

    /// <summary>
    /// Validates that a received UDP message is a properly structured discovery request.
    /// Expected format: {"discover":"PulseRealm"}
    /// </summary>
    private static bool IsDiscoveryRequest(string message)
    {
        try
        {
            using var doc = JsonDocument.Parse(message);
            return doc.RootElement.TryGetProperty("discover", out var value)
                && value.ValueKind == JsonValueKind.String
                && value.GetString() == "PulseRealm";
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>
    /// Enumerates all network interfaces and computes directed broadcast addresses.
    /// For example, an interface with IP 10.0.5.2 and mask 255.0.0.0 (/8) gets
    /// broadcast address 10.255.255.255. Also includes the limited broadcast 255.255.255.255.
    /// </summary>
    private static List<IPEndPoint> GetBroadcastEndpoints(int port)
    {
        var endpoints = new List<IPEndPoint>
        {
            // Always include the limited broadcast address
            new(IPAddress.Broadcast, port)
        };

        try
        {
            foreach (var iface in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (iface.OperationalStatus != OperationalStatus.Up)
                    continue;
                if (iface.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                    continue;

                var props = iface.GetIPProperties();
                foreach (var addr in props.UnicastAddresses)
                {
                    if (addr.Address.AddressFamily != AddressFamily.InterNetwork)
                        continue;

                    var ip = addr.Address.GetAddressBytes();
                    var mask = addr.IPv4Mask.GetAddressBytes();

                    // Compute directed broadcast: IP | ~mask
                    var broadcast = new byte[4];
                    for (int i = 0; i < 4; i++)
                    {
                        broadcast[i] = (byte)(ip[i] | ~mask[i]);
                    }

                    var broadcastAddr = new IPAddress(broadcast);

                    // Skip if it's the same as limited broadcast (already added)
                    if (!broadcastAddr.Equals(IPAddress.Broadcast))
                    {
                        endpoints.Add(new IPEndPoint(broadcastAddr, port));
                    }
                }
            }
        }
        catch
        {
            // If enumeration fails, we still have the limited broadcast
        }

        return endpoints;
    }
}
