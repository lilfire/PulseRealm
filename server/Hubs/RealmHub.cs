using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Hubs;

public class RealmHub : Hub
{
    private readonly RealmManager _realmManager;

    /// <summary>Tracks the last raw steps and receive time per client for speed and offset calculation.</summary>
    private static readonly ConcurrentDictionary<string, (int RawSteps, DateTime ReceivedAt)> _lastData = new();

    /// <summary>Maps SignalR connection IDs to (realmId, clientId) for disconnect handling.</summary>
    private static readonly ConcurrentDictionary<string, (string RealmId, string ClientId)> _connectionMap = new();

    /// <summary>Step offset per client to handle app restarts where the step counter resets to 0.</summary>
    private static readonly ConcurrentDictionary<string, int> _stepOffsets = new();

    /// <summary>Walking stride-length factor: stride (m) ≈ height (cm) × factor / 100.</summary>
    private const double StrideFactor = 0.415;

    public RealmHub(RealmManager realmManager)
    {
        _realmManager = realmManager;
    }

    /// <summary>
    /// Called by a wearable client to join a realm using a short code.
    /// </summary>
    public async Task JoinRealm(string joinCode, string clientId, ClientProfile? profile = null)
    {
        if (profile is not null)
        {
            if (string.IsNullOrWhiteSpace(profile.Name))
                throw new HubException("Name is cannot be blank or empty");
            if (!string.IsNullOrWhiteSpace(profile.Name) && profile.Name.Length > 50)
                throw new HubException("Name is too long (max 50 characters).");
            if (profile.HeightCm is < 50 or > 250)
                throw new HubException("Height must be between 50 and 250 cm.");
            if (profile.WeightKg is < 10 or > 500)
                throw new HubException("Weight must be between 10 and 500 kg.");
        }

        var realm = _realmManager.GetByJoinCode(joinCode);
        if (realm is null)
        {
            throw new HubException("Invalid join code.");
        }

        // Read realm state under lock for thread-safe checks
        var (status, isKnown, connectedCount, maxClients) = realm.WithLock(r => (
            r.Status,
            r.KnownClientIds.Contains(clientId),
            r.ConnectedClientIds.Count,
            r.MaxClients
        ));

        if (status == RealmStatus.Ended)
        {
            throw new HubException("Realm has ended.");
        }

        if (status == RealmStatus.Started && !isKnown)
        {
            throw new HubException("Realm has already started.");
        }

        var isReconnect = status == RealmStatus.Started;

        if (!isReconnect && connectedCount >= maxClients)
        {
            throw new HubException($"Realm is full ({maxClients}/{maxClients} players).");
        }

        _realmManager.AddClient(realm.Id, clientId, profile);
        _connectionMap[Context.ConnectionId] = (realm.Id, clientId);
        await Groups.AddToGroupAsync(Context.ConnectionId, realm.Id);

        var joinedProfile = profile ?? new ClientProfile { ClientId = clientId };
        joinedProfile.ClientId = clientId;
        await Clients.Group(realm.Id).SendAsync("ClientJoined", joinedProfile);

        // If reconnecting to a started realm, send the current state so the client can catch up
        if (isReconnect)
        {
            await Clients.Caller.SendAsync("RealmStarted", realm.RealmConfig);
        }
    }

    /// <summary>
    /// Called by the dashboard to start the realm. No new clients can join after this.
    /// Optionally accepts a JSON config blob for mode-specific settings.
    /// </summary>
    public async Task StartRealm(string realmId, string? config = null)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
        {
            await Clients.Caller.SendAsync("Error", "Realm not found.");
            return;
        }

