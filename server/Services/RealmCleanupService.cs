namespace PulseRealm.Server.Services;

/// <summary>
/// Periodically removes realms that have been in Ended status for longer than the configured TTL.
/// Prevents unbounded memory growth from accumulated ended realms.
/// </summary>
public class RealmCleanupService : BackgroundService
{
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan RealmTtl = TimeSpan.FromMinutes(30);

    private readonly RealmManager _realmManager;
    private readonly ILogger<RealmCleanupService> _logger;

    public RealmCleanupService(RealmManager realmManager, ILogger<RealmCleanupService> logger)
    {
        _realmManager = realmManager;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Realm cleanup service started (TTL: {Ttl}, interval: {Interval})", RealmTtl, CleanupInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(CleanupInterval, stoppingToken);

            var removed = _realmManager.CleanupEndedRealms(RealmTtl);
            if (removed > 0)
            {
                _logger.LogInformation("Cleaned up {Count} ended realm(s)", removed);
            }
        }
    }
}
