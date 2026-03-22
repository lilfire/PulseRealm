using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using PulseRealm.Server.Controllers;
using Xunit;

namespace PulseRealm.Server.Tests.Controllers;

public class DiscoveryControllerTests
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static IConfiguration CreateConfig(string? serverName = null)
    {
        var dict = new Dictionary<string, string?>();
        if (serverName != null) dict["SERVER_NAME"] = serverName;
        return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
    }

    // -------------------------------------------------------------------------
    // GetServerInfo
    // -------------------------------------------------------------------------

    [Fact]
    public void GetServerInfo_Returns200()
    {
        var controller = new DiscoveryController(CreateConfig());

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
    }

    [Fact]
    public void GetServerInfo_ReturnsDefaultServerNameWhenNotConfigured()
    {
        var controller = new DiscoveryController(CreateConfig());

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("PulseRealm", json);
    }

    [Fact]
    public void GetServerInfo_ReturnsConfiguredServerName()
    {
        var controller = new DiscoveryController(CreateConfig("MyGymServer"));

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("MyGymServer", json);
    }

    [Fact]
    public void GetServerInfo_ConfiguredServerNameOverridesDefault()
    {
        var controller = new DiscoveryController(CreateConfig("CustomName"));

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        // The custom name must appear and the literal default must not be present alone.
        Assert.Contains("CustomName", json);
        Assert.DoesNotContain("\"name\":\"PulseRealm\"", json);
    }

    [Fact]
    public void GetServerInfo_ReturnsCorrectHubPath()
    {
        var controller = new DiscoveryController(CreateConfig());

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("/hubs/realm", json);
    }

    [Fact]
    public void GetServerInfo_ReturnsCorrectApiPath()
    {
        var controller = new DiscoveryController(CreateConfig());

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("/api", json);
    }

    [Fact]
    public void GetServerInfo_ReturnsHostname()
    {
        var controller = new DiscoveryController(CreateConfig());

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("hostname", json);
        Assert.Contains(Environment.MachineName, json);
    }

    [Fact]
    public void GetServerInfo_ReturnsVersionProperty()
    {
        var controller = new DiscoveryController(CreateConfig());

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("version", json);
    }

    [Fact]
    public void GetServerInfo_HubPathIsHubsRealm()
    {
        var controller = new DiscoveryController(CreateConfig());

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        // Use reflection to get the exact hubPath value from the anonymous type.
        var value = okResult.Value!;
        var hubPath = value.GetType().GetProperty("hubPath")?.GetValue(value) as string;
        Assert.Equal("/hubs/realm", hubPath);
    }

    [Fact]
    public void GetServerInfo_ApiPathIsApi()
    {
        var controller = new DiscoveryController(CreateConfig());

        var result = controller.GetServerInfo();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var value = okResult.Value!;
        var apiPath = value.GetType().GetProperty("apiPath")?.GetValue(value) as string;
        Assert.Equal("/api", apiPath);
    }
}
