namespace PulseRealm.Server.Services;

/// <summary>
/// Periodically removes realms that have been in Ended status for longer than the configured TTL,
/// and marks abandoned realms (Lobby/Started with no activity and no connections) as Ended.
/// Prevents unbounded memory growth from accumulated or forgotten realms.
/// </summary>
public class RealmCleanupService : BackgroundService
{
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan EndedRealmTtl = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan AbandonedRealmTtl = TimeSpan.FromMinutes(15);

    private readonly RealmManager _realmManager;
    private readonly RealmStatsTracker _statsTracker;
    private readonly ILogger<RealmCleanupService> _logger;

    public RealmCleanupService(RealmManager realmManager, RealmStatsTracker statsTracker, ILogger<RealmCleanupService> logger)
    {
        _realmManager = realmManager;
        _statsTracker = statsTracker;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Realm cleanup service started (ended TTL: {EndedTtl}, abandoned TTL: {AbandonedTtl}, interval: {Interval})",
            EndedRealmTtl, AbandonedRealmTtl, CleanupInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(CleanupInterval, stoppingToken);

            // Clean up abandoned realms (no activity, no connections) — mark ended and remove
            var abandoned = _realmManager.CleanupAbandonedRealms(AbandonedRealmTtl);
            foreach (var realm in abandoned)
            {
                var clientIds = realm.WithLock(r => new List<string>(r.KnownClientIds));
                _statsTracker.CleanupRealm(realm.Id, clientIds);
            }
            if (abandoned.Count > 0)
            {
                _logger.LogInformation("Cleaned up {Count} abandoned realm(s)", abandoned.Count);
            }

            // Clean up ended realms past their TTL
            var removed = _realmManager.CleanupEndedRealms(EndedRealmTtl);
            if (removed > 0)
            {
                _logger.LogInformation("Cleaned up {Count} ended realm(s)", removed);
            }
        }
    }
}
