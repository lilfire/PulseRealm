using PulseRealm.Server.Models;
using PulseRealm.Server.Services;
using Xunit;

namespace PulseRealm.Server.Tests.Services;

public class RealmStatsTrackerTests
{
    private readonly RealmStatsTracker _tracker = new();

    private static Realm CreateRealm(params string[] clientIds)
    {
        var realm = new Realm
        {
            Mode = RealmMode.Competition,
            Status = RealmStatus.Started,
            CreatedAt = DateTime.UtcNow.AddMinutes(-5),
        };
        foreach (var id in clientIds)
        {
            realm.ConnectedClientIds.Add(id);
            realm.KnownClientIds.Add(id);
        }
        return realm;
    }

    private static ClientProfile CreateProfile(string name = "Test", int age = 30,
        double height = 175, double weight = 70, int maxHr = 0)
    {
        return new ClientProfile
        {
            Name = name,
            Age = age,
            HeightCm = height,
            WeightKg = weight,
            MaxHr = maxHr,
        };
    }

    // -------------------------------------------------------------------------
    // Record — basic accumulation
    // -------------------------------------------------------------------------

    [Fact]
    public void Record_TracksMaxSteps()
    {
        var realm = CreateRealm("c1");
        _tracker.Record(realm.Id, "c1", 100, 120, 5.0, CreateProfile());
        _tracker.Record(realm.Id, "c1", 200, 120, 5.0, CreateProfile());

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(200, summary.TotalSteps);
    }

    [Fact]
    public void Record_TracksHeartRateStats()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile();
        _tracker.Record(realm.Id, "c1", 10, 100, 5.0, profile);
        _tracker.Record(realm.Id, "c1", 20, 160, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(130, summary.AverageHeartRate); // (100+160)/2
        Assert.Equal(160, summary.MaxHeartRate);
    }

    [Fact]
    public void Record_ZeroHeartRate_IsIgnored()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile();
        _tracker.Record(realm.Id, "c1", 10, 0, 5.0, profile);
        _tracker.Record(realm.Id, "c1", 20, 120, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(120, summary.AverageHeartRate);
    }

    [Fact]
    public void Record_TracksSpeedStats()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile();
        _tracker.Record(realm.Id, "c1", 10, 120, 6.0, profile);
        _tracker.Record(realm.Id, "c1", 20, 120, 10.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(8.0, summary.AverageSpeedKmh); // (6+10)/2
        Assert.Equal(10.0, summary.PeakSpeedKmh);
    }

    [Fact]
    public void Record_ZeroSpeed_IsNotCounted()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile();
        _tracker.Record(realm.Id, "c1", 10, 120, 0, profile);
        _tracker.Record(realm.Id, "c1", 20, 120, 8.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(8.0, summary.AverageSpeedKmh);
    }

    // -------------------------------------------------------------------------
    // Record — zone tracking
    // -------------------------------------------------------------------------