        realm.WithLock(r =>
        {
            r.Status = RealmStatus.Started;
            r.RealmConfig = config;
        });
        await Clients.Group(realmId).SendAsync("RealmStarted", config);
    }

    /// <summary>
    /// Called by a wearable client to stream live data (steps, heart rate).
    /// The server forwards it to the dashboard in the same realm group.
    /// </summary>
    public async Task SendWearableData(string realmId, WearableData data)
    {
        var rawSteps = data.Steps;

        // Detect client restart: if incoming steps are lower than the last known raw value,
        // the client's counter reset — accumulate the previous raw total as an offset.
        var previous = _lastData.GetValueOrDefault(data.ClientId);
        if (previous.RawSteps > 0 && rawSteps < previous.RawSteps)
        {
            _stepOffsets.AddOrUpdate(data.ClientId, previous.RawSteps, (_, existing) => existing + previous.RawSteps);
        }

        data.SpeedKmh = EstimateSpeed(realmId, rawSteps, data.ClientId);

        // Apply offset to outgoing steps
        data.Steps = rawSteps + _stepOffsets.GetValueOrDefault(data.ClientId, 0);

        // Forward enriched data to all dashboard listeners in this realm
        await Clients.Group(realmId).SendAsync("WearableDataReceived", data);
    }

    /// <summary>
    /// Estimates current speed (km/h) from step deltas and the client's height.
    /// Stride length ≈ heightCm × 0.415 / 100 (standard biomechanics approximation).
    /// </summary>
    private double EstimateSpeed(string realmId, int rawSteps, string clientId)
    {
        var now = DateTime.UtcNow;
        var previous = _lastData.GetValueOrDefault(clientId);
        _lastData[clientId] = (rawSteps, now);

        if (previous.RawSteps == 0 && previous.ReceivedAt == default)
            return 0;

        var stepDelta = rawSteps - previous.RawSteps;
        if (stepDelta <= 0)
            return 0;

        // Use server-side receive timestamps for reliable time deltas
        var timeDelta = (now - previous.ReceivedAt).TotalSeconds;
        if (timeDelta < 0.1)
            return 0;

        var profile = _realmManager.GetClientProfile(realmId, clientId);
        var heightCm = profile?.HeightCm > 0 ? profile.HeightCm : 170.0; // fallback to average

        var strideLengthM = heightCm * StrideFactor / 100.0;
        var distanceM = stepDelta * strideLengthM;
        var speedKmh = distanceM / timeDelta * 3.6;

        // Clamp to a reasonable treadmill range (0–25 km/h)
        return Math.Clamp(Math.Round(speedKmh, 1), 0, 25);
    }

    /// <summary>
    /// Called by the dashboard to notify a client they have been eliminated.
    /// </summary>
    public async Task NotifyEliminated(string realmId, string clientId)
    {
        await Clients.Group(realmId).SendAsync("ClientEliminated", clientId);
    }

    /// <summary>
    /// Called by the dashboard to end a realm. Broadcasts a summary to all clients.
    /// </summary>
    public async Task EndRealm(string realmId, RealmSummary summary)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
        {
            await Clients.Caller.SendAsync("Error", "Realm not found.");
            return;
        }

        realm.WithLock(r => r.Status = RealmStatus.Ended);
        summary.DurationSeconds = (DateTime.UtcNow - realm.CreatedAt).TotalSeconds;

        // Clean up hub state for all clients that were in this realm
        CleanupRealmHubState(realmId);

        await Clients.Group(realmId).SendAsync("RealmEnded", summary);
    }

    /// <summary>
    /// Called by the dashboard to join a realm's broadcast group.
    /// Returns the current realm state so late-joining viewers can catch up.
    /// </summary>
    public async Task JoinRealmAsDashboard(string realmId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, realmId);

        var realm = _realmManager.GetById(realmId);
        object state;
        if (realm is not null)
        {
            state = realm.WithLock(r => new
            {
                RealmId = realmId,
                Status = r.Status.ToString(),
                ConnectedClientIds = new List<string>(r.ConnectedClientIds),
                ClientProfiles = new Dictionary<string, ClientProfile>(r.ClientProfiles),
                Config = r.RealmConfig,
            });
        }
        else
        {
            state = new
            {
                RealmId = realmId,
                Status = "Lobby",
                ConnectedClientIds = new List<string>(),
                ClientProfiles = new Dictionary<string, ClientProfile>(),
                Config = (string?)null,
            };
        }
        await Clients.Caller.SendAsync("JoinedRealm", state);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_connectionMap.TryRemove(Context.ConnectionId, out var mapping))
        {
            var realm = _realmManager.GetById(mapping.RealmId);
            if (realm is not null && realm.Status == RealmStatus.Started)
            {
                // Started realm: only remove from connected list, keep profile and speed data for reconnect
                realm.WithLock(r => r.ConnectedClientIds.Remove(mapping.ClientId));
            }
            else
            {
                _realmManager.RemoveClient(mapping.RealmId, mapping.ClientId);
                _lastData.TryRemove(mapping.ClientId, out _);
                _stepOffsets.TryRemove(mapping.ClientId, out _);
            }
            await Clients.Group(mapping.RealmId).SendAsync("ClientLeft", mapping.ClientId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Removes hub-level state (_lastData, _stepOffsets) for all clients associated with a realm.
    /// </summary>
    private static void CleanupRealmHubState(string realmId)
    {
        foreach (var kvp in _connectionMap)
        {
            if (kvp.Value.RealmId == realmId)
            {
                _lastData.TryRemove(kvp.Value.ClientId, out _);
                _stepOffsets.TryRemove(kvp.Value.ClientId, out _);
            }
        }
    }
}
