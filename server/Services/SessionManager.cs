using System.Collections.Concurrent;
using PulseRealm.Server.Models;

namespace PulseRealm.Server.Services;

public class RealmManager
{
    private readonly ConcurrentDictionary<string, Realm> _realms = new();
    private readonly ConcurrentDictionary<string, Realm> _joinCodes = new();
    private static readonly Random _random = new();

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
            realm.ConnectedClientIds.Add(clientId);
            if (profile != null)
            {
                profile.ClientId = clientId;
                realm.ClientProfiles[clientId] = profile;
            }
        }
    }

    public ClientProfile? GetClientProfile(string realmId, string clientId)
    {
        if (_realms.TryGetValue(realmId, out var realm))
        {
            realm.ClientProfiles.TryGetValue(clientId, out var profile);
            return profile;
        }
        return null;
    }

    public Dictionary<string, ClientProfile> GetClientProfiles(string realmId)
    {
        if (_realms.TryGetValue(realmId, out var realm))
        {
            return new Dictionary<string, ClientProfile>(realm.ClientProfiles);
        }
        return new();
    }

    private string GenerateJoinCode()
    {
        const string chars = "0123456789";
        var code = new string(Enumerable.Range(0, 6).Select(_ => chars[_random.Next(chars.Length)]).ToArray());
        return code;
    }
}