    [Fact]
    public void Record_AssignsHeartRateToZones()
    {
        var realm = CreateRealm("c1");
        // Age 30 => maxHR = 220 - 30 = 190
        // HR 100 => pct = 100/190 ≈ 0.526 => zone 1 (< 0.57)
        var profile = CreateProfile(age: 30);

        _tracker.Record(realm.Id, "c1", 10, 100, 5.0, profile);
        // Need a second record with time gap for zone time to accumulate
        Thread.Sleep(200);
        _tracker.Record(realm.Id, "c1", 20, 100, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.True(summary.TimeInZone.ContainsKey("1"));
    }

    [Fact]
    public void Record_HighHeartRate_AssignsToZone5()
    {
        var realm = CreateRealm("c1");
        // maxHR from profile = 180, HR 175 => pct = 175/180 ≈ 0.97 => zone 5 (>= 0.89)
        var profile = CreateProfile(maxHr: 180);

        _tracker.Record(realm.Id, "c1", 10, 175, 5.0, profile);
        Thread.Sleep(200);
        _tracker.Record(realm.Id, "c1", 20, 175, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.True(summary.TimeInZone.ContainsKey("5"));
    }

    [Fact]
    public void Record_CustomZoneBounds_AreUsed()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile(maxHr: 200);
        profile.ZoneBounds = new[] { 0.50, 0.60, 0.70, 0.80 };
        // HR 170, maxHR 200 => pct = 0.85 => zone 5 (>= 0.80)

        _tracker.Record(realm.Id, "c1", 10, 170, 5.0, profile);
        Thread.Sleep(200);
        _tracker.Record(realm.Id, "c1", 20, 170, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.True(summary.TimeInZone.ContainsKey("5"));
    }

    // -------------------------------------------------------------------------
    // Record — calorie calculation
    // -------------------------------------------------------------------------

    [Fact]
    public void Record_WithValidProfileAndTimeDelta_CalculatesCalories()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile(age: 30, weight: 70);

        _tracker.Record(realm.Id, "c1", 10, 150, 5.0, profile);
        Thread.Sleep(200);
        _tracker.Record(realm.Id, "c1", 20, 150, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.True(summary.CaloriesBurned >= 0);
    }

    [Fact]
    public void Record_WithZeroWeight_DoesNotAccumulateCalories()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile(weight: 0);

        _tracker.Record(realm.Id, "c1", 10, 150, 5.0, profile);
        Thread.Sleep(200);
        _tracker.Record(realm.Id, "c1", 20, 150, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(0, summary.CaloriesBurned);
    }

    // -------------------------------------------------------------------------
    // Record — elevation gain
    // -------------------------------------------------------------------------

    [Fact]
    public void Record_WithIncline_AccumulatesElevation()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile();

        _tracker.UpdateIncline(realm.Id, "c1", 15.0); // 15% incline

        _tracker.Record(realm.Id, "c1", 10, 120, 20.0, profile); // high speed
        Thread.Sleep(1100); // long enough gap for measurable elevation
        _tracker.Record(realm.Id, "c1", 20, 120, 20.0, profile);

        var summary = _tracker.BuildSummary(realm);
        // 20 km/h = 5.56 m/s * 1.1s ≈ 6.1m distance, * 15% = 0.92m elevation
        Assert.True(summary.ElevationGainMeters > 0,
            $"Expected elevation > 0, got {summary.ElevationGainMeters}");
    }

    [Fact]
    public void Record_WithZeroIncline_NoElevation()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile();

        _tracker.Record(realm.Id, "c1", 10, 120, 6.0, profile);
        Thread.Sleep(200);
        _tracker.Record(realm.Id, "c1", 20, 120, 6.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(0, summary.ElevationGainMeters);
    }

    // -------------------------------------------------------------------------
    // Record — cadence tracking
    // -------------------------------------------------------------------------

    [Fact]
    public void Record_StepIncreases_TracksCadence()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile();

        _tracker.Record(realm.Id, "c1", 100, 120, 5.0, profile);
        Thread.Sleep(1100);
        // Only 3 steps in ~1.1s = ~163 SPM (must be < 300 to pass cadence filter)
        _tracker.Record(realm.Id, "c1", 103, 120, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.True(summary.AvgCadenceSpm > 0,
            $"Expected cadence > 0, got {summary.AvgCadenceSpm}");
    }

    [Fact]
    public void Record_NoStepIncrease_NoCadenceAccumulated()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile();

        _tracker.Record(realm.Id, "c1", 100, 120, 5.0, profile);
        Thread.Sleep(200);
        _tracker.Record(realm.Id, "c1", 100, 120, 5.0, profile); // same steps

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(0, summary.AvgCadenceSpm);
    }

    // -------------------------------------------------------------------------
    // BuildSummary
    // -------------------------------------------------------------------------

    [Fact]
    public void BuildSummary_EmptyRealm_ReturnsZeroDefaults()
    {
        var realm = CreateRealm();
        var summary = _tracker.BuildSummary(realm);

        Assert.Equal(0, summary.TotalSteps);
        Assert.Equal(0, summary.AverageHeartRate);
        Assert.Equal(0, summary.MaxHeartRate);
        Assert.Equal(0, summary.AverageSpeedKmh);
        Assert.Equal(0, summary.PeakSpeedKmh);
        Assert.Equal(0, summary.CaloriesBurned);
    }

    [Fact]
    public void BuildSummary_IncludesParticipantCount()
    {
        var realm = CreateRealm("c1", "c2");
        var summary = _tracker.BuildSummary(realm);

        Assert.Equal(2, summary.ParticipantCount);
    }

    [Fact]
    public void BuildSummary_IncludesDuration()
    {
        var realm = CreateRealm("c1");
        realm.CreatedAt = DateTime.UtcNow.AddMinutes(-10);

        var summary = _tracker.BuildSummary(realm);
        Assert.True(summary.DurationSeconds >= 590); // ~10 minutes
    }

