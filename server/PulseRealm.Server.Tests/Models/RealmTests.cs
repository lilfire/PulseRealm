using PulseRealm.Server.Models;
using Xunit;

namespace PulseRealm.Server.Tests.Models;

public class RealmTests
{
    // -------------------------------------------------------------------------
    // Default values
    // -------------------------------------------------------------------------

    [Fact]
    public void DefaultStatus_IsLobby()
    {
        var realm = new Realm();

        Assert.Equal(RealmStatus.Lobby, realm.Status);
    }

    [Fact]
    public void DefaultJoinCode_IsEmptyString()
    {
        var realm = new Realm();

        Assert.Equal(string.Empty, realm.JoinCode);
    }

    [Fact]
    public void DefaultRealmConfig_IsNull()
    {
        var realm = new Realm();

        Assert.Null(realm.RealmConfig);
    }

    [Fact]
    public void DefaultConnectedClientIds_IsEmptyList()
    {
        var realm = new Realm();

        Assert.NotNull(realm.ConnectedClientIds);
        Assert.Empty(realm.ConnectedClientIds);
    }

    [Fact]
    public void DefaultKnownClientIds_IsEmptySet()
    {
        var realm = new Realm();

        Assert.NotNull(realm.KnownClientIds);
        Assert.Empty(realm.KnownClientIds);
    }

    [Fact]
    public void DefaultClientProfiles_IsEmptyDictionary()
    {
        var realm = new Realm();

        Assert.NotNull(realm.ClientProfiles);
        Assert.Empty(realm.ClientProfiles);
    }

    [Fact]
    public void DefaultId_IsNonEmptyGuidString()
    {
        var realm = new Realm();

        Assert.False(string.IsNullOrWhiteSpace(realm.Id));
        Assert.True(Guid.TryParse(realm.Id, out _),
            $"Expected Id to be a valid GUID but was: {realm.Id}");
    }

    [Fact]
    public void DefaultCreatedAt_IsCloseToUtcNow()
    {
        var before = DateTime.UtcNow.AddSeconds(-2);
        var realm = new Realm();
        var after = DateTime.UtcNow.AddSeconds(2);

        Assert.InRange(realm.CreatedAt, before, after);
    }

    [Fact]
    public void NewRealm_AllDefaultValues()
    {
        var realm = new Realm();

        Assert.NotEmpty(realm.Id);
        Assert.Equal(string.Empty, realm.JoinCode);
        Assert.Equal(RealmStatus.Lobby, realm.Status);
        Assert.Empty(realm.ConnectedClientIds);
        Assert.Empty(realm.KnownClientIds);
        Assert.Empty(realm.ClientProfiles);
        Assert.Null(realm.RealmConfig);
    }

    // -------------------------------------------------------------------------
    // Id uniqueness
    // -------------------------------------------------------------------------

    [Fact]
    public void Id_IsUniqueAcrossInstances()
    {
        var realm1 = new Realm();
        var realm2 = new Realm();

        Assert.NotEqual(realm1.Id, realm2.Id);
    }

    [Fact]
    public void Id_IsUniqueAcrossManyInstances()
    {
        const int count = 100;
        var ids = Enumerable.Range(0, count).Select(_ => new Realm().Id).ToHashSet();

        Assert.Equal(count, ids.Count);
    }

    // -------------------------------------------------------------------------
    // MaxClients per mode — individual facts
    // -------------------------------------------------------------------------

    [Fact]
    public void MaxClients_Competition_IsEight()
    {
        var realm = new Realm { Mode = RealmMode.Competition };

        Assert.Equal(8, realm.MaxClients);
    }

    [Fact]
    public void MaxClients_StreetView_IsOne()
    {
        var realm = new Realm { Mode = RealmMode.StreetView };

        Assert.Equal(1, realm.MaxClients);
    }

    [Fact]
    public void MaxClients_YouTubeTrail_IsOne()
    {
        var realm = new Realm { Mode = RealmMode.YouTubeTrail };

        Assert.Equal(1, realm.MaxClients);
    }

    [Fact]
    public void MaxClients_Route_IsOne()
    {
        var realm = new Realm { Mode = RealmMode.Route };

        Assert.Equal(1, realm.MaxClients);
    }

    [Fact]
    public void MaxClients_Dungeon_IsFour()
    {
        var realm = new Realm { Mode = RealmMode.Dungeon };

        Assert.Equal(4, realm.MaxClients);
    }

    [Fact]
    public void MaxClients_Social_IsFour()
    {
        var realm = new Realm { Mode = RealmMode.Social };

        Assert.Equal(4, realm.MaxClients);
    }

