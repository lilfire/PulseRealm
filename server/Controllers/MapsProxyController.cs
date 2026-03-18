using Microsoft.AspNetCore.Mvc;

namespace PulseRealm.Server.Controllers;

/// <summary>
/// Proxies Google Maps Static API requests so the API key stays server-side
/// and browser referrer restrictions don't cause 403 errors (e.g. Chrome 74).
/// </summary>
[ApiController]
[Route("api/maps")]
public class MapsProxyController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;

    public MapsProxyController(IConfiguration configuration, IHttpClientFactory httpClientFactory)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
    }

    /// <summary>
    /// Proxy for Google Static Maps API.
    /// GET /api/maps/static?size=640x640&amp;maptype=roadmap&amp;...
    /// </summary>
    [HttpGet("static")]
    [ResponseCache(Duration = 300)]
    public async Task<IActionResult> StaticMap()
    {
        return await ProxyGet("https://maps.googleapis.com/maps/api/staticmap");
    }

    /// <summary>
    /// Proxy for Google Street View Static API.
    /// GET /api/maps/streetview?size=640x640&amp;location=...&amp;heading=...
    /// </summary>
    [HttpGet("streetview")]
    [ResponseCache(Duration = 300)]
    public async Task<IActionResult> StreetView()
    {
        return await ProxyGet("https://maps.googleapis.com/maps/api/streetview");
    }

    /// <summary>
    /// Proxy for Google Street View Metadata API.
    /// GET /api/maps/streetview/metadata?location=...
    /// </summary>
    [HttpGet("streetview/metadata")]
    public async Task<IActionResult> StreetViewMetadata()
    {
        return await ProxyGet("https://maps.googleapis.com/maps/api/streetview/metadata");
    }

    private async Task<IActionResult> ProxyGet(string baseGoogleUrl)
    {
        var apiKey = _configuration["GOOGLE_MAPS_API_KEY"];
        if (string.IsNullOrEmpty(apiKey))
        {
            return BadRequest("Google Maps API key not configured");
        }

        // Forward the original query string and append the API key
        var qs = HttpContext.Request.QueryString.Value ?? "";
        var separator = qs.Length > 0 ? "&" : "?";
        var url = $"{baseGoogleUrl}{qs}{separator}key={apiKey}";

        var client = _httpClientFactory.CreateClient();
        var response = await client.GetAsync(url);

        var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";
        var bytes = await response.Content.ReadAsByteArrayAsync();

        return File(bytes, contentType);
    }
}