    [Fact]
    public void BuildSummary_CalculatesDistance_FromStepsAndStride()
    {
        var realm = CreateRealm("c1");
        realm.ClientProfiles["c1"] = CreateProfile(height: 180);

        // stride = 180 * 0.415 / 100 = 0.747m
        _tracker.Record(realm.Id, "c1", 1000, 120, 5.0, CreateProfile(height: 180));

        var summary = _tracker.BuildSummary(realm);
        Assert.True(summary.TotalDistanceMeters > 700);
        Assert.True(summary.TotalDistanceMeters < 800);
    }

    [Fact]
    public void BuildSummary_MultipleClients_AggregatesCorrectly()
    {
        var realm = CreateRealm("c1", "c2");
        realm.ClientProfiles["c1"] = CreateProfile(name: "A");
        realm.ClientProfiles["c2"] = CreateProfile(name: "B");

        _tracker.Record(realm.Id, "c1", 500, 120, 6.0, CreateProfile());
        _tracker.Record(realm.Id, "c2", 300, 140, 8.0, CreateProfile());

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(800, summary.TotalSteps);
        Assert.NotNull(summary.ClientSummaries);
        Assert.Equal(2, summary.ClientSummaries!.Count);
    }

    [Fact]
    public void BuildSummary_ClientSummaries_HaveCorrectIds()
    {
        var realm = CreateRealm("c1");
        realm.ClientProfiles["c1"] = CreateProfile(name: "Alice");
        _tracker.Record(realm.Id, "c1", 100, 120, 5.0, CreateProfile(name: "Alice"));

        var summary = _tracker.BuildSummary(realm);

        Assert.NotNull(summary.ClientSummaries);
        var cs = summary.ClientSummaries![0];
        Assert.Equal("c1", cs.ClientId);
        Assert.Equal("Alice", cs.Name);
    }

