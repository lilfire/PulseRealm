using Microsoft.AspNetCore.Mvc;

namespace PulseRealm.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ConfigController : ControllerBase
{
    private readonly IConfiguration _configuration;

    public ConfigController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    /// <summary>
    /// Returns client configuration (API keys, feature flags) for the frontend.
    /// </summary>
    [HttpGet]
    public IActionResult GetConfig()
    {
        return Ok(new
        {
            googleMapsApiKey = _configuration["GOOGLE_MAPS_API_KEY"] ?? "",
        });
    }
}
