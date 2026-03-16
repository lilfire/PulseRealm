using System.Collections.Concurrent;
using PulseRealm.Server.Models;

namespace PulseRealm.Server.Services;

public class RealmManager
{
    private readonly ConcurrentDictionary<string, Realm> _realms = new();
    private readonly ConcurrentDictionary<string, Realm> _joinCodes = new();

    public Realm CreateRealm(RealmMode mode)
    {
        var realm = new Realm
        {
            Mode = mode,
            JoinCode = GenerateJoinCode()
        };

        _realms[realm.Id] = realm;
        _joinCodes[realm.JoinCode] = realm;
        return realm;
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

    public void RemoveClient(string realmId, string clientId)
    {
        if (_realms.TryGetValue(realmId, out var realm))
        {
            realm.WithLock(r =>
            {
                r.ConnectedClientIds.Remove(clientId);
                r.ClientProfiles.Remove(clientId);
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

    /// <summary>Removes realms that have been in Ended status for longer than the given TTL.</summary>
    public int CleanupEndedRealms(TimeSpan ttl)
    {
        var cutoff = DateTime.UtcNow - ttl;
        var removed = 0;

        foreach (var kvp in _realms)
        {
            var realm = kvp.Value;
            if (realm.Status == RealmStatus.Ended && realm.CreatedAt < cutoff)
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

    private static string GenerateJoinCode()
    {
        const string chars = "0123456789";
        var code = new string(Enumerable.Range(0, 6).Select(_ => chars[Random.Shared.Next(chars.Length)]).ToArray());
        return code;
    }
}
