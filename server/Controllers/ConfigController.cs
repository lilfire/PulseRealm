using Microsoft.AspNetCore.Mvc;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ConfigController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly AdminConfigService _adminConfig;
    private readonly AdminAuthService _adminAuth;

    public ConfigController(IConfiguration configuration, AdminConfigService adminConfig, AdminAuthService adminAuth)
    {
        _configuration = configuration;
        _adminConfig = adminConfig;
        _adminAuth = adminAuth;
    }

    /// <summary>
    /// Returns client configuration (API keys, lobby defaults) for the frontend.
    /// </summary>
    [HttpGet]
    public IActionResult GetConfig()
    {
        var config = _adminConfig.GetConfig();
        return Ok(new
        {
            googleMapsApiKey = _configuration["GOOGLE_MAPS_API_KEY"] ?? "",
            adminEnabled = _adminAuth.IsConfigured,
            defaults = new
            {
                competition = new
                {
                    subMode = config.CompetitionSubMode,
                    playerFormat = config.CompetitionPlayerFormat,
                    targetDistanceKm = config.CompetitionTargetDistanceKm,
                    intervalMinutes = config.CompetitionIntervalMinutes,
                    targetZone = config.CompetitionTargetZone,
                    durationMinutes = config.CompetitionDurationMinutes,
                },
                dungeon = new
                {
                    difficulty = config.DungeonDifficulty,
                    timeframeMinutes = config.DungeonTimeframeMinutes,
                },
                streetViewLocations = config.StreetViewLocations,
                youTubeVideos = config.YouTubeVideos,
                curatedRoutes = config.CuratedRoutes,
            },
        });
    }
}
