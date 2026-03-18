using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Hubs;

public class RealmHub : Hub
{
    private readonly RealmManager _realmManager;
    private readonly AdminConfigService _adminConfig;
    private readonly RealmStatsTracker _statsTracker;

    /// <summary>Tracks the last raw steps and receive time per client for speed and offset calculation.</summary>
    private static readonly ConcurrentDictionary<string, (int RawSteps, DateTime ReceivedAt, double SmoothedSpeed, DateTime LastStepTime)> _lastData = new();

    /// <summary>Maps SignalR connection IDs to (realmId, clientId) for disconnect handling.</summary>
    private static readonly ConcurrentDictionary<string, (string RealmId, string ClientId)> _connectionMap = new();

    /// <summary>Step offset per client to handle app restarts where the step counter resets to 0.</summary>
    private static readonly ConcurrentDictionary<string, int> _stepOffsets = new();

    /// <summary>Connection IDs of clients that explicitly called LeaveRealm (intentional leave, not connection loss).</summary>
    private static readonly ConcurrentDictionary<string, bool> _pendingLeaves = new();

    /// <summary>Maps host connection IDs to realm IDs for disconnect cleanup.</summary>
    private static readonly ConcurrentDictionary<string, string> _hostConnectionMap = new();

    /// <summary>Tracks the last accepted wearable message time per client for rate limiting.</summary>
    private static readonly ConcurrentDictionary<string, DateTime> _lastAcceptedTime = new();

    /// <summary>Walking stride-length factor: stride (m) ≈ height (cm) × factor / 100.</summary>
    private const double StrideFactor = 0.415;

    /// <summary>EMA smoothing factor (higher = more responsive, noisier). At ~5 msg/sec reaches 90% of true speed in ~1.4s.</summary>
    private const double EmaAlpha = 0.3;
    /// <summary>Seconds after last step before speed starts decaying.</summary>
    private const double IdleGraceSec = 3.0;
    /// <summary>Seconds for linear decay from grace end to zero speed.</summary>
    private const double IdleDecaySec = 4.0;

    public RealmHub(RealmManager realmManager, AdminConfigService adminConfig, RealmStatsTracker statsTracker)
    {
        _realmManager = realmManager;
        _adminConfig = adminConfig;
        _statsTracker = statsTracker;
    }

    /// <summary>
    /// Called by the dashboard to authenticate as the host of a realm.
    /// Must be called before any privileged operations (StartRealm, EndRealm, etc.).
    /// </summary>
    public Task AuthenticateAsHost(string realmId, string hostSecret)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
            throw new HubException("Realm not found.");
        if (realm.HostSecret != hostSecret)
            throw new HubException("Invalid host secret.");

