using System.Collections.Concurrent;
using PulseRealm.Server.Models;

namespace PulseRealm.Server.Services;

/// <summary>
/// Accumulates per-client wearable stats during a realm so the server can
/// build a complete RealmSummary for any end/leave scenario.
/// </summary>
public class RealmStatsTracker
{
    private static readonly ConcurrentDictionary<string, ClientStats> _stats = new();

    private const double StrideFactor = 0.415;
    private const double CadenceEmaAlpha = 0.3;

    /// <summary>Key that scopes stats to a specific client within a specific realm.</summary>
    private static string Key(string realmId, string clientId) => $"{realmId}:{clientId}";

    /// <summary>
    /// Records a wearable data sample for a client. Called from SendWearableData
    /// after speed has been computed. Only records when the realm is started.
    /// </summary>
    public void Record(string realmId, string clientId, int steps, int heartRate, double speedKmh, ClientProfile? profile)
    {
        var key = Key(realmId, clientId);
        var stats = _stats.GetOrAdd(key, _ => new ClientStats());

        lock (stats)
        {
            var now = DateTime.UtcNow;

            stats.MaxSteps = Math.Max(stats.MaxSteps, steps);

            if (heartRate > 0)
            {
                stats.HrSum += heartRate;
                stats.HrCount++;
                stats.MaxHr = Math.Max(stats.MaxHr, heartRate);

                // Zone tracking
                var maxHr = profile?.MaxHr is > 0 ? profile.MaxHr
                    : profile?.Age is >= 5 and <= 120 ? 220 - profile.Age : 190;
                var pct = (double)heartRate / maxHr;
                var b = profile?.ZoneBounds is { Length: 4 } zb ? zb : new[] { 0.57, 0.63, 0.76, 0.89 };
                var zone = pct < b[0] ? 1 : pct < b[1] ? 2 : pct < b[2] ? 3 : pct < b[3] ? 4 : 5;
                var zoneKey = zone.ToString();
                stats.TimeInZone.TryGetValue(zoneKey, out var zoneSecs);

                // Estimate seconds in zone based on time since last recording
                var elapsed = stats.LastRecordedAt != default
                    ? (now - stats.LastRecordedAt).TotalSeconds
                    : 0;
                if (elapsed is > 0 and <= 5)
                {
                    stats.TimeInZone[zoneKey] = zoneSecs + (int)Math.Round(elapsed);
                    stats.ActivePeriodSeconds += elapsed;

                    // Calories: gender-neutral formula from Keytel et al. (2005)
                    if (profile?.WeightKg > 0 && profile?.Age > 0)
                    {
                        var calsPerMin = (-37.549 + 0.5391 * heartRate + 0.1626 * profile.WeightKg + 0.1379 * profile.Age) / 4.184;
                        stats.CaloriesBurned += Math.Max(0, calsPerMin / 60.0) * elapsed;
                    }
                }
            }

            if (speedKmh > 0)
            {
                stats.SpeedSum += speedKmh;
                stats.SpeedCount++;
                stats.PeakSpeedKmh = Math.Max(stats.PeakSpeedKmh, speedKmh);

                // Accumulate elevation gain: distance in this segment × incline
                if (stats.CurrentInclinePercent > 0 && stats.LastRecordedAt != default)
                {
                    var segmentSeconds = (now - stats.LastRecordedAt).TotalSeconds;
                    if (segmentSeconds is > 0 and <= 5)
                    {
                        var segmentDistanceMeters = speedKmh / 3.6 * segmentSeconds;
                        stats.ElevationGainMeters += segmentDistanceMeters * (stats.CurrentInclinePercent / 100.0);
                    }
                }
            }

            // Cadence from step deltas with EMA smoothing
            if (stats.PrevSteps > 0 && steps > stats.PrevSteps && stats.PrevStepsTime != default)
            {
                var dtMinutes = (now - stats.PrevStepsTime).TotalMinutes;
                if (dtMinutes > 0)
                {
                    var rawCadence = (steps - stats.PrevSteps) / dtMinutes;
                    if (rawCadence is > 0 and < 300)
                    {
                        // Pre-clamp outliers before EMA
                        var maxChange = Math.Max(30.0, stats.SmoothedCadence * 0.5);
                        var clamped = Math.Clamp(rawCadence, stats.SmoothedCadence - maxChange, stats.SmoothedCadence + maxChange);

                        // Apply EMA (first sample seeds directly)
                        stats.SmoothedCadence = stats.SmoothedCadence > 0
                            ? CadenceEmaAlpha * clamped + (1 - CadenceEmaAlpha) * stats.SmoothedCadence
                            : rawCadence;

                        stats.CadenceSum += stats.SmoothedCadence;
                        stats.CadenceCount++;
                    }
                }
            }
            stats.PrevSteps = steps;
            stats.PrevStepsTime = now;
            stats.LastRecordedAt = now;
        }
    }

