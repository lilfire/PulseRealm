using Microsoft.AspNetCore.SignalR;
using Moq;
using PulseRealm.Server.Hubs;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Tests.Hubs;

public class RealmHubTests : IDisposable
{
    private readonly RealmManager _realmManager = new();
    private readonly Mock<IHubCallerClients> _mockClients = new();
    private readonly Mock<IClientProxy> _mockClientProxy = new();
    private readonly Mock<IGroupManager> _mockGroups = new();
    private int _connCounter;

    private RealmHub CreateHub(string? connectionId = null)
    {
        var hub = new RealmHub(_realmManager);
        var mockContext = new Mock<HubCallerContext>();
        connectionId ??= $"conn-{Interlocked.Increment(ref _connCounter)}";
        mockContext.Setup(c => c.ConnectionId).Returns(connectionId);
        _mockClients.Setup(c => c.Group(It.IsAny<string>())).Returns(_mockClientProxy.Object);
        _mockClients.Setup(c => c.Caller).Returns(_mockClientProxy.Object);
        hub.Clients = _mockClients.Object;
        hub.Groups = _mockGroups.Object;
        hub.Context = mockContext.Object;
        return hub;
    }

    public void Dispose() { }

    // --- JoinRealm ---

    [Fact]
    public async Task JoinRealm_InvalidJoinCode_ThrowsHubException()
    {
        var hub = CreateHub();
        var ex = await Assert.ThrowsAsync<HubException>(() =>
            hub.JoinRealm("000000", "client-1"));
        Assert.Contains("Invalid join code", ex.Message);
    }

    [Fact]
    public async Task JoinRealm_EndedRealm_ThrowsHubException()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Ended;