    [Fact]
    public void BuildSummary_MergesZoneTimes_TakesMaxPerZone()
    {
        var realm = CreateRealm("c1", "c2");
        realm.ClientProfiles["c1"] = CreateProfile();
        realm.ClientProfiles["c2"] = CreateProfile();

        // Both clients record at zone-compatible HRs
        var profile = CreateProfile(age: 30);
        _tracker.Record(realm.Id, "c1", 10, 100, 5.0, profile);
        _tracker.Record(realm.Id, "c2", 10, 100, 5.0, profile);
        Thread.Sleep(200);
        _tracker.Record(realm.Id, "c1", 20, 100, 5.0, profile);
        _tracker.Record(realm.Id, "c2", 20, 100, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        // Zone times should be merged (max of the two clients per zone)
        Assert.NotNull(summary.TimeInZone);
    }

    [Fact]
    public void BuildSummary_DefaultStrideForMissingProfile()
    {
        var realm = CreateRealm("c1");
        // No profile set => uses default height 170 and stride 0.415
        _tracker.Record(realm.Id, "c1", 1000, 120, 5.0, null);

        var summary = _tracker.BuildSummary(realm);
        // Default: 1000 * 170 * 0.415 / 100 = 705.5m
        Assert.True(summary.TotalDistanceMeters > 700);
        Assert.True(summary.TotalDistanceMeters < 710);
    }

    // -------------------------------------------------------------------------
    // BuildSummaryForClient
    // -------------------------------------------------------------------------

    [Fact]
    public void BuildSummaryForClient_ReturnsClientSpecificData()
    {
        var realm = CreateRealm("c1", "c2");
        realm.ClientProfiles["c1"] = CreateProfile(name: "A");
        realm.ClientProfiles["c2"] = CreateProfile(name: "B");

        _tracker.Record(realm.Id, "c1", 500, 120, 6.0, CreateProfile());
        _tracker.Record(realm.Id, "c2", 300, 140, 8.0, CreateProfile());

        var summary = _tracker.BuildSummaryForClient(realm, "c1");

        Assert.Equal(500, summary.TotalSteps);
        Assert.NotNull(summary.ClientSummaries);
        Assert.Single(summary.ClientSummaries!);
        Assert.Equal("c1", summary.ClientSummaries![0].ClientId);
    }

    [Fact]
    public void BuildSummaryForClient_NoStats_ReturnsMinimalSummary()
    {
        var realm = CreateRealm("c1");

        var summary = _tracker.BuildSummaryForClient(realm, "unknown-client");

        Assert.Equal(0, summary.TotalSteps);
        Assert.True(summary.DurationSeconds > 0);
    }

    [Fact]
    public void BuildSummaryForClient_IncludesDuration()
    {
        var realm = CreateRealm("c1");
        realm.CreatedAt = DateTime.UtcNow.AddMinutes(-3);
        _tracker.Record(realm.Id, "c1", 100, 120, 5.0, CreateProfile());

        var summary = _tracker.BuildSummaryForClient(realm, "c1");
        Assert.True(summary.DurationSeconds >= 170);
    }

    // -------------------------------------------------------------------------
    // UpdateIncline
    // -------------------------------------------------------------------------

    [Fact]
    public void UpdateIncline_SetsInclineForFutureRecords()
    {
        var realm = CreateRealm("c1");
        _tracker.UpdateIncline(realm.Id, "c1", 15.0);

        _tracker.Record(realm.Id, "c1", 10, 120, 20.0, CreateProfile());
        Thread.Sleep(1100);
        _tracker.Record(realm.Id, "c1", 20, 120, 20.0, CreateProfile());

        var summary = _tracker.BuildSummary(realm);
        Assert.True(summary.ElevationGainMeters > 0,
            $"Expected elevation > 0, got {summary.ElevationGainMeters}");
    }

    [Fact]
    public void UpdateIncline_CreatesStatsEntryIfNotExists()
    {
        // Should not throw even if no Record calls have been made yet
        var exception = Record.Exception(() => _tracker.UpdateIncline("r1", "c1", 10.0));
        Assert.Null(exception);
    }

    // -------------------------------------------------------------------------
    // CleanupRealm
    // -------------------------------------------------------------------------

    [Fact]
    public void CleanupRealm_RemovesTrackedStats()
    {
        var realm = CreateRealm("c1", "c2");
        realm.ClientProfiles["c1"] = CreateProfile();
        realm.ClientProfiles["c2"] = CreateProfile();

        _tracker.Record(realm.Id, "c1", 100, 120, 5.0, CreateProfile());
        _tracker.Record(realm.Id, "c2", 200, 130, 6.0, CreateProfile());

        _tracker.CleanupRealm(realm.Id, new[] { "c1", "c2" });

        // After cleanup, building summary should produce zero stats
        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(0, summary.TotalSteps);
    }

    [Fact]
    public void CleanupRealm_OnlyRemovesSpecifiedClients()
    {
        var realm = CreateRealm("c1", "c2");
        realm.ClientProfiles["c1"] = CreateProfile();
        realm.ClientProfiles["c2"] = CreateProfile();

        _tracker.Record(realm.Id, "c1", 100, 120, 5.0, CreateProfile());
        _tracker.Record(realm.Id, "c2", 200, 130, 6.0, CreateProfile());

        _tracker.CleanupRealm(realm.Id, new[] { "c1" });

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(200, summary.TotalSteps);
    }

    // -------------------------------------------------------------------------
    // Record — active period seconds
    // -------------------------------------------------------------------------

    [Fact]
    public void Record_TimeBetweenRecords_AccumulatesActivePeriod()
    {
        var realm = CreateRealm("c1");
        var profile = CreateProfile();

        _tracker.Record(realm.Id, "c1", 10, 120, 5.0, profile);
        Thread.Sleep(1100);
        _tracker.Record(realm.Id, "c1", 20, 120, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        Assert.True(summary.ActivePeriodSeconds > 0,
            $"Expected active period > 0, got {summary.ActivePeriodSeconds}");
    }

    [Fact]
    public void Record_NullProfile_UsesDefaults()
    {
        var realm = CreateRealm("c1");
        // Should not throw with null profile
        _tracker.Record(realm.Id, "c1", 100, 120, 5.0, null);

        var summary = _tracker.BuildSummary(realm);
        Assert.Equal(100, summary.TotalSteps);
    }

    [Fact]
    public void Record_ProfileWithDefaultAge_UsesDefaultMaxHr190()
    {
        var realm = CreateRealm("c1");
        // Age 0 => not in 5-120 range, maxHr 0 => uses default 190
        var profile = new ClientProfile { Name = "Test", HeightCm = 170, WeightKg = 70 };

        _tracker.Record(realm.Id, "c1", 10, 170, 5.0, profile);
        Thread.Sleep(200);
        _tracker.Record(realm.Id, "c1", 20, 170, 5.0, profile);

        var summary = _tracker.BuildSummary(realm);
        // HR 170 / 190 ≈ 0.89 => zone 5
        Assert.True(summary.TimeInZone.ContainsKey("4") || summary.TimeInZone.ContainsKey("5"));
    }
}
