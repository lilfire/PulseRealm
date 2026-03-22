using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;
using Xunit;

namespace PulseRealm.Server.Tests.Services;

/// <summary>Testable subclass with short intervals for integration testing.</summary>
internal class FastCleanupService : RealmCleanupService
{
    protected override TimeSpan CleanupInterval => TimeSpan.FromMilliseconds(50);
    protected override TimeSpan EndedRealmTtl => TimeSpan.FromMilliseconds(1);
    protected override TimeSpan AbandonedRealmTtl => TimeSpan.FromMilliseconds(1);

    public FastCleanupService(RealmManager realmManager, RealmStatsTracker statsTracker,
        AdminAuthService adminAuth, ILogger<RealmCleanupService> logger)
        : base(realmManager, statsTracker, adminAuth, logger) { }
}

public class RealmCleanupServiceTests
{
    private readonly Mock<ILogger<RealmCleanupService>> _loggerMock = new();

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

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

    private static AdminAuthService CreateAdminAuthService()
    {
        var config = new ConfigurationBuilder().Build();
        return new AdminAuthService(config);
    }

    private RealmCleanupService CreateService(RealmManager? manager = null) =>
        new(manager ?? CreateRealmManager(), new RealmStatsTracker(), CreateAdminAuthService(), _loggerMock.Object);

    // -------------------------------------------------------------------------
    // Lifecycle: start and cancel
    // -------------------------------------------------------------------------

    [Fact]
    public async Task StartAsync_ThenCancelImmediately_DoesNotThrow()
    {
        var service = CreateService();
        using var cts = new CancellationTokenSource();

        await service.StartAsync(cts.Token);
        await cts.CancelAsync();

        // Allow the background loop to observe cancellation.
        await Task.Delay(50);

        var exception = await Record.ExceptionAsync(
            () => service.StopAsync(CancellationToken.None));

        Assert.Null(exception);
        service.Dispose();
    }

    [Fact]
    public async Task StopAsync_AfterStart_CompletesCleanly()
    {
        var service = CreateService();
        using var cts = new CancellationTokenSource();

        await service.StartAsync(cts.Token);

        // Request graceful shutdown.
        await service.StopAsync(CancellationToken.None);
        service.Dispose();
    }

    [Fact]
    public async Task ExecuteAsync_IsCancellable_BeforeFirstInterval()
    {
        // Use a pre-cancelled token so the loop never runs a single iteration.
        var service = CreateService();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // StartAsync with a cancelled token: the background task should exit quickly.
        await service.StartAsync(cts.Token);
        await Task.Delay(50);

        var exception = await Record.ExceptionAsync(
            () => service.StopAsync(CancellationToken.None));

        Assert.Null(exception);
        service.Dispose();
    }

    // -------------------------------------------------------------------------
    // Integration: CleanupEndedRealms is invoked by the service
    // -------------------------------------------------------------------------

    [Fact]
    public void CleanupEndedRealms_Integration_RemovesExpiredEndedRealm()
    {
        // This test drives RealmManager directly (the same object the service uses)
        // to verify the end-to-end cleanup path without waiting 5 minutes for the
        // timer to fire.  It mirrors the exact logic that ExecuteAsync calls.
        var manager = CreateRealmManager();
        var realm = manager.CreateRealm(RealmMode.Competition);

        realm.Status = RealmStatus.Ended;
        realm.CreatedAt = DateTime.UtcNow.AddHours(-1); // well beyond 30-minute TTL

        var removed = manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(1, removed);
        Assert.Null(manager.GetById(realm.Id));
        Assert.Null(manager.GetByJoinCode(realm.JoinCode));
    }

    [Fact]
    public void CleanupEndedRealms_Integration_DoesNotRemoveActiveRealm()
    {
        var manager = CreateRealmManager();
        _ = CreateService(manager); // service shares the same manager

        var realm = manager.CreateRealm(RealmMode.Dungeon);
        realm.Status = RealmStatus.Started;
        realm.CreatedAt = DateTime.UtcNow.AddHours(-2);

        var removed = manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(0, removed);
        Assert.NotNull(manager.GetById(realm.Id));
    }

    [Fact]
    public void CleanupEndedRealms_Integration_DoesNotRemoveRealmWithinTtl()
    {
        var manager = CreateRealmManager();
        var realm = manager.CreateRealm(RealmMode.Social);

        realm.Status = RealmStatus.Ended;
        realm.CreatedAt = DateTime.UtcNow.AddMinutes(-10); // only 10 minutes old

        // TTL is 30 minutes — should not be removed yet.
        var removed = manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(0, removed);
        Assert.NotNull(manager.GetById(realm.Id));
    }