    // -------------------------------------------------------------------------
    // MaxClients per mode — theory
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(RealmMode.Competition, 8)]
    [InlineData(RealmMode.StreetView, 1)]
    [InlineData(RealmMode.YouTubeTrail, 1)]
    [InlineData(RealmMode.Route, 1)]
    [InlineData(RealmMode.Dungeon, 4)]
    [InlineData(RealmMode.Social, 4)]
    public void MaxClients_ReturnsCorrectValuePerMode(RealmMode mode, int expected)
    {
        var realm = new Realm { Mode = mode };

        Assert.Equal(expected, realm.MaxClients);
    }

    // -------------------------------------------------------------------------
    // WithLock(Action<Realm>)
    // -------------------------------------------------------------------------

    [Fact]
    public void WithLock_Action_Executes()
    {
        var realm = new Realm();
        var executed = false;

        realm.WithLock(r => { executed = true; });

        Assert.True(executed);
    }

    [Fact]
    public void WithLock_Action_ReceivesRealmInstance()
    {
        var realm = new Realm();
        Realm? captured = null;

        realm.WithLock(r => { captured = r; });

        Assert.Same(realm, captured);
    }

    [Fact]
    public void WithLock_Action_MutatesStateVisibleAfterLock()
    {
        var realm = new Realm();

        realm.WithLock(r =>
        {
            r.ConnectedClientIds.Add("client-1");
            r.KnownClientIds.Add("client-1");
        });

        Assert.Single(realm.ConnectedClientIds);
        Assert.Contains("client-1", realm.KnownClientIds);
    }

    [Fact]
    public void WithLock_Action_SecondCallSeesFirstCallMutation()
    {
        // Verifies that mutations made inside one WithLock block are visible
        // to a subsequent WithLock block on the same realm.
        var realm = new Realm();

        realm.WithLock(r => r.Status = RealmStatus.Started);

        realm.WithLock(r =>
        {
            Assert.Equal(RealmStatus.Started, r.Status);
        });
    }

    [Fact]
    public void WithLock_Action_MultipleCallsExecuteSuccessively()
    {
        var realm = new Realm();
        var results = new List<int>();

        realm.WithLock(_ => results.Add(1));
        realm.WithLock(_ => results.Add(2));
        realm.WithLock(_ => results.Add(3));

        Assert.Equal(new[] { 1, 2, 3 }, results);
    }

    // -------------------------------------------------------------------------
    // WithLock<T>(Func<Realm, T>)
    // -------------------------------------------------------------------------

    [Fact]
    public void WithLock_Func_ReturnsValue()
    {
        var realm = new Realm();
        realm.ConnectedClientIds.Add("client-1");

        var count = realm.WithLock(r => r.ConnectedClientIds.Count);

        Assert.Equal(1, count);
    }

    [Fact]
    public void WithLock_Func_ReceivesRealmInstance()
    {
        var realm = new Realm();

        var captured = realm.WithLock(r => r);

        Assert.Same(realm, captured);
    }

    [Fact]
    public void WithLock_Func_ReturnsComplexValue()
    {
        var realm = new Realm();
        realm.ConnectedClientIds.Add("c1");
        realm.ConnectedClientIds.Add("c2");

        var (count, status) = realm.WithLock(r => (r.ConnectedClientIds.Count, r.Status));

        Assert.Equal(2, count);
        Assert.Equal(RealmStatus.Lobby, status);
    }

    [Fact]
    public void WithLock_Func_CanReturnNull()
    {
        var realm = new Realm();

        var result = realm.WithLock<string?>(r => null);

        Assert.Null(result);
    }

    [Fact]
    public void WithLock_Func_CanReadClientProfilesUnderLock()
    {
        var realm = new Realm();
        realm.ClientProfiles["c1"] = new ClientProfile { Name = "Alice", ClientId = "c1" };

        var profile = realm.WithLock(r =>
        {
            r.ClientProfiles.TryGetValue("c1", out var p);
            return p;
        });

        Assert.NotNull(profile);
        Assert.Equal("Alice", profile!.Name);
    }

    // -------------------------------------------------------------------------
    // Thread safety
    // -------------------------------------------------------------------------

    [Fact]
    public void WithLock_Action_ConcurrentMutations_DoNotCorruptList()
    {
        var realm = new Realm();
        const int threadCount = 50;

        var tasks = Enumerable.Range(0, threadCount).Select(i => Task.Run(() =>
            realm.WithLock(r => r.ConnectedClientIds.Add($"client-{i}"))
        )).ToArray();

        Task.WaitAll(tasks);

        Assert.Equal(threadCount, realm.ConnectedClientIds.Count);
    }

    [Fact]
    public void WithLock_Func_ConcurrentReads_DoNotThrow()
    {
        var realm = new Realm();
        realm.ConnectedClientIds.AddRange(Enumerable.Range(0, 10).Select(i => $"c{i}"));
        const int threadCount = 50;

        var tasks = Enumerable.Range(0, threadCount).Select(_ => Task.Run(() =>
            realm.WithLock(r => r.ConnectedClientIds.Count)
        )).ToArray();

        var exception = Record.Exception(() => Task.WaitAll(tasks));

        Assert.Null(exception);
    }
}
