using Microsoft.Extensions.Logging;
using Moq;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Tests.Services;

public class RealmCleanupServiceTests
{
    private readonly Mock<ILogger<RealmCleanupService>> _loggerMock = new();

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private RealmCleanupService CreateService(RealmManager? manager = null) =>
        new(manager ?? new RealmManager(), _loggerMock.Object);

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
        await service.DisposeAsync();
    }

    [Fact]
    public async Task StopAsync_AfterStart_CompletesCleanly()
    {
        var service = CreateService();
        using var cts = new CancellationTokenSource();

        await service.StartAsync(cts.Token);

        // Request graceful shutdown.
        await service.StopAsync(CancellationToken.None);
        await service.DisposeAsync();
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
        await service.DisposeAsync();
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
        var manager = new RealmManager();
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
        var manager = new RealmManager();
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
        var manager = new RealmManager();
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
        var manager = new RealmManager();

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
        var manager = new RealmManager();

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
        await service.DisposeAsync();
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
}