        realm.WithLock(r => r.HostConnectionId = Context.ConnectionId);
        _hostConnectionMap[Context.ConnectionId] = realmId;
        return Task.CompletedTask;
    }

    /// <summary>
    /// Called by the host dashboard to broadcast lobby settings to all clients in the realm.
    /// Stores the settings on the realm so late-joining clients receive them on connect.
    /// </summary>
    public async Task UpdateLobbySettings(string realmId, string settingsJson)
    {
        var realm = GetRealmAsHost(realmId);

        realm.WithLock(r => r.LobbySettings = settingsJson);
        await Clients.Group(realmId).SendAsync("LobbySettingsUpdated", settingsJson);
    }

    private Realm GetRealmAsHost(string realmId)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
            throw new HubException("Realm not found.");
        if (realm.HostConnectionId != Context.ConnectionId)
            throw new HubException("Not authorized. Only the host can perform this action.");
        return realm;
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
            if (profile.StrideFactor is < 0.3 or > 0.6)
                profile.StrideFactor = StrideFactor;
        }

        var realm = _realmManager.GetByJoinCode(joinCode);
        if (realm is null)
        {
            throw new HubException("Invalid join code.");
        }

        // Read realm state under lock for thread-safe checks
        var (status, isKnown, isKicked, connectedCount, maxClients) = realm.WithLock(r => (
            r.Status,
            r.KnownClientIds.Contains(clientId),
            r.KickedClientIds.Contains(clientId),
            r.ConnectedClientIds.Count,
            r.MaxClients
        ));

        if (isKicked)
        {
            throw new HubException("You have been kicked from this realm.");
        }

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
            _lastAcceptedTime.TryRemove(clientId, out _);
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

        // Send current lobby settings to the joining client so they see the host's configuration
        var lobbySettings = realm.WithLock(r => r.LobbySettings);
        if (lobbySettings is not null)
        {
            await Clients.Caller.SendAsync("LobbySettingsUpdated", lobbySettings);
        }
    }

    /// <summary>
    /// Called by the dashboard to start the realm. No new clients can join after this.
    /// Optionally accepts a JSON config blob for mode-specific settings.
    /// </summary>
    public async Task StartRealm(string realmId, string? config = null)
    {
        var realm = GetRealmAsHost(realmId);

        realm.WithLock(r =>
        {
            r.Status = RealmStatus.Started;
            r.RealmConfig = config;
        });

        // Clear pre-start step data so steps begin at 0 for all clients
        var clientIds = realm.WithLock(r => new List<string>(r.ConnectedClientIds));
        foreach (var clientId in clientIds)
        {
            _lastData.TryRemove(clientId, out _);
            _stepOffsets.TryRemove(clientId, out _);
        }

        await Clients.Group(realmId).SendAsync("RealmStarted", config);
    }

    /// <summary>
    /// Called by a wearable client to stream live data (steps, heart rate).
    /// The server forwards it to the dashboard in the same realm group.
    /// </summary>
    public async Task SendWearableData(string realmId, WearableData data)
    {
        // Rate limiting: drop messages arriving faster than configured rate
        var maxRate = _adminConfig.GetConfig().MaxWearableMessagesPerSecond;
        if (maxRate > 0)
        {
            var now = DateTime.UtcNow;
            var minIntervalMs = 1000.0 / maxRate;
            var lastTime = _lastAcceptedTime.GetValueOrDefault(data.ClientId);
            if (lastTime != default && (now - lastTime).TotalMilliseconds < minIntervalMs)
                return;
            _lastAcceptedTime[data.ClientId] = now;
        }

        var realm = _realmManager.GetById(realmId);
        if (realm is null) return;

        var status = realm.WithLock(r => r.Status);

        // Only process steps and speed when the realm is actively running.
        // During lobby, forward heart rate only (steps zeroed, no speed).
        if (status != RealmStatus.Started)
        {
            data.Steps = 0;
            data.SpeedKmh = 0;
            await Clients.Group(realmId).SendAsync("WearableDataReceived", data);
            return;
        }

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

        // Accumulate stats for the summary
        var profile = _realmManager.GetClientProfile(realmId, data.ClientId);
        _statsTracker.Record(realmId, data.ClientId, data.Steps, data.HeartRate, data.SpeedKmh, profile);

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

        // First message for this client — initialize and return 0
        if (previous.ReceivedAt == default)
        {
            _lastData[clientId] = (rawSteps, now, 0, now);
            return 0;
        }

        var timeDelta = (now - previous.ReceivedAt).TotalSeconds;
        var stepDelta = rawSteps - previous.RawSteps;

        if (stepDelta > 0)
        {
            // Steps received — compute instantaneous speed, pre-clamp outliers, apply EMA
            if (timeDelta < 0.1)
            {
                // Too-fast message — return previous smoothed speed instead of flickering to 0
                _lastData[clientId] = (rawSteps, now, previous.SmoothedSpeed, now);
                return Math.Round(previous.SmoothedSpeed, 1);
            }

            var profile = _realmManager.GetClientProfile(realmId, clientId);
            var heightCm = profile?.HeightCm > 0 ? profile.HeightCm : 170.0;
            var factor = profile?.StrideFactor > 0 ? profile.StrideFactor : StrideFactor;
            var strideLengthM = heightCm * factor / 100.0;
            var distanceM = stepDelta * strideLengthM;
            var instantaneous = distanceM / timeDelta * 3.6;

            // Pre-clamp outliers before EMA to prevent single burst from spiking
            var maxChange = Math.Max(3.0, previous.SmoothedSpeed * 0.5);
            var clamped = Math.Clamp(instantaneous, previous.SmoothedSpeed - maxChange, previous.SmoothedSpeed + maxChange);

            // Apply EMA
            var smoothed = EmaAlpha * clamped + (1 - EmaAlpha) * previous.SmoothedSpeed;
            smoothed = Math.Clamp(smoothed, 0, 25);

            _lastData[clientId] = (rawSteps, now, smoothed, now);
            return Math.Round(smoothed, 1);
        }

        // No new steps — check idle decay
        var secSinceLastStep = (now - previous.LastStepTime).TotalSeconds;

        if (secSinceLastStep <= IdleGraceSec)
        {
            // Within grace period — hold previous smoothed speed
            _lastData[clientId] = (rawSteps, now, previous.SmoothedSpeed, previous.LastStepTime);
            return Math.Round(previous.SmoothedSpeed, 1);
        }

        // Past grace period — linearly decay to 0
        var decayElapsed = secSinceLastStep - IdleGraceSec;
        var decayFactor = Math.Clamp(1.0 - decayElapsed / IdleDecaySec, 0, 1);
        var decayed = previous.SmoothedSpeed * decayFactor;

        _lastData[clientId] = (rawSteps, now, decayed, previous.LastStepTime);
        return Math.Round(decayed, 1);
    }

    /// <summary>
    /// Called by the dashboard to notify a client they have been eliminated.
    /// </summary>
    public async Task NotifyEliminated(string realmId, string clientId)
    {
        GetRealmAsHost(realmId);
        await Clients.Group(realmId).SendAsync("ClientEliminated", clientId);
    }

    /// <summary>
    /// Called by the host or admin dashboard to kick a client from a realm.
    /// Performs full cleanup and prevents reconnection by removing from KnownClientIds.
    /// </summary>
    public async Task KickClient(string realmId, string clientId)
    {
        var realm = GetRealmAsHost(realmId);

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
        realm.WithLock(r => r.KickedClientIds.Add(clientId));
        _realmManager.RemoveClient(realmId, clientId, removeFromKnown: true);
        _lastData.TryRemove(clientId, out _);
        _stepOffsets.TryRemove(clientId, out _);
        _lastAcceptedTime.TryRemove(clientId, out _);

        if (kickedConnectionId != null)
        {
            _connectionMap.TryRemove(kickedConnectionId, out _);
            _pendingLeaves[kickedConnectionId] = true; // prevent OnDisconnectedAsync from sending ClientDisconnected
            await Groups.RemoveFromGroupAsync(kickedConnectionId, realmId);
        }

        // Notify the rest of the group that this client was removed
        await Clients.Group(realmId).SendAsync("ClientKicked", clientId);
        // Tell the kicked client directly so they can disconnect
        if (kickedConnectionId != null)
        {
            await Clients.Client(kickedConnectionId).SendAsync("YouWereKicked");
        }
    }

    /// <summary>
    /// Called by the dashboard to end a realm. Broadcasts a summary to all clients.
    /// Accepts optional overrides (e.g. totalDistanceMeters, isTeamFormat) from the dashboard
    /// that get merged into the server-built summary.
    /// </summary>
    public async Task EndRealm(string realmId, RealmSummary? overrides = null)
    {
        var realm = GetRealmAsHost(realmId);

        realm.WithLock(r => r.Status = RealmStatus.Ended);

        var summary = _statsTracker.BuildSummary(realm);

        // Allow the dashboard to override specific fields (e.g. distance from GPS, team format)
        if (overrides is not null)
        {
            if (overrides.TotalDistanceMeters > 0)
                summary.TotalDistanceMeters = overrides.TotalDistanceMeters;
            if (overrides.IsTeamFormat)
                summary.IsTeamFormat = true;
            // Merge per-client team assignments from dashboard
            if (overrides.ClientSummaries is not null)
            {
                foreach (var ocs in overrides.ClientSummaries)
                {
                    var existing = summary.ClientSummaries?.FirstOrDefault(c => c.ClientId == ocs.ClientId);
                    if (existing is not null)
                    {
                        if (ocs.DistanceMeters > 0)
                            existing.DistanceMeters = ocs.DistanceMeters;
                        existing.TeamName = ocs.TeamName;
                        existing.TeamColor = ocs.TeamColor;
                    }
                }
            }
        }

        // Clean up hub state for all clients that were in this realm (including disconnected ones)
        var knownClientIds = realm.WithLock(r => new List<string>(r.KnownClientIds));
        CleanupRealmHubState(realmId, knownClientIds);
        _statsTracker.CleanupRealm(realmId, knownClientIds);

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

            // If the realm was started, send the leaving client a full summary
            if (wasStarted)
            {
                var summary = _statsTracker.BuildSummaryForClient(realm!, mapping.ClientId);
                await Clients.Caller.SendAsync("RealmEnded", summary);
            }

            // Remove from connected list but keep in KnownClientIds and keep stats
            // so that TryAutoEndRealm can include this client in the final summary.
            realm?.WithLock(r => r.ConnectedClientIds.Remove(mapping.ClientId));
            _lastData.TryRemove(mapping.ClientId, out _);
            _stepOffsets.TryRemove(mapping.ClientId, out _);
            _lastAcceptedTime.TryRemove(mapping.ClientId, out _);

            await Groups.RemoveFromGroupAsync(Context.ConnectionId, mapping.RealmId);
            await Clients.Group(mapping.RealmId).SendAsync("ClientLeft", mapping.ClientId);

            // TryAutoEndRealm will build the full summary (including this client's stats)
            // and handle cleanup if no connected clients remain.
            var autoEnded = await TryAutoEndRealm(mapping.RealmId);

            // If auto-end didn't fire (other clients still connected), clean up
            // this client's stats now since they won't be needed for their personal summary.
            if (!autoEnded)
            {
                _statsTracker.CleanupRealm(mapping.RealmId, new[] { mapping.ClientId });
                _realmManager.RemoveClient(mapping.RealmId, mapping.ClientId, removeFromKnown: true);
            }
            return wasStarted;
        }
        return false;
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // Clear host association if this was a host connection
        if (_hostConnectionMap.TryRemove(Context.ConnectionId, out var hostRealmId))
        {
            var hostRealm = _realmManager.GetById(hostRealmId);
            hostRealm?.WithLock(r =>
            {
                if (r.HostConnectionId == Context.ConnectionId)
                    r.HostConnectionId = null;
            });
        }

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
                _lastAcceptedTime.TryRemove(mapping.ClientId, out _);
            }
            await Clients.Group(mapping.RealmId).SendAsync("ClientDisconnected", mapping.ClientId);
            await TryAutoEndRealm(mapping.RealmId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Checks if a realm has no connected clients left and, if so, ends it automatically.
    /// </summary>
    private async Task<bool> TryAutoEndRealm(string realmId)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
            return false;

        var shouldEnd = realm.WithLock(r =>
        {
            if (r.Status != RealmStatus.Started)
                return false;
            if (r.ConnectedClientIds.Count > 0)
                return false;
            // Don't auto-end if the dashboard/host is still connected
            if (r.HostConnectionId is not null)
                return false;
            return true;
        });

        if (shouldEnd)
        {
            realm.WithLock(r => r.Status = RealmStatus.Ended);
            var summary = _statsTracker.BuildSummary(realm);

            var knownClientIds = realm.WithLock(r => new List<string>(r.KnownClientIds));
            CleanupRealmHubState(realmId, knownClientIds);
            _statsTracker.CleanupRealm(realmId, knownClientIds);
            await Clients.Group(realmId).SendAsync("RealmEnded", summary);
            return true;
        }

        return false;
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
            _lastAcceptedTime.TryRemove(clientId, out _);
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
