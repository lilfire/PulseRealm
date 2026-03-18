using System.Text.Json;
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

    /// <summary>
    /// Proxy for Google Directions API. Returns an overview polyline, decoded points,
    /// and total walking distance in metres.
    /// GET /api/maps/directions?origin={lat},{lng}&amp;destination={lat},{lng}
    /// </summary>
    [HttpGet("directions")]
    [ResponseCache(Duration = 300)]
    public async Task<IActionResult> Directions()
    {
        var apiKey = _configuration["GOOGLE_MAPS_API_KEY"];
        if (string.IsNullOrEmpty(apiKey))
        {
            return BadRequest("Google Maps API key not configured");
        }

        var qs = HttpContext.Request.QueryString.Value ?? "";
        var separator = qs.Length > 0 ? "&" : "?";
        var url = $"https://maps.googleapis.com/maps/api/directions/json{qs}{separator}mode=walking&key={apiKey}";

        var client = _httpClientFactory.CreateClient();
        var response = await client.GetAsync(url);

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            var message = !string.IsNullOrWhiteSpace(errorBody) ? errorBody : "Bad response from Google Directions API";
            return StatusCode((int)response.StatusCode, new { error = message, statusCode = (int)response.StatusCode });
        }

        var json = await response.Content.ReadAsStringAsync();
        JsonElement root;
        try
        {
            root = JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch (JsonException)
        {
            return StatusCode(502, new { error = "Invalid JSON from Google Directions API" });
        }

        if (!root.TryGetProperty("status", out var statusProp) || statusProp.GetString() != "OK")
        {
            var status = root.TryGetProperty("status", out var s) ? s.GetString() : "UNKNOWN";
            return status switch
            {
                "ZERO_RESULTS" => NotFound(new { error = "No routes found between origin and destination" }),
                "NOT_FOUND"    => NotFound(new { error = "Origin or destination could not be geocoded" }),
                _              => StatusCode(502, new { error = $"Google Directions API returned status: {status}" })
            };
        }

        if (!root.TryGetProperty("routes", out var routes) || routes.GetArrayLength() == 0)
        {
            return NotFound(new { error = "No routes found" });
        }

        var route = routes[0];

        if (!route.TryGetProperty("overview_polyline", out var overviewPolylineProp) ||
            !overviewPolylineProp.TryGetProperty("points", out var pointsProp))
        {
            return StatusCode(502, new { error = "Missing overview_polyline in Directions response" });
        }

        var encodedPolyline = pointsProp.GetString() ?? "";

        if (!route.TryGetProperty("legs", out var legs) || legs.GetArrayLength() == 0)
        {
            return StatusCode(502, new { error = "Missing legs in Directions response" });
        }

        var leg = legs[0];
        if (!leg.TryGetProperty("distance", out var distanceProp) ||
            !distanceProp.TryGetProperty("value", out var distanceValueProp))
        {
            return StatusCode(502, new { error = "Missing distance in Directions response" });
        }

        var distanceMeters = distanceValueProp.GetInt32();
        var decodedPoints = DecodePolyline(encodedPolyline);

        return Ok(new
        {
            overview_polyline = encodedPolyline,
            distance_meters   = distanceMeters,
            points            = decodedPoints
        });
    }

    /// <summary>
    /// Decodes a Google Maps encoded polyline string into a list of lat/lng pairs.
    /// https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    /// </summary>
    private static List<object> DecodePolyline(string encoded)
    {
        var points = new List<object>();
        if (string.IsNullOrEmpty(encoded))
            return points;

        int index = 0;
        int lat = 0;
        int lng = 0;

        while (index < encoded.Length)
        {
            int b;
            int shift = 0;
            int result = 0;

            // Decode latitude delta
            do
            {
                b = encoded[index++] - 63;
                result |= (b & 0x1F) << shift;
                shift += 5;
            }
            while (b >= 0x20 && index < encoded.Length);

            lat += (result & 1) != 0 ? ~(result >> 1) : result >> 1;

            shift = 0;
            result = 0;

            // Decode longitude delta
            do
            {
                b = encoded[index++] - 63;
                result |= (b & 0x1F) << shift;
                shift += 5;
            }
            while (b >= 0x20 && index < encoded.Length);

            lng += (result & 1) != 0 ? ~(result >> 1) : result >> 1;

            points.Add(new { lat = lat / 1e5, lng = lng / 1e5 });
        }

        return points;
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

        if (!response.IsSuccessStatusCode || bytes.Length == 0)
        {
            // Try to extract a human-readable error from the Google response body.
            var errorBody = bytes.Length > 0 ? System.Text.Encoding.UTF8.GetString(bytes) : "";
            var message = !string.IsNullOrWhiteSpace(errorBody) ? errorBody : "Empty response from Google Maps API";
            return StatusCode((int)response.StatusCode, new { error = message, statusCode = (int)response.StatusCode });
        }

        return File(bytes, contentType);
    }
}