    /// <summary>
    /// Builds a complete RealmSummary from tracked stats for all clients in a realm.
    /// </summary>
    public RealmSummary BuildSummary(Realm realm)
    {
        var profiles = realm.WithLock(r => new Dictionary<string, ClientProfile>(r.ClientProfiles));
        var knownClientIds = realm.WithLock(r => new List<string>(r.KnownClientIds));
        var duration = (DateTime.UtcNow - realm.CreatedAt).TotalSeconds;

        var clientSummaries = new List<ClientSummaryDto>();
        long totalHrSum = 0;
        int totalHrCount = 0;
        int globalMaxHr = 0;

        foreach (var clientId in knownClientIds)
        {
            var key = Key(realm.Id, clientId);
            if (!_stats.TryGetValue(key, out var stats)) continue;

            profiles.TryGetValue(clientId, out var profile);
            var factor = profile?.StrideFactor > 0 ? profile.StrideFactor : StrideFactor;
            var heightCm = profile?.HeightCm > 0 ? profile.HeightCm : 170.0;
            var strideM = heightCm * factor / 100.0;

            ClientSummaryDto cs;
            lock (stats)
            {
                var distance = stats.MaxSteps * strideM;
                cs = new ClientSummaryDto
                {
                    ClientId = clientId,
                    Name = profile?.Name ?? "",
                    Steps = stats.MaxSteps,
                    DistanceMeters = Math.Round(distance, 1),
                    AverageHeartRate = stats.HrCount > 0 ? (int)Math.Round((double)stats.HrSum / stats.HrCount) : 0,
                    MaxHeartRate = stats.MaxHr,
                    AvgCadenceSpm = stats.CadenceCount > 0 ? Math.Round((double)stats.CadenceSum / stats.CadenceCount) : 0,
                    CaloriesBurned = Math.Round(stats.CaloriesBurned),
                    AverageSpeedKmh = stats.SpeedCount > 0 ? Math.Round(stats.SpeedSum / stats.SpeedCount, 1) : 0,
                    PeakSpeedKmh = Math.Round(stats.PeakSpeedKmh, 1),
                    TimeInZone = new Dictionary<string, int>(stats.TimeInZone),
                    ElevationGainMeters = Math.Round(stats.ElevationGainMeters, 1),
                };

                totalHrSum += stats.HrSum;
                totalHrCount += stats.HrCount;
                globalMaxHr = Math.Max(globalMaxHr, stats.MaxHr);
            }

            clientSummaries.Add(cs);
        }

        var totalSteps = clientSummaries.Sum(c => c.Steps);
        var totalDistance = clientSummaries.Sum(c => c.DistanceMeters);
        var totalElevation = clientSummaries.Sum(c => c.ElevationGainMeters);
        var avgSpeed = clientSummaries.Where(c => c.AverageSpeedKmh > 0).Select(c => c.AverageSpeedKmh).DefaultIfEmpty(0).Average();
        var peakSpeed = clientSummaries.Select(c => c.PeakSpeedKmh).DefaultIfEmpty(0).Max();
        var avgCadence = clientSummaries.Where(c => c.AvgCadenceSpm > 0).Select(c => c.AvgCadenceSpm).DefaultIfEmpty(0).Average();
        var totalCalories = clientSummaries.Sum(c => c.CaloriesBurned);
        var maxActivePeriod = 0.0;
        foreach (var cid in knownClientIds)
        {
            if (_stats.TryGetValue(Key(realm.Id, cid), out var s))
            {
                lock (s)
                {
                    maxActivePeriod = Math.Max(maxActivePeriod, s.ActivePeriodSeconds);
                }
            }
        }

        // Merge zone times across clients
        var mergedZones = new Dictionary<string, int>();
        foreach (var cs in clientSummaries)
        {
            foreach (var (zone, secs) in cs.TimeInZone)
            {
                mergedZones.TryGetValue(zone, out var existing);
                mergedZones[zone] = Math.Max(existing, secs);
            }
        }

        return new RealmSummary
        {
            DurationSeconds = duration,
            TotalDistanceMeters = Math.Round(totalDistance, 1),
            TotalSteps = totalSteps,
            AverageHeartRate = totalHrCount > 0 ? (int)Math.Round((double)totalHrSum / totalHrCount) : 0,
            MaxHeartRate = globalMaxHr,
            AverageSpeedKmh = Math.Round(avgSpeed, 1),
            PeakSpeedKmh = Math.Round(peakSpeed, 1),
            AvgCadenceSpm = Math.Round(avgCadence),
            CaloriesBurned = Math.Round(totalCalories),
            TimeInZone = mergedZones,
            ActivePeriodSeconds = Math.Round(maxActivePeriod),
            ParticipantCount = knownClientIds.Count,
            ElevationGainMeters = Math.Round(totalElevation, 1),
            ClientSummaries = clientSummaries,
        };
    }

