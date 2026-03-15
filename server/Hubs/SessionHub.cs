using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Hubs;

public class RealmHub : Hub
{
    private readonly RealmManager _realmManager;

    /// <summary>Tracks the last wearable snapshot per client for speed calculation.</summary>
    private static readonly ConcurrentDictionary<string, (WearableData Data, DateTime ReceivedAt)> _lastData = new();

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
        var realm = _realmManager.GetByJoinCode(joinCode);
        if (realm is null)
        {
            throw new HubException("Invalid join code.");
        }

        if (realm.Status != RealmStatus.Lobby)
        {
            throw new HubException("Realm has already started.");
        }

        if (realm.ConnectedClientIds.Count >= realm.MaxClients)
        {
            throw new HubException($"Realm is full ({realm.MaxClients}/{realm.MaxClients} players).");
        }

        _realmManager.AddClient(realm.Id, clientId, profile);
        await Groups.AddToGroupAsync(Context.ConnectionId, realm.Id);

        var joinedProfile = profile ?? new ClientProfile { ClientId = clientId };
        joinedProfile.ClientId = clientId;
        await Clients.Group(realm.Id).SendAsync("ClientJoined", joinedProfile);
    }

    /// <summary>
    /// Called by the dashboard to start the realm. No new clients can join after this.
    /// </summary>
    public async Task StartRealm(string realmId)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
        {
            await Clients.Caller.SendAsync("Error", "Realm not found.");
            return;
        }

        realm.Status = RealmStatus.Started;
        await Clients.Group(realmId).SendAsync("RealmStarted");
    }

    /// <summary>
    /// Called by a wearable client to stream live data (steps, heart rate).
    /// The server forwards it to the dashboard in the same realm group.
    /// </summary>
    public async Task SendWearableData(string realmId, WearableData data)
    {
        data.SpeedKmh = EstimateSpeed(realmId, data);

        // Forward enriched data to all dashboard listeners in this realm
        await Clients.Group(realmId).SendAsync("WearableDataReceived", data);
    }

    /// <summary>
    /// Estimates current speed (km/h) from step deltas and the client's height.
    /// Stride length ≈ heightCm × 0.415 / 100 (standard biomechanics approximation).
    /// </summary>
    private double EstimateSpeed(string realmId, WearableData data)
    {
        var now = DateTime.UtcNow;
        var previous = _lastData.GetValueOrDefault(data.ClientId);
        _lastData[data.ClientId] = (data, now);

        if (previous.Data is null)
            return 0;

        var stepDelta = data.Steps - previous.Data.Steps;
        if (stepDelta <= 0)
            return 0;

        // Use server-side receive timestamps for reliable time deltas
        var timeDelta = (now - previous.ReceivedAt).TotalSeconds;
        if (timeDelta < 0.1)
            return 0;

        var profile = _realmManager.GetClientProfile(realmId, data.ClientId);
        var heightCm = profile?.HeightCm > 0 ? profile.HeightCm : 170.0; // fallback to average

        var strideLengthM = heightCm * StrideFactor / 100.0;
        var distanceM = stepDelta * strideLengthM;
        var speedKmh = distanceM / timeDelta * 3.6;

        // Clamp to a reasonable treadmill range (0–25 km/h)
        return Math.Clamp(Math.Round(speedKmh, 1), 0, 25);
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

        realm.Status = RealmStatus.Ended;
        summary.DurationSeconds = (DateTime.UtcNow - realm.CreatedAt).TotalSeconds;

        await Clients.Group(realmId).SendAsync("RealmEnded", summary);
    }

    /// <summary>
    /// Called by the dashboard to join a realm's broadcast group.
    /// </summary>
    public async Task JoinRealmAsDashboard(string realmId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, realmId);
        await Clients.Caller.SendAsync("JoinedRealm", realmId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // TODO: Handle client disconnection — remove from realm, notify dashboard
        await base.OnDisconnectedAsync(exception);
    }
}
