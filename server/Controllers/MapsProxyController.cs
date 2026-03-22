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

    // Allowlists of query parameters accepted per endpoint type.
    // The 'key' parameter is always stripped from incoming requests to prevent callers
    // from overriding the server-side API key.
    private static readonly HashSet<string> StaticMapAllowedParams = new(StringComparer.OrdinalIgnoreCase)
        { "size", "maptype", "center", "zoom", "markers", "path", "style", "scale", "format", "language", "region" };

    private static readonly HashSet<string> StreetViewAllowedParams = new(StringComparer.OrdinalIgnoreCase)
        { "size", "location", "heading", "pitch", "fov", "pano", "radius", "source", "return_error_code" };

    private static readonly HashSet<string> DirectionsAllowedParams = new(StringComparer.OrdinalIgnoreCase)
        { "origin", "destination", "mode", "waypoints", "alternatives", "avoid", "language", "region", "units" };

    // PlacesAutocomplete and PlacesDetails use [FromQuery] bound parameters and build their
    // URLs explicitly, so no allowlist filtering is needed for those endpoints.

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
        return await ProxyGet("https://maps.googleapis.com/maps/api/staticmap", StaticMapAllowedParams);
    }

    /// <summary>
    /// Proxy for Google Street View Static API.
    /// GET /api/maps/streetview?size=640x640&amp;location=...&amp;heading=...
    /// </summary>
    [HttpGet("streetview")]
    [ResponseCache(Duration = 300)]
    public async Task<IActionResult> StreetView()
    {
        return await ProxyGet("https://maps.googleapis.com/maps/api/streetview", StreetViewAllowedParams);
    }

    /// <summary>
    /// Proxy for Google Street View Metadata API.
    /// GET /api/maps/streetview/metadata?location=...
    /// </summary>
    [HttpGet("streetview/metadata")]
    public async Task<IActionResult> StreetViewMetadata()
    {
        return await ProxyGet("https://maps.googleapis.com/maps/api/streetview/metadata", StreetViewAllowedParams);
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

        var filteredQs = BuildFilteredQueryString(DirectionsAllowedParams);
        var separator = filteredQs.Length > 0 ? "&" : "?";
        var url = $"https://maps.googleapis.com/maps/api/directions/json{filteredQs}{separator}mode=walking&key={apiKey}";

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

    /// <summary>
    /// Proxy for Google Places Autocomplete API.
    /// GET /api/maps/places/autocomplete?input=...
    /// </summary>
    [HttpGet("places/autocomplete")]
    public async Task<IActionResult> PlacesAutocomplete([FromQuery] string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return Ok(new { predictions = Array.Empty<object>() });
        }

        var apiKey = _configuration["GOOGLE_MAPS_API_KEY"];
        if (string.IsNullOrEmpty(apiKey))
        {
            return BadRequest("Google Maps API key not configured");
        }

        var encodedInput = Uri.EscapeDataString(input);
        var url = $"https://maps.googleapis.com/maps/api/place/autocomplete/json?input={encodedInput}&key={apiKey}";

        var client = _httpClientFactory.CreateClient();
        var response = await client.GetAsync(url);
        var json = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            return StatusCode((int)response.StatusCode, new { error = json });
        }

        JsonElement root;
        try
        {
            root = JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch (JsonException)
        {
            return StatusCode(502, new { error = "Invalid JSON from Google Places API" });
        }

        if (!root.TryGetProperty("predictions", out var predictions))
        {
            return Ok(new { predictions = Array.Empty<object>() });
        }

        var results = new List<object>();
        foreach (var p in predictions.EnumerateArray())
        {
            var placeId = p.TryGetProperty("place_id", out var pid) ? pid.GetString() : "";
            var description = p.TryGetProperty("description", out var desc) ? desc.GetString() : "";
            results.Add(new { placeId, description });
        }

        return Ok(new { predictions = results });
    }

    /// <summary>
    /// Proxy for Google Places Details API.
    /// GET /api/maps/places/details?placeId=...
    /// </summary>
    [HttpGet("places/details")]
    public async Task<IActionResult> PlacesDetails([FromQuery] string placeId)
    {
        if (string.IsNullOrWhiteSpace(placeId))
        {
            return BadRequest("placeId is required");
        }

        var apiKey = _configuration["GOOGLE_MAPS_API_KEY"];
        if (string.IsNullOrEmpty(apiKey))
        {
            return BadRequest("Google Maps API key not configured");
        }

        var encodedPlaceId = Uri.EscapeDataString(placeId);
        var url = $"https://maps.googleapis.com/maps/api/place/details/json?place_id={encodedPlaceId}&fields=geometry,formatted_address,name&key={apiKey}";

        var client = _httpClientFactory.CreateClient();
        var response = await client.GetAsync(url);
        var json = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            return StatusCode((int)response.StatusCode, new { error = json });
        }

        JsonElement root;
        try
        {
            root = JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch (JsonException)
        {
            return StatusCode(502, new { error = "Invalid JSON from Google Places API" });
        }

        if (!root.TryGetProperty("result", out var result))
        {
            return NotFound(new { error = "Place not found" });
        }

        double? lat = null, lng = null;
        if (result.TryGetProperty("geometry", out var geo) &&
            geo.TryGetProperty("location", out var loc))
        {
            lat = loc.TryGetProperty("lat", out var latProp) ? latProp.GetDouble() : null;
            lng = loc.TryGetProperty("lng", out var lngProp) ? lngProp.GetDouble() : null;
        }

        var name = result.TryGetProperty("name", out var n) ? n.GetString() : null;
        var address = result.TryGetProperty("formatted_address", out var a) ? a.GetString() : null;

        return Ok(new
        {
            lat,
            lng,
            name,
            address = address ?? name
        });
    }

    /// <summary>
    /// Builds a filtered query string from the incoming request, allowing only parameters
    /// present in the allowlist. The 'key' parameter is always excluded to prevent overriding
    /// the server-side API key.
    /// </summary>
    private string BuildFilteredQueryString(HashSet<string> allowedParams)
    {
        var query = HttpContext.Request.Query;
        var parts = new List<string>();
        foreach (var (name, values) in query)
        {
            if (string.Equals(name, "key", StringComparison.OrdinalIgnoreCase))
                continue; // Never forward the key parameter
            if (!allowedParams.Contains(name))
                continue;
            foreach (var value in values)
            {
                parts.Add($"{Uri.EscapeDataString(name)}={Uri.EscapeDataString(value ?? "")}");
            }
        }
        return parts.Count > 0 ? "?" + string.Join("&", parts) : "";
    }

    private async Task<IActionResult> ProxyGet(string baseGoogleUrl, HashSet<string> allowedParams)
    {
        var apiKey = _configuration["GOOGLE_MAPS_API_KEY"];
        if (string.IsNullOrEmpty(apiKey))
        {
            return BadRequest("Google Maps API key not configured");
        }

        // Build a filtered query string from allowed parameters only, then append the API key
        var filteredQs = BuildFilteredQueryString(allowedParams);
        var separator = filteredQs.Length > 0 ? "&" : "?";
        var url = $"{baseGoogleUrl}{filteredQs}{separator}key={apiKey}";

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
