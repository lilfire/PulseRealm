using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Hubs;

public class SessionHub : Hub
{
    private readonly SessionManager _sessionManager;

    /// <summary>Tracks the last wearable snapshot per client for speed calculation.</summary>
    private static readonly ConcurrentDictionary<string, (WearableData Data, DateTime ReceivedAt)> _lastData = new();

    /// <summary>Walking stride-length factor: stride (m) ≈ height (cm) × factor / 100.</summary>
    private const double StrideFactor = 0.415;

    public SessionHub(SessionManager sessionManager)
    {
        _sessionManager = sessionManager;
    }

    /// <summary>
    /// Called by a wearable client to join a session using a short code.
    /// </summary>
    public async Task JoinSession(string joinCode, string clientId, ClientProfile? profile = null)
    {
        var session = _sessionManager.GetByJoinCode(joinCode);
        if (session is null)
        {
            throw new HubException("Invalid join code.");
        }

        if (session.Status != SessionStatus.Lobby)
        {
            throw new HubException("Session has already started.");
        }

        if (session.ConnectedClientIds.Count >= session.MaxClients)
        {
            throw new HubException($"Session is full ({session.MaxClients}/{session.MaxClients} players).");
        }

        _sessionManager.AddClient(session.Id, clientId, profile);
        await Groups.AddToGroupAsync(Context.ConnectionId, session.Id);

        var joinedProfile = profile ?? new ClientProfile { ClientId = clientId };
        joinedProfile.ClientId = clientId;
        await Clients.Group(session.Id).SendAsync("ClientJoined", joinedProfile);
    }

    /// <summary>
    /// Called by the dashboard to start the session. No new clients can join after this.
    /// </summary>
    public async Task StartSession(string sessionId)
    {
        var session = _sessionManager.GetById(sessionId);
        if (session is null)
        {
            await Clients.Caller.SendAsync("Error", "Session not found.");
            return;
        }

        session.Status = SessionStatus.Started;
        await Clients.Group(sessionId).SendAsync("SessionStarted");
    }

    /// <summary>
    /// Called by a wearable client to stream live data (steps, heart rate).
    /// The server forwards it to the dashboard in the same session group.
    /// </summary>
    public async Task SendWearableData(string sessionId, WearableData data)
    {
        data.SpeedKmh = EstimateSpeed(sessionId, data);

        // Forward enriched data to all dashboard listeners in this session
        await Clients.Group(sessionId).SendAsync("WearableDataReceived", data);
    }

    /// <summary>
    /// Estimates current speed (km/h) from step deltas and the client's height.
    /// Stride length ≈ heightCm × 0.415 / 100 (standard biomechanics approximation).
    /// </summary>
    private double EstimateSpeed(string sessionId, WearableData data)
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

        var profile = _sessionManager.GetClientProfile(sessionId, data.ClientId);
        var heightCm = profile?.HeightCm > 0 ? profile.HeightCm : 170.0; // fallback to average

        var strideLengthM = heightCm * StrideFactor / 100.0;
        var distanceM = stepDelta * strideLengthM;
        var speedKmh = distanceM / timeDelta * 3.6;

        // Clamp to a reasonable treadmill range (0–25 km/h)
        return Math.Clamp(Math.Round(speedKmh, 1), 0, 25);
    }

    /// <summary>
    /// Called by the dashboard to end a session. Broadcasts a summary to all clients.
    /// </summary>
    public async Task EndSession(string sessionId, SessionSummary summary)
    {
        var session = _sessionManager.GetById(sessionId);
        if (session is null)
        {
            await Clients.Caller.SendAsync("Error", "Session not found.");
            return;
        }

        session.Status = SessionStatus.Ended;
        summary.DurationSeconds = (DateTime.UtcNow - session.CreatedAt).TotalSeconds;

        await Clients.Group(sessionId).SendAsync("SessionEnded", summary);
    }

    /// <summary>
    /// Called by the dashboard to join a session's broadcast group.
    /// </summary>
    public async Task JoinSessionAsDashboard(string sessionId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, sessionId);
        await Clients.Caller.SendAsync("JoinedSession", sessionId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // TODO: Handle client disconnection — remove from session, notify dashboard
        await base.OnDisconnectedAsync(exception);
    }
}
