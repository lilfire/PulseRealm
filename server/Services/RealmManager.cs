using System.Collections.Concurrent;
using PulseRealm.Server.Models;

namespace PulseRealm.Server.Services;

public class RealmManager
{
    private readonly ConcurrentDictionary<string, Realm> _realms = new();
    private readonly ConcurrentDictionary<string, Realm> _joinCodes = new();
    private readonly AdminConfigService _adminConfig;
    private readonly object _createLock = new();

    public RealmManager(AdminConfigService adminConfig)
    {
        _adminConfig = adminConfig;
    }

    public Realm CreateRealm(RealmMode mode)
    {
        lock (_createLock)
        {
            var maxRealms = _adminConfig.GetConfig().MaxConcurrentRealms;
            if (maxRealms > 0)
            {
                var activeCount = _realms.Values.Count(r => r.Status != RealmStatus.Ended);
                if (activeCount >= maxRealms)
                    throw new InvalidOperationException($"Maximum concurrent realms reached ({maxRealms}). Please wait for an existing realm to end.");
            }

            var realm = new Realm
            {
                Mode = mode,
                JoinCode = GenerateJoinCode(),
                HostSecret = GenerateHostSecret()
            };

            _realms[realm.Id] = realm;
            _joinCodes[realm.JoinCode] = realm;
            return realm;
        }
    }

    public Realm? GetByJoinCode(string joinCode)
    {
        _joinCodes.TryGetValue(joinCode.ToUpperInvariant(), out var realm);
        return realm;
    }

    public Realm? GetById(string id)
    {
        _realms.TryGetValue(id, out var realm);
        return realm;
    }

    public void AddClient(string realmId, string clientId, ClientProfile? profile = null)
    {
        if (_realms.TryGetValue(realmId, out var realm))
        {
            realm.WithLock(r =>
            {
                // Capacity check is performed inside the lock so the check and add are atomic.
                // Reconnecting clients (already Known) bypass the limit.
                var isReconnect = r.KnownClientIds.Contains(clientId);
                if (!isReconnect && r.ConnectedClientIds.Count >= r.MaxClients)
                    throw new InvalidOperationException($"Realm is full ({r.MaxClients}/{r.MaxClients} players).");

                if (!r.ConnectedClientIds.Contains(clientId))
                {
                    r.ConnectedClientIds.Add(clientId);
                }
                r.KnownClientIds.Add(clientId);
                if (profile != null)
                {
                    profile.ClientId = clientId;
                    r.ClientProfiles[clientId] = profile;
                }
            });
        }
    }

    public void RemoveClient(string realmId, string clientId, bool removeFromKnown = false)
    {
        if (_realms.TryGetValue(realmId, out var realm))
        {
            realm.WithLock(r =>
            {
                r.ConnectedClientIds.Remove(clientId);
                r.ClientProfiles.Remove(clientId);
                if (removeFromKnown)
                    r.KnownClientIds.Remove(clientId);
            });
        }
    }

    public ClientProfile? GetClientProfile(string realmId, string clientId)
    {
        if (_realms.TryGetValue(realmId, out var realm))
        {
            return realm.WithLock(r =>
            {
                r.ClientProfiles.TryGetValue(clientId, out var profile);
                return profile;
            });
        }
        return null;
    }

    public Dictionary<string, ClientProfile> GetClientProfiles(string realmId)
    {
        if (_realms.TryGetValue(realmId, out var realm))
        {
            return realm.WithLock(r => new Dictionary<string, ClientProfile>(r.ClientProfiles));
        }
        return new();
    }

    public List<Realm> GetActiveRealms()
    {
        return _realms.Values
            .Where(r => r.Status != RealmStatus.Ended)
            .OrderByDescending(r => r.CreatedAt)
            .ToList();
    }

    /// <summary>Removes realms that have been in Ended status for longer than the given TTL.</summary>
    public int CleanupEndedRealms(TimeSpan ttl)
    {
        var cutoff = DateTime.UtcNow - ttl;
        var removed = 0;

        foreach (var kvp in _realms)
        {
            var realm = kvp.Value;
            if (realm.Status == RealmStatus.Ended && (realm.EndedAt ?? realm.CreatedAt) < cutoff)
            {
                if (_realms.TryRemove(kvp.Key, out _))
                {
                    _joinCodes.TryRemove(realm.JoinCode, out _);
                    removed++;
                }
            }
        }

        return removed;
    }

    /// <summary>
    /// Finds realms in Lobby or Started status with no activity for longer than the given TTL
    /// and no connected clients or host. Returns the abandoned realms so the caller can
    /// perform hub-level cleanup (stats, SignalR state) before removal.
    /// </summary>
    public List<Realm> CleanupAbandonedRealms(TimeSpan inactivityTtl)
    {
        var cutoff = DateTime.UtcNow - inactivityTtl;
        var abandoned = new List<Realm>();

        foreach (var kvp in _realms)
        {
            var realm = kvp.Value;
            if (realm.Status == RealmStatus.Ended)
                continue;

            var isAbandoned = realm.WithLock(r =>
                r.LastActivityAt < cutoff
                && r.ConnectedClientIds.Count == 0
                && r.HostConnectionId is null);

            if (isAbandoned)
            {
                realm.WithLock(r =>
                {
                    r.Status = RealmStatus.Ended;
                    r.EndedAt = DateTime.UtcNow;
                });

                if (_realms.TryRemove(kvp.Key, out _))
                {
                    _joinCodes.TryRemove(realm.JoinCode, out _);
                    abandoned.Add(realm);
                }
            }
        }

        return abandoned;
    }

    private static string GenerateJoinCode()
    {
        const string chars = "0123456789";
        var code = new string(Enumerable.Range(0, 6).Select(_ => chars[Random.Shared.Next(chars.Length)]).ToArray());
        return code;
    }

    private static string GenerateHostSecret()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, 8).Select(_ => chars[Random.Shared.Next(chars.Length)]).ToArray());
    }
}
