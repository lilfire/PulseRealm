using Microsoft.AspNetCore.Mvc;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SessionController : ControllerBase
{
    private readonly SessionManager _sessionManager;

    public SessionController(SessionManager sessionManager)
    {
        _sessionManager = sessionManager;
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateSessionRequest request)
    {
        var session = _sessionManager.CreateSession(request.Mode);
        return Ok(new { session.Id, session.JoinCode, session.Mode });
    }

    [HttpGet("{joinCode}")]
    public IActionResult GetByCode(string joinCode)
    {
        var session = _sessionManager.GetByJoinCode(joinCode);
        if (session is null) return NotFound();
        return Ok(new { session.Id, session.JoinCode, session.Mode });
    }
}

public record CreateSessionRequest(SessionMode Mode);
