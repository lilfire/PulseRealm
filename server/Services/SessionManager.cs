using System.Collections.Concurrent;
using PulseRealm.Server.Models;

namespace PulseRealm.Server.Services;

public class SessionManager
{
    private readonly ConcurrentDictionary<string, Session> _sessions = new();
    private readonly ConcurrentDictionary<string, Session> _joinCodes = new();
    private static readonly Random _random = new();

    public Session CreateSession(SessionMode mode)
    {
        var session = new Session
        {
            Mode = mode,
            JoinCode = GenerateJoinCode()
        };

        _sessions[session.Id] = session;
        _joinCodes[session.JoinCode] = session;
        return session;
    }

    public Session? GetByJoinCode(string joinCode)
    {
        _joinCodes.TryGetValue(joinCode.ToUpperInvariant(), out var session);
        return session;
    }

    public Session? GetById(string id)
    {
        _sessions.TryGetValue(id, out var session);
        return session;
    }

    public void AddClient(string sessionId, string clientId)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            session.ConnectedClientIds.Add(clientId);
        }
    }

    private string GenerateJoinCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars
        var code = new string(Enumerable.Range(0, 6).Select(_ => chars[_random.Next(chars.Length)]).ToArray());
        return code;
    }
}
