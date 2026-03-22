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
///
/// Placed in [Collection("CalibrationCleanup")] so that calibration session tests
/// in RealmCleanupServiceTests do not run in parallel and corrupt the shared static
/// RealmHub calibration dictionaries.
/// </summary>
[Collection("CalibrationCleanup")]
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
        var (hub, manager, mockClients, mockProxy, mockGroups, _) = CreateHubWithTracker(connectionId);
        return (hub, manager, mockClients, mockProxy, mockGroups);
    }

    private static (
        RealmHub Hub,
        RealmManager Manager,
        Mock<IHubCallerClients> MockClients,
        Mock<ISingleClientProxy> MockProxy,
        Mock<IGroupManager> MockGroups,
        RealmStatsTracker StatsTracker)
        CreateHubWithTracker(string? connectionId = null)
    {
        var adminConfig = CreateAdminConfigService();
        var manager = new RealmManager(adminConfig);
        var statsTracker = new RealmStatsTracker();
        var hub = new RealmHub(manager, adminConfig, statsTracker);

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

        return (hub, manager, mockClients, mockProxy, mockGroups, statsTracker);
    }

    /// <summary>Creates a hub wired as a different client connection for multi-client scenarios.</summary>
    private static (
        RealmHub Hub,
        Mock<ISingleClientProxy> MockProxy)
        CreateHubForClient(RealmManager manager, string clientId, Realm realm,
            RealmStatsTracker? statsTracker = null)
    {
        var adminConfig = CreateAdminConfigService();
        var hub = new RealmHub(manager, adminConfig, statsTracker ?? new RealmStatsTracker());

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
        var (hub, manager, _, mockProxy, _, sharedTracker) = CreateHubWithTracker(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        var clientId = Guid.NewGuid().ToString();
        // Share the same statsTracker so SendWearableData records into the host hub's tracker
        var clientHub = CreateHubForClient(manager, clientId, realm, sharedTracker);
        var profile = new ClientProfile { Name = "Player", Age = 25, HeightCm = 175, WeightKg = 70 };
        await clientHub.Hub.JoinRealm(realm.JoinCode, clientId, profile);
        realm.WithLock(r => r.Status = RealmStatus.Started);

        // Send wearable data through the client hub to register stats in the shared tracker
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
            // Add a second connected client so TryAutoEndRealm doesn't fire
            // (ConnectedClientIds.Count > 0 prevents auto-end)
            r.ConnectedClientIds.Add(Guid.NewGuid().ToString());
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

    // -------------------------------------------------------------------------
    // Ping
    // -------------------------------------------------------------------------

    [Fact]
    public void Ping_ReturnsTrue()
    {
        var (hub, _, _, _, _) = CreateHub();

        Assert.True(hub.Ping());
    }

    // -------------------------------------------------------------------------
    // TrackPopularity — via StartRealm with different config shapes
    // -------------------------------------------------------------------------

    [Fact]
    public async Task StartRealm_YouTubeTrailConfig_TracksPopularity()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.YouTubeTrail);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        var config = """{"videoId":"abc123","someOtherField":"val"}""";

        // Should not throw — popularity tracking is fire-and-forget
        var ex = await Record.ExceptionAsync(() => hub.StartRealm(realm.Id, config));

        Assert.Null(ex);
        Assert.Equal(RealmStatus.Started, realm.Status);
    }

    [Fact]
    public async Task StartRealm_StreetViewConfig_TracksPopularity()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.StreetView);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        var config = """{"lat":48.8566,"lng":2.3522}""";

        var ex = await Record.ExceptionAsync(() => hub.StartRealm(realm.Id, config));

        Assert.Null(ex);
        Assert.Equal(RealmStatus.Started, realm.Status);
    }

    [Fact]
    public async Task StartRealm_RouteConfig_TracksPopularity()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Route);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        var config = """{"from":{"lat":51.5074,"lng":-0.1278},"to":{"lat":51.5155,"lng":-0.0922}}""";

        var ex = await Record.ExceptionAsync(() => hub.StartRealm(realm.Id, config));

        Assert.Null(ex);
        Assert.Equal(RealmStatus.Started, realm.Status);
    }

    [Fact]
    public async Task StartRealm_MalformedConfig_DoesNotThrow()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.YouTubeTrail);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        // Malformed JSON should be swallowed silently
        var ex = await Record.ExceptionAsync(() => hub.StartRealm(realm.Id, "not valid json"));

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // RequestBind — successful bind request
    // -------------------------------------------------------------------------

    [Fact]
    public async Task RequestBind_ValidLobbyRealm_SendsBindCodeGeneratedToCaller()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, mockClients, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);

        // The client must NOT be bound yet and realm must be in Lobby
        await hub.RequestBind(realm.Id, clientId);

        // Dashboard (Caller) receives the code
        mockProxy.Verify(p => p.SendCoreAsync(
            "BindCodeGenerated", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task RequestBind_ValidLobbyRealm_StoresPendingBindCode()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);

        await hub.RequestBind(realm.Id, clientId);

        var hasPending = realm.WithLock(r => r.PendingBindCodes.ContainsKey(clientId));
        Assert.True(hasPending);
    }

    // -------------------------------------------------------------------------
    // RespondBind — approve and decline
    // -------------------------------------------------------------------------

    [Fact]
    public async Task RespondBind_NotInRealm_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.RespondBind(realm.Id, approved: true));

        Assert.Contains("Not in a realm", ex.Message);
    }

    [Fact]
    public async Task RespondBind_NoPendingBind_ThrowsHubException()
    {
        // Client joins, but nobody called RequestBind, so there is no pending code.
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        await hub.JoinRealm(realm.JoinCode, clientId);

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.RespondBind(realm.Id, approved: true));

        Assert.Contains("No pending bind", ex.Message);
    }

    [Fact]
    public async Task RespondBind_InvalidRealm_ThrowsHubException()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        await hub.JoinRealm(realm.JoinCode, clientId);

        // Pass a nonexistent realm ID
        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.RespondBind("nonexistent", approved: true));

        Assert.Contains("not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RespondBind_Approved_CreatesBoundRelationship()
    {
        // Dashboard hub
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, manager, mockClients, mockProxy, mockGroups, tracker) = CreateHubWithTracker(dashConnId);

        var realm = manager.CreateRealm(RealmMode.Competition);
        await dashHub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        // Wearable hub
        var clientConnId = Guid.NewGuid().ToString();
        var clientHub = new RealmHub(manager, CreateAdminConfigService(), tracker);
        var clientMockClients = new Mock<IHubCallerClients>();
        var clientMockProxy = new Mock<ISingleClientProxy>();
        var clientMockContext = new Mock<HubCallerContext>();
        clientMockContext.Setup(c => c.ConnectionId).Returns(clientConnId);
        clientMockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(clientMockProxy.Object);
        clientMockClients.Setup(c => c.Caller).Returns(clientMockProxy.Object);
        clientHub.Context = clientMockContext.Object;
        clientHub.Clients = clientMockClients.Object;
        clientHub.Groups = mockGroups.Object;

        var clientId = Guid.NewGuid().ToString();
        await clientHub.JoinRealm(realm.JoinCode, clientId);

        // Dashboard requests bind
        mockClients.Setup(c => c.Client(clientConnId)).Returns(clientMockProxy.Object);
        await dashHub.RequestBind(realm.Id, clientId);

        // Wearable approves
        clientMockClients.Setup(c => c.Client(dashConnId)).Returns(mockProxy.Object);
        await clientHub.RespondBind(realm.Id, approved: true);

        var isBound = realm.WithLock(r => r.ClientBindings.ContainsKey(clientId));
        Assert.True(isBound);
    }

    [Fact]
    public async Task RespondBind_Declined_DoesNotBind()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, manager, mockClients, mockProxy, mockGroups, tracker) = CreateHubWithTracker(dashConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await dashHub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        var clientConnId = Guid.NewGuid().ToString();
        var clientHub = new RealmHub(manager, CreateAdminConfigService(), tracker);
        var clientMockClients = new Mock<IHubCallerClients>();
        var clientMockProxy = new Mock<ISingleClientProxy>();
        var clientMockContext = new Mock<HubCallerContext>();
        clientMockContext.Setup(c => c.ConnectionId).Returns(clientConnId);
        clientMockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(clientMockProxy.Object);
        clientMockClients.Setup(c => c.Caller).Returns(clientMockProxy.Object);
        clientHub.Context = clientMockContext.Object;
        clientHub.Clients = clientMockClients.Object;
        clientHub.Groups = mockGroups.Object;

        var clientId = Guid.NewGuid().ToString();
        await clientHub.JoinRealm(realm.JoinCode, clientId);

        mockClients.Setup(c => c.Client(clientConnId)).Returns(clientMockProxy.Object);
        await dashHub.RequestBind(realm.Id, clientId);

        clientMockClients.Setup(c => c.Client(dashConnId)).Returns(mockProxy.Object);
        await clientHub.RespondBind(realm.Id, approved: false);

        var isBound = realm.WithLock(r => r.ClientBindings.ContainsKey(clientId));
        Assert.False(isBound);
    }

    // -------------------------------------------------------------------------
    // CancelBind — cancel an existing pending bind
    // -------------------------------------------------------------------------

    [Fact]
    public async Task CancelBind_ExistingPendingBind_RemovesIt()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, manager, mockClients, mockProxy, mockGroups) = CreateHub(dashConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);

        // Set up a pending bind code manually
        realm.WithLock(r => r.PendingBindCodes[clientId] = ("1234", dashConnId));

        await hub.CancelBind(realm.Id, clientId);

        var stillPending = realm.WithLock(r => r.PendingBindCodes.ContainsKey(clientId));
        Assert.False(stillPending);
    }

    // -------------------------------------------------------------------------
    // SetIncline — successful operation
    // -------------------------------------------------------------------------

    [Fact]
    public async Task SetIncline_WhenBound_StoresInclineAndBroadcasts()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(dashConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);

        // Bind the dashboard to the client
        realm.WithLock(r => r.ClientBindings[clientId] = dashConnId);

        await hub.SetIncline(realm.Id, clientId, 8.0);

        var storedIncline = realm.WithLock(r => r.ClientInclines.TryGetValue(clientId, out var v) ? v : -1);
        Assert.Equal(8.0, storedIncline);
        mockProxy.Verify(p => p.SendCoreAsync(
            "InclineChanged", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task SetIncline_ClampsToMaximum()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(dashConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);
        realm.WithLock(r => r.ClientBindings[clientId] = dashConnId);

        await hub.SetIncline(realm.Id, clientId, 100.0); // way over max of 15

        var storedIncline = realm.WithLock(r => r.ClientInclines.TryGetValue(clientId, out var v) ? v : -1);
        Assert.Equal(15.0, storedIncline);
    }

    [Fact]
    public async Task SetIncline_ClampsToMinimum()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(dashConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);
        realm.WithLock(r => r.ClientBindings[clientId] = dashConnId);

        await hub.SetIncline(realm.Id, clientId, -5.0); // negative

        var storedIncline = realm.WithLock(r => r.ClientInclines.TryGetValue(clientId, out var v) ? v : -1);
        Assert.Equal(0.0, storedIncline);
    }

    // -------------------------------------------------------------------------
    // SetSpeedOverride — successful operations
    // -------------------------------------------------------------------------

    [Fact]
    public async Task SetSpeedOverride_WhenBound_StoresOverrideAndBroadcasts()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(dashConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);
        realm.WithLock(r => r.ClientBindings[clientId] = dashConnId);

        await hub.SetSpeedOverride(realm.Id, clientId, 10.0);

        var storedOverride = realm.WithLock(r => r.ClientSpeedOverrides.TryGetValue(clientId, out var v) ? v : -1);
        Assert.Equal(10.0, storedOverride);
        mockProxy.Verify(p => p.SendCoreAsync(
            "SpeedOverrideChanged", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task SetSpeedOverride_ZeroValue_ClearsOverride()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(dashConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);
        realm.WithLock(r =>
        {
            r.ClientBindings[clientId] = dashConnId;
            r.ClientSpeedOverrides[clientId] = 8.5;
        });

        await hub.SetSpeedOverride(realm.Id, clientId, 0);

        var hasOverride = realm.WithLock(r => r.ClientSpeedOverrides.ContainsKey(clientId));
        Assert.False(hasOverride);
    }

    [Fact]
    public async Task SetSpeedOverride_ClampsToMaximum()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(dashConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);
        realm.WithLock(r => r.ClientBindings[clientId] = dashConnId);

        await hub.SetSpeedOverride(realm.Id, clientId, 100.0); // way over 30 km/h max

        var storedOverride = realm.WithLock(r => r.ClientSpeedOverrides.TryGetValue(clientId, out var v) ? v : -1);
        Assert.Equal(30.0, storedOverride);
    }

    // -------------------------------------------------------------------------
    // KickClient — no existing connection (client ID only, no live conn)
    // -------------------------------------------------------------------------

    [Fact]
    public async Task KickClient_ClientWithNoActiveConnection_StillKicksAndPreventsReconnect()
    {
        var hostConnId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(hostConnId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);

        // Add client directly (no live hub connection mapping)
        var clientId = Guid.NewGuid().ToString();
        manager.AddClient(realm.Id, clientId);

        await hub.KickClient(realm.Id, clientId);

        Assert.DoesNotContain(clientId, realm.ConnectedClientIds);
        Assert.Contains(clientId, realm.KickedClientIds);
        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientKicked", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // JoinRealmAsDashboard — nonexistent realm returns default state
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealmAsDashboard_NonexistentRealm_AddsToGroupAndSendsDefaultState()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, _, _, mockProxy, mockGroups) = CreateHub(connId);

        await hub.JoinRealmAsDashboard("realm-that-does-not-exist");

        mockGroups.Verify(g => g.AddToGroupAsync(connId, "realm-that-does-not-exist", default), Times.Once);
        mockProxy.Verify(p => p.SendCoreAsync(
            "JoinedRealm", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // LeaveRealm — client not in any realm
    // -------------------------------------------------------------------------

    [Fact]
    public async Task LeaveRealm_ClientNotInRealm_ReturnsFalse()
    {
        var (hub, _, _, _, _) = CreateHub(Guid.NewGuid().ToString());

        // Hub is fresh, no connection map entry
        var result = await hub.LeaveRealm();

        Assert.False(result);
    }

    [Fact]
    public async Task LeaveRealm_LobbyRealm_ReturnsFalse()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, _, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();
        await hub.JoinRealm(realm.JoinCode, clientId,
            new ClientProfile { Name = "Test", Age = 25, HeightCm = 170, WeightKg = 70 });

        // Realm stays in Lobby — LeaveRealm should return false (not a "started realm" leave)
        var result = await hub.LeaveRealm();

        Assert.False(result);
    }

    // -------------------------------------------------------------------------
    // OnDisconnectedAsync — calibration session cleanup
    // -------------------------------------------------------------------------

    [Fact]
    public async Task OnDisconnectedAsync_CalibrationClientDisconnects_NotifiesDashboard()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var clientConnId = Guid.NewGuid().ToString();

        // Dashboard creates session
        var (dashHub, _, dashMockClients, dashMockProxy, _, _) = CreateHubWithTracker(dashConnId);
        var joinCode = dashHub.CreateCalibrationSession();

        // Wearable client joins the calibration session
        var (clientHub, _, clientMockClients, clientMockProxy, _, tracker) = CreateHubWithTracker(clientConnId);

        // Re-create with same connection ID for client hub
        var realmManager = new RealmManager(CreateAdminConfigService());
        var clientHubActual = new RealmHub(realmManager, CreateAdminConfigService(), tracker);
        var clientCtx = new Mock<HubCallerContext>();
        clientCtx.Setup(c => c.ConnectionId).Returns(clientConnId);
        clientHubActual.Context = clientCtx.Object;
        clientHubActual.Clients = clientMockClients.Object;
        clientHubActual.Groups = new Mock<IGroupManager>().Object;

        // Setup dashboard mock to receive notifications
        clientMockClients.Setup(c => c.Client(dashConnId)).Returns(dashMockProxy.Object);
        dashMockClients.Setup(c => c.Client(clientConnId)).Returns(clientMockProxy.Object);

        await clientHubActual.JoinCalibrationSession(joinCode, Guid.NewGuid().ToString(), 175.0);

        // Now client disconnects
        await clientHubActual.OnDisconnectedAsync(null);

        dashMockProxy.Verify(p => p.SendCoreAsync(
            "CalibrationClientLeft", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task OnDisconnectedAsync_CalibrationDashboardDisconnects_NotifiesClient()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var clientConnId = Guid.NewGuid().ToString();

        // Dashboard creates session
        var (dashHub, _, dashMockClients, dashMockProxy, dashMockGroups, tracker) = CreateHubWithTracker(dashConnId);
        var joinCode = dashHub.CreateCalibrationSession();

        // Wearable joins
        var clientHub = new RealmHub(new RealmManager(CreateAdminConfigService()), CreateAdminConfigService(), tracker);
        var clientCtx = new Mock<HubCallerContext>();
        var clientMockClients = new Mock<IHubCallerClients>();
        var clientMockProxy = new Mock<ISingleClientProxy>();
        clientCtx.Setup(c => c.ConnectionId).Returns(clientConnId);
        clientMockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(clientMockProxy.Object);
        clientMockClients.Setup(c => c.Caller).Returns(clientMockProxy.Object);
        clientHub.Context = clientCtx.Object;
        clientHub.Clients = clientMockClients.Object;
        clientHub.Groups = dashMockGroups.Object;

        clientMockClients.Setup(c => c.Client(dashConnId)).Returns(dashMockProxy.Object);
        dashMockClients.Setup(c => c.Client(clientConnId)).Returns(clientMockProxy.Object);

        await clientHub.JoinCalibrationSession(joinCode, "wearable-id", 170.0);

        // Dashboard disconnects
        await dashHub.OnDisconnectedAsync(null);

        clientMockProxy.Verify(p => p.SendCoreAsync(
            "CalibrationCancelled", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // TryAutoEndRealm — last client leaves started realm
    // -------------------------------------------------------------------------

    [Fact]
    public async Task LeaveRealm_LastClientInStartedRealm_AutoEndsRealm()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        await hub.JoinRealm(realm.JoinCode, clientId,
            new ClientProfile { Name = "Solo", Age = 30, HeightCm = 175, WeightKg = 75 });

        realm.WithLock(r => r.Status = RealmStatus.Started);

        // Client leaves — last one, so realm should auto-end
        await hub.LeaveRealm();

        Assert.Equal(RealmStatus.Ended, realm.Status);
        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmEnded", It.IsAny<object?[]>(), default), Times.AtLeastOnce);
    }

    // -------------------------------------------------------------------------
    // CreateCalibrationSession
    // -------------------------------------------------------------------------

    [Fact]
    public void CreateCalibrationSession_ReturnsValidSixDigitCode()
    {
        var (hub, _, _, _, _) = CreateHub();

        var code = hub.CreateCalibrationSession();

        Assert.NotNull(code);
        Assert.Equal(6, code.Length);
        Assert.True(int.TryParse(code, out var parsed));
        Assert.InRange(parsed, 100000, 999999);
    }

    [Fact]
    public void CreateCalibrationSession_RegistersSessionAndJoinCode()
    {
        var (hub, _, _, _, _) = CreateHub();

        var code = hub.CreateCalibrationSession();

        Assert.True(RealmHub._calibrationJoinCodes.ContainsKey(code));
        var sessionId = RealmHub._calibrationJoinCodes[code];
        Assert.True(RealmHub._calibrationSessions.ContainsKey(sessionId));
    }

    // -------------------------------------------------------------------------
    // JoinCalibrationSession
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinCalibrationSession_InvalidCode_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinCalibrationSession("000000", "client1", 170.0));

        Assert.Contains("Invalid calibration code", ex.Message);
    }

    [Fact]
    public async Task JoinCalibrationSession_InvalidHeight_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, _, _, _, _) = CreateHub(dashConnId);
        var code = dashHub.CreateCalibrationSession();

        var (clientHub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => clientHub.JoinCalibrationSession(code, "client1", 30.0)); // too short

        Assert.Contains("Height", ex.Message);
    }

    [Fact]
    public async Task JoinCalibrationSession_ValidCode_NotifiesDashboard()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, _, _, mockProxy, _, tracker) = CreateHubWithTracker(dashConnId);
        var code = dashHub.CreateCalibrationSession();

        var clientConnId = Guid.NewGuid().ToString();
        var clientHub = new RealmHub(new RealmManager(CreateAdminConfigService()), CreateAdminConfigService(), tracker);
        var clientCtx = new Mock<HubCallerContext>();
        var clientMockClients = new Mock<IHubCallerClients>();
        var clientMockProxy = new Mock<ISingleClientProxy>();
        clientCtx.Setup(c => c.ConnectionId).Returns(clientConnId);
        clientMockClients.Setup(c => c.Caller).Returns(clientMockProxy.Object);
        clientMockClients.Setup(c => c.Client(dashConnId)).Returns(mockProxy.Object);
        clientHub.Context = clientCtx.Object;
        clientHub.Clients = clientMockClients.Object;
        clientHub.Groups = new Mock<IGroupManager>().Object;

        await clientHub.JoinCalibrationSession(code, "wear1", 175.0);

        mockProxy.Verify(p => p.SendCoreAsync(
            "CalibrationClientJoined", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task JoinCalibrationSession_SecondClientJoins_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, _, _, mockProxy, _, tracker) = CreateHubWithTracker(dashConnId);
        var code = dashHub.CreateCalibrationSession();

        // First client joins
        var client1Hub = new RealmHub(new RealmManager(CreateAdminConfigService()), CreateAdminConfigService(), tracker);
        var ctx1 = new Mock<HubCallerContext>();
        var clients1 = new Mock<IHubCallerClients>();
        var proxy1 = new Mock<ISingleClientProxy>();
        ctx1.Setup(c => c.ConnectionId).Returns(Guid.NewGuid().ToString());
        clients1.Setup(c => c.Caller).Returns(proxy1.Object);
        clients1.Setup(c => c.Client(dashConnId)).Returns(mockProxy.Object);
        client1Hub.Context = ctx1.Object;
        client1Hub.Clients = clients1.Object;
        client1Hub.Groups = new Mock<IGroupManager>().Object;
        await client1Hub.JoinCalibrationSession(code, "wear1", 170.0);

        // Second client tries to join the same session
        var client2Hub = new RealmHub(new RealmManager(CreateAdminConfigService()), CreateAdminConfigService(), tracker);
        var ctx2 = new Mock<HubCallerContext>();
        var clients2 = new Mock<IHubCallerClients>();
        var proxy2 = new Mock<ISingleClientProxy>();
        ctx2.Setup(c => c.ConnectionId).Returns(Guid.NewGuid().ToString());
        clients2.Setup(c => c.Caller).Returns(proxy2.Object);
        clients2.Setup(c => c.Client(dashConnId)).Returns(mockProxy.Object);
        client2Hub.Context = ctx2.Object;
        client2Hub.Clients = clients2.Object;
        client2Hub.Groups = new Mock<IGroupManager>().Object;

        var ex = await Assert.ThrowsAsync<HubException>(
            () => client2Hub.JoinCalibrationSession(code, "wear2", 170.0));

        Assert.Contains("already connected", ex.Message);
    }

    // -------------------------------------------------------------------------
    // JoinRealm — calibration join code routing
    // -------------------------------------------------------------------------

    [Fact]
    public async Task JoinRealm_WithCalibrationCode_RoutesToCalibrationSession()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, manager, _, mockProxy, _, tracker) = CreateHubWithTracker(dashConnId);
        var calCode = dashHub.CreateCalibrationSession();

        // Use JoinRealm with the calibration code — it should route to JoinCalibrationSession
        var clientConnId = Guid.NewGuid().ToString();
        var clientHub = new RealmHub(manager, CreateAdminConfigService(), tracker);
        var ctx = new Mock<HubCallerContext>();
        var clients = new Mock<IHubCallerClients>();
        var proxy = new Mock<ISingleClientProxy>();
        ctx.Setup(c => c.ConnectionId).Returns(clientConnId);
        clients.Setup(c => c.Caller).Returns(proxy.Object);
        clients.Setup(c => c.Client(dashConnId)).Returns(mockProxy.Object);
        clientHub.Context = ctx.Object;
        clientHub.Clients = clients.Object;
        clientHub.Groups = new Mock<IGroupManager>().Object;

        // Should route to calibration, not throw "invalid join code"
        var profile = new ClientProfile { Name = "Tester", Age = 25, HeightCm = 175, WeightKg = 70 };
        var ex = await Record.ExceptionAsync(
            () => clientHub.JoinRealm(calCode, "wearable-id", profile));

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // SendCalibrationData
    // -------------------------------------------------------------------------

    [Fact]
    public async Task SendCalibrationData_InvalidSession_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.SendCalibrationData("nonexistent", 100));

        Assert.Contains("session not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SendCalibrationData_NotTheConnectedClient_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, _, _, mockProxy, _, tracker) = CreateHubWithTracker(dashConnId);
        var code = dashHub.CreateCalibrationSession();

        // Join with a specific client connection
        var realClientConnId = Guid.NewGuid().ToString();
        var clientHub = new RealmHub(new RealmManager(CreateAdminConfigService()), CreateAdminConfigService(), tracker);
        var ctx1 = new Mock<HubCallerContext>();
        var clients1 = new Mock<IHubCallerClients>();
        var proxy1 = new Mock<ISingleClientProxy>();
        ctx1.Setup(c => c.ConnectionId).Returns(realClientConnId);
        clients1.Setup(c => c.Caller).Returns(proxy1.Object);
        clients1.Setup(c => c.Client(dashConnId)).Returns(mockProxy.Object);
        clientHub.Context = ctx1.Object;
        clientHub.Clients = clients1.Object;
        clientHub.Groups = new Mock<IGroupManager>().Object;
        await clientHub.JoinCalibrationSession(code, "wear1", 170.0);

        var sessionId = RealmHub._calibrationJoinCodes[code];

        // Try sending data from a different hub (different connection ID)
        var impersonatorHub = new RealmHub(new RealmManager(CreateAdminConfigService()), CreateAdminConfigService(), tracker);
        var ctx2 = new Mock<HubCallerContext>();
        ctx2.Setup(c => c.ConnectionId).Returns(Guid.NewGuid().ToString()); // different conn
        var clients2 = new Mock<IHubCallerClients>();
        clients2.Setup(c => c.Caller).Returns(new Mock<ISingleClientProxy>().Object);
        impersonatorHub.Context = ctx2.Object;
        impersonatorHub.Clients = clients2.Object;
        impersonatorHub.Groups = new Mock<IGroupManager>().Object;

        var ex = await Assert.ThrowsAsync<HubException>(
            () => impersonatorHub.SendCalibrationData(sessionId, 50));

        Assert.Contains("Not the connected client", ex.Message);
    }

    [Fact]
    public async Task SendCalibrationData_ValidClient_ForwardsStepsToDashboard()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, _, _, dashProxy, _, tracker) = CreateHubWithTracker(dashConnId);
        var code = dashHub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        var clientConnId = Guid.NewGuid().ToString();
        var clientHub = new RealmHub(new RealmManager(CreateAdminConfigService()), CreateAdminConfigService(), tracker);
        var ctx = new Mock<HubCallerContext>();
        var clients = new Mock<IHubCallerClients>();
        var proxy = new Mock<ISingleClientProxy>();
        ctx.Setup(c => c.ConnectionId).Returns(clientConnId);
        clients.Setup(c => c.Caller).Returns(proxy.Object);
        clients.Setup(c => c.Client(dashConnId)).Returns(dashProxy.Object);
        clientHub.Context = ctx.Object;
        clientHub.Clients = clients.Object;
        clientHub.Groups = new Mock<IGroupManager>().Object;
        await clientHub.JoinCalibrationSession(code, "wear1", 170.0);

        await clientHub.SendCalibrationData(sessionId, 250);

        dashProxy.Verify(p => p.SendCoreAsync(
            "CalibrationDataReceived", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // StartCalibrationSample
    // -------------------------------------------------------------------------

    [Fact]
    public void StartCalibrationSample_InvalidSession_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = Assert.Throws<HubException>(
            () => hub.StartCalibrationSample("nonexistent", 5.0));

        Assert.Contains("session not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void StartCalibrationSample_NotTheDashboard_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, _, _, _, _) = CreateHub(dashConnId);
        var code = dashHub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        // Create another hub with a DIFFERENT connection ID trying to start a sample
        var (otherHub, _, _, _, _) = CreateHub(Guid.NewGuid().ToString());

        var ex = Assert.Throws<HubException>(
            () => otherHub.StartCalibrationSample(sessionId, 5.0));

        Assert.Contains("Not the dashboard", ex.Message);
    }

    [Fact]
    public void StartCalibrationSample_InvalidSpeed_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, _, _, _, _) = CreateHub(dashConnId);
        var code = hub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        var ex = Assert.Throws<HubException>(
            () => hub.StartCalibrationSample(sessionId, -1.0));

        Assert.Contains("speed", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void StartCalibrationSample_ValidSpeedAsDashboard_SetsSampleState()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, _, _, _, _) = CreateHub(dashConnId);
        var code = hub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        hub.StartCalibrationSample(sessionId, 8.0);

        var session = RealmHub._calibrationSessions[sessionId];
        Assert.Equal(8.0, session.CurrentTargetSpeedKmh);
        Assert.NotNull(session.SampleStartTime);
    }

    // -------------------------------------------------------------------------
    // EndCalibrationSample
    // -------------------------------------------------------------------------

    [Fact]
    public async Task EndCalibrationSample_InvalidSession_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.EndCalibrationSample("nonexistent"));

        Assert.Contains("session not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task EndCalibrationSample_NotTheDashboard_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, _, _, _, _) = CreateHub(dashConnId);
        var code = dashHub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        var (otherHub, _, _, _, _) = CreateHub(Guid.NewGuid().ToString());

        var ex = await Assert.ThrowsAsync<HubException>(
            () => otherHub.EndCalibrationSample(sessionId));

        Assert.Contains("Not the dashboard", ex.Message);
    }

    [Fact]
    public async Task EndCalibrationSample_NoActiveSample_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, _, _, _, _) = CreateHub(dashConnId);
        var code = hub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        // Don't call StartCalibrationSample first
        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.EndCalibrationSample(sessionId));

        Assert.Contains("No active sample", ex.Message);
    }

    [Fact]
    public async Task EndCalibrationSample_SampleTooShort_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, _, _, _, _) = CreateHub(dashConnId);
        var code = hub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        // Set up a sample state that was started VERY recently (< 5 seconds ago)
        var session = RealmHub._calibrationSessions[sessionId];
        lock (session.Lock)
        {
            session.CurrentTargetSpeedKmh = 8.0;
            session.SampleStartSteps = 0;
            session.SampleStartTime = DateTime.UtcNow; // just now
            session.LatestSteps = 100; // some steps received
        }

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.EndCalibrationSample(sessionId));

        Assert.Contains("too short", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task EndCalibrationSample_NoStepsRecorded_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, _, _, _, _) = CreateHub(dashConnId);
        var code = hub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        var session = RealmHub._calibrationSessions[sessionId];
        lock (session.Lock)
        {
            session.CurrentTargetSpeedKmh = 8.0;
            session.SampleStartSteps = 100;
            session.SampleStartTime = DateTime.UtcNow.AddSeconds(-10); // 10 seconds ago
            session.LatestSteps = 100; // same steps = delta zero
        }

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.EndCalibrationSample(sessionId));

        Assert.Contains("No steps", ex.Message);
    }

    [Fact]
    public async Task EndCalibrationSample_ValidSample_AddsCalibrationPoint()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, _, mockClients, mockProxy, _) = CreateHub(dashConnId);

        // EndCalibrationSample calls Clients.Client(dashboardConnectionId).SendAsync
        mockClients.Setup(c => c.Client(dashConnId)).Returns(mockProxy.Object);

        var code = hub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        var session = RealmHub._calibrationSessions[sessionId];
        lock (session.Lock)
        {
            session.HeightCm = 175.0;
            session.CurrentTargetSpeedKmh = 8.0;
            session.SampleStartSteps = 0;
            session.SampleStartTime = DateTime.UtcNow.AddSeconds(-10); // 10 seconds back
            session.LatestSteps = 50; // 50 steps in 10 seconds
        }

        await hub.EndCalibrationSample(sessionId);

        var collectedCount = session.CollectedPoints.Count;
        Assert.Equal(1, collectedCount);
        mockProxy.Verify(p => p.SendCoreAsync(
            "CalibrationSampleResult", It.IsAny<object?[]>(), default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // SaveCalibration
    // -------------------------------------------------------------------------

    [Fact]
    public async Task SaveCalibration_InvalidSession_ThrowsHubException()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.SaveCalibration("nonexistent"));

        Assert.Contains("session not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SaveCalibration_NotTheDashboard_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, _, _, _, _) = CreateHub(dashConnId);
        var code = dashHub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        var (otherHub, _, _, _, _) = CreateHub(Guid.NewGuid().ToString());

        var ex = await Assert.ThrowsAsync<HubException>(
            () => otherHub.SaveCalibration(sessionId));

        Assert.Contains("Not the dashboard", ex.Message);
    }

    [Fact]
    public async Task SaveCalibration_FewerThanTwoPoints_ThrowsHubException()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, _, _, _, _) = CreateHub(dashConnId);
        var code = hub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        // Add only one point
        var session = RealmHub._calibrationSessions[sessionId];
        lock (session.Lock)
        {
            session.CollectedPoints.Add(new PulseRealm.Server.Models.StrideCalibrationPoint { SpeedKmh = 5.0, StrideFactor = 0.45 });
        }

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.SaveCalibration(sessionId));

        Assert.Contains("2 calibration samples", ex.Message);
    }

    [Fact]
    public async Task SaveCalibration_TwoPoints_SendsCalibrationCompleteAndSaved()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, _, mockClients, mockProxy, _) = CreateHub(dashConnId);

        // SaveCalibration calls Clients.Client(dashboardConnectionId).SendAsync
        mockClients.Setup(c => c.Client(dashConnId)).Returns(mockProxy.Object);

        var code = hub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        var session = RealmHub._calibrationSessions[sessionId];
        lock (session.Lock)
        {
            session.CollectedPoints.Add(new PulseRealm.Server.Models.StrideCalibrationPoint { SpeedKmh = 5.0, StrideFactor = 0.45 });
            session.CollectedPoints.Add(new PulseRealm.Server.Models.StrideCalibrationPoint { SpeedKmh = 10.0, StrideFactor = 0.55 });
            // No wearable connected — clientConnectionId is null
        }

        await hub.SaveCalibration(sessionId);

        // Should notify dashboard
        mockProxy.Verify(p => p.SendCoreAsync(
            "CalibrationSaved", It.IsAny<object?[]>(), default), Times.Once);

        // Session should be cleaned up
        Assert.False(RealmHub._calibrationSessions.ContainsKey(sessionId));
    }

    // -------------------------------------------------------------------------
    // CancelCalibration
    // -------------------------------------------------------------------------

    [Fact]
    public void CancelCalibration_InvalidSession_DoesNotThrow()
    {
        var (hub, _, _, _, _) = CreateHub();

        var ex = Record.Exception(() => hub.CancelCalibration("nonexistent"));

        Assert.Null(ex);
    }

    [Fact]
    public void CancelCalibration_NotParticipant_DoesNothing()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (dashHub, _, _, _, _) = CreateHub(dashConnId);
        var code = dashHub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        // A random hub with no role in the session tries to cancel
        var (randomHub, _, _, _, _) = CreateHub(Guid.NewGuid().ToString());
        randomHub.CancelCalibration(sessionId);

        // Session should still exist
        Assert.True(RealmHub._calibrationSessions.ContainsKey(sessionId));
    }

    [Fact]
    public void CancelCalibration_AsDashboard_RemovesSession()
    {
        var dashConnId = Guid.NewGuid().ToString();
        var (hub, _, _, _, _) = CreateHub(dashConnId);
        var code = hub.CreateCalibrationSession();
        var sessionId = RealmHub._calibrationJoinCodes[code];

        hub.CancelCalibration(sessionId);

        Assert.False(RealmHub._calibrationSessions.ContainsKey(sessionId));
        Assert.False(RealmHub._calibrationJoinCodes.ContainsKey(code));
    }

    // -------------------------------------------------------------------------
    // EndRealm — already ended guard
    // -------------------------------------------------------------------------

    [Fact]
    public async Task EndRealm_AlreadyEnded_DoesNotSendDuplicateEvent()
    {
        var connId = Guid.NewGuid().ToString();
        var (hub, manager, _, mockProxy, _) = CreateHub(connId);
        var realm = manager.CreateRealm(RealmMode.Competition);
        await hub.AuthenticateAsHost(realm.Id, realm.HostSecret);
        realm.WithLock(r => r.Status = RealmStatus.Ended);

        await hub.EndRealm(realm.Id);

        // Already ended => should NOT fire RealmEnded again
        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmEnded", It.IsAny<object?[]>(), default), Times.Never);
    }
}
