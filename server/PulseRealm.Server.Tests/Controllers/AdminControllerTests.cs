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
using Xunit;

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
        var controller = new AdminController(auth, configService, new RealmManager(configService), new Mock<IHubContext<RealmHub>>().Object, new RealmStatsTracker(), new ConfigurationBuilder().Build());
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

    // -------------------------------------------------------------------------
    // GetActiveRealms
    // -------------------------------------------------------------------------

    [Fact]
    public void GetActiveRealms_NoRealms_ReturnsEmptyList()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = controller.GetActiveRealms();

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(okResult.Value);
    }

    [Fact]
    public void GetActiveRealms_WithRealms_ReturnsRealmData()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var realmManager = new RealmManager(configService);
        realmManager.CreateRealm(RealmMode.Competition);
        realmManager.CreateRealm(RealmMode.Dungeon);

        var controller = new AdminController(auth, configService, realmManager,
            new Mock<IHubContext<RealmHub>>().Object, new RealmStatsTracker(),
            new ConfigurationBuilder().Build());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var result = controller.GetActiveRealms();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("Competition", json);
        Assert.Contains("Dungeon", json);
    }

    [Fact]
    public void GetActiveRealms_ExcludesEndedRealms()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var realmManager = new RealmManager(configService);
        var active = realmManager.CreateRealm(RealmMode.Competition);
        var ended = realmManager.CreateRealm(RealmMode.Dungeon);
        ended.Status = RealmStatus.Ended;

        var controller = new AdminController(auth, configService, realmManager,
            new Mock<IHubContext<RealmHub>>().Object, new RealmStatsTracker(),
            new ConfigurationBuilder().Build());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var result = controller.GetActiveRealms();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains(active.Id, json);
        Assert.DoesNotContain(ended.Id, json);
    }

    // -------------------------------------------------------------------------
    // EndRealm
    // -------------------------------------------------------------------------

    [Fact]
    public async Task EndRealm_RealmNotFound_Returns404()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = await controller.EndRealm("nonexistent-id");

        var notFound = Assert.IsType<NotFoundObjectResult>(result);
        Assert.Equal(404, notFound.StatusCode);
    }

    [Fact]
    public async Task EndRealm_AlreadyEnded_ReturnsOkWithMessage()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var realmManager = new RealmManager(configService);
        var realm = realmManager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Ended;

        var mockHubContext = new Mock<IHubContext<RealmHub>>();
        var mockClients = new Mock<IHubClients>();
        var mockProxy = new Mock<IClientProxy>();
        mockHubContext.Setup(h => h.Clients).Returns(mockClients.Object);
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockProxy.Object);

        var controller = new AdminController(auth, configService, realmManager,
            mockHubContext.Object, new RealmStatsTracker(),
            new ConfigurationBuilder().Build());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var result = await controller.EndRealm(realm.Id);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("already ended", json);
    }

    [Fact]
    public async Task EndRealm_ActiveRealm_EndsRealmAndBroadcasts()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var realmManager = new RealmManager(configService);
        var realm = realmManager.CreateRealm(RealmMode.Competition);

        var mockHubContext = new Mock<IHubContext<RealmHub>>();
        var mockClients = new Mock<IHubClients>();
        var mockProxy = new Mock<IClientProxy>();
        mockHubContext.Setup(h => h.Clients).Returns(mockClients.Object);
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockProxy.Object);

        var controller = new AdminController(auth, configService, realmManager,
            mockHubContext.Object, new RealmStatsTracker(),
            new ConfigurationBuilder().Build());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var result = await controller.EndRealm(realm.Id);

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal(RealmStatus.Ended, realm.Status);
        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmEnded", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // KickClient
    // -------------------------------------------------------------------------

    [Fact]
    public async Task KickClient_RealmNotFound_Returns404()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = await controller.KickClient("nonexistent", "client1");

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task KickClient_ClientNotInRealm_Returns404()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var realmManager = new RealmManager(configService);
        var realm = realmManager.CreateRealm(RealmMode.Competition);

        var mockHubContext = new Mock<IHubContext<RealmHub>>();
        var mockClients = new Mock<IHubClients>();
        var mockProxy = new Mock<IClientProxy>();
        mockHubContext.Setup(h => h.Clients).Returns(mockClients.Object);
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockProxy.Object);

        var controller = new AdminController(auth, configService, realmManager,
            mockHubContext.Object, new RealmStatsTracker(),
            new ConfigurationBuilder().Build());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var result = await controller.KickClient(realm.Id, "nonexistent-client");

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task KickClient_ValidClient_KicksAndBroadcasts()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var realmManager = new RealmManager(configService);
        var realm = realmManager.CreateRealm(RealmMode.Competition);
        realmManager.AddClient(realm.Id, "client1");

        var mockHubContext = new Mock<IHubContext<RealmHub>>();
        var mockClients = new Mock<IHubClients>();
        var mockProxy = new Mock<IClientProxy>();
        mockHubContext.Setup(h => h.Clients).Returns(mockClients.Object);
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockProxy.Object);

        var controller = new AdminController(auth, configService, realmManager,
            mockHubContext.Object, new RealmStatsTracker(),
            new ConfigurationBuilder().Build());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var result = await controller.KickClient(realm.Id, "client1");

        Assert.IsType<OkObjectResult>(result);
        Assert.DoesNotContain("client1", realm.ConnectedClientIds);
        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientKicked", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // UploadThumbnail
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UploadThumbnail_NullFile_ReturnsBadRequest()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var result = await controller.UploadThumbnail(null!);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UploadThumbnail_EmptyFile_ReturnsBadRequest()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var file = new Mock<IFormFile>();
        file.Setup(f => f.Length).Returns(0);

        var result = await controller.UploadThumbnail(file.Object);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UploadThumbnail_TooLarge_ReturnsBadRequest()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var file = new Mock<IFormFile>();
        file.Setup(f => f.Length).Returns(6 * 1024 * 1024); // 6 MB
        file.Setup(f => f.FileName).Returns("big.jpg");

        var result = await controller.UploadThumbnail(file.Object);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UploadThumbnail_InvalidExtension_ReturnsBadRequest()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var controller = CreateController(auth, configService);

        var file = new Mock<IFormFile>();
        file.Setup(f => f.Length).Returns(1024);
        file.Setup(f => f.FileName).Returns("malicious.exe");

        var result = await controller.UploadThumbnail(file.Object);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UploadThumbnail_ValidFile_ReturnsUrl()
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_DIR"] = tempDir })
            .Build();

        var realmManager = new RealmManager(configService);
        var controller = new AdminController(auth, configService, realmManager,
            new Mock<IHubContext<RealmHub>>().Object, new RealmStatsTracker(), config);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var content = new byte[] { 0xFF, 0xD8, 0xFF }; // JPEG magic bytes
        var stream = new MemoryStream(content);
        var file = new Mock<IFormFile>();
        file.Setup(f => f.Length).Returns(content.Length);
        file.Setup(f => f.FileName).Returns("test.jpg");
        file.Setup(f => f.CopyToAsync(It.IsAny<Stream>(), default))
            .Callback<Stream, CancellationToken>((s, _) => stream.CopyTo(s))
            .Returns(Task.CompletedTask);

        var result = await controller.UploadThumbnail(file.Object);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("/thumbnails/", json);
        Assert.Contains(".jpg", json);

        // Cleanup
        try { Directory.Delete(tempDir, true); } catch { }
    }

    [Theory]
    [InlineData(".jpg")]
    [InlineData(".jpeg")]
    [InlineData(".png")]
    [InlineData(".webp")]
    [InlineData(".gif")]
    public async Task UploadThumbnail_AllowedExtensions_Succeeds(string ext)
    {
        var auth = new AdminAuthService(CreateConfig("admin", "secret"));
        var configService = CreateConfigService();
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_DIR"] = tempDir })
            .Build();

        var realmManager = new RealmManager(configService);
        var controller = new AdminController(auth, configService, realmManager,
            new Mock<IHubContext<RealmHub>>().Object, new RealmStatsTracker(), config);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };

        var content = new byte[] { 0x00 };
        var stream = new MemoryStream(content);
        var file = new Mock<IFormFile>();
        file.Setup(f => f.Length).Returns(content.Length);
        file.Setup(f => f.FileName).Returns($"test{ext}");
        file.Setup(f => f.CopyToAsync(It.IsAny<Stream>(), default))
            .Callback<Stream, CancellationToken>((s, _) => stream.CopyTo(s))
            .Returns(Task.CompletedTask);

        var result = await controller.UploadThumbnail(file.Object);

        Assert.IsType<OkObjectResult>(result);

        try { Directory.Delete(tempDir, true); } catch { }
    }
}
