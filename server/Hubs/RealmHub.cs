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

    /// <summary>Connection IDs of clients that explicitly called LeaveRealm (intentional leave, not connection loss).</summary>
    private static readonly ConcurrentDictionary<string, bool> _pendingLeaves = new();

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
            if (profile.Age is < 5 or > 120)
                throw new HubException("Age must be between 5 and 120.");
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

        // Clear any stale step data from a previous realm so steps start fresh.
        // On reconnect to the same realm we keep the existing offsets.
        if (!isReconnect)
        {
            _lastData.TryRemove(clientId, out _);
            _stepOffsets.TryRemove(clientId, out _);
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
    /// Called by the host or admin dashboard to kick a client from a realm.
    /// Performs full cleanup and prevents reconnection by removing from KnownClientIds.
    /// </summary>
    public async Task KickClient(string realmId, string clientId)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
        {
            await Clients.Caller.SendAsync("Error", "Realm not found.");
            return;
        }

        // Find the kicked client's connection ID so we can remove them from the SignalR group
        string? kickedConnectionId = null;
        foreach (var kvp in _connectionMap)
        {
            if (kvp.Value.RealmId == realmId && kvp.Value.ClientId == clientId)
            {
                kickedConnectionId = kvp.Key;
                break;
            }
        }

        // Full removal including KnownClientIds so the client cannot reconnect
        _realmManager.RemoveClient(realmId, clientId, removeFromKnown: true);
        _lastData.TryRemove(clientId, out _);
        _stepOffsets.TryRemove(clientId, out _);

        if (kickedConnectionId != null)
        {
            _connectionMap.TryRemove(kickedConnectionId, out _);
            _pendingLeaves[kickedConnectionId] = true; // prevent OnDisconnectedAsync from sending ClientDisconnected
            await Groups.RemoveFromGroupAsync(kickedConnectionId, realmId);
        }

        // Notify the kicked client directly, then notify the rest of the group
        await Clients.Group(realmId).SendAsync("ClientKicked", clientId);
        if (kickedConnectionId != null)
        {
            await Clients.Client(kickedConnectionId).SendAsync("ClientKicked", clientId);
        }

        await TryAutoEndRealm(realmId);
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

        // Clean up hub state for all clients that were in this realm (including disconnected ones)
        var knownClientIds = realm.WithLock(r => new List<string>(r.KnownClientIds));
        CleanupRealmHubState(realmId, knownClientIds);

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

    /// <summary>
    /// Called by a client to intentionally leave a realm.
    /// Marks the connection so that OnDisconnectedAsync performs full cleanup
    /// and notifies others with "ClientLeft" instead of "ClientDisconnected".
    /// </summary>
    public async Task<bool> LeaveRealm()
    {
        _pendingLeaves[Context.ConnectionId] = true;

        if (_connectionMap.TryRemove(Context.ConnectionId, out var mapping))
        {
            var realm = _realmManager.GetById(mapping.RealmId);
            var wasStarted = realm is not null && realm.Status == RealmStatus.Started;

            // If the realm was started, send the leaving client a summary so they see the end screen
            if (wasStarted)
            {
                var summary = new RealmSummary
                {
                    DurationSeconds = (DateTime.UtcNow - realm!.CreatedAt).TotalSeconds,
                    ParticipantCount = realm.WithLock(r => r.ConnectedClientIds.Count),
                };
                await Clients.Caller.SendAsync("RealmEnded", summary);
            }

            _realmManager.RemoveClient(mapping.RealmId, mapping.ClientId, removeFromKnown: true);
            _lastData.TryRemove(mapping.ClientId, out _);
            _stepOffsets.TryRemove(mapping.ClientId, out _);

            await Groups.RemoveFromGroupAsync(Context.ConnectionId, mapping.RealmId);
            await Clients.Group(mapping.RealmId).SendAsync("ClientLeft", mapping.ClientId);
            await TryAutoEndRealm(mapping.RealmId);
            return wasStarted;
        }
        return false;
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // If the client already called LeaveRealm, cleanup is done — just clear the flag.
        if (_pendingLeaves.TryRemove(Context.ConnectionId, out _))
        {
            await base.OnDisconnectedAsync(exception);
            return;
        }

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
            await Clients.Group(mapping.RealmId).SendAsync("ClientDisconnected", mapping.ClientId);
            await TryAutoEndRealm(mapping.RealmId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Checks if a realm has no connected clients left and, if so, ends it automatically.
    /// </summary>
    private async Task TryAutoEndRealm(string realmId)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
            return;

        var shouldEnd = realm.WithLock(r =>
        {
            if (r.Status == RealmStatus.Ended)
                return false;
            return r.ConnectedClientIds.Count == 0;
        });

        if (shouldEnd)
        {
            realm.WithLock(r => r.Status = RealmStatus.Ended);
            var summary = new RealmSummary
            {
                DurationSeconds = (DateTime.UtcNow - realm.CreatedAt).TotalSeconds,
            };

            var knownClientIds = realm.WithLock(r => new List<string>(r.KnownClientIds));
            CleanupRealmHubState(realmId, knownClientIds);
            await Clients.Group(realmId).SendAsync("RealmEnded", summary);
        }
    }

    /// <summary>
    /// Removes hub-level state (_lastData, _stepOffsets) for all clients associated with a realm.
    /// Uses the provided client ID list (from KnownClientIds) so that disconnected clients
    /// whose entries were already removed from _connectionMap are still cleaned up.
    /// </summary>
    private static void CleanupRealmHubState(string realmId, IEnumerable<string> knownClientIds)
    {
        foreach (var clientId in knownClientIds)
        {
            _lastData.TryRemove(clientId, out _);
            _stepOffsets.TryRemove(clientId, out _);
        }

        foreach (var kvp in _connectionMap)
        {
            if (kvp.Value.RealmId == realmId)
            {
                _pendingLeaves.TryRemove(kvp.Key, out _);
            }
        }
    }
}
