using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using PulseRealm.Server.Filters;
using PulseRealm.Server.Hubs;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly AdminAuthService _auth;
    private readonly AdminConfigService _configService;
    private readonly RealmManager _realmManager;
    private readonly IHubContext<RealmHub> _hubContext;
    private readonly RealmStatsTracker _statsTracker;

    public AdminController(AdminAuthService auth, AdminConfigService configService, RealmManager realmManager, IHubContext<RealmHub> hubContext, RealmStatsTracker statsTracker)
    {
        _auth = auth;
        _configService = configService;
        _realmManager = realmManager;
        _hubContext = hubContext;
        _statsTracker = statsTracker;
    }

    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        if (!_auth.IsConfigured)
            return StatusCode(403, new { error = "Admin not configured" });

        var token = _auth.Login(request.Username, request.Password);
        if (token == null)
            return Unauthorized(new { error = "Invalid credentials" });

        return Ok(new { token });
    }

    [HttpPost("logout")]
    [ServiceFilter(typeof(AdminAuthFilter))]
    public IActionResult Logout()
    {
        var header = Request.Headers.Authorization.ToString();
        var token = header["Bearer ".Length..].Trim();
        _auth.Logout(token);
        return Ok();
    }

    [HttpGet("config")]
    [ServiceFilter(typeof(AdminAuthFilter))]
    public IActionResult GetConfig()
    {
        return Ok(_configService.GetConfig());
    }

    [HttpPut("config")]
    [ServiceFilter(typeof(AdminAuthFilter))]
    public IActionResult UpdateConfig([FromBody] AdminConfig config)
    {
        _configService.UpdateConfig(config);
        return Ok(_configService.GetConfig());
    }

    [HttpGet("realms")]
    [ServiceFilter(typeof(AdminAuthFilter))]
    public IActionResult GetActiveRealms()
    {
        var realms = _realmManager.GetActiveRealms().Select(r => new
        {
            r.Id,
            r.JoinCode,
            r.HostSecret,
            Mode = r.Mode.ToString(),
            Status = r.Status.ToString(),
            r.CreatedAt,
            ConnectedClients = r.WithLock(realm => realm.ConnectedClientIds.Count),
            MaxClients = r.MaxClients,
        });
        return Ok(realms);
    }

    [HttpPost("realms/{realmId}/end")]
    [ServiceFilter(typeof(AdminAuthFilter))]
    public async Task<IActionResult> EndRealm(string realmId)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
            return NotFound(new { error = "Realm not found" });

        if (realm.Status == RealmStatus.Ended)
            return Ok(new { message = "Realm already ended" });

        realm.WithLock(r => r.Status = RealmStatus.Ended);

        var summary = _statsTracker.BuildSummary(realm);

        var knownClientIds = realm.WithLock(r => new List<string>(r.KnownClientIds));
        _statsTracker.CleanupRealm(realmId, knownClientIds);

        await _hubContext.Clients.Group(realmId).SendAsync("RealmEnded", summary);

        return Ok(new { message = "Realm ended" });
    }
    [HttpPost("realms/{realmId}/kick/{clientId}")]
    [ServiceFilter(typeof(AdminAuthFilter))]
    public async Task<IActionResult> KickClient(string realmId, string clientId)
    {
        var realm = _realmManager.GetById(realmId);
        if (realm is null)
            return NotFound(new { error = "Realm not found" });

        var isConnected = realm.WithLock(r => r.ConnectedClientIds.Contains(clientId));
        if (!isConnected)
            return NotFound(new { error = "Client not found in realm" });

        _realmManager.RemoveClient(realmId, clientId, removeFromKnown: true);

        await _hubContext.Clients.Group(realmId).SendAsync("ClientKicked", clientId);

        return Ok(new { message = "Client kicked" });
    }
}

public class LoginRequest
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}
