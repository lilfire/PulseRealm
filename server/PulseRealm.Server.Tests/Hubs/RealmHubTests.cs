using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using PulseRealm.Server.Hubs;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;
using Xunit;

namespace PulseRealm.Server.Tests.Hubs;

/// <summary>
/// Tests for RealmHub.
///
/// The hub owns three static ConcurrentDictionaries keyed by connection ID or
/// client ID. To prevent cross-test contamination every test uses a fresh
/// RealmManager and Guid-based client / connection IDs so nothing collides with
/// state left behind by another test regardless of execution order.
///
/// Hub infrastructure (Clients / Groups / Context) is wired by CreateHub().
/// </summary>
public class RealmHubTests
{
    // -------------------------------------------------------------------------
    // Fixture helpers
    // -------------------------------------------------------------------------

    /// <summary>
    /// Builds a fully-wired RealmHub together with its supporting mocks and a
    /// brand-new RealmManager so each test starts from a clean slate.
    /// </summary>
    private static AdminConfigService CreateAdminConfigService()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_DIR"] = tempDir })
            .Build();
        var logger = new Mock<Microsoft.Extensions.Logging.ILogger<AdminConfigService>>().Object;
        var adminConfig = new AdminConfigService(config, logger);
        var cfg = adminConfig.GetConfig();
        cfg.MaxConcurrentRealms = 0;
        cfg.MaxWearableMessagesPerSecond = 0;
        adminConfig.UpdateConfig(cfg);
        return adminConfig;
    }

    private static (
        RealmHub Hub,
        RealmManager Manager,
        Mock<IHubCallerClients> MockClients,
        Mock<ISingleClientProxy> MockProxy,
        Mock<IGroupManager> MockGroups)
        CreateHub(string? connectionId = null)
    {
        var adminConfig = CreateAdminConfigService();
        var manager = new RealmManager(adminConfig);
        var hub = new RealmHub(manager, adminConfig, new RealmStatsTracker());

        var mockClients = new Mock<IHubCallerClients>();
        var mockProxy = new Mock<ISingleClientProxy>();
        var mockGroups = new Mock<IGroupManager>();
        var mockContext = new Mock<HubCallerContext>();

        mockContext.Setup(c => c.ConnectionId).Returns(connectionId ?? Guid.NewGuid().ToString());
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockProxy.Object);
        mockClients.Setup(c => c.Caller).Returns(mockProxy.Object);

        hub.Context = mockContext.Object;
        hub.Clients = mockClients.Object;
        hub.Groups = mockGroups.Object;

        return (hub, manager, mockClients, mockProxy, mockGroups);
    }

    /// <summary>Creates a hub wired as a different client connection for multi-client scenarios.</summary>
    private static (
        RealmHub Hub,
        Mock<ISingleClientProxy> MockProxy)
        CreateHubForClient(RealmManager manager, string clientId, Realm realm)
    {
        var adminConfig = CreateAdminConfigService();
        var hub = new RealmHub(manager, adminConfig, new RealmStatsTracker());

        var mockClients = new Mock<IHubCallerClients>();
        var mockProxy = new Mock<ISingleClientProxy>();
        var mockGroups = new Mock<IGroupManager>();
        var mockContext = new Mock<HubCallerContext>();

        mockContext.Setup(c => c.ConnectionId).Returns(Guid.NewGuid().ToString());
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockProxy.Object);
        mockClients.Setup(c => c.Caller).Returns(mockProxy.Object);

        hub.Context = mockContext.Object;
        hub.Clients = mockClients.Object;
        hub.Groups = mockGroups.Object;

        return (hub, mockProxy);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — guard conditions
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealm_InvalidJoinCode_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm("000000", Guid.NewGuid().ToString()));

        Assert.Contains("Invalid join code", ex.Message);
    }

    [Fact]
    public async Task JoinRealm_EndedRealm_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Ended);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString()));

        Assert.Contains("ended", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task JoinRealm_StartedRealmUnknownClient_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Started);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString()));

        Assert.Contains("already started", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task JoinRealm_FullRealm_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        // StreetView has MaxClients = 1, so adding one client fills it.
        var realm = manager.CreateRealm(RealmMode.StreetView);
        manager.AddClient(realm.Id, Guid.NewGuid().ToString());

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString()));

        Assert.Contains("full", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — successful join
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealm_ValidCode_AddsClientAndSendsClientJoined()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, mockGroups) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        await hub.JoinRealm(realm.JoinCode, clientId);

        Assert.Contains(clientId, realm.ConnectedClientIds);
        mockGroups.Verify(g => g.AddToGroupAsync(connId, realm.Id, default), Times.Once);
        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientJoined", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task JoinRealm_WithProfile_StoresProfile()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        var profile = new ClientProfile { Name = "Alice", Age = 25, HeightCm = 170, WeightKg = 60 };

        await hub.JoinRealm(realm.JoinCode, clientId, profile);

        var stored = manager.GetClientProfile(realm.Id, clientId);
        Assert.NotNull(stored);
        Assert.Equal("Alice", stored.Name);
        Assert.Equal(clientId, stored.ClientId);
    }

    [Fact]
    public async Task JoinRealm_NullProfile_Succeeds()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        await hub.JoinRealm(realm.JoinCode, clientId, null);

        Assert.Contains(clientId, realm.ConnectedClientIds);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — reconnect to started realm
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealm_Reconnect_KnownClientInStartedRealm_SendsRealmStarted()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        manager.AddClient(realm.Id, clientId);
        realm.WithLock(r =>
        {
            r.Status = RealmStatus.Started;
            r.RealmConfig = """{"subMode":"race"}""";
        });

        await hub.JoinRealm(realm.JoinCode, clientId);

        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmStarted", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task JoinRealm_Reconnect_StillSendsClientJoined()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        manager.AddClient(realm.Id, clientId);
        realm.WithLock(r => r.Status = RealmStatus.Started);

        await hub.JoinRealm(realm.JoinCode, clientId);

        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientJoined", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — profile validation
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task JoinRealm_BlankName_ThrowsHubException(string name)
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = name, Age = 25, HeightCm = 170, WeightKg = 60 };

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Contains("Name", ex.Message);
    }

    [Fact]
    public async Task JoinRealm_NameTooLong_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = new string('X', 51), Age = 25, HeightCm = 170, WeightKg = 60 };

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Contains("Name", ex.Message);
    }

    [Theory]
    [InlineData(49)]
    [InlineData(251)]
    public async Task JoinRealm_HeightOutOfRange_ThrowsHubException(double height)
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", Age = 25, HeightCm = height, WeightKg = 70 };

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Contains("Height", ex.Message);
    }

    [Theory]
    [InlineData(9)]
    [InlineData(501)]
    public async Task JoinRealm_WeightOutOfRange_ThrowsHubException(double weight)
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", Age = 25, HeightCm = 170, WeightKg = weight };

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Contains("Weight", ex.Message);
    }

    [Fact]
    public async Task JoinRealm_NameExactly50Chars_Succeeds()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        // 50-character name is the maximum allowed — must not throw.
        var profile = new ClientProfile { Name = new string('A', 50), Age = 25, HeightCm = 170, WeightKg = 60 };
        var clientId = Guid.NewGuid().ToString();

        var ex = await Record.ExceptionAsync(
            () => hub.JoinRealm(realm.JoinCode, clientId, profile));

        Assert.Null(ex);
    }

    [Theory]
    [InlineData(50)]   // minimum valid height
    [InlineData(250)]  // maximum valid height
    public async Task JoinRealm_HeightAtBoundary_Succeeds(double height)
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", Age = 25, HeightCm = height, WeightKg = 70 };

        var ex = await Record.ExceptionAsync(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Null(ex);
    }

    [Theory]
    [InlineData(10)]   // minimum valid weight
    [InlineData(500)]  // maximum valid weight
    public async Task JoinRealm_WeightAtBoundary_Succeeds(double weight)
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", Age = 25, HeightCm = 170, WeightKg = weight };

        var ex = await Record.ExceptionAsync(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // AuthenticateAsHost
    // -------------------------------------------------------------------------

    [Fact]
    public async Task AuthenticateAsHost_ValidSecret_SetsHostConnectionId()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);

        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        Assert.Equal(connId, realm.HostConnectionId);
    }

    [Fact]
    public async Task AuthenticateAsHost_WrongSecret_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.AuthenticateAsHost(realm.Id, "WRONGKEY"));

        Assert.Contains("Invalid host secret", ex.Message);
    }

    [Fact]
    public async Task AuthenticateAsHost_InvalidRealm_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.AuthenticateAsHost(Guid.NewGuid().ToString(), "ANY"));

        Assert.Contains("not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // -------------------------------------------------------------------------
    // StartRealm
    // -------------------------------------------------------------------------

    [Fact]
    public async Task StartRealm_InvalidRealm_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.StartRealm(Guid.NewGuid().ToString()));

        Assert.Contains("not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task StartRealm_NotHost_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.StartRealm(realm.Id));

        Assert.Contains("Not authorized", ex.Message);
    }

    [Fact]
    public async Task StartRealm_ValidRealm_SetsStatusToStarted()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        await hub.StartRealm(realm.Id, """{"mode":"race"}""");

        Assert.Equal(RealmStatus.Started, realm.Status);
    }

    [Fact]
    public async Task StartRealm_ValidRealm_StoresConfig()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        const string config = """{"mode":"race"}""";

        await hub.StartRealm(realm.Id, config);

        Assert.Equal(config, realm.RealmConfig);
    }

    [Fact]
    public async Task StartRealm_ValidRealm_SendsRealmStartedToGroup()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        await hub.StartRealm(realm.Id, """{"mode":"race"}""");

        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmStarted", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task StartRealm_NullConfig_SetsStatusAndSendsEvent()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Social);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        await hub.StartRealm(realm.Id, null);

        Assert.Equal(RealmStatus.Started, realm.Status);
        Assert.Null(realm.RealmConfig);
        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmStarted", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // SendWearableData
    // -------------------------------------------------------------------------

    [Fact]
    public async Task SendWearableData_ForwardsWearableDataReceivedToGroup()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Started);
        var data = new WearableData
        {
            ClientId = Guid.NewGuid().ToString(),
            HeartRate = 120,
            Steps = 0
        };

        await hub.SendWearableData(realm.Id, data);

        mockProxy.Verify(p => p.SendCoreAsync(
            "WearableDataReceived", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task SendWearableData_RealmNotStarted_ZerosStepsAndSpeed()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        // Realm stays in Lobby status
        var data = new WearableData
        {
            ClientId = Guid.NewGuid().ToString(),
            HeartRate = 120,
            Steps = 50
        };

        await hub.SendWearableData(realm.Id, data);

        Assert.Equal(0, data.Steps);
        Assert.Equal(0, data.SpeedKmh);
        // Should still forward the message (for heart rate visibility)
        mockProxy.Verify(p => p.SendCoreAsync(
            "WearableDataReceived", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task SendWearableData_FirstPacket_SpeedIsZero()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Started);
        var data = new WearableData
        {
            ClientId = Guid.NewGuid().ToString(),
            HeartRate = 100,
            Steps = 50
        };

        await hub.SendWearableData(realm.Id, data);

        Assert.Equal(0, data.SpeedKmh);
    }

    [Fact]
    public async Task SendWearableData_StepDecrease_AppliesOffsetToSteps()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Started);
        // Use a guaranteed-unique client ID so static state from any other test
        // cannot influence the offset accumulated here.
        var clientId = Guid.NewGuid().ToString();

        var first = new WearableData { ClientId = clientId, HeartRate = 120, Steps = 100 };
        await hub.SendWearableData(realm.Id, first);

        // Steps dropped from 100 to 10 — device counter reset.
        var second = new WearableData { ClientId = clientId, HeartRate = 125, Steps = 10 };
        await hub.SendWearableData(realm.Id, second);

        // After the reset the offset is 100, so cumulative = 10 + 100 = 110.
        Assert.Equal(110, second.Steps);
    }

    [Fact]
    public async Task SendWearableData_StepIncrease_NoOffsetApplied()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Started);
        var clientId = Guid.NewGuid().ToString();

        var first = new WearableData { ClientId = clientId, HeartRate = 80, Steps = 0 };
        await hub.SendWearableData(realm.Id, first);

        await Task.Delay(150);

        var second = new WearableData { ClientId = clientId, HeartRate = 85, Steps = 50 };
        await hub.SendWearableData(realm.Id, second);

        // No reset occurred, so steps must not be inflated.
        Assert.Equal(50, second.Steps);
    }

    [Fact]
    public async Task SendWearableData_SubsequentPacketWithStepGain_SpeedIsPositive()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Started);
        var clientId = Guid.NewGuid().ToString();

        manager.AddClient(realm.Id, clientId, new ClientProfile
        {
            Name = "Runner",
            HeightCm = 180,
            WeightKg = 75
        });

        var first = new WearableData { ClientId = clientId, HeartRate = 140, Steps = 0 };
        await hub.SendWearableData(realm.Id, first);

        await Task.Delay(200);

        var second = new WearableData { ClientId = clientId, HeartRate = 145, Steps = 30 };
        await hub.SendWearableData(realm.Id, second);

        Assert.True(second.SpeedKmh > 0, "SpeedKmh must be positive when steps increased over a measurable time window.");
        Assert.True(second.SpeedKmh <= 25, "SpeedKmh must be clamped to 25 km/h.");
    }

    // -------------------------------------------------------------------------
    // NotifyEliminated
    // -------------------------------------------------------------------------

    [Fact]
    public async Task NotifyEliminated_BroadcastsClientEliminatedToGroup()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        var clientId = Guid.NewGuid().ToString();

        await hub.NotifyEliminated(realm.Id, clientId);

        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientEliminated",
            It.Is<object?[]>(a => a.Length > 0 && (string)a[0]! == clientId),
            default), Times.Once);
    }

    [Fact]
    public async Task NotifyEliminated_NotHost_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.NotifyEliminated(realm.Id, Guid.NewGuid().ToString()));

        Assert.Contains("Not authorized", ex.Message);
    }

    // -------------------------------------------------------------------------
    // EndRealm
    // -------------------------------------------------------------------------

    [Fact]
    public async Task EndRealm_InvalidRealm_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.EndRealm(Guid.NewGuid().ToString(), new RealmSummary()));

        Assert.Contains("not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task EndRealm_NotHost_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.EndRealm(realm.Id, new RealmSummary()));

        Assert.Contains("Not authorized", ex.Message);
    }

    [Fact]
    public async Task EndRealm_ValidRealm_SetsStatusToEnded()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        realm.WithLock(r => r.Status = RealmStatus.Started);

        await hub.EndRealm(realm.Id);

        Assert.Equal(RealmStatus.Ended, realm.Status);
    }

    [Fact]
    public async Task EndRealm_ValidRealm_SendsRealmEndedToGroup()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        await hub.EndRealm(realm.Id);

        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmEnded", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task EndRealm_ValidRealm_PopulatesDurationSeconds()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        // Back-date so the duration is measurably > 0.
        realm.CreatedAt = DateTime.UtcNow.AddMinutes(-5);

        RealmSummary? capturedSummary = null;
        mockProxy.Setup(p => p.SendCoreAsync(
            "RealmEnded", It.IsAny<object?[]>(), default))
            .Callback<string, object?[], CancellationToken>((_, args, _) =>
            {
                if (args.Length > 0 && args[0] is RealmSummary s)
                    capturedSummary = s;
            })
            .Returns(Task.CompletedTask);

        await hub.EndRealm(realm.Id);

        Assert.NotNull(capturedSummary);
        Assert.True(capturedSummary!.DurationSeconds > 0,
            $"Expected DurationSeconds > 0, got {capturedSummary.DurationSeconds}");
    }

    [Fact]
    public async Task KickClient_NotHost_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.KickClient(realm.Id, Guid.NewGuid().ToString()));

        Assert.Contains("Not authorized", ex.Message);
    }

    // -------------------------------------------------------------------------
    // JoinRealmAsDashboard
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealmAsDashboard_ValidRealm_AddsToGroupAndSendsJoinedRealm()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, mockGroups) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Dungeon);
        manager.AddClient(realm.Id, Guid.NewGuid().ToString(),
            new ClientProfile { Name = "Player1", HeightCm = 175, WeightKg = 70 });

        await hub.JoinRealmAsDashboard(realm.Id);

        mockGroups.Verify(g => g.AddToGroupAsync(connId, realm.Id, default), Times.Once);
        mockProxy.Verify(p => p.SendCoreAsync(
            "JoinedRealm", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task JoinRealmAsDashboard_ValidRealm_StateContainsConnectedClientIds()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Dungeon);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);

        object?[]? capturedArgs = null;
        mockProxy
            .Setup(p => p.SendCoreAsync("JoinedRealm", It.IsAny<object?[]>(), default))
            .Callback<string, object?[], CancellationToken>((_, args, _) => capturedArgs = args)
            .Returns(Task.CompletedTask);

        await hub.JoinRealmAsDashboard(realm.Id);

        Assert.NotNull(capturedArgs);
        var json = System.Text.Json.JsonSerializer.Serialize(capturedArgs[0]);
        Assert.Contains(clientId, json);
    }

    [Fact]
    public async Task JoinRealmAsDashboard_ValidRealm_StateContainsClientProfiles()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Dungeon);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId,
            new ClientProfile { Name = "ProfiledPlayer", HeightCm = 180, WeightKg = 75 });

        object?[]? capturedArgs = null;
        mockProxy
            .Setup(p => p.SendCoreAsync("JoinedRealm", It.IsAny<object?[]>(), default))
            .Callback<string, object?[], CancellationToken>((_, args, _) => capturedArgs = args)
            .Returns(Task.CompletedTask);

        await hub.JoinRealmAsDashboard(realm.Id);

        Assert.NotNull(capturedArgs);
        var json = System.Text.Json.JsonSerializer.Serialize(capturedArgs[0]);
        Assert.Contains("ProfiledPlayer", json);
    }

    [Fact]
    public async Task JoinRealmAsDashboard_NullRealm_SendsDefaultLobbyState()
    {
        var (hub, _, _, mockProxy, _) = CreateHub();

        object?[]? capturedArgs = null;
        mockProxy
            .Setup(p => p.SendCoreAsync("JoinedRealm", It.IsAny<object?[]>(), default))
            .Callback<string, object?[], CancellationToken>((_, args, _) => capturedArgs = args)
            .Returns(Task.CompletedTask);

        await hub.JoinRealmAsDashboard(Guid.NewGuid().ToString());

        Assert.NotNull(capturedArgs);
        var json = System.Text.Json.JsonSerializer.Serialize(capturedArgs[0]);
        Assert.Contains("Lobby", json);
    }

    [Fact]
    public async Task JoinRealmAsDashboard_NullRealm_StateHasEmptyClientLists()
    {
        var (hub, _, _, mockProxy, _) = CreateHub();

        object?[]? capturedArgs = null;
        mockProxy
            .Setup(p => p.SendCoreAsync("JoinedRealm", It.IsAny<object?[]>(), default))
            .Callback<string, object?[], CancellationToken>((_, args, _) => capturedArgs = args)
            .Returns(Task.CompletedTask);

        await hub.JoinRealmAsDashboard(Guid.NewGuid().ToString());

        Assert.NotNull(capturedArgs);
        var json = System.Text.Json.JsonSerializer.Serialize(capturedArgs[0]);
        // ConnectedClientIds and ClientProfiles should be empty collections.
        Assert.Contains("[]", json);
    }

    // -------------------------------------------------------------------------
    // OnDisconnectedAsync
    // -------------------------------------------------------------------------

    [Fact]
    public async Task OnDisconnectedAsync_LobbyRealm_FullyRemovesClientAndProfile()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        // The JoinRealm call seeds _connectionMap[connId] inside the hub's static state.
        await hub.JoinRealm(realm.JoinCode, clientId,
            new ClientProfile { Name = "Bob", Age = 25, HeightCm = 175, WeightKg = 70 });

        // Realm stays in Lobby — disconnect must fully clean up.
        await hub.OnDisconnectedAsync(null);

        Assert.DoesNotContain(clientId, realm.ConnectedClientIds);
        Assert.Null(manager.GetClientProfile(realm.Id, clientId));
    }

    [Fact]
    public async Task OnDisconnectedAsync_StartedRealm_OnlyRemovesFromConnectedList()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        // Join while still in Lobby to register the connection mapping.
        await hub.JoinRealm(realm.JoinCode, clientId,
            new ClientProfile { Name = "Alice", Age = 25, HeightCm = 170, WeightKg = 60 });

        // Transition to Started before disconnecting.
        realm.WithLock(r => r.Status = RealmStatus.Started);

        await hub.OnDisconnectedAsync(null);

        // ConnectedClientIds entry must be gone …
        Assert.DoesNotContain(clientId, realm.ConnectedClientIds);
        // … but the profile must survive for potential reconnect.
        Assert.NotNull(manager.GetClientProfile(realm.Id, clientId));
        // KnownClientIds must also still hold the client.
        Assert.Contains(clientId, realm.KnownClientIds);
    }

    [Fact]
    public async Task OnDisconnectedAsync_LobbyRealm_SendsClientDisconnectedToGroup()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        await hub.JoinRealm(realm.JoinCode, clientId,
            new ClientProfile { Name = "Charlie", Age = 25, HeightCm = 180, WeightKg = 80 });

        await hub.OnDisconnectedAsync(null);

        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientDisconnected",
            It.Is<object?[]>(a => a.Length > 0 && (string)a[0]! == clientId),
            default), Times.Once);
    }

    [Fact]
    public async Task LeaveRealm_RemovesClientAndSendsClientLeft()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, mockGroups) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        await hub.JoinRealm(realm.JoinCode, clientId,
            new ClientProfile { Name = "Dave", Age = 25, HeightCm = 175, WeightKg = 70 });

        await hub.LeaveRealm();

        Assert.DoesNotContain(clientId, realm.ConnectedClientIds);
        Assert.Null(manager.GetClientProfile(realm.Id, clientId));
        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientLeft",
            It.Is<object?[]>(a => a.Length > 0 && (string)a[0]! == clientId),
            default), Times.Once);
    }

    [Fact]
    public async Task LeaveRealm_ThenDisconnect_DoesNotSendClientDisconnected()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        await hub.JoinRealm(realm.JoinCode, clientId,
            new ClientProfile { Name = "Eve", Age = 25, HeightCm = 165, WeightKg = 55 });

        await hub.LeaveRealm();
        await hub.OnDisconnectedAsync(null);

        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientDisconnected", It.IsAny<object?[]>(), default), Times.Never);
    }

    [Fact]
    public async Task OnDisconnectedAsync_UnknownConnection_DoesNotThrow()
    {
        var (hub, _, _, _, _) = CreateHub(Guid.NewGuid().ToString());

        // No prior JoinRealm — the connection map has no entry for this ID.
        var ex = await Record.ExceptionAsync(() => hub.OnDisconnectedAsync(null));

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — kicked client
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealm_KickedClient_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        realm.WithLock(r => r.KickedClientIds.Add(clientId));

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, clientId));

        Assert.Contains("kicked", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — profile validation: age
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(4)]
    [InlineData(121)]
    public async Task JoinRealm_AgeOutOfRange_ThrowsHubException(int age)
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", Age = age, HeightCm = 170, WeightKg = 70 };

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Contains("Age", ex.Message);
    }

    [Theory]
    [InlineData(5)]
    [InlineData(120)]
    public async Task JoinRealm_AgeAtBoundary_Succeeds(int age)
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", Age = age, HeightCm = 170, WeightKg = 70 };

        var ex = await Record.ExceptionAsync(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — profile validation: stride factor
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealm_InvalidStrideFactor_ResetsToDefault()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        var profile = new ClientProfile
        {
            Name = "Test", Age = 25, HeightCm = 170, WeightKg = 70,
            StrideFactor = 0.2 // Below 0.3 minimum
        };

        await hub.JoinRealm(realm.JoinCode, clientId, profile);

        var stored = manager.GetClientProfile(realm.Id, clientId);
        Assert.Equal(0, stored!.StrideFactor);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — profile validation: zone bounds
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealm_InvalidZoneBounds_SetsToNull()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        var profile = new ClientProfile
        {
            Name = "Test", Age = 25, HeightCm = 170, WeightKg = 70,
            ZoneBounds = new[] { 0.5, 0.4, 0.7, 0.9 } // Not strictly increasing
        };

        await hub.JoinRealm(realm.JoinCode, clientId, profile);

        var stored = manager.GetClientProfile(realm.Id, clientId);
        Assert.Null(stored!.ZoneBounds);
    }

    [Fact]
    public async Task JoinRealm_WrongLengthZoneBounds_SetsToNull()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        var profile = new ClientProfile
        {
            Name = "Test", Age = 25, HeightCm = 170, WeightKg = 70,
            ZoneBounds = new[] { 0.5, 0.7, 0.9 } // Wrong length
        };

        await hub.JoinRealm(realm.JoinCode, clientId, profile);

        var stored = manager.GetClientProfile(realm.Id, clientId);
        Assert.Null(stored!.ZoneBounds);
    }

    [Fact]
    public async Task JoinRealm_ValidZoneBounds_AreKept()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        var profile = new ClientProfile
        {
            Name = "Test", Age = 25, HeightCm = 170, WeightKg = 70,
            ZoneBounds = new[] { 0.50, 0.60, 0.70, 0.80 }
        };

        await hub.JoinRealm(realm.JoinCode, clientId, profile);

        var stored = manager.GetClientProfile(realm.Id, clientId);
        Assert.NotNull(stored!.ZoneBounds);
        Assert.Equal(4, stored.ZoneBounds!.Length);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — profile validation: MaxHr
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(99)]
    [InlineData(251)]
    public async Task JoinRealm_InvalidMaxHr_ResetsToZero(int maxHr)
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        var profile = new ClientProfile
        {
            Name = "Test", Age = 25, HeightCm = 170, WeightKg = 70,
            MaxHr = maxHr
        };

        await hub.JoinRealm(realm.JoinCode, clientId, profile);

        var stored = manager.GetClientProfile(realm.Id, clientId);
        Assert.Equal(0, stored!.MaxHr);
    }

    [Theory]
    [InlineData(100)]
    [InlineData(250)]
    public async Task JoinRealm_ValidMaxHr_IsKept(int maxHr)
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        var profile = new ClientProfile
        {
            Name = "Test", Age = 25, HeightCm = 170, WeightKg = 70,
            MaxHr = maxHr
        };

        await hub.JoinRealm(realm.JoinCode, clientId, profile);

        var stored = manager.GetClientProfile(realm.Id, clientId);
        Assert.Equal(maxHr, stored!.MaxHr);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — lobby settings
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealm_WithLobbySettings_SendsSettingsToJoiner()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.LobbySettings = """{"someConfig":true}""");

        await hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString());

        mockProxy.Verify(p => p.SendCoreAsync(
            "LobbySettingsUpdated", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // UpdateLobbySettings
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpdateLobbySettings_AsHost_StoresAndBroadcasts()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        var settings = """{"subMode":"interval"}""";

        await hub.UpdateLobbySettings(realm.Id, settings);

        Assert.Equal(settings, realm.LobbySettings);
        mockProxy.Verify(p => p.SendCoreAsync(
            "LobbySettingsUpdated", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task UpdateLobbySettings_NotHost_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.UpdateLobbySettings(realm.Id, "{}"));

        Assert.Contains("Not authorized", ex.Message);
    }

    // -------------------------------------------------------------------------
    // SendWearableData — rate limiting
    // -------------------------------------------------------------------------

    [Fact]
    public async Task SendWearableData_RateLimited_DropsExcessMessages()
    {
        // Create a hub with rate limiting enabled
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DATA_DIR"] = tempDir })
            .Build();
        var adminConfig = new AdminConfigService(config, new Mock<Microsoft.Extensions.Logging.ILogger<AdminConfigService>>().Object);
        var cfg = adminConfig.GetConfig();
        cfg.MaxConcurrentRealms = 0;
        cfg.MaxWearableMessagesPerSecond = 2; // 2 per second = 500ms min interval
        adminConfig.UpdateConfig(cfg);
        var realmManager = new RealmManager(adminConfig);
        var hub = new RealmHub(realmManager, adminConfig, new RealmStatsTracker());

        var mockClients = new Mock<IHubCallerClients>();
        var mockProxy = new Mock<ISingleClientProxy>();
        var mockGroups = new Mock<IGroupManager>();
        var mockContext = new Mock<HubCallerContext>();
        mockContext.Setup(c => c.ConnectionId).Returns(Guid.NewGuid().ToString());
        mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(mockProxy.Object);
        mockClients.Setup(c => c.Caller).Returns(mockProxy.Object);
        hub.Context = mockContext.Object;
        hub.Clients = mockClients.Object;
        hub.Groups = mockGroups.Object;

        var realm = realmManager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Started);
        var clientId = Guid.NewGuid().ToString();

        // First message should go through
        await hub.SendWearableData(realm.Id, new WearableData { ClientId = clientId, HeartRate = 120, Steps = 0 });
        // Immediate second message should be rate-limited (dropped)
        await hub.SendWearableData(realm.Id, new WearableData { ClientId = clientId, HeartRate = 125, Steps = 5 });

        // Only 1 WearableDataReceived call (the first one)
        mockProxy.Verify(p => p.SendCoreAsync(
            "WearableDataReceived", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task SendWearableData_NullRealm_NoException()
    {
        var (hub, _, _, _, _) = CreateHub();
        var data = new WearableData { ClientId = Guid.NewGuid().ToString(), HeartRate = 120, Steps = 0 };

        var ex = await Record.ExceptionAsync(
            () => hub.SendWearableData("nonexistent-realm-id", data));

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // SendWearableData — speed override
    // -------------------------------------------------------------------------

    [Fact]
    public async Task SendWearableData_WithSpeedOverride_UsesOverrideSpeed()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r =>
        {
            r.Status = RealmStatus.Started;
            r.ClientSpeedOverrides["runner"] = 8.5;
        });

        var data = new WearableData { ClientId = "runner", HeartRate = 130, Steps = 50 };
        await hub.SendWearableData(realm.Id, data);

        Assert.Equal(8.5, data.SpeedKmh);
    }

    // -------------------------------------------------------------------------
    // EndRealm — with overrides
    // -------------------------------------------------------------------------

    [Fact]
    public async Task EndRealm_WithDistanceOverride_UsesOverrideDistance()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        RealmSummary? capturedSummary = null;
        mockProxy.Setup(p => p.SendCoreAsync("RealmEnded", It.IsAny<object?[]>(), default))
            .Callback<string, object?[], CancellationToken>((_, args, _) =>
            {
                if (args.Length > 0 && args[0] is RealmSummary s)
                    capturedSummary = s;
            })
            .Returns(Task.CompletedTask);

        var overrides = new RealmSummary { TotalDistanceMeters = 5000 };
        await hub.EndRealm(realm.Id, overrides);

        Assert.NotNull(capturedSummary);
        Assert.Equal(5000, capturedSummary!.TotalDistanceMeters);
    }

    [Fact]
    public async Task EndRealm_WithTeamFormat_SetsIsTeamFormat()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        RealmSummary? capturedSummary = null;
        mockProxy.Setup(p => p.SendCoreAsync("RealmEnded", It.IsAny<object?[]>(), default))
            .Callback<string, object?[], CancellationToken>((_, args, _) =>
            {
                if (args.Length > 0 && args[0] is RealmSummary s)
                    capturedSummary = s;
            })
            .Returns(Task.CompletedTask);

        var overrides = new RealmSummary { IsTeamFormat = true };
        await hub.EndRealm(realm.Id, overrides);

        Assert.NotNull(capturedSummary);
        Assert.True(capturedSummary!.IsTeamFormat);
    }

    [Fact]
    public async Task EndRealm_WithClientSummaryOverrides_MergesTeamInfo()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        var clientId = Guid.NewGuid().ToString();
        var clientHub = CreateHubForClient(manager, clientId, realm);
        var profile = new ClientProfile { Name = "Player", Age = 25, HeightCm = 175, WeightKg = 70 };
        await clientHub.Hub.JoinRealm(realm.JoinCode, clientId, profile);
        realm.WithLock(r => r.Status = RealmStatus.Started);

        // Record stats so the client appears in the summary
        var statsTracker = new RealmStatsTracker();
        statsTracker.Record(realm.Id, clientId, 100, 120, 5.0, profile);

        // Use hub.EndRealm which builds summary from the hub's own stats tracker
        // Instead, send wearable data through the client hub to register stats
        var data = new WearableData { ClientId = clientId, HeartRate = 120, Steps = 100 };
        await clientHub.Hub.SendWearableData(realm.Id, data);

        RealmSummary? capturedSummary = null;
        mockProxy.Setup(p => p.SendCoreAsync("RealmEnded", It.IsAny<object?[]>(), default))
            .Callback<string, object?[], CancellationToken>((_, args, _) =>
            {
                if (args.Length > 0 && args[0] is RealmSummary s)
                    capturedSummary = s;
            })
            .Returns(Task.CompletedTask);

        var overrides = new RealmSummary
        {
            ClientSummaries = new List<ClientSummaryDto>
            {
                new() { ClientId = clientId, TeamName = "Red Team", TeamColor = "#FF0000", DistanceMeters = 1500 }
            }
        };
        await hub.EndRealm(realm.Id, overrides);

        Assert.NotNull(capturedSummary);
        var cs = capturedSummary!.ClientSummaries?.FirstOrDefault(c => c.ClientId == clientId);
        Assert.NotNull(cs);
        Assert.Equal("Red Team", cs!.TeamName);
        Assert.Equal("#FF0000", cs.TeamColor);
        Assert.Equal(1500, cs.DistanceMeters);
    }

    // -------------------------------------------------------------------------
    // KickClient — successful kick
    // -------------------------------------------------------------------------

    [Fact]
    public async Task KickClient_AsHost_RemovesClientAndBroadcasts()
    {
        var hostConnId = Guid.NewGuid().ToString();
        var clientConnId = Guid.NewGuid().ToString();
        var (hub, manager, mockClients, mockProxy, mockGroups) = CreateHub(hostConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        // Join a client using a separate hub instance with the client connection
        var clientMockContext = new Mock<HubCallerContext>();
        clientMockContext.Setup(c => c.ConnectionId).Returns(clientConnId);
        var clientHub = new RealmHub(manager, CreateAdminConfigService(), new RealmStatsTracker());
        clientHub.Context = clientMockContext.Object;
        clientHub.Clients = mockClients.Object;
        clientHub.Groups = mockGroups.Object;

        var clientId = Guid.NewGuid().ToString();
        await clientHub.JoinRealm(realm.JoinCode, clientId,
            new ClientProfile { Name = "Victim", Age = 25, HeightCm = 170, WeightKg = 70 });

        // Now kick from host hub
        var mockClientProxy = new Mock<ISingleClientProxy>();
        mockClients.Setup(c => c.Client(clientConnId)).Returns(mockClientProxy.Object);

        await hub.KickClient(realm.Id, clientId);

        Assert.DoesNotContain(clientId, realm.ConnectedClientIds);
        Assert.Contains(clientId, realm.KickedClientIds);
        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientKicked", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // OnDisconnectedAsync — host disconnect
    // -------------------------------------------------------------------------

    [Fact]
    public async Task OnDisconnectedAsync_HostDisconnects_ClearsHostConnectionId()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        Assert.Equal(connId, realm.HostConnectionId);

        await hub.OnDisconnectedAsync(null);

        Assert.Null(realm.HostConnectionId);
    }

    // -------------------------------------------------------------------------
    // LeaveRealm — started realm
    // -------------------------------------------------------------------------

    [Fact]
    public async Task LeaveRealm_StartedRealm_SendsSummary()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        await hub.JoinRealm(realm.JoinCode, clientId,
            new ClientProfile { Name = "Runner", Age = 25, HeightCm = 175, WeightKg = 70 });
        realm.WithLock(r =>
        {
            r.Status = RealmStatus.Started;
            // Keep a host so TryAutoEndRealm doesn't fire a second RealmEnded
            r.HostConnectionId = Guid.NewGuid().ToString();
        });

        var result = await hub.LeaveRealm();

        Assert.True(result);
        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmEnded", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task LeaveRealm_NotInRealm_ReturnsFalse()
    {
        var (hub, _, _, _, _) = CreateHub();

        var result = await hub.LeaveRealm();

        Assert.False(result);
    }

    // -------------------------------------------------------------------------
    // SetIncline / SetSpeedOverride — basic tests
    // -------------------------------------------------------------------------

    [Fact]
    public async Task SetIncline_NotBound_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.SetIncline(realm.Id, "c1", 5.0));

        Assert.Contains("Not bound", ex.Message);
    }

    [Fact]
    public async Task SetSpeedOverride_NotBound_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.SetSpeedOverride(realm.Id, "c1", 8.0));

        Assert.Contains("Not bound", ex.Message);
    }

    [Fact]
    public async Task SetIncline_InvalidRealm_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.SetIncline("nonexistent", "c1", 5.0));

        Assert.Contains("not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SetSpeedOverride_InvalidRealm_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.SetSpeedOverride("nonexistent", "c1", 8.0));

        Assert.Contains("not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // -------------------------------------------------------------------------
    // RequestBind / RespondBind / CancelBind
    // -------------------------------------------------------------------------

    [Fact]
    public async Task RequestBind_InvalidRealm_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.RequestBind("nonexistent", "c1"));

        Assert.Contains("not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RequestBind_StartedRealm_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Started);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.RequestBind(realm.Id, "c1"));

        Assert.Contains("started", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RequestBind_AlreadyBound_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.ClientBindings["c1"] = "some-dashboard");

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.RequestBind(realm.Id, "c1"));

        Assert.Contains("already bound", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CancelBind_NullRealm_DoesNotThrow()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Record.ExceptionAsync(
            () => hub.CancelBind("nonexistent", "c1"));

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // StartRealm — clears step data
    // -------------------------------------------------------------------------

    [Fact]
    public async Task StartRealm_ClearsPreStartStepData()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);

        // Send pre-start data
        var lobbyData = new WearableData { ClientId = clientId, HeartRate = 80, Steps = 500 };
        await hub.SendWearableData(realm.Id, lobbyData);

        await hub.StartRealm(realm.Id, null);

        // After start, first data packet should get speed 0 (fresh start)
        var data = new WearableData { ClientId = clientId, HeartRate = 100, Steps = 10 };
        await hub.SendWearableData(realm.Id, data);

        Assert.Equal(0, data.SpeedKmh); // First packet after start => speed 0
    }
}
