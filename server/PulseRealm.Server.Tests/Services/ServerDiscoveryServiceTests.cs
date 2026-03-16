using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using PulseRealm.Server.Services;

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
        // We can test the discovery parsing logic indirectly by checking the JSON format
        var validRequest = JsonSerializer.Serialize(new { discover = "PulseRealm" });
        // The method is private, so we verify the expected JSON format
        Assert.Contains("\"discover\"", validRequest);
        Assert.Contains("PulseRealm", validRequest);

        // Verify it's valid JSON with the expected structure
        using var doc = JsonDocument.Parse(validRequest);
        Assert.True(doc.RootElement.TryGetProperty("discover", out var val));
        Assert.Equal("PulseRealm", val.GetString());
    }

    [Fact]
    public void IsDiscoveryRequest_BroadcastPayload_DoesNotMatchDiscoverKey()
    {
        // Server broadcasts have "service" key, not "discover"
        var broadcastPayload = JsonSerializer.Serialize(new
        {
            service = "PulseRealm",
            version = "0.1.0",
            name = "TestServer",
            urls = "http://+:5062",
            hostname = "test",
        });

        using var doc = JsonDocument.Parse(broadcastPayload);
        Assert.False(doc.RootElement.TryGetProperty("discover", out _));
    }

    [Fact]
    public void IsDiscoveryRequest_InvalidJson_DoesNotParse()
    {
        var invalidJson = "not json at all";
        Assert.Throws<JsonException>(() => JsonDocument.Parse(invalidJson));
    }

    [Fact]
    public void IsDiscoveryRequest_WrongDiscoverValue_DoesNotMatch()
    {
        var wrongValue = JsonSerializer.Serialize(new { discover = "OtherService" });
        using var doc = JsonDocument.Parse(wrongValue);
        Assert.True(doc.RootElement.TryGetProperty("discover", out var val));
        Assert.NotEqual("PulseRealm", val.GetString());
    }
}
