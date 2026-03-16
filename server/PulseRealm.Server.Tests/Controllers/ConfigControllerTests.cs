using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using PulseRealm.Server.Controllers;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Tests.Controllers;

public class ConfigControllerTests
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static IConfiguration CreateBaseConfig(Dictionary<string, string?>? overrides = null)
    {
        var dict = new Dictionary<string, string?>();
        if (overrides != null)
            foreach (var kv in overrides)
                dict[kv.Key] = kv.Value;
        return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
    }

    private static AdminConfigService CreateAdminConfigServiceWithTempDir()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_DIR"] = tempDir })
            .Build();
        var logger = new Mock<ILogger<AdminConfigService>>().Object;
        return new AdminConfigService(config, logger);
    }

    private static AdminAuthService CreateAuthService(string? username = null, string? password = null)
    {
        var dict = new Dictionary<string, string?>();
        if (username != null) dict["ADMIN_USERNAME"] = username;
        if (password != null) dict["ADMIN_PASSWORD"] = password;
        var config = new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        return new AdminAuthService(config);
    }

    // -------------------------------------------------------------------------
    // GetConfig — structure
    // -------------------------------------------------------------------------

    [Fact]
    public void GetConfig_Returns200()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
    }

    [Fact]
    public void GetConfig_ResponseContainsGoogleMapsApiKeyProperty()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("googleMapsApiKey", json);
    }

    [Fact]
    public void GetConfig_ResponseContainsAdminEnabledProperty()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("adminEnabled", json);
    }

    [Fact]
    public void GetConfig_ResponseContainsDefaultsProperty()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("defaults", json);
    }

    // -------------------------------------------------------------------------
    // GetConfig — Google Maps key
    // -------------------------------------------------------------------------

    [Fact]
    public void GetConfig_ReturnsEmptyStringWhenGoogleMapsKeyNotConfigured()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("\"googleMapsApiKey\":\"\"", json);
    }

    [Fact]
    public void GetConfig_ReturnsGoogleMapsKeyFromConfiguration()
    {
        var appConfig = CreateBaseConfig(new Dictionary<string, string?> { ["GOOGLE_MAPS_API_KEY"] = "my-test-key-123" });
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("my-test-key-123", json);
    }

    // -------------------------------------------------------------------------
    // GetConfig — adminEnabled
    // -------------------------------------------------------------------------

    [Fact]
    public void GetConfig_AdminEnabledIsFalseWhenNotConfigured()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService(); // no password set
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("\"adminEnabled\":false", json);
    }

    [Fact]
    public void GetConfig_AdminEnabledIsTrueWhenPasswordConfigured()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService("admin", "password123");
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("\"adminEnabled\":true", json);
    }

    // -------------------------------------------------------------------------
    // GetConfig — competition defaults
    // -------------------------------------------------------------------------

    [Fact]
    public void GetConfig_DefaultsContainCompetitionSubMode()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("subMode", json);
    }

    [Fact]
    public void GetConfig_DefaultsReflectUpdatedAdminConfig()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        adminConfig.UpdateConfig(new AdminConfig { CompetitionSubMode = "interval", DungeonDifficulty = "easy" });
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("interval", json);
        Assert.Contains("easy", json);
    }

    // -------------------------------------------------------------------------
    // GetConfig — streetViewLocations and youTubeVideos
    // -------------------------------------------------------------------------

    [Fact]
    public void GetConfig_DefaultsContainStreetViewLocations()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("streetViewLocations", json);
    }

    [Fact]
    public void GetConfig_DefaultsContainYouTubeVideos()
    {
        var appConfig = CreateBaseConfig();
        var adminConfig = CreateAdminConfigServiceWithTempDir();
        var auth = CreateAuthService();
        var controller = new ConfigController(appConfig, adminConfig, auth);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("youTubeVideos", json);
    }
}
