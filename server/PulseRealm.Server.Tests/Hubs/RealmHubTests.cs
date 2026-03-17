using Microsoft.AspNetCore.SignalR;
using Moq;
using PulseRealm.Server.Hubs;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

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
    private static (
        RealmHub Hub,
        RealmManager Manager,
        Mock<IHubCallerClients> MockClients,
        Mock<IClientProxy> MockProxy,
        Mock<IGroupManager> MockGroups)
        CreateHub(string? connectionId = null)
    {
        var manager = new RealmManager();
        var hub = new RealmHub(manager);

        var mockClients = new Mock<IHubCallerClients>();
        var mockProxy = new Mock<IClientProxy>();
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
        var profile = new ClientProfile { Name = "Alice", HeightCm = 170, WeightKg = 60 };

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
        var profile = new ClientProfile { Name = name, HeightCm = 170, WeightKg = 60 };

        var ex = await Assert.ThrowsAsync<HubException>(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Contains("Name", ex.Message);
    }

    [Fact]
    public async Task JoinRealm_NameTooLong_ThrowsHubException()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = new string('X', 51), HeightCm = 170, WeightKg = 60 };

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
        var profile = new ClientProfile { Name = "Test", HeightCm = height, WeightKg = 70 };

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
        var profile = new ClientProfile { Name = "Test", HeightCm = 170, WeightKg = weight };

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
        var profile = new ClientProfile { Name = new string('A', 50), HeightCm = 170, WeightKg = 60 };
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
        var profile = new ClientProfile { Name = "Test", HeightCm = height, WeightKg = 70 };

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
        var profile = new ClientProfile { Name = "Test", HeightCm = 170, WeightKg = weight };

        var ex = await Record.ExceptionAsync(
            () => hub.JoinRealm(realm.JoinCode, Guid.NewGuid().ToString(), profile));

        Assert.Null(ex);
    }

    // -------------------------------------------------------------------------
    // StartRealm
    // -------------------------------------------------------------------------

    [Fact]
    public async Task StartRealm_InvalidRealm_SendsErrorToCaller()
    {
        var (hub, _, _, mockProxy, _) = CreateHub();

        await hub.StartRealm(Guid.NewGuid().ToString());

        mockProxy.Verify(p => p.SendCoreAsync(
            "Error",
            It.Is<object?[]>(a => a.Length > 0 && a[0]!.ToString()!.Contains("not found")),
            default), Times.Once);
    }

    [Fact]
    public async Task StartRealm_ValidRealm_SetsStatusToStarted()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        await hub.StartRealm(realm.Id, """{"mode":"race"}""");

        Assert.Equal(RealmStatus.Started, realm.Status);
    }

    [Fact]
    public async Task StartRealm_ValidRealm_StoresConfig()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        const string config = """{"mode":"race"}""";

        await hub.StartRealm(realm.Id, config);

        Assert.Equal(config, realm.RealmConfig);
    }

    [Fact]
    public async Task StartRealm_ValidRealm_SendsRealmStartedToGroup()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        await hub.StartRealm(realm.Id, """{"mode":"race"}""");

        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmStarted", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task StartRealm_NullConfig_SetsStatusAndSendsEvent()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Social);

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
    public async Task SendWearableData_FirstPacket_SpeedIsZero()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
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
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        var clientId = Guid.NewGuid().ToString();

        await hub.NotifyEliminated(realm.Id, clientId);

        mockProxy.Verify(p => p.SendCoreAsync(
            "ClientEliminated",
            It.Is<object?[]>(a => a.Length > 0 && (string)a[0]! == clientId),
            default), Times.Once);
    }

    // -------------------------------------------------------------------------
    // EndRealm
    // -------------------------------------------------------------------------

    [Fact]
    public async Task EndRealm_InvalidRealm_SendsErrorToCaller()
    {
        var (hub, _, _, mockProxy, _) = CreateHub();

        await hub.EndRealm(Guid.NewGuid().ToString(), new RealmSummary());

        mockProxy.Verify(p => p.SendCoreAsync(
            "Error",
            It.Is<object?[]>(a => a.Length > 0 && a[0]!.ToString()!.Contains("not found")),
            default), Times.Once);
    }

    [Fact]
    public async Task EndRealm_ValidRealm_SetsStatusToEnded()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.WithLock(r => r.Status = RealmStatus.Started);

        await hub.EndRealm(realm.Id, new RealmSummary());

        Assert.Equal(RealmStatus.Ended, realm.Status);
    }

    [Fact]
    public async Task EndRealm_ValidRealm_SendsRealmEndedToGroup()
    {
        var (hub, manager, _, mockProxy, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);

        await hub.EndRealm(realm.Id, new RealmSummary { TotalSteps = 500 });

        mockProxy.Verify(p => p.SendCoreAsync(
            "RealmEnded", It.IsAny<object?[]>(), default), Times.Once);
    }

    [Fact]
    public async Task EndRealm_ValidRealm_PopulatesDurationSeconds()
    {
        var (hub, manager, _, _, _) = CreateHub();
        var realm = manager.CreateRealm(RealmMode.Competition);
        // Back-date so the duration is measurably > 0.
        realm.CreatedAt = DateTime.UtcNow.AddMinutes(-5);
        var summary = new RealmSummary();

        await hub.EndRealm(realm.Id, summary);

        Assert.True(summary.DurationSeconds > 0,
            $"Expected DurationSeconds > 0, got {summary.DurationSeconds}");
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
            new ClientProfile { Name = "Bob", HeightCm = 175, WeightKg = 70 });

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
            new ClientProfile { Name = "Alice", HeightCm = 170, WeightKg = 60 });

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
            new ClientProfile { Name = "Charlie", HeightCm = 180, WeightKg = 80 });

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
            new ClientProfile { Name = "Dave", HeightCm = 175, WeightKg = 70 });

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
            new ClientProfile { Name = "Eve", HeightCm = 165, WeightKg = 55 });

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
}
