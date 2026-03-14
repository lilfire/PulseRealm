using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace PulseRealm.DesktopTest.Services;

public record DiscoveredServer(string Hostname, string Urls, string Version, IPAddress Address)
{
    public string BuildServerUrl()
    {
        // If Urls is already a full HTTP URL (from HTTP probing), use it directly
        if (Urls.StartsWith("http://") && !Urls.Contains("+") && !Urls.Contains("*"))
            return Urls.TrimEnd('/');

        // Otherwise parse port from listener spec (e.g. "http://+:5062")
        var match = System.Text.RegularExpressions.Regex.Match(Urls, @":(\d+)");
        var port = match.Success ? match.Groups[1].Value : "5062";
        return $"http://{Address}:{port}";
    }
}

/// <summary>
/// Discovers PulseRealm servers on the local network.
/// Uses two strategies in parallel:
///   1. UDP broadcast (works when server runs natively or with host networking)
///   2. HTTP probing of local network IPs (works when server runs in Docker with port mapping)
/// </summary>
public class ServerDiscoveryClient
{
    public const int DiscoveryPort = 5063;
    private const int SocketTimeoutMs = 2000;
    private const int ListenTimeoutMs = 8000;

    // Common server ports to probe (native + Docker)
    private static readonly int[] CommonPorts = [5062, 8080];
    private static readonly int[] PriorityHosts = [1, 2, 100, 50, 10, 200, 150, 254];

    public event Action<List<DiscoveredServer>>? ServersChanged;
    public event Action<bool>? ScanningChanged;

    public async Task<List<DiscoveredServer>> ScanAsync(CancellationToken ct = default)
    {
        ScanningChanged?.Invoke(true);
        var found = new Dictionary<string, DiscoveredServer>();

        // Run UDP broadcast and HTTP probing in parallel
        var udpTask = Task.Run(() => UdpScan(found, ct), ct);
        var httpTask = HttpScan(found, ct);

        await Task.WhenAll(udpTask, httpTask);

        ScanningChanged?.Invoke(false);
        return found.Values.ToList();
    }

    /// <summary>
    /// UDP broadcast discovery — sends a request and listens for server responses.
    /// Works when the server runs natively or with Docker host networking.
    /// </summary>
    private void UdpScan(Dictionary<string, DiscoveredServer> found, CancellationToken ct)
    {
        try
        {
            using var socket = new UdpClient();
            socket.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            socket.Client.Bind(new IPEndPoint(IPAddress.Any, 0));
            socket.EnableBroadcast = true;
            socket.Client.ReceiveTimeout = SocketTimeoutMs;

            SendDiscoveryRequest(socket);

            var deadline = Environment.TickCount64 + ListenTimeoutMs;

            while (Environment.TickCount64 < deadline && !ct.IsCancellationRequested)
            {
                try
                {
                    IPEndPoint? remote = null;
                    var data = socket.Receive(ref remote);
                    var json = Encoding.UTF8.GetString(data);

                    var server = ParseDiscoveryResponse(json, remote!.Address);
                    if (server is not null)
                    {
                        lock (found)
                        {
                            found[remote.Address.ToString()] = server;
                            ServersChanged?.Invoke(found.Values.ToList());
                        }
                    }
                }
                catch (SocketException ex) when (ex.SocketErrorCode == SocketError.TimedOut)
                {
                    if (found.Count == 0 && Environment.TickCount64 + SocketTimeoutMs < deadline)
                    {
                        SendDiscoveryRequest(socket);
                    }
                }
            }
        }
        catch
        {
            // UDP discovery failed — HTTP probing may still succeed
        }
    }

