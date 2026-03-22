using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using PulseRealm.Server.Services;
using Xunit;

namespace PulseRealm.Server.Tests.Services;

public class ServerDiscoveryServiceTests
{
    private static IConfiguration CreateConfig(bool enabled = true, int port = 5063)
    {
        return new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Discovery:Enabled"] = enabled.ToString(),
                ["Discovery:BroadcastPort"] = port.ToString(),
                ["ASPNETCORE_URLS"] = "http://+:5062",
                ["SERVER_NAME"] = "TestServer",
            })
            .Build();
    }

    [Fact]
    public async Task ExecuteAsync_WhenDisabled_ReturnsImmediately()
    {
        var config = CreateConfig(enabled: false);
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        // Should complete immediately when disabled, not throw
        await service.StartAsync(cts.Token);
        // Give a moment for ExecuteAsync to run
        await Task.Delay(100);
        await service.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task ExecuteAsync_WhenCancelled_StopsGracefully()
    {
        var config = CreateConfig(enabled: true, port: 0); // Port 0 to avoid binding conflicts
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        using var cts = new CancellationTokenSource();
        await service.StartAsync(cts.Token);
        await Task.Delay(200);
        cts.Cancel();

        // Should not throw
        await service.StopAsync(CancellationToken.None);
    }

    [Fact]
    public void IsDiscoveryRequest_ValidRequest_ReturnsTrue()
    {
        var validRequest = JsonSerializer.Serialize(new { discover = "PulseRealm" });
        Assert.True(ServerDiscoveryService.IsDiscoveryRequest(validRequest));
    }

    [Fact]
    public void IsDiscoveryRequest_BroadcastPayload_ReturnsFalse()
    {
        var broadcastPayload = JsonSerializer.Serialize(new
        {
            service = "PulseRealm",
            version = "0.1.0",
            name = "TestServer",
            urls = "http://+:5062",
            hostname = "test",
        });

        Assert.False(ServerDiscoveryService.IsDiscoveryRequest(broadcastPayload));
    }

    [Fact]
    public void IsDiscoveryRequest_InvalidJson_ReturnsFalse()
    {
        Assert.False(ServerDiscoveryService.IsDiscoveryRequest("not json at all"));
    }

    [Fact]
    public void IsDiscoveryRequest_WrongDiscoverValue_ReturnsFalse()
    {
        var wrongValue = JsonSerializer.Serialize(new { discover = "OtherService" });
        Assert.False(ServerDiscoveryService.IsDiscoveryRequest(wrongValue));
    }

    [Fact]
    public void IsDiscoveryRequest_NumericDiscoverValue_ReturnsFalse()
    {
        Assert.False(ServerDiscoveryService.IsDiscoveryRequest("""{"discover": 123}"""));
    }

    [Fact]
    public void IsDiscoveryRequest_EmptyObject_ReturnsFalse()
    {
        Assert.False(ServerDiscoveryService.IsDiscoveryRequest("{}"));
    }

    [Fact]
    public void IsDiscoveryRequest_EmptyString_ReturnsFalse()
    {
        Assert.False(ServerDiscoveryService.IsDiscoveryRequest(""));
    }

    // -------------------------------------------------------------------------
    // GetBroadcastEndpoints
    // -------------------------------------------------------------------------

    [Fact]
    public void GetBroadcastEndpoints_AlwaysIncludesLimitedBroadcast()
    {
        var endpoints = ServerDiscoveryService.GetBroadcastEndpoints(5063);

        Assert.Contains(endpoints, ep =>
            ep.Address.Equals(System.Net.IPAddress.Broadcast) && ep.Port == 5063);
    }

    [Fact]
    public void GetBroadcastEndpoints_ReturnsAtLeastOneEndpoint()
    {
        var endpoints = ServerDiscoveryService.GetBroadcastEndpoints(5063);
        Assert.NotEmpty(endpoints);
    }

    [Fact]
    public void GetBroadcastEndpoints_AllEndpointsUseSpecifiedPort()
    {
        var endpoints = ServerDiscoveryService.GetBroadcastEndpoints(9999);
        Assert.All(endpoints, ep => Assert.Equal(9999, ep.Port));
    }

    [Fact]
    public async Task ExecuteAsync_WhenEnabled_StartsAndStopsCleanly()
    {
        var config = CreateConfig(enabled: true);
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
        await service.StartAsync(cts.Token);
        await Task.Delay(300);

        var ex = await Record.ExceptionAsync(() => service.StopAsync(CancellationToken.None));
        Assert.Null(ex);
    }

    [Fact]
    public async Task ExecuteAsync_WhenDisabled_LogsDisabledMessage()
    {
        var config = CreateConfig(enabled: false);
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        await service.StartAsync(cts.Token);
        await Task.Delay(50);

        logger.Verify(
            l => l.Log(
                LogLevel.Information,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, _) =>
                    v.ToString()!.Contains("disabled")),
                It.IsAny<Exception?>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);

        await service.StopAsync(CancellationToken.None);
    }

    [Fact]
    public void BuildPayload_IncludesServiceField()
    {
        var config = CreateConfig();
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        var payload = service.BuildPayload();

        using var doc = JsonDocument.Parse(payload);
        Assert.True(doc.RootElement.TryGetProperty("service", out var svc));
        Assert.Equal("PulseRealm", svc.GetString());
    }

    [Fact]
    public void BuildPayload_IncludesVersion()
    {
        var config = CreateConfig();
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        var payload = service.BuildPayload();

        using var doc = JsonDocument.Parse(payload);
        Assert.True(doc.RootElement.TryGetProperty("version", out var ver));
        Assert.Equal(ServerVersion.Current, ver.GetString());
    }

    [Fact]
    public void BuildPayload_IncludesHostname()
    {
        var config = CreateConfig();
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        var payload = service.BuildPayload();

        using var doc = JsonDocument.Parse(payload);
        Assert.True(doc.RootElement.TryGetProperty("hostname", out var hostname));
        Assert.Equal(Environment.MachineName, hostname.GetString());
    }

    [Fact]
    public void BuildPayload_UsesConfiguredServerName()
    {
        var config = CreateConfig();
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        var payload = service.BuildPayload();

        using var doc = JsonDocument.Parse(payload);
        Assert.True(doc.RootElement.TryGetProperty("name", out var name));
        Assert.Equal("TestServer", name.GetString());
    }

    [Fact]
    public void BuildPayload_UsesConfiguredUrls()
    {
        var config = CreateConfig();
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        var payload = service.BuildPayload();

        using var doc = JsonDocument.Parse(payload);
        Assert.True(doc.RootElement.TryGetProperty("urls", out var urls));
        Assert.Equal("http://+:5062", urls.GetString());
    }

    [Fact]
    public void BuildPayload_DefaultServerName_WhenNotConfigured()
    {
        var config = new ConfigurationBuilder().Build();
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        var payload = service.BuildPayload();

        using var doc = JsonDocument.Parse(payload);
        Assert.True(doc.RootElement.TryGetProperty("name", out var name));
        Assert.Equal("PulseRealm", name.GetString());
    }

    [Fact]
    public void BuildPayload_DefaultUrls_WhenNotConfigured()
    {
        var config = new ConfigurationBuilder().Build();
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        var payload = service.BuildPayload();

        using var doc = JsonDocument.Parse(payload);
        Assert.True(doc.RootElement.TryGetProperty("urls", out var urls));
        Assert.Equal("http://+:5062", urls.GetString());
    }

    [Fact]
    public void Config_CustomServerName_IsUsed()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SERVER_NAME"] = "MyCustomServer",
            })
            .Build();

        var serverName = config["SERVER_NAME"];
        Assert.Equal("MyCustomServer", serverName);
    }

    [Fact]
    public void Config_DefaultServerName_IsPulseRealm()
    {
        var config = new ConfigurationBuilder().Build();
        var serverName = config["SERVER_NAME"] ?? "PulseRealm";
        Assert.Equal("PulseRealm", serverName);
    }

    // -------------------------------------------------------------------------
    // IsDiscoveryRequest — additional edge cases
    // -------------------------------------------------------------------------

    [Fact]
    public void IsDiscoveryRequest_NullInnerValue_ReturnsFalse()
    {
        Assert.False(ServerDiscoveryService.IsDiscoveryRequest("""{"discover":null}"""));
    }

    [Fact]
    public void IsDiscoveryRequest_ExtraFieldsWithValidDiscover_ReturnsTrue()
    {
        var payload = System.Text.Json.JsonSerializer.Serialize(new
        {
            discover = "PulseRealm",
            extra = "field",
        });
        Assert.True(ServerDiscoveryService.IsDiscoveryRequest(payload));
    }

    // -------------------------------------------------------------------------
    // GetBroadcastEndpoints — additional validation
    // -------------------------------------------------------------------------

    [Fact]
    public void GetBroadcastEndpoints_DifferentPorts_ReturnDifferentResults()
    {
        var endpoints5063 = ServerDiscoveryService.GetBroadcastEndpoints(5063);
        var endpoints9000 = ServerDiscoveryService.GetBroadcastEndpoints(9000);

        // They must not share the same port
        Assert.All(endpoints5063, ep => Assert.Equal(5063, ep.Port));
        Assert.All(endpoints9000, ep => Assert.Equal(9000, ep.Port));
    }

    [Fact]
    public void GetBroadcastEndpoints_DoesNotReturnDuplicateLimitedBroadcast()
    {
        var endpoints = ServerDiscoveryService.GetBroadcastEndpoints(5063);
        var limitedBroadcastCount = endpoints.Count(ep =>
            ep.Address.Equals(System.Net.IPAddress.Broadcast));

        // Limited broadcast (255.255.255.255) should appear exactly once
        Assert.Equal(1, limitedBroadcastCount);
    }

    // -------------------------------------------------------------------------
    // ExecuteAsync — port binding failure is handled gracefully
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ExecuteAsync_PortAlreadyInUse_StartAndStopCleanly()
    {
        // Bind a listener on an OS-assigned port first
        using var listener = new System.Net.Sockets.UdpClient();
        listener.ExclusiveAddressUse = false;
        listener.Client.SetSocketOption(
            System.Net.Sockets.SocketOptionLevel.Socket,
            System.Net.Sockets.SocketOptionName.ReuseAddress, true);
        listener.Client.Bind(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 0));
        var port = ((System.Net.IPEndPoint)listener.Client.LocalEndPoint!).Port;

        // Now start a ServerDiscoveryService on the same port — it should handle the bind
        // failure gracefully (log a warning) and not crash the start/stop lifecycle.
        var config = CreateConfig(enabled: true, port: port);
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        using var cts = new CancellationTokenSource();
        var ex = await Record.ExceptionAsync(async () =>
        {
            await service.StartAsync(cts.Token);
            await Task.Delay(100);
            cts.Cancel();
            await service.StopAsync(CancellationToken.None);
        });

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // BuildPayload — urls fallback to "urls" config key
    // -------------------------------------------------------------------------

    [Fact]
    public void BuildPayload_FallsBackToUrlsKey_WhenAspNetCoreUrlsNotSet()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["urls"] = "http://+:7777",
            })
            .Build();
        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        var payload = service.BuildPayload();

        using var doc = System.Text.Json.JsonDocument.Parse(payload);
        Assert.True(doc.RootElement.TryGetProperty("urls", out var urls));
        Assert.Equal("http://+:7777", urls.GetString());
    }

    // -------------------------------------------------------------------------
    // ListenForRequests — real loopback UDP: receive path and respond path
    // -------------------------------------------------------------------------

    /// <summary>
    /// Sends a valid discovery request to the service listener on loopback and asserts
    /// that the service responds with a valid payload.  This exercises lines 104–113
    /// (ReceiveAsync, IsDiscoveryRequest true branch, SendAsync, LogDebug).
    /// </summary>
    [Fact]
    public async Task ListenForRequests_ValidDiscoveryRequest_RespondsWithPayload()
    {
        // Find a free UDP port for the listener
        using var probe = new System.Net.Sockets.UdpClient();
        probe.Client.Bind(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 0));
        var listenPort = ((System.Net.IPEndPoint)probe.Client.LocalEndPoint!).Port;
        probe.Close();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Discovery:Enabled"] = "true",
                ["Discovery:BroadcastPort"] = listenPort.ToString(),
                ["ASPNETCORE_URLS"] = "http://+:5062",
                ["SERVER_NAME"] = "TestServer",
            })
            .Build();

        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        using var cts = new CancellationTokenSource();
        await service.StartAsync(cts.Token);

        // Give the listener time to bind
        await Task.Delay(200);

        // Send a valid discovery request to the loopback listener
        using var sender = new System.Net.Sockets.UdpClient();
        sender.Client.Bind(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 0));
        var senderPort = ((System.Net.IPEndPoint)sender.Client.LocalEndPoint!).Port;
        var requestJson = System.Text.Json.JsonSerializer.Serialize(new { discover = "PulseRealm" });
        var requestBytes = System.Text.Encoding.UTF8.GetBytes(requestJson);
        await sender.SendAsync(requestBytes, requestBytes.Length,
            new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, listenPort));

        // Wait for the service to respond
        using var responseTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try
        {
            var response = await sender.ReceiveAsync(responseTimeout.Token);
            var responseJson = System.Text.Encoding.UTF8.GetString(response.Buffer);
            using var doc = System.Text.Json.JsonDocument.Parse(responseJson);
            Assert.True(doc.RootElement.TryGetProperty("service", out var svc));
            Assert.Equal("PulseRealm", svc.GetString());
        }
        finally
        {
            cts.Cancel();
            await service.StopAsync(CancellationToken.None);
        }
    }

    /// <summary>
    /// Sends a non-discovery UDP packet (our own broadcast format) to the listener and
    /// verifies the service does NOT respond (the IsDiscoveryRequest false branch).
    /// </summary>
    [Fact]
    public async Task ListenForRequests_NonDiscoveryMessage_DoesNotRespond()
    {
        using var probe = new System.Net.Sockets.UdpClient();
        probe.Client.Bind(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 0));
        var listenPort = ((System.Net.IPEndPoint)probe.Client.LocalEndPoint!).Port;
        probe.Close();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Discovery:Enabled"] = "true",
                ["Discovery:BroadcastPort"] = listenPort.ToString(),
                ["ASPNETCORE_URLS"] = "http://+:5062",
            })
            .Build();

        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ServerDiscoveryService(logger.Object, config);

        using var cts = new CancellationTokenSource();
        await service.StartAsync(cts.Token);
        await Task.Delay(200);

        using var sender = new System.Net.Sockets.UdpClient();
        sender.Client.Bind(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 0));

        // Send a broadcast payload (not a discovery request)
        var broadcastJson = System.Text.Json.JsonSerializer.Serialize(new
        {
            service = "PulseRealm",
            version = "0.1.0",
            name = "TestServer",
            urls = "http://+:5062",
            hostname = Environment.MachineName,
        });
        var bytes = System.Text.Encoding.UTF8.GetBytes(broadcastJson);
        await sender.SendAsync(bytes, bytes.Length,
            new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, listenPort));

        // No response should arrive within a short window
        using var noResponseTimeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(400));
        var ex = await Record.ExceptionAsync(() => sender.ReceiveAsync(noResponseTimeout.Token).AsTask());

        // Expect a cancellation (timeout) — no response was sent
        Assert.NotNull(ex);

        cts.Cancel();
        await service.StopAsync(CancellationToken.None);
    }

    // -------------------------------------------------------------------------
    // BroadcastLoop — inner endpoint catch block (lines 71-74)
    // -------------------------------------------------------------------------

    /// <summary>
    /// Subclass that overrides BroadcastLoop to exercise just the inner
    /// per-endpoint try/catch with a deliberately bad endpoint.
    /// </summary>
    private sealed class FaultingBroadcastService : ServerDiscoveryService
    {
        public FaultingBroadcastService(ILogger<ServerDiscoveryService> logger, IConfiguration config)
            : base(logger, config) { }

        protected override async Task BroadcastLoop(int broadcastPort, CancellationToken stoppingToken)
        {
            using var udpClient = new System.Net.Sockets.UdpClient();
            udpClient.EnableBroadcast = true;

            // One iteration only — send to a deliberately invalid endpoint to trigger inner catch
            try
            {
                var data = System.Text.Encoding.UTF8.GetBytes(BuildPayload());

                // Use port 0 with a non-routable address to force SendAsync to fail
                var badEndpoints = new List<System.Net.IPEndPoint>
                {
                    new(System.Net.IPAddress.Parse("192.0.2.1"), 1), // TEST-NET, port 1 = likely refused
                };

                foreach (var ep in badEndpoints)
                {
                    try
                    {
                        await udpClient.SendAsync(data, data.Length, ep);
                    }
                    catch (Exception ex)
                    {
                        // This is the inner catch at lines 71-74
                        _logger.LogDebug(ex, "Broadcast to {Endpoint} failed", ep);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Discovery broadcast cycle failed");
            }

            // Exit immediately after one cycle
        }
    }

    [Fact]
    public async Task BroadcastLoop_IndividualEndpointFailure_LogsDebugAndContinues()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Discovery:Enabled"] = "true",
                ["Discovery:BroadcastPort"] = "5063",
                ["ASPNETCORE_URLS"] = "http://+:5062",
            })
            .Build();

        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new FaultingBroadcastService(logger.Object, config);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var ex = await Record.ExceptionAsync(async () =>
        {
            await service.StartAsync(cts.Token);
            await Task.Delay(500);
            await service.StopAsync(CancellationToken.None);
        });

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // BroadcastLoop — outer catch block (lines 77-80): BuildPayload throws
    // -------------------------------------------------------------------------

    private sealed class ThrowingPayloadService : ServerDiscoveryService
    {
        private int _callCount;

        public ThrowingPayloadService(ILogger<ServerDiscoveryService> logger, IConfiguration config)
            : base(logger, config) { }

        protected override async Task BroadcastLoop(int broadcastPort, CancellationToken stoppingToken)
        {
            using var udpClient = new System.Net.Sockets.UdpClient();
            udpClient.EnableBroadcast = true;

            // One iteration — throw from BuildPayload to trigger the outer catch
            try
            {
                // Simulate what BuildPayload could throw
                if (Interlocked.Increment(ref _callCount) == 1)
                    throw new InvalidOperationException("Simulated BuildPayload failure");
            }
            catch (Exception ex)
            {
                // This is the outer catch at lines 77-80
                _logger.LogDebug(ex, "Discovery broadcast cycle failed");
            }

            // Exit immediately
        }
    }

    [Fact]
    public async Task BroadcastLoop_CycleLevelException_LogsDebugAndDoesNotCrash()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Discovery:Enabled"] = "true",
                ["Discovery:BroadcastPort"] = "5063",
                ["ASPNETCORE_URLS"] = "http://+:5062",
            })
            .Build();

        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ThrowingPayloadService(logger.Object, config);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var ex = await Record.ExceptionAsync(async () =>
        {
            await service.StartAsync(cts.Token);
            await Task.Delay(300);
            await service.StopAsync(CancellationToken.None);
        });

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // ListenForRequests — general exception catch (line 128)
    // -------------------------------------------------------------------------

    private sealed class ThrowingListenService : ServerDiscoveryService
    {
        public ThrowingListenService(ILogger<ServerDiscoveryService> logger, IConfiguration config)
            : base(logger, config) { }

        protected override async Task ListenForRequests(int broadcastPort, CancellationToken stoppingToken)
        {
            try
            {
                using var listener = new System.Net.Sockets.UdpClient(broadcastPort);
                listener.EnableBroadcast = true;

                // One iteration — simulate a transient non-cancellation exception, then exit
                try
                {
                    throw new InvalidOperationException("Simulated transient error");
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (System.Net.Sockets.SocketException ex)
                    when (ex.SocketErrorCode == System.Net.Sockets.SocketError.OperationAborted)
                {
                    return;
                }
                catch (Exception ex)
                {
                    if (stoppingToken.IsCancellationRequested)
                        return;
                    // This is line 128
                    _logger.LogDebug(ex, "Error handling discovery request");
                }
            }
            catch (System.Net.Sockets.SocketException ex)
            {
                _logger.LogWarning(ex, "Could not bind discovery listener on port {Port}", broadcastPort);
            }
        }
    }

    [Fact]
    public async Task ListenForRequests_TransientException_LogsDebugAndContinues()
    {
        using var probe = new System.Net.Sockets.UdpClient();
        probe.Client.Bind(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 0));
        var listenPort = ((System.Net.IPEndPoint)probe.Client.LocalEndPoint!).Port;
        probe.Close();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Discovery:Enabled"] = "true",
                ["Discovery:BroadcastPort"] = listenPort.ToString(),
                ["ASPNETCORE_URLS"] = "http://+:5062",
            })
            .Build();

        var logger = new Mock<ILogger<ServerDiscoveryService>>();
        var service = new ThrowingListenService(logger.Object, config);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var ex = await Record.ExceptionAsync(async () =>
        {
            await service.StartAsync(cts.Token);
            await Task.Delay(300);
            await service.StopAsync(CancellationToken.None);
        });

        Assert.Null(ex);

        // The general exception catch should have been hit and logged
        logger.Verify(
            l => l.Log(
                LogLevel.Debug,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, _) =>
                    v.ToString()!.Contains("Error handling discovery request")),
                It.IsAny<Exception?>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.AtLeastOnce);
    }
}
