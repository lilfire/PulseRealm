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
        var realm = _realmManager.CreateRealm(request.Mode);
        return Ok(new { realm.Id, realm.JoinCode, realm.Mode });
    }

    [HttpGet("{joinCode}")]
    public IActionResult GetByCode(string joinCode)
    {
        var realm = _realmManager.GetByJoinCode(joinCode);
        if (realm is null) return NotFound();
        return Ok(new { realm.Id, realm.JoinCode, realm.Mode });
    }
}

public record CreateRealmRequest(RealmMode Mode);
