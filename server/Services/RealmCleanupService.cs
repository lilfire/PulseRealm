using PulseRealm.Server.Hubs;

namespace PulseRealm.Server.Services;

/// <summary>
/// Periodically removes realms that have been in Ended status for longer than the configured TTL,
/// and marks abandoned realms (Lobby/Started with no activity and no connections) as Ended.
/// Prevents unbounded memory growth from accumulated or forgotten realms.
/// </summary>
public class RealmCleanupService : BackgroundService
{
    protected virtual TimeSpan CleanupInterval { get; } = TimeSpan.FromMinutes(5);
    protected virtual TimeSpan EndedRealmTtl { get; } = TimeSpan.FromMinutes(30);
    protected virtual TimeSpan AbandonedRealmTtl { get; } = TimeSpan.FromMinutes(15);
    protected virtual TimeSpan CalibrationSessionTtl { get; } = TimeSpan.FromMinutes(30);

    private readonly RealmManager _realmManager;
    private readonly RealmStatsTracker _statsTracker;
    private readonly AdminAuthService _adminAuth;
    private readonly ILogger<RealmCleanupService> _logger;

    public RealmCleanupService(RealmManager realmManager, RealmStatsTracker statsTracker, AdminAuthService adminAuth, ILogger<RealmCleanupService> logger)
    {
        _realmManager = realmManager;
        _statsTracker = statsTracker;
        _adminAuth = adminAuth;
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
                RealmHub.CleanupRealmHubState(realm.Id, clientIds);
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

            // Clean up stale calibration sessions older than the TTL
            var calibrationCutoff = DateTime.UtcNow - CalibrationSessionTtl;
            var expiredSessions = RealmHub._calibrationSessions
                .Where(kvp => kvp.Value.CreatedAt < calibrationCutoff)
                .Select(kvp => kvp.Key)
                .ToList();
            foreach (var sessionId in expiredSessions)
            {
                if (RealmHub._calibrationSessions.TryRemove(sessionId, out var session))
                {
                    RealmHub._calibrationJoinCodes.TryRemove(session.JoinCode, out _);
                }
            }
            if (expiredSessions.Count > 0)
            {
                _logger.LogInformation("Cleaned up {Count} expired calibration session(s)", expiredSessions.Count);
            }

            // Clean up expired admin auth tokens
            _adminAuth.CleanupExpiredTokens();
        }
    }
}