    /// <summary>
    /// Builds a summary for a single client leaving mid-realm.
    /// </summary>
    public RealmSummary BuildSummaryForClient(Realm realm, string clientId)
    {
        var profile = realm.WithLock(r =>
        {
            r.ClientProfiles.TryGetValue(clientId, out var p);
            return p;
        });

        var key = Key(realm.Id, clientId);
        if (!_stats.TryGetValue(key, out var stats))
        {
            return new RealmSummary
            {
                DurationSeconds = (DateTime.UtcNow - realm.CreatedAt).TotalSeconds,
                ParticipantCount = realm.WithLock(r => r.ConnectedClientIds.Count),
            };
        }

        var factor = profile?.StrideFactor > 0 ? profile.StrideFactor : StrideFactor;
        var heightCm = profile?.HeightCm > 0 ? profile.HeightCm : 170.0;
        var strideM = heightCm * factor / 100.0;
        var duration = (DateTime.UtcNow - realm.CreatedAt).TotalSeconds;

        lock (stats)
        {
            var distance = stats.MaxSteps * strideM;
            var elevation = Math.Round(stats.ElevationGainMeters, 1);
            return new RealmSummary
            {
                DurationSeconds = duration,
                TotalDistanceMeters = Math.Round(distance, 1),
                TotalSteps = stats.MaxSteps,
                AverageHeartRate = stats.HrCount > 0 ? (int)Math.Round((double)stats.HrSum / stats.HrCount) : 0,
                MaxHeartRate = stats.MaxHr,
                AverageSpeedKmh = stats.SpeedCount > 0 ? Math.Round(stats.SpeedSum / stats.SpeedCount, 1) : 0,
                PeakSpeedKmh = Math.Round(stats.PeakSpeedKmh, 1),
                AvgCadenceSpm = stats.CadenceCount > 0 ? Math.Round((double)stats.CadenceSum / stats.CadenceCount) : 0,
                CaloriesBurned = Math.Round(stats.CaloriesBurned),
                TimeInZone = new Dictionary<string, int>(stats.TimeInZone),
                ActivePeriodSeconds = Math.Round(stats.ActivePeriodSeconds),
                ParticipantCount = realm.WithLock(r => r.ConnectedClientIds.Count),
                ElevationGainMeters = elevation,
                ClientSummaries = new List<ClientSummaryDto>
                {
                    new()
                    {
                        ClientId = clientId,
                        Name = profile?.Name ?? "",
                        Steps = stats.MaxSteps,
                        DistanceMeters = Math.Round(distance, 1),
                        AverageHeartRate = stats.HrCount > 0 ? (int)Math.Round((double)stats.HrSum / stats.HrCount) : 0,
                        MaxHeartRate = stats.MaxHr,
                        AvgCadenceSpm = stats.CadenceCount > 0 ? Math.Round((double)stats.CadenceSum / stats.CadenceCount) : 0,
                        CaloriesBurned = Math.Round(stats.CaloriesBurned),
                        AverageSpeedKmh = stats.SpeedCount > 0 ? Math.Round(stats.SpeedSum / stats.SpeedCount, 1) : 0,
                        PeakSpeedKmh = Math.Round(stats.PeakSpeedKmh, 1),
                        TimeInZone = new Dictionary<string, int>(stats.TimeInZone),
                        ElevationGainMeters = elevation,
                    }
                },
            };
        }
    }

    /// <summary>
    /// Updates the current incline for a client. Called when SetIncline is invoked.
    /// </summary>
    public void UpdateIncline(string realmId, string clientId, double inclinePercent)
    {
        var key = Key(realmId, clientId);
        var stats = _stats.GetOrAdd(key, _ => new ClientStats());
        lock (stats)
        {
            stats.CurrentInclinePercent = inclinePercent;
        }
    }

    /// <summary>Removes all tracked stats for a realm.</summary>
    public void CleanupRealm(string realmId, IEnumerable<string> clientIds)
    {
        foreach (var clientId in clientIds)
        {
            _stats.TryRemove(Key(realmId, clientId), out _);
        }
    }

    private class ClientStats
    {
        public int MaxSteps;
        public long HrSum;
        public int HrCount;
        public int MaxHr;
        public double SpeedSum;
        public int SpeedCount;
        public double PeakSpeedKmh;
        public double ActivePeriodSeconds;
        public Dictionary<string, int> TimeInZone = new();
        public double CadenceSum;
        public int CadenceCount;
        public double SmoothedCadence;
        public double CaloriesBurned;
        public int PrevSteps;
        public DateTime PrevStepsTime;
        public DateTime LastRecordedAt;
        public double CurrentInclinePercent;
        public double ElevationGainMeters;
    }
}
