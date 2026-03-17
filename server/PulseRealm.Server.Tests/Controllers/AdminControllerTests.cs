using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using PulseRealm.Server.Controllers;
using PulseRealm.Server.Hubs;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Tests.Controllers;

public class AdminControllerTests
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static IConfiguration CreateConfig(string? username = null, string? password = null)
    {
        var dict = new Dictionary<string, string?>();
        if (username != null) dict["ADMIN_USERNAME"] = username;
        if (password != null) dict["ADMIN_PASSWORD"] = password;
        return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
    }

    private static AdminConfigService CreateConfigService()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_DIR"] = tempDir })
            .Build();
        var logger = new Mock<ILogger<AdminConfigService>>().Object;
        return new AdminConfigService(config, logger);
    }

    private static AdminController CreateController(AdminAuthService auth, AdminConfigService configService,
        string? authHeader = null)
    {
        var controller = new AdminController(auth, configService, new RealmManager(configService), new Mock<IHubContext<RealmHub>>().Object);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };
        if (authHeader != null)
            controller.Request.Headers.Authorization = authHeader;
        return controller;
    }

    // -------------------------------------------------------------------------
    // Login
    // -------------------------------------------------------------------------

    [Fact]
    public void Login_WhenAdminNotConfigured_Returns403()
    {
        var auth = new AdminAuthService(CreateConfig());
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.Login(new LoginRequest { Username = "admin", Password = "pass" });

        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, statusResult.StatusCode);
    }

    [Fact]
    public void Login_WhenAdminNotConfigured_Returns403ErrorMessage()
    {
        var auth = new AdminAuthService(CreateConfig());
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.Login(new LoginRequest { Username = "admin", Password = "pass" });

        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.NotNull(statusResult.Value);
        var json = System.Text.Json.JsonSerializer.Serialize(statusResult.Value);
        Assert.Contains("Admin not configured", json);
    }

    [Fact]
    public void Login_WithInvalidCredentials_Returns401()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "correct-password"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.Login(new LoginRequest { Username = "admin", Password = "wrong-password" });

        var unauthorizedResult = Assert.IsType<UnauthorizedObjectResult>(result);
        Assert.Equal(401, unauthorizedResult.StatusCode);
    }

    [Fact]
    public void Login_WithWrongUsername_Returns401()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "password123"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.Login(new LoginRequest { Username = "notadmin", Password = "password123" });

        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void Login_WithValidCredentials_Returns200WithToken()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.Login(new LoginRequest { Username = "admin", Password = "secret" });

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
        Assert.NotNull(okResult.Value);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("token", json);
    }

    [Fact]
    public void Login_WithValidCredentials_ReturnsNonEmptyToken()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.Login(new LoginRequest { Username = "admin", Password = "secret" });

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        // The token value must not be null or empty in the JSON payload.
        Assert.DoesNotMatch("\"token\":\"\"", json);
        Assert.DoesNotMatch("\"token\":null", json);
    }

    [Fact]
    public void Login_IsCaseInsensitiveForUsername()
    {
        var auth = new AdminAuthService(CreateConfig("Admin", "pass"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.Login(new LoginRequest { Username = "admin", Password = "pass" });

        Assert.IsType<OkObjectResult>(result);
    }

    // -------------------------------------------------------------------------
    // Logout
    // -------------------------------------------------------------------------

    [Fact]
    public void Logout_WithValidToken_Returns200()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var token = auth.Login("admin", "secret")!;
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService, $"Bearer {token}");

        var result = controller.Logout();

        Assert.IsType<OkResult>(result);
    }

    [Fact]
    public void Logout_InvalidatesToken_SubsequentValidateReturnsFalse()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var token = auth.Login("admin", "secret")!;
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService, $"Bearer {token}");

        controller.Logout();

        Assert.False(auth.ValidateToken(token));
    }

    [Fact]
    public void Logout_WithAlreadyInvalidToken_DoesNotThrow()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        // Generate a token, immediately logout it so it is no longer valid,
        // then attempt a second logout of the same (now-invalid) token.
        var token = auth.Login("admin", "secret")!;
        auth.Logout(token);
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService, $"Bearer {token}");

        // Calling Logout with an already-invalidated token must not throw.
        var exception = Record.Exception(() => controller.Logout());

        Assert.Null(exception);
    }

    // -------------------------------------------------------------------------
    // GetConfig
    // -------------------------------------------------------------------------

    [Fact]
    public void GetConfig_Returns200WithAdminConfig()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
        Assert.IsType<AdminConfig>(okResult.Value);
    }

    [Fact]
    public void GetConfig_ReturnsDefaultCompetitionSubMode()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.GetConfig();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var config = Assert.IsType<AdminConfig>(okResult.Value);
        Assert.Equal("race", config.CompetitionSubMode);
    }

    // -------------------------------------------------------------------------
    // UpdateConfig
    // -------------------------------------------------------------------------

    [Fact]
    public void UpdateConfig_Returns200WithUpdatedConfig()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);
        var newConfig = new AdminConfig
        {
            CompetitionSubMode = "interval",
            DungeonDifficulty = "hard",
            DungeonTimeframeMinutes = 45,
        };

        var result = controller.UpdateConfig(newConfig);

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
        var returnedConfig = Assert.IsType<AdminConfig>(okResult.Value);
        Assert.Equal("interval", returnedConfig.CompetitionSubMode);
        Assert.Equal("hard", returnedConfig.DungeonDifficulty);
    }

    [Fact]
    public void UpdateConfig_PersistsChangesToConfigService()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);
        var newConfig = new AdminConfig { CompetitionDurationMinutes = 45 };

        controller.UpdateConfig(newConfig);

        Assert.Equal(45, configService.GetConfig().CompetitionDurationMinutes);
    }
}