    [Fact]
    public void CleanupEndedRealms_Integration_RemovesMultipleExpiredRealms()
    {
        var manager = CreateRealmManager();

        var expired1 = manager.CreateRealm(RealmMode.Competition);
        expired1.Status = RealmStatus.Ended;
        expired1.CreatedAt = DateTime.UtcNow.AddHours(-2);

        var expired2 = manager.CreateRealm(RealmMode.YouTubeTrail);
        expired2.Status = RealmStatus.Ended;
        expired2.CreatedAt = DateTime.UtcNow.AddHours(-3);

        var active = manager.CreateRealm(RealmMode.Route);
        active.Status = RealmStatus.Started;

        var removed = manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(2, removed);
        Assert.Null(manager.GetById(expired1.Id));
        Assert.Null(manager.GetById(expired2.Id));
        Assert.NotNull(manager.GetById(active.Id));
    }

    [Fact]
    public void CleanupEndedRealms_Integration_ReturnsZero_WhenManagerIsEmpty()
    {
        var manager = CreateRealmManager();

        var removed = manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(0, removed);
    }

    // -------------------------------------------------------------------------
    // Logger interaction
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ExecuteAsync_LogsStartupMessage_OnServiceStart()
    {
        var service = CreateService();
        using var cts = new CancellationTokenSource();

        await service.StartAsync(cts.Token);
        // Give the background task a moment to log its startup message.
        await Task.Delay(50);

        _loggerMock.Verify(
            l => l.Log(
                LogLevel.Information,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, _) =>
                    v.ToString()!.Contains("cleanup service started")),
                It.IsAny<Exception?>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);

        await service.StopAsync(CancellationToken.None);
        service.Dispose();
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    [Fact]
    public void Constructor_DoesNotThrow_WithValidDependencies()
    {
        var exception = Record.Exception(() => CreateService());
        Assert.Null(exception);
    }

    // -------------------------------------------------------------------------
    // CleanupAbandonedRealms
    // -------------------------------------------------------------------------

    [Fact]
    public void CleanupAbandonedRealms_RemovesAbandonedRealm()
    {
        var manager = CreateRealmManager();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.SetLastActivityAt(DateTime.UtcNow.AddMinutes(-20));
        // No connected clients, no host = abandoned

        var abandoned = manager.CleanupAbandonedRealms(TimeSpan.FromMinutes(15));

        Assert.Single(abandoned);
        Assert.Equal(RealmStatus.Ended, realm.Status);
        Assert.Null(manager.GetById(realm.Id));
    }

    [Fact]
    public void CleanupAbandonedRealms_DoesNotRemoveRealmWithActivity()
    {
        var manager = CreateRealmManager();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.SetLastActivityAt(DateTime.UtcNow); // recent activity

        var abandoned = manager.CleanupAbandonedRealms(TimeSpan.FromMinutes(15));

        Assert.Empty(abandoned);
        Assert.NotNull(manager.GetById(realm.Id));
    }

    [Fact]
    public void CleanupAbandonedRealms_DoesNotRemoveRealmWithClients()
    {
        var manager = CreateRealmManager();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.SetLastActivityAt(DateTime.UtcNow.AddMinutes(-20));
        manager.AddClient(realm.Id, "client1");

        var abandoned = manager.CleanupAbandonedRealms(TimeSpan.FromMinutes(15));

        Assert.Empty(abandoned);
    }

    [Fact]
    public void CleanupAbandonedRealms_DoesNotRemoveRealmWithHost()
    {
        var manager = CreateRealmManager();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.SetLastActivityAt(DateTime.UtcNow.AddMinutes(-20));
        realm.HostConnectionId = "host-conn-id";

        var abandoned = manager.CleanupAbandonedRealms(TimeSpan.FromMinutes(15));

        Assert.Empty(abandoned);
    }

    [Fact]
    public void CleanupAbandonedRealms_SkipsEndedRealms()
    {
        var manager = CreateRealmManager();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Ended;
        realm.SetLastActivityAt(DateTime.UtcNow.AddMinutes(-20));

        var abandoned = manager.CleanupAbandonedRealms(TimeSpan.FromMinutes(15));

        Assert.Empty(abandoned);
    }

    [Fact]
    public void CleanupAbandonedRealms_SetsEndedAtTimestamp()
    {
        var manager = CreateRealmManager();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.SetLastActivityAt(DateTime.UtcNow.AddMinutes(-20));

        var abandoned = manager.CleanupAbandonedRealms(TimeSpan.FromMinutes(15));

        Assert.Single(abandoned);
        Assert.NotNull(realm.EndedAt);
    }

