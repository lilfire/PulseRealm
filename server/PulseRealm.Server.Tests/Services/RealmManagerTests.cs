using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Tests.Services;

public class RealmManagerTests
{
    private readonly RealmManager _manager = new();

    // -------------------------------------------------------------------------
    // CreateRealm
    // -------------------------------------------------------------------------

    [Theory]
    [InlineData(RealmMode.Competition)]
    [InlineData(RealmMode.StreetView)]
    [InlineData(RealmMode.YouTubeTrail)]
    [InlineData(RealmMode.Route)]
    [InlineData(RealmMode.Dungeon)]
    [InlineData(RealmMode.Social)]
    public void CreateRealm_SetsCorrectMode(RealmMode mode)
    {
        var realm = _manager.CreateRealm(mode);

        Assert.Equal(mode, realm.Mode);
    }

    [Fact]
    public void CreateRealm_AssignsNonEmptyId()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        Assert.False(string.IsNullOrWhiteSpace(realm.Id));
    }

    [Fact]
    public void CreateRealm_GeneratesSixDigitNumericJoinCode()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        Assert.Equal(6, realm.JoinCode.Length);
        Assert.True(realm.JoinCode.All(char.IsDigit),
            $"Expected all digits but got: {realm.JoinCode}");
    }

    [Fact]
    public void CreateRealm_IsRetrievableByJoinCode()
    {
        var realm = _manager.CreateRealm(RealmMode.Dungeon);

        var found = _manager.GetByJoinCode(realm.JoinCode);

        Assert.NotNull(found);
        Assert.Equal(realm.Id, found.Id);
    }

    [Fact]
    public void CreateRealm_IsRetrievableById()
    {
        var realm = _manager.CreateRealm(RealmMode.Social);

        var found = _manager.GetById(realm.Id);

        Assert.NotNull(found);
        Assert.Equal(realm.Id, found.Id);
    }

    [Fact]
    public void CreateRealm_InitialStatusIsLobby()
    {
        var realm = _manager.CreateRealm(RealmMode.Route);

        Assert.Equal(RealmStatus.Lobby, realm.Status);
    }

    [Fact]
    public void CreateRealm_MultipleRealmsHaveUniqueIds()
    {
        var realm1 = _manager.CreateRealm(RealmMode.Competition);
        var realm2 = _manager.CreateRealm(RealmMode.Competition);

        Assert.NotEqual(realm1.Id, realm2.Id);
    }

    // -------------------------------------------------------------------------
    // GetByJoinCode
    // -------------------------------------------------------------------------

    [Fact]
    public void GetByJoinCode_ReturnsCorrectRealm()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        var found = _manager.GetByJoinCode(realm.JoinCode);

        Assert.NotNull(found);
        Assert.Equal(realm.Id, found.Id);
    }

    [Fact]
    public void GetByJoinCode_IsCaseInsensitive_Lowercase()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        var found = _manager.GetByJoinCode(realm.JoinCode.ToLowerInvariant());

        Assert.NotNull(found);
        Assert.Equal(realm.Id, found.Id);
    }

    [Fact]
    public void GetByJoinCode_IsCaseInsensitive_Uppercase()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        var found = _manager.GetByJoinCode(realm.JoinCode.ToUpperInvariant());

        Assert.NotNull(found);
        Assert.Equal(realm.Id, found.Id);
    }

    [Fact]
    public void GetByJoinCode_ReturnsNull_ForUnknownCode()
    {
        var found = _manager.GetByJoinCode("000000");

        Assert.Null(found);
    }

    [Fact]
    public void GetByJoinCode_ReturnsNull_ForEmptyString()
    {
        var found = _manager.GetByJoinCode(string.Empty);

        Assert.Null(found);
    }

    // -------------------------------------------------------------------------
    // GetById
    // -------------------------------------------------------------------------

    [Fact]
    public void GetById_ReturnsCorrectRealm()
    {
        var realm = _manager.CreateRealm(RealmMode.Dungeon);

        var found = _manager.GetById(realm.Id);

        Assert.NotNull(found);
        Assert.Equal(realm.Id, found.Id);
    }

    [Fact]
    public void GetById_ReturnsNull_ForUnknownId()
    {
        var found = _manager.GetById(Guid.NewGuid().ToString());

        Assert.Null(found);
    }

    [Fact]
    public void GetById_ReturnsNull_ForEmptyString()
    {
        var found = _manager.GetById(string.Empty);

        Assert.Null(found);
    }

    // -------------------------------------------------------------------------
    // AddClient
    // -------------------------------------------------------------------------

    [Fact]
    public void AddClient_AddsToConnectedClientIds()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        _manager.AddClient(realm.Id, "client-1");

        Assert.Contains("client-1", realm.ConnectedClientIds);
    }

    [Fact]
    public void AddClient_AddsToKnownClientIds()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        _manager.AddClient(realm.Id, "client-1");

        Assert.Contains("client-1", realm.KnownClientIds);
    }

    [Fact]
    public void AddClient_WithProfile_StoresProfileAndSetsClientId()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        var profile = new ClientProfile { Name = "Alice", HeightCm = 170, WeightKg = 65 };

        _manager.AddClient(realm.Id, "client-1", profile);

        var stored = _manager.GetClientProfile(realm.Id, "client-1");
        Assert.NotNull(stored);
        Assert.Equal("client-1", stored.ClientId);
        Assert.Equal("Alice", stored.Name);
    }

    [Fact]
    public void AddClient_WithNullProfile_DoesNotAddToProfiles()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        _manager.AddClient(realm.Id, "client-1", null);

        var profile = _manager.GetClientProfile(realm.Id, "client-1");
        Assert.Null(profile);
    }

    [Fact]
    public void AddClient_CalledTwiceWithSameId_DoesNotDuplicateInConnectedClients()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        _manager.AddClient(realm.Id, "client-1");
        _manager.AddClient(realm.Id, "client-1");

        Assert.Single(realm.ConnectedClientIds, id => id == "client-1");
    }

    [Fact]
    public void AddClient_InvalidRealmId_DoesNothing()
    {
        // Should not throw — the realm simply does not exist.
        var exception = Record.Exception(() =>
            _manager.AddClient(Guid.NewGuid().ToString(), "client-1"));

        Assert.Null(exception);
    }

    [Fact]
    public void AddClient_WithProfile_OverwritesPreviousProfileForSameClient()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        _manager.AddClient(realm.Id, "client-1", new ClientProfile { Name = "Alice" });
        _manager.AddClient(realm.Id, "client-1", new ClientProfile { Name = "Bob" });

        var stored = _manager.GetClientProfile(realm.Id, "client-1");
        Assert.Equal("Bob", stored!.Name);
    }

    // -------------------------------------------------------------------------
    // RemoveClient
    // -------------------------------------------------------------------------

    [Fact]
    public void RemoveClient_RemovesFromConnectedClientIds()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        _manager.AddClient(realm.Id, "client-1", new ClientProfile { Name = "Alice" });

        _manager.RemoveClient(realm.Id, "client-1");

        Assert.DoesNotContain("client-1", realm.ConnectedClientIds);
    }

    [Fact]
    public void RemoveClient_RemovesProfileFromClientProfiles()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        _manager.AddClient(realm.Id, "client-1", new ClientProfile { Name = "Alice" });

        _manager.RemoveClient(realm.Id, "client-1");

        var profile = _manager.GetClientProfile(realm.Id, "client-1");
        Assert.Null(profile);
    }

    [Fact]
    public void RemoveClient_DoesNotRemoveFromKnownClientIds()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        _manager.AddClient(realm.Id, "client-1");

        _manager.RemoveClient(realm.Id, "client-1");

        // KnownClientIds is intentionally permanent (tracks who was ever connected).
        Assert.Contains("client-1", realm.KnownClientIds);
    }

    [Fact]
    public void RemoveClient_InvalidRealmId_DoesNothing()
    {
        var exception = Record.Exception(() =>
            _manager.RemoveClient(Guid.NewGuid().ToString(), "client-1"));

        Assert.Null(exception);
    }

    [Fact]
    public void RemoveClient_NonExistentClient_DoesNothing()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        var exception = Record.Exception(() =>
            _manager.RemoveClient(realm.Id, "never-added"));

        Assert.Null(exception);
    }

    // -------------------------------------------------------------------------
    // GetClientProfile
    // -------------------------------------------------------------------------

    [Fact]
    public void GetClientProfile_ReturnsStoredProfile()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        _manager.AddClient(realm.Id, "client-1", new ClientProfile { Name = "Alice", HeightCm = 165 });

        var profile = _manager.GetClientProfile(realm.Id, "client-1");

        Assert.NotNull(profile);
        Assert.Equal("Alice", profile.Name);
        Assert.Equal(165, profile.HeightCm);
    }

    [Fact]
    public void GetClientProfile_ReturnsNull_ForClientWithNoProfile()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        _manager.AddClient(realm.Id, "client-1");

        var profile = _manager.GetClientProfile(realm.Id, "client-1");

        Assert.Null(profile);
    }

    [Fact]
    public void GetClientProfile_ReturnsNull_ForInvalidRealmId()
    {
        var profile = _manager.GetClientProfile(Guid.NewGuid().ToString(), "client-1");

        Assert.Null(profile);
    }

    [Fact]
    public void GetClientProfile_ReturnsNull_ForUnknownClientInKnownRealm()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);

        var profile = _manager.GetClientProfile(realm.Id, "ghost-client");

        Assert.Null(profile);
    }

    // -------------------------------------------------------------------------
    // GetClientProfiles
    // -------------------------------------------------------------------------

    [Fact]
    public void GetClientProfiles_ReturnsAllStoredProfiles()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        _manager.AddClient(realm.Id, "client-1", new ClientProfile { Name = "Alice" });
        _manager.AddClient(realm.Id, "client-2", new ClientProfile { Name = "Bob" });

        var profiles = _manager.GetClientProfiles(realm.Id);

        Assert.Equal(2, profiles.Count);
        Assert.True(profiles.ContainsKey("client-1"));
        Assert.True(profiles.ContainsKey("client-2"));
    }

    [Fact]
    public void GetClientProfiles_ReturnsCopy_NotLiveReference()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        _manager.AddClient(realm.Id, "client-1", new ClientProfile { Name = "Alice" });

        var profiles = _manager.GetClientProfiles(realm.Id);

        // Mutating the returned dictionary must not affect internal state.
        profiles["injected"] = new ClientProfile { Name = "Injected" };

        var profilesAgain = _manager.GetClientProfiles(realm.Id);
        Assert.False(profilesAgain.ContainsKey("injected"));
    }

    [Fact]
    public void GetClientProfiles_ReturnsEmptyDict_ForInvalidRealmId()
    {
        var profiles = _manager.GetClientProfiles(Guid.NewGuid().ToString());

        Assert.NotNull(profiles);
        Assert.Empty(profiles);
    }

    [Fact]
    public void GetClientProfiles_ReturnsEmptyDict_WhenNoProfilesAdded()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        // Add client without profile
        _manager.AddClient(realm.Id, "client-1");

        var profiles = _manager.GetClientProfiles(realm.Id);

        Assert.Empty(profiles);
    }

    // -------------------------------------------------------------------------
    // CleanupEndedRealms
    // -------------------------------------------------------------------------

    [Fact]
    public void CleanupEndedRealms_RemovesEndedRealmPastTtl()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Ended;
        // Force CreatedAt into the distant past so it is beyond any TTL.
        realm.CreatedAt = DateTime.UtcNow.AddHours(-2);

        var removed = _manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(1, removed);
        Assert.Null(_manager.GetById(realm.Id));
        Assert.Null(_manager.GetByJoinCode(realm.JoinCode));
    }

    [Fact]
    public void CleanupEndedRealms_RemovesJoinCodeEntry()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        var joinCode = realm.JoinCode;
        realm.Status = RealmStatus.Ended;
        realm.CreatedAt = DateTime.UtcNow.AddHours(-2);

        _manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Null(_manager.GetByJoinCode(joinCode));
    }

    [Fact]
    public void CleanupEndedRealms_DoesNotRemoveActiveRealms()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Started;
        realm.CreatedAt = DateTime.UtcNow.AddHours(-2);

        var removed = _manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(0, removed);
        Assert.NotNull(_manager.GetById(realm.Id));
    }

    [Fact]
    public void CleanupEndedRealms_DoesNotRemoveLobbyRealms()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Lobby;
        realm.CreatedAt = DateTime.UtcNow.AddHours(-2);

        var removed = _manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(0, removed);
        Assert.NotNull(_manager.GetById(realm.Id));
    }

    [Fact]
    public void CleanupEndedRealms_DoesNotRemoveEndedRealmWithinTtl()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Ended;
        realm.CreatedAt = DateTime.UtcNow.AddMinutes(-5);

        // TTL is 30 minutes; realm is only 5 minutes old.
        var removed = _manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(0, removed);
        Assert.NotNull(_manager.GetById(realm.Id));
    }

    [Fact]
    public void CleanupEndedRealms_RemovesMultipleEligibleRealms()
    {
        var realm1 = _manager.CreateRealm(RealmMode.Competition);
        realm1.Status = RealmStatus.Ended;
        realm1.CreatedAt = DateTime.UtcNow.AddHours(-1);

        var realm2 = _manager.CreateRealm(RealmMode.Dungeon);
        realm2.Status = RealmStatus.Ended;
        realm2.CreatedAt = DateTime.UtcNow.AddHours(-1);

        var active = _manager.CreateRealm(RealmMode.Social);
        active.Status = RealmStatus.Started;

        var removed = _manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(2, removed);
        Assert.Null(_manager.GetById(realm1.Id));
        Assert.Null(_manager.GetById(realm2.Id));
        Assert.NotNull(_manager.GetById(active.Id));
    }

    [Fact]
    public void CleanupEndedRealms_ReturnsZero_WhenNoRealmsExist()
    {
        var removed = _manager.CleanupEndedRealms(TimeSpan.FromMinutes(30));

        Assert.Equal(0, removed);
    }

    [Fact]
    public void CleanupEndedRealms_DoesNotRemoveEndedRealmCreatedExactlyAtCutoff()
    {
        // The cutoff is DateTime.UtcNow - ttl. The implementation uses strict <
        // (realm.CreatedAt < cutoff), so a realm created exactly at the cutoff
        // boundary should NOT be removed.
        var ttl = TimeSpan.FromMinutes(30);
        var realm = _manager.CreateRealm(RealmMode.Competition);
        realm.Status = RealmStatus.Ended;
        // Set CreatedAt to exactly the cutoff moment (not older).
        realm.CreatedAt = DateTime.UtcNow - ttl;

        var removed = _manager.CleanupEndedRealms(ttl);

        // Realm is at the boundary (== cutoff), not strictly before it.
        Assert.Equal(0, removed);
        Assert.NotNull(_manager.GetById(realm.Id));
    }

    // -------------------------------------------------------------------------
    // Thread safety
    // -------------------------------------------------------------------------

    [Fact]
    public void AddAndRemoveClient_ConcurrentCalls_DoNotThrow()
    {
        var realm = _manager.CreateRealm(RealmMode.Competition);
        const int threadCount = 20;

        var tasks = Enumerable.Range(0, threadCount).Select(i => Task.Run(() =>
        {
            var clientId = $"client-{i}";
            _manager.AddClient(realm.Id, clientId, new ClientProfile { Name = $"User{i}" });
            _manager.RemoveClient(realm.Id, clientId);
        })).ToArray();

        var exception = Record.Exception(() => Task.WaitAll(tasks));

        Assert.Null(exception);
    }

    [Fact]
    public void CreateRealm_ConcurrentCreation_AllRealmsStoredWithUniqueIds()
    {
        const int count = 50;
        var realms = new System.Collections.Concurrent.ConcurrentBag<Realm>();

        var tasks = Enumerable.Range(0, count).Select(_ => Task.Run(() =>
        {
            var realm = _manager.CreateRealm(RealmMode.Competition);
            realms.Add(realm);
        })).ToArray();

        Task.WaitAll(tasks);

        var ids = realms.Select(r => r.Id).ToHashSet();
        Assert.Equal(count, ids.Count);
    }
}
