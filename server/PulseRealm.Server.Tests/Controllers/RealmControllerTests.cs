using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using PulseRealm.Server.Controllers;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;
using Xunit;

namespace PulseRealm.Server.Tests.Controllers;

public class RealmControllerTests
{
    private static RealmManager CreateRealmManager()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_DIR"] = tempDir })
            .Build();
        var logger = new Mock<ILogger<AdminConfigService>>().Object;
        var adminConfig = new AdminConfigService(config, logger);
        var cfg = adminConfig.GetConfig();
        cfg.MaxConcurrentRealms = 0;
        adminConfig.UpdateConfig(cfg);
        return new RealmManager(adminConfig);
    }

    private readonly RealmManager _realmManager = CreateRealmManager();
    private readonly RealmController _controller;

    public RealmControllerTests()
    {
        _controller = new RealmController(_realmManager);
    }

    // -------------------------------------------------------------------------
    // Create
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(RealmMode.Competition)]
    [InlineData(RealmMode.StreetView)]
    [InlineData(RealmMode.YouTubeTrail)]
    [InlineData(RealmMode.Route)]
    [InlineData(RealmMode.Dungeon)]
    [InlineData(RealmMode.Social)]
    public void Create_Returns200ForAllModes(RealmMode mode)
    {
        var result = _controller.Create(new CreateRealmRequest(mode));

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
    }

    [Fact]
    public void Create_ReturnsRealmId()
    {
        var result = _controller.Create(new CreateRealmRequest(RealmMode.Competition));

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("Id", json);
    }

    [Fact]
    public void Create_ReturnsJoinCode()
    {
        var result = _controller.Create(new CreateRealmRequest(RealmMode.Competition));

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("JoinCode", json);
    }

    [Fact]
    public void Create_ReturnsMode()
    {
        var result = _controller.Create(new CreateRealmRequest(RealmMode.Dungeon));

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        // RealmMode.Dungeon has int value 4; confirm Mode is present in the payload.
        Assert.Contains("Mode", json);
    }

    [Fact]
    public void Create_StoredRealmIsRetrievableByJoinCode()
    {
        var result = _controller.Create(new CreateRealmRequest(RealmMode.Social));

        var okResult = Assert.IsType<OkObjectResult>(result);
        // Use reflection to extract the anonymous-type JoinCode property.
        var value = okResult.Value!;
        var joinCode = value.GetType().GetProperty("JoinCode")?.GetValue(value) as string;

        Assert.NotNull(joinCode);
        var realm = _realmManager.GetByJoinCode(joinCode);
        Assert.NotNull(realm);
    }

    [Fact]
    public void Create_EachCallProducesUniqueId()
    {
        var result1 = _controller.Create(new CreateRealmRequest(RealmMode.Competition));
        var result2 = _controller.Create(new CreateRealmRequest(RealmMode.Competition));

        var id1 = ((OkObjectResult)result1).Value!.GetType().GetProperty("Id")?.GetValue(((OkObjectResult)result1).Value) as string;
        var id2 = ((OkObjectResult)result2).Value!.GetType().GetProperty("Id")?.GetValue(((OkObjectResult)result2).Value) as string;

        Assert.NotEqual(id1, id2);
    }

    // -------------------------------------------------------------------------
    // GetByCode
    // -------------------------------------------------------------------------

    [Fact]
    public void GetByCode_Returns200ForValidJoinCode()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);

        var result = _controller.GetByCode(realm.JoinCode);

        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
    }

    [Fact]
    public void GetByCode_ReturnsRealmData()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Dungeon);

        var result = _controller.GetByCode(realm.JoinCode);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains(realm.Id, json);
        Assert.Contains(realm.JoinCode, json);
    }

    [Fact]
    public void GetByCode_ReturnsStatusAsString()
    {
        var realm = _realmManager.CreateRealm(RealmMode.StreetView);

        var result = _controller.GetByCode(realm.JoinCode);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("Lobby", json);
    }

    [Fact]
    public void GetByCode_Returns404ForInvalidCode()
    {
        var result = _controller.GetByCode("000000");

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public void GetByCode_Returns404ForEmptyCode()
    {
        var result = _controller.GetByCode(string.Empty);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public void GetByCode_IsCaseInsensitive_ReturnsRealmForLowercaseCode()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);

        var result = _controller.GetByCode(realm.JoinCode.ToLowerInvariant());

        Assert.IsType<OkObjectResult>(result);
    }

    // -------------------------------------------------------------------------
    // Create — error paths
    // -------------------------------------------------------------------------

    [Fact]
    public void Create_MaxConcurrentReached_Returns429()
    {
        // Create a manager with max 1 concurrent realm
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_DIR"] = tempDir })
            .Build();
        var logger = new Mock<ILogger<AdminConfigService>>().Object;
        var adminConfig = new AdminConfigService(config, logger);
        var cfg = adminConfig.GetConfig();
        cfg.MaxConcurrentRealms = 1;
        adminConfig.UpdateConfig(cfg);
        var limitedManager = new RealmManager(adminConfig);
        var controller = new RealmController(limitedManager);

        controller.Create(new CreateRealmRequest(RealmMode.Competition));
        var result = controller.Create(new CreateRealmRequest(RealmMode.Dungeon));

        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(429, statusResult.StatusCode);
    }

    [Fact]
    public void Create_ReturnsHostSecret()
    {
        var result = _controller.Create(new CreateRealmRequest(RealmMode.Competition));

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("HostSecret", json);
    }

    // -------------------------------------------------------------------------
    // ClaimHost
    // -------------------------------------------------------------------------

    [Fact]
    public void ClaimHost_ValidSecret_ReturnsRealmDetails()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);

        var result = _controller.ClaimHost(realm.JoinCode, new ClaimHostRequest(realm.HostSecret));

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains(realm.Id, json);
        Assert.Contains("Lobby", json);
    }

    [Fact]
    public void ClaimHost_InvalidSecret_Returns401()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);

        var result = _controller.ClaimHost(realm.JoinCode, new ClaimHostRequest("WRONGKEY1"));

        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void ClaimHost_EndedRealm_ReturnsBadRequest()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Ended;

        var result = _controller.ClaimHost(realm.JoinCode, new ClaimHostRequest(realm.HostSecret));

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public void ClaimHost_InvalidJoinCode_Returns404()
    {
        var result = _controller.ClaimHost("000000", new ClaimHostRequest("WHATEVER"));

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public void ClaimHost_WrongCaseSecret_Returns401()
    {
        // Host secret comparison is case-sensitive (Ordinal) to prevent guessing via case variations.
        var realm = _realmManager.CreateRealm(RealmMode.Competition);

        var result = _controller.ClaimHost(realm.JoinCode,
            new ClaimHostRequest(realm.HostSecret.ToLowerInvariant()));

        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void ClaimHost_ExactSecret_Returns200()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);

        var result = _controller.ClaimHost(realm.JoinCode,
            new ClaimHostRequest(realm.HostSecret));

        Assert.IsType<OkObjectResult>(result);
    }
}