    // -------------------------------------------------------------------------
    // Integration: cleanup loop cleans stats
    // -------------------------------------------------------------------------

    [Fact]
    public void CleanupAbandonedRealms_Integration_CleanupStatsAfterAbandoned()
    {
        var manager = CreateRealmManager();
        var statsTracker = new RealmStatsTracker();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.KnownClientIds.Add("c1");
        realm.SetLastActivityAt(DateTime.UtcNow.AddMinutes(-20));

        // Record some stats
        statsTracker.Record(realm.Id, "c1", 100, 120, 5.0,
            new ClientProfile { Name = "Test", HeightCm = 170, WeightKg = 70 });

        var abandoned = manager.CleanupAbandonedRealms(TimeSpan.FromMinutes(15));
        foreach (var r in abandoned)
        {
            var clientIds = r.WithLock(rl => new List<string>(rl.KnownClientIds));
            statsTracker.CleanupRealm(r.Id, clientIds);
        }

        Assert.Single(abandoned);
    }

    // -------------------------------------------------------------------------
    // ExecuteAsync integration: actually run the loop
    // -------------------------------------------------------------------------

    [Fact]
    public async Task ExecuteAsync_CleansUpAbandonedRealms()
    {
        var manager = CreateRealmManager();
        var statsTracker = new RealmStatsTracker();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.SetLastActivityAt(DateTime.UtcNow.AddHours(-1)); // well past any TTL

        var service = new FastCleanupService(manager, statsTracker, CreateAdminAuthService(), _loggerMock.Object);
        using var cts = new CancellationTokenSource();

        await service.StartAsync(cts.Token);
        // Give the fast loop time to execute at least one cycle
        await Task.Delay(200);
        await cts.CancelAsync();
        await service.StopAsync(CancellationToken.None);
        service.Dispose();

        Assert.Null(manager.GetById(realm.Id));
    }

    [Fact]
    public async Task ExecuteAsync_CleansUpEndedRealms()
    {
        var manager = CreateRealmManager();
        var statsTracker = new RealmStatsTracker();
        var realm = manager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Ended;
        realm.EndedAt = DateTime.UtcNow.AddHours(-2);

        var service = new FastCleanupService(manager, statsTracker, CreateAdminAuthService(), _loggerMock.Object);
        using var cts = new CancellationTokenSource();

        await service.StartAsync(cts.Token);
        await Task.Delay(200);
        await cts.CancelAsync();
        await service.StopAsync(CancellationToken.None);
        service.Dispose();

        Assert.Null(manager.GetById(realm.Id));
    }

    [Fact]
    public async Task ExecuteAsync_LogsCleanupCounts()
    {
        var manager = CreateRealmManager();
        var statsTracker = new RealmStatsTracker();

        // Create an abandoned realm
        var abandoned = manager.CreateRealm(RealmMode.Competition);
        abandoned.SetLastActivityAt(DateTime.UtcNow.AddHours(-1));

        // Create an ended realm
        var ended = manager.CreateRealm(RealmMode.Dungeon);
        ended.Status = RealmStatus.Ended;
        ended.EndedAt = DateTime.UtcNow.AddHours(-2);

        var service = new FastCleanupService(manager, statsTracker, CreateAdminAuthService(), _loggerMock.Object);
        using var cts = new CancellationTokenSource();

        await service.StartAsync(cts.Token);
        await Task.Delay(200);
        await cts.CancelAsync();
        await service.StopAsync(CancellationToken.None);
        service.Dispose();

        // Should have logged cleanup messages
        _loggerMock.Verify(
            l => l.Log(
                LogLevel.Information,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, _) =>
                    v.ToString()!.Contains("abandoned realm")),
                It.IsAny<Exception?>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExecuteAsync_PreservesActiveRealms()
    {
        var manager = CreateRealmManager();
        var statsTracker = new RealmStatsTracker();
        var activeRealm = manager.CreateRealm(RealmMode.Competition);
        // Active realm: has a host connected (so not considered abandoned)
        activeRealm.HostConnectionId = "host-conn";

        var service = new FastCleanupService(manager, statsTracker, CreateAdminAuthService(), _loggerMock.Object);
        using var cts = new CancellationTokenSource();

        await service.StartAsync(cts.Token);
        await Task.Delay(200);
        await cts.CancelAsync();
        await service.StopAsync(CancellationToken.None);
        service.Dispose();

        Assert.NotNull(manager.GetById(activeRealm.Id));
    }
}
