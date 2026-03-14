using Microsoft.AspNetCore.Mvc;

namespace PulseRealm.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DiscoveryController : ControllerBase
{
    /// <summary>
    /// Returns server info so clients can verify connectivity and discover capabilities.
    /// </summary>
    [HttpGet]
    public IActionResult GetServerInfo()
    {
        return Ok(new
        {
            name = "PulseRealm",
            version = "1.0.0",
            hubPath = "/hubs/session",
            apiPath = "/api",
        });
    }
}
