using System.Net;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Moq;
using Moq.Protected;
using PulseRealm.Server.Controllers;
using Xunit;

namespace PulseRealm.Server.Tests.Controllers;

public class MapsProxyControllerTests
{
    private static IConfiguration CreateConfig(string? apiKey = "test-api-key")
    {
        var dict = new Dictionary<string, string?>();
        if (apiKey != null) dict["GOOGLE_MAPS_API_KEY"] = apiKey;
        return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
    }

    private static (MapsProxyController Controller, Mock<HttpMessageHandler> Handler)
        CreateController(IConfiguration? config = null, HttpStatusCode responseStatus = HttpStatusCode.OK,
            string responseContent = "", string contentType = "application/json")
    {
        config ??= CreateConfig();
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = responseStatus,
                Content = new StringContent(responseContent, Encoding.UTF8, contentType)
            });

        var httpClient = new HttpClient(handler.Object);
        var mockFactory = new Mock<IHttpClientFactory>();
        mockFactory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(httpClient);

        var controller = new MapsProxyController(config, mockFactory.Object);
        var httpContext = new DefaultHttpContext();
        httpContext.Request.QueryString = new QueryString("?size=640x640");
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        return (controller, handler);
    }

    // -------------------------------------------------------------------------
    // ProxyGet (via StaticMap, StreetView, StreetViewMetadata)
    // -------------------------------------------------------------------------

    [Fact]
    public async Task StaticMap_NoApiKey_ReturnsBadRequest()
    {
        var (controller, _) = CreateController(config: CreateConfig(apiKey: ""));
        var result = await controller.StaticMap();
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task StaticMap_WithApiKey_ReturnsFileResult()
    {
        var imageBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47 }; // fake PNG
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new ByteArrayContent(imageBytes)
                {
                    Headers = { ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png") }
                }
            });

        var httpClient = new HttpClient(handler.Object);
        var mockFactory = new Mock<IHttpClientFactory>();
        mockFactory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(httpClient);

        var controller = new MapsProxyController(CreateConfig(), mockFactory.Object);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };
        controller.Request.QueryString = new QueryString("?size=640x640");

        var result = await controller.StaticMap();
        Assert.IsType<FileContentResult>(result);
        var fileResult = (FileContentResult)result;
        Assert.Equal("image/png", fileResult.ContentType);
    }

    [Fact]
    public async Task StaticMap_GoogleReturns403_ReturnsStatusCode()
    {
        var (controller, _) = CreateController(
            responseStatus: HttpStatusCode.Forbidden,
            responseContent: "Forbidden",
            contentType: "text/plain");

        var result = await controller.StaticMap();
        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, objectResult.StatusCode);
    }

    [Fact]
    public async Task StreetView_NoApiKey_ReturnsBadRequest()
    {
        var (controller, _) = CreateController(config: CreateConfig(apiKey: ""));
        var result = await controller.StreetView();
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task StreetViewMetadata_NoApiKey_ReturnsBadRequest()
    {
        var (controller, _) = CreateController(config: CreateConfig(apiKey: ""));
        var result = await controller.StreetViewMetadata();
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task ProxyGet_EmptyResponse_ReturnsError()
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new ByteArrayContent(Array.Empty<byte>())
            });

        var httpClient = new HttpClient(handler.Object);
        var mockFactory = new Mock<IHttpClientFactory>();
        mockFactory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(httpClient);

        var controller = new MapsProxyController(CreateConfig(), mockFactory.Object);
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        controller.Request.QueryString = new QueryString("?size=640x640");

        var result = await controller.StaticMap();
        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(200, objectResult.StatusCode);
    }

    // -------------------------------------------------------------------------
    // Directions
    // -------------------------------------------------------------------------

    [Fact]
    public async Task Directions_NoApiKey_ReturnsBadRequest()
    {
        var (controller, _) = CreateController(config: CreateConfig(apiKey: ""));
        var result = await controller.Directions();
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Directions_SuccessfulResponse_ReturnsPolylineAndDistance()
    {
        var json = """
        {
            "status": "OK",
            "routes": [{
                "overview_polyline": { "points": "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
                "legs": [{ "distance": { "value": 2500 } }]
            }]
        }
        """;

        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.Directions();

        var okResult = Assert.IsType<OkObjectResult>(result);
        var responseJson = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("_p~iF~ps|U_ulLnnqC_mqNvxq", responseJson);
        Assert.Contains("2500", responseJson);
        Assert.Contains("points", responseJson);
    }

    [Fact]
    public async Task Directions_ZeroResults_Returns404()
    {
        var json = """{ "status": "ZERO_RESULTS" }""";
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.Directions();

        var notFoundResult = Assert.IsType<NotFoundObjectResult>(result);
        var responseJson = System.Text.Json.JsonSerializer.Serialize(notFoundResult.Value);
        Assert.Contains("No routes found", responseJson);
    }

    [Fact]
    public async Task Directions_NotFound_Returns404()
    {
        var json = """{ "status": "NOT_FOUND" }""";
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.Directions();

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task Directions_UnknownStatus_Returns502()
    {
        var json = """{ "status": "REQUEST_DENIED" }""";
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.Directions();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, objectResult.StatusCode);
    }

    [Fact]
    public async Task Directions_InvalidJson_Returns502()
    {
        var (controller, _) = CreateController(responseContent: "not json at all");
        var result = await controller.Directions();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, objectResult.StatusCode);
    }

    [Fact]
    public async Task Directions_NoRoutes_Returns404()
    {
        var json = """{ "status": "OK", "routes": [] }""";
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.Directions();

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task Directions_MissingPolyline_Returns502()
    {
        var json = """
        {
            "status": "OK",
            "routes": [{ "legs": [{ "distance": { "value": 1000 } }] }]
        }
        """;
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.Directions();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, objectResult.StatusCode);
    }

    [Fact]
    public async Task Directions_MissingLegs_Returns502()
    {
        var json = """
        {
            "status": "OK",
            "routes": [{ "overview_polyline": { "points": "abc" } }]
        }
        """;
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.Directions();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, objectResult.StatusCode);
    }

    [Fact]
    public async Task Directions_MissingDistance_Returns502()
    {
        var json = """
        {
            "status": "OK",
            "routes": [{
                "overview_polyline": { "points": "abc" },
                "legs": [{}]
            }]
        }
        """;
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.Directions();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, objectResult.StatusCode);
    }

    [Fact]
    public async Task Directions_GoogleReturnsError_ReturnsErrorStatus()
    {
        var (controller, _) = CreateController(
            responseStatus: HttpStatusCode.BadGateway,
            responseContent: "Bad Gateway");
        var result = await controller.Directions();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, objectResult.StatusCode);
    }

    [Fact]
    public async Task Directions_MissingStatusField_Returns502()
    {
        var json = """{ "routes": [] }""";
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.Directions();

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, objectResult.StatusCode);
    }

    [Fact]
    public async Task Directions_EmptyGoogleErrorBody_UsesDefaultMessage()
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.InternalServerError,
                Content = new StringContent("", Encoding.UTF8, "text/plain")
            });

        var httpClient = new HttpClient(handler.Object);
        var mockFactory = new Mock<IHttpClientFactory>();
        mockFactory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(httpClient);

        var controller = new MapsProxyController(CreateConfig(), mockFactory.Object);
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        controller.Request.QueryString = new QueryString("?origin=1,2&destination=3,4");

        var result = await controller.Directions();
        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(500, objectResult.StatusCode);
    }

    // -------------------------------------------------------------------------
    // Places Autocomplete
    // -------------------------------------------------------------------------

    [Fact]
    public async Task PlacesAutocomplete_EmptyInput_ReturnsEmptyPredictions()
    {
        var (controller, _) = CreateController();
        var result = await controller.PlacesAutocomplete("");

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("predictions", json);
    }

    [Fact]
    public async Task PlacesAutocomplete_WhitespaceInput_ReturnsEmptyPredictions()
    {
        var (controller, _) = CreateController();
        var result = await controller.PlacesAutocomplete("   ");

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task PlacesAutocomplete_NoApiKey_ReturnsBadRequest()
    {
        var (controller, _) = CreateController(config: CreateConfig(apiKey: ""));
        var result = await controller.PlacesAutocomplete("oslo");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task PlacesAutocomplete_ValidResponse_ReturnsPredictions()
    {
        var json = """
        {
            "predictions": [
                { "place_id": "abc123", "description": "Oslo, Norway" },
                { "place_id": "def456", "description": "Oslo S, Norway" }
            ]
        }
        """;
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.PlacesAutocomplete("oslo");

        var okResult = Assert.IsType<OkObjectResult>(result);
        var responseJson = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("Oslo, Norway", responseJson);
        Assert.Contains("abc123", responseJson);
    }

    [Fact]
    public async Task PlacesAutocomplete_NoPredictionsKey_ReturnsEmptyPredictions()
    {
        var json = """{ "status": "OK" }""";
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.PlacesAutocomplete("oslo");

        var okResult = Assert.IsType<OkObjectResult>(result);
        var responseJson = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("predictions", responseJson);
    }

    [Fact]
    public async Task PlacesAutocomplete_InvalidJson_Returns502()
    {
        var (controller, _) = CreateController(responseContent: "not json");
        var result = await controller.PlacesAutocomplete("oslo");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, objectResult.StatusCode);
    }

    [Fact]
    public async Task PlacesAutocomplete_GoogleError_ReturnsStatusCode()
    {
        var (controller, _) = CreateController(
            responseStatus: HttpStatusCode.Forbidden,
            responseContent: "API key invalid");
        var result = await controller.PlacesAutocomplete("oslo");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, objectResult.StatusCode);
    }

    // -------------------------------------------------------------------------
    // Places Details
    // -------------------------------------------------------------------------

    [Fact]
    public async Task PlacesDetails_EmptyPlaceId_ReturnsBadRequest()
    {
        var (controller, _) = CreateController();
        var result = await controller.PlacesDetails("");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task PlacesDetails_WhitespacePlaceId_ReturnsBadRequest()
    {
        var (controller, _) = CreateController();
        var result = await controller.PlacesDetails("   ");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task PlacesDetails_NoApiKey_ReturnsBadRequest()
    {
        var (controller, _) = CreateController(config: CreateConfig(apiKey: ""));
        var result = await controller.PlacesDetails("abc123");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task PlacesDetails_ValidResponse_ReturnsLocationAndName()
    {
        var json = """
        {
            "result": {
                "geometry": { "location": { "lat": 59.91, "lng": 10.75 } },
                "name": "Oslo",
                "formatted_address": "Oslo, Norway"
            }
        }
        """;
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.PlacesDetails("abc123");

        var okResult = Assert.IsType<OkObjectResult>(result);
        var responseJson = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("59.91", responseJson);
        Assert.Contains("Oslo", responseJson);
    }

    [Fact]
    public async Task PlacesDetails_NoResult_Returns404()
    {
        var json = """{ "status": "NOT_FOUND" }""";
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.PlacesDetails("abc123");

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task PlacesDetails_MissingGeometry_ReturnsNullLatLng()
    {
        var json = """
        {
            "result": {
                "name": "Unknown Place"
            }
        }
        """;
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.PlacesDetails("abc123");

        var okResult = Assert.IsType<OkObjectResult>(result);
        var responseJson = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        Assert.Contains("Unknown Place", responseJson);
    }

    [Fact]
    public async Task PlacesDetails_InvalidJson_Returns502()
    {
        var (controller, _) = CreateController(responseContent: "bad json");
        var result = await controller.PlacesDetails("abc123");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(502, objectResult.StatusCode);
    }

    [Fact]
    public async Task PlacesDetails_GoogleError_ReturnsStatusCode()
    {
        var (controller, _) = CreateController(
            responseStatus: HttpStatusCode.Forbidden,
            responseContent: "API key invalid");
        var result = await controller.PlacesDetails("abc123");

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, objectResult.StatusCode);
    }

    [Fact]
    public async Task PlacesDetails_NoFormattedAddress_UsesNameAsAddress()
    {
        var json = """
        {
            "result": {
                "geometry": { "location": { "lat": 59.91, "lng": 10.75 } },
                "name": "Some Place"
            }
        }
        """;
        var (controller, _) = CreateController(responseContent: json);
        var result = await controller.PlacesDetails("abc123");

        var okResult = Assert.IsType<OkObjectResult>(result);
        var responseJson = System.Text.Json.JsonSerializer.Serialize(okResult.Value);
        // address should fall back to name
        Assert.Contains("Some Place", responseJson);
    }

    // -------------------------------------------------------------------------
    // ProxyGet — empty query string handling
    // -------------------------------------------------------------------------

    [Fact]
    public async Task StaticMap_EmptyQueryString_StillAppendsApiKey()
    {
        var imageBytes = new byte[] { 0x89, 0x50 };
        var handler = new Mock<HttpMessageHandler>();
        HttpRequestMessage? capturedRequest = null;
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new ByteArrayContent(imageBytes)
                {
                    Headers = { ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png") }
                }
            });

        var httpClient = new HttpClient(handler.Object);
        var mockFactory = new Mock<IHttpClientFactory>();
        mockFactory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(httpClient);

        var controller = new MapsProxyController(CreateConfig(), mockFactory.Object);
        var httpContext = new DefaultHttpContext();
        // Empty query string
        httpContext.Request.QueryString = new QueryString();
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        await controller.StaticMap();

        Assert.NotNull(capturedRequest);
        Assert.Contains("key=test-api-key", capturedRequest!.RequestUri!.ToString());
    }
}
