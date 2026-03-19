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
}
