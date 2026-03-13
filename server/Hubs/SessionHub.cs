using Microsoft.AspNetCore.SignalR;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Hubs;

public class SessionHub : Hub
{
    private readonly SessionManager _sessionManager;

    public SessionHub(SessionManager sessionManager)
    {
        _sessionManager = sessionManager;
    }

    /// <summary>
    /// Called by a wearable client to join a session using a short code.
    /// </summary>
    public async Task JoinSession(string joinCode, string clientId)
    {
        var session = _sessionManager.GetByJoinCode(joinCode);
        if (session is null)
        {
            await Clients.Caller.SendAsync("Error", "Invalid join code.");
            return;
        }

        _sessionManager.AddClient(session.Id, clientId);
        await Groups.AddToGroupAsync(Context.ConnectionId, session.Id);
        await Clients.Group(session.Id).SendAsync("ClientJoined", clientId);
    }

    /// <summary>
    /// Called by a wearable client to stream live data (steps, heart rate).
    /// The server forwards it to the dashboard in the same session group.
    /// </summary>
    public async Task SendWearableData(string sessionId, WearableData data)
    {
        // Forward to all dashboard listeners in this session
        await Clients.Group(sessionId).SendAsync("WearableDataReceived", data);

        // TODO: Add mode-specific processing logic here
        // e.g., update leaderboard for competition mode,
        // calculate distance for streetview mode
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