    /// <summary>
    /// HTTP probing — tries /api/discovery on local network IPs.
    /// Works when the server runs in Docker with port mapping.
    /// </summary>
    private async Task HttpScan(Dictionary<string, DiscoveredServer> found, CancellationToken ct)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromMilliseconds(1500) };
        var candidates = BuildHttpCandidates();

        // Probe in batches of 20
        for (int i = 0; i < candidates.Count; i += 20)
        {
            if (ct.IsCancellationRequested || found.Count > 0) return;

            var batch = candidates.Skip(i).Take(20);
            var tasks = batch.Select(url => ProbeHttp(http, url, found, ct));
            await Task.WhenAll(tasks);
        }
    }

    private async Task ProbeHttp(HttpClient http, string url, Dictionary<string, DiscoveredServer> found, CancellationToken ct)
    {
        try
        {
            var resp = await http.GetAsync($"{url}/api/discovery", ct);
            if (!resp.IsSuccessStatusCode) return;
            var json = await resp.Content.ReadAsStringAsync(ct);

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("name", out var name) && name.GetString() == "PulseRealm")
            {
                var uri = new Uri(url);
                var address = (await Dns.GetHostAddressesAsync(uri.Host, ct)).FirstOrDefault()
                              ?? IPAddress.Loopback;

                var server = new DiscoveredServer(
                    Hostname: root.TryGetProperty("hostname", out var h) ? h.GetString() ?? "Unknown" : "Unknown",
                    Urls: url,
                    Version: root.TryGetProperty("version", out var v) ? v.GetString() ?? "" : "",
                    Address: address
                );

                lock (found)
                {
                    found[url] = server;
                    ServersChanged?.Invoke(found.Values.ToList());
                }
            }
        }
        catch
        {
            // Probe failed — expected for most IPs
        }
    }

    private static List<string> BuildHttpCandidates()
    {
        var candidates = new List<string>();

        // Localhost first
        foreach (var port in CommonPorts)
        {
            candidates.Add($"http://localhost:{port}");
            candidates.Add($"http://127.0.0.1:{port}");
        }

        // Enumerate local network interfaces and probe their subnets
        try
        {
            foreach (var iface in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (iface.OperationalStatus != OperationalStatus.Up) continue;
                if (iface.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                foreach (var addr in iface.GetIPProperties().UnicastAddresses)
                {
                    if (addr.Address.AddressFamily != AddressFamily.InterNetwork) continue;

                    var ip = addr.Address.GetAddressBytes();
                    var subnet = $"{ip[0]}.{ip[1]}.{ip[2]}";

                    // Priority hosts on own /24
                    foreach (var oct in PriorityHosts)
                    {
                        if (oct == ip[3]) continue;
                        foreach (var port in CommonPorts)
                        {
                            var url = $"http://{subnet}.{oct}:{port}";
                            if (!candidates.Contains(url))
                                candidates.Add(url);
                        }
                    }

                    // Full /24
                    for (int i = 1; i <= 254; i++)
                    {
                        if (i == ip[3]) continue;
                        foreach (var port in CommonPorts)
                        {
                            var url = $"http://{subnet}.{i}:{port}";
                            if (!candidates.Contains(url))
                                candidates.Add(url);
                        }
                    }
                }
            }
        }
        catch
        {
            // Fallback if interface enumeration fails
        }

        return candidates;
    }

    private static DiscoveredServer? ParseDiscoveryResponse(string json, IPAddress address)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.TryGetProperty("service", out var svc) && svc.GetString() == "PulseRealm")
            {
                return new DiscoveredServer(
                    Hostname: root.TryGetProperty("hostname", out var h) ? h.GetString() ?? "Unknown" : "Unknown",
                    Urls: root.TryGetProperty("urls", out var u) ? u.GetString() ?? "" : "",
                    Version: root.TryGetProperty("version", out var v) ? v.GetString() ?? "" : "",
                    Address: address
                );
            }
        }
        catch { }
        return null;
    }

    private static void SendDiscoveryRequest(UdpClient socket)
    {
        try
        {
            var request = JsonSerializer.Serialize(new { discover = "PulseRealm" });
            var data = Encoding.UTF8.GetBytes(request);
            socket.Send(data, data.Length, new IPEndPoint(IPAddress.Broadcast, DiscoveryPort));
        }
        catch
        {
            // Best effort
        }
    }
}