        var hub = CreateHub();
        var ex = await Assert.ThrowsAsync<HubException>(() =>
            hub.JoinRealm(realm.JoinCode, "client-1"));
        Assert.Contains("ended", ex.Message);
    }

    [Fact]
    public async Task JoinRealm_StartedRealmUnknownClient_ThrowsHubException()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Started;

        var hub = CreateHub();
        var ex = await Assert.ThrowsAsync<HubException>(() =>
            hub.JoinRealm(realm.JoinCode, "unknown-client"));
        Assert.Contains("already started", ex.Message);
    }

    [Fact]
    public async Task JoinRealm_FullRealm_ThrowsHubException()
    {
        var realm = _realmManager.CreateRealm(RealmMode.StreetView); // MaxClients = 1
        _realmManager.AddClient(realm.Id, "existing-client");

        var hub = CreateHub();
        var ex = await Assert.ThrowsAsync<HubException>(() =>
            hub.JoinRealm(realm.JoinCode, "new-client"));
        Assert.Contains("full", ex.Message);
    }

    [Fact]
    public async Task JoinRealm_ValidCode_AddsClientAndSendsJoined()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", HeightCm = 175, WeightKg = 70 };

        var hub = CreateHub();
        await hub.JoinRealm(realm.JoinCode, "client-1", profile);

        Assert.Contains("client-1", realm.ConnectedClientIds);
        _mockClientProxy.Verify(
            c => c.SendCoreAsync("ClientJoined", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    [Fact]
    public async Task JoinRealm_NullProfile_Succeeds()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);

        var hub = CreateHub();
        await hub.JoinRealm(realm.JoinCode, "client-1");

        Assert.Contains("client-1", realm.ConnectedClientIds);
    }

    [Fact]
    public async Task JoinRealm_Reconnect_SendsRealmStarted()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        _realmManager.AddClient(realm.Id, "client-1");
        realm.WithLock(r =>
        {
            r.Status = RealmStatus.Started;
            r.RealmConfig = "{\"test\":true}";
        });

        var hub = CreateHub();
        await hub.JoinRealm(realm.JoinCode, "client-1");

        _mockClientProxy.Verify(
            c => c.SendCoreAsync("RealmStarted", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    // --- Profile Validation ---

    [Fact]
    public async Task JoinRealm_EmptyName_ThrowsHubException()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "", HeightCm = 175, WeightKg = 70 };

        var hub = CreateHub();
        var ex = await Assert.ThrowsAsync<HubException>(() =>
            hub.JoinRealm(realm.JoinCode, "client-1", profile));
        Assert.Contains("Name", ex.Message);
    }

    [Fact]
    public async Task JoinRealm_NameTooLong_ThrowsHubException()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = new string('A', 51), HeightCm = 175, WeightKg = 70 };

        var hub = CreateHub();
        var ex = await Assert.ThrowsAsync<HubException>(() =>
            hub.JoinRealm(realm.JoinCode, "client-1", profile));
        Assert.Contains("Name", ex.Message);
    }

    [Theory]
    [InlineData(49)]
    [InlineData(251)]
    public async Task JoinRealm_HeightOutOfRange_ThrowsHubException(double height)
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", HeightCm = height, WeightKg = 70 };

        var hub = CreateHub();
        var ex = await Assert.ThrowsAsync<HubException>(() =>
            hub.JoinRealm(realm.JoinCode, "client-1", profile));
        Assert.Contains("Height", ex.Message);
    }

    [Theory]
    [InlineData(9)]
    [InlineData(501)]
    public async Task JoinRealm_WeightOutOfRange_ThrowsHubException(double weight)
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", HeightCm = 175, WeightKg = weight };

        var hub = CreateHub();
        var ex = await Assert.ThrowsAsync<HubException>(() =>
            hub.JoinRealm(realm.JoinCode, "client-1", profile));
        Assert.Contains("Weight", ex.Message);
    }

    // --- StartRealm ---

    [Fact]
    public async Task StartRealm_InvalidRealm_SendsError()
    {
        var hub = CreateHub();
        await hub.StartRealm("nonexistent");

        _mockClientProxy.Verify(
            c => c.SendCoreAsync("Error", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    [Fact]
    public async Task StartRealm_Valid_SetsStatusAndBroadcasts()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);

        var hub = CreateHub();
        await hub.StartRealm(realm.Id, "{\"mode\":\"race\"}");

        Assert.Equal(RealmStatus.Started, realm.Status);
        Assert.Equal("{\"mode\":\"race\"}", realm.RealmConfig);
        _mockClientProxy.Verify(
            c => c.SendCoreAsync("RealmStarted", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    // --- SendWearableData ---

    [Fact]
    public async Task SendWearableData_ForwardsToGroup()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        var data = new WearableData { ClientId = $"wd-client-{Guid.NewGuid()}", HeartRate = 120, Steps = 100 };

        var hub = CreateHub();
        await hub.SendWearableData(realm.Id, data);

        _mockClientProxy.Verify(
            c => c.SendCoreAsync("WearableDataReceived", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    [Fact]
    public async Task SendWearableData_StepOffsetApplied_WhenStepsDecrease()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        var clientId = $"offset-client-{Guid.NewGuid()}";

        var hub = CreateHub();

        // First send: 100 steps
        var data1 = new WearableData { ClientId = clientId, HeartRate = 120, Steps = 100 };
        await hub.SendWearableData(realm.Id, data1);

        // Second send: steps reset to 10 (device restart)
        var data2 = new WearableData { ClientId = clientId, HeartRate = 125, Steps = 10 };
        await hub.SendWearableData(realm.Id, data2);

        // Steps should include offset: 10 + 100 = 110
        Assert.Equal(110, data2.Steps);
    }

    // --- EndRealm ---

    [Fact]
    public async Task EndRealm_InvalidRealm_SendsError()
    {
        var hub = CreateHub();
        await hub.EndRealm("nonexistent", new RealmSummary());

        _mockClientProxy.Verify(
            c => c.SendCoreAsync("Error", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    [Fact]
    public async Task EndRealm_Valid_SetsEndedAndBroadcasts()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Started;
        var summary = new RealmSummary { TotalSteps = 500 };

        var hub = CreateHub();
        await hub.EndRealm(realm.Id, summary);

        Assert.Equal(RealmStatus.Ended, realm.Status);
        Assert.True(summary.DurationSeconds > 0);
        _mockClientProxy.Verify(
            c => c.SendCoreAsync("RealmEnded", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    // --- NotifyEliminated ---

    [Fact]
    public async Task NotifyEliminated_BroadcastsToGroup()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);

        var hub = CreateHub();
        await hub.NotifyEliminated(realm.Id, "client-1");

        _mockClientProxy.Verify(
            c => c.SendCoreAsync("ClientEliminated", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    // --- JoinRealmAsDashboard ---

    [Fact]
    public async Task JoinRealmAsDashboard_ValidRealm_SendsState()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        _realmManager.AddClient(realm.Id, "client-1", new ClientProfile { Name = "Test", HeightCm = 175, WeightKg = 70 });

        var hub = CreateHub();
        await hub.JoinRealmAsDashboard(realm.Id);

        _mockClientProxy.Verify(
            c => c.SendCoreAsync("JoinedRealm", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    [Fact]
    public async Task JoinRealmAsDashboard_NullRealm_SendsDefaultState()
    {
        var hub = CreateHub();
        await hub.JoinRealmAsDashboard("nonexistent");

        _mockClientProxy.Verify(
            c => c.SendCoreAsync("JoinedRealm", It.IsAny<object?[]>(), default),
            Times.Once);
    }

    // --- OnDisconnectedAsync ---

    [Fact]
    public async Task OnDisconnectedAsync_StartedRealm_KeepsProfile()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", HeightCm = 175, WeightKg = 70 };
        var connId = $"conn-disconnect-{Guid.NewGuid()}";

        // Join first
        var hub1 = CreateHub(connId);
        await hub1.JoinRealm(realm.JoinCode, "dc-client-1", profile);

        // Start realm
        realm.WithLock(r => r.Status = RealmStatus.Started);

        // Disconnect
        var hub2 = CreateHub(connId);
        await hub2.OnDisconnectedAsync(null);

        // Profile should still be there (for reconnect)
        var p = _realmManager.GetClientProfile(realm.Id, "dc-client-1");
        Assert.NotNull(p);
    }

    [Fact]
    public async Task OnDisconnectedAsync_LobbyRealm_RemovesClient()
    {
        var realm = _realmManager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Test", HeightCm = 175, WeightKg = 70 };
        var connId = $"conn-lobby-dc-{Guid.NewGuid()}";

        // Join
        var hub1 = CreateHub(connId);
        await hub1.JoinRealm(realm.JoinCode, "lobby-dc-client", profile);

        // Disconnect (realm still in Lobby)
        var hub2 = CreateHub(connId);
        await hub2.OnDisconnectedAsync(null);

        // Profile should be removed
        var p = _realmManager.GetClientProfile(realm.Id, "lobby-dc-client");
        Assert.Null(p);
    }

    [Fact]
    public async Task OnDisconnectedAsync_NoMapping_DoesNotThrow()
    {
        var hub = CreateHub("unmapped-conn");
        await hub.OnDisconnectedAsync(null); // Should not throw
    }
}
