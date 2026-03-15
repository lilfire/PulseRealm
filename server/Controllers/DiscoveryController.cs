using Microsoft.AspNetCore.Mvc;

namespace PulseRealm.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DiscoveryController : ControllerBase
{
    private readonly IConfiguration _configuration;

    public DiscoveryController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    /// <summary>
    /// Returns server info so clients can verify connectivity and discover capabilities.
    /// </summary>
    [HttpGet]
    public IActionResult GetServerInfo()
    {
        var serverName = _configuration["SERVER_NAME"] ?? "PulseRealm";

        return Ok(new
        {
            name = serverName,
            version = "1.0.0",
            hostname = Environment.MachineName,
            hubPath = "/hubs/realm",
            apiPath = "/api",
        });
    }
}
