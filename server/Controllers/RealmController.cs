using Microsoft.AspNetCore.Mvc;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RealmController : ControllerBase
{
    private readonly RealmManager _realmManager;

    public RealmController(RealmManager realmManager)
    {
        _realmManager = realmManager;
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateRealmRequest request)
    {
        try
        {
            var realm = _realmManager.CreateRealm(request.Mode);
            return Ok(new { realm.Id, realm.JoinCode, realm.Mode, realm.HostSecret });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(429, new { error = ex.Message });
        }
    }

    [HttpGet("{joinCode}")]
    public IActionResult GetByCode(string joinCode)
    {
        var realm = _realmManager.GetByJoinCode(joinCode);
        if (realm is null) return NotFound();
        return Ok(new { realm.Id, realm.JoinCode, realm.Mode, Status = realm.Status.ToString() });
    }

    [HttpPost("{joinCode}/claim-host")]
    public IActionResult ClaimHost(string joinCode, [FromBody] ClaimHostRequest request)
    {
        var realm = _realmManager.GetByJoinCode(joinCode);
        if (realm is null) return NotFound();

        if (realm.Status == RealmStatus.Ended)
            return BadRequest(new { error = "Realm has ended." });

        if (!string.Equals(realm.HostSecret, request.HostSecret, StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new { error = "Invalid host key." });

        return Ok(new { realm.Id, realm.JoinCode, realm.Mode, Status = realm.Status.ToString() });
    }
}

public record CreateRealmRequest(RealmMode Mode);
public record ClaimHostRequest(string HostSecret);
