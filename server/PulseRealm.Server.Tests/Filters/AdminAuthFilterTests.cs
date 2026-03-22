using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using PulseRealm.Server.Filters;
using PulseRealm.Server.Services;
using Xunit;

namespace PulseRealm.Server.Tests.Filters;

/// <summary>
/// Tests for AdminAuthFilter.
///
/// The filter reads the Authorization request header, rejects requests that lack
/// a well-formed Bearer token, and delegates token validity to AdminAuthService.
/// A real AdminAuthService is used so token-lifecycle scenarios (login / logout)
/// are covered without mocking internals.
/// </summary>
public class AdminAuthFilterTests
{
    // -------------------------------------------------------------------------
    // Fixture helpers
    // -------------------------------------------------------------------------

    private readonly AdminAuthService _auth;
    private readonly AdminAuthFilter _filter;

    public AdminAuthFilterTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ADMIN_USERNAME"] = "admin",
                ["ADMIN_PASSWORD"] = "secret",
            })
            .Build();

        _auth = new AdminAuthService(config);
        _filter = new AdminAuthFilter(_auth);
    }

    /// <summary>
    /// Builds an <see cref="ActionExecutingContext"/> with the given Authorization
    /// header value. When <paramref name="authHeader"/> is null the header is
    /// omitted entirely, mirroring a request sent without any Authorization header.
    /// </summary>
    private static ActionExecutingContext CreateContext(string? authHeader = null)
    {
        var httpContext = new DefaultHttpContext();
        if (authHeader != null)
            httpContext.Request.Headers.Authorization = authHeader;

        var actionContext = new ActionContext(
            httpContext,
            new RouteData(),
            new ActionDescriptor());

        return new ActionExecutingContext(
            actionContext,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            new object());
    }

    // -------------------------------------------------------------------------
    // OnActionExecuting — rejection paths
    // -------------------------------------------------------------------------

    [Fact]
    public void OnActionExecuting_MissingAuthHeader_ReturnsUnauthorized()
    {
        var context = CreateContext();

        _filter.OnActionExecuting(context);

        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuting_EmptyAuthHeader_ReturnsUnauthorized()
    {
        var context = CreateContext("");

        _filter.OnActionExecuting(context);

        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuting_NonBearerScheme_ReturnsUnauthorized()
    {
        // Basic auth header — not a Bearer token.
        var context = CreateContext("Basic dXNlcjpwYXNz");

        _filter.OnActionExecuting(context);

        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuting_BearerWithNoToken_ReturnsUnauthorized()
    {
        // "Bearer " with nothing after it.
        var context = CreateContext("Bearer ");

        _filter.OnActionExecuting(context);

        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuting_BearerWithInvalidToken_ReturnsUnauthorized()
    {
        var context = CreateContext("Bearer completely-invalid-token");

        _filter.OnActionExecuting(context);

        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuting_BearerWithRandomGuid_ReturnsUnauthorized()
    {
        // A GUID that was never issued by the auth service.
        var context = CreateContext($"Bearer {Guid.NewGuid():N}");

        _filter.OnActionExecuting(context);

        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    // -------------------------------------------------------------------------
    // OnActionExecuting — success path
    // -------------------------------------------------------------------------

    [Fact]
    public void OnActionExecuting_ValidToken_ResultIsNull()
    {
        var token = _auth.Login("admin", "secret")!;
        var context = CreateContext($"Bearer {token}");

        _filter.OnActionExecuting(context);

        // When the filter passes the request through it must not set a result.
        Assert.Null(context.Result);
    }

    [Fact]
    public void OnActionExecuting_ValidToken_BearerIsCaseInsensitive()
    {
        var token = _auth.Login("admin", "secret")!;
        // Uppercase BEARER prefix — the filter uses OrdinalIgnoreCase comparison.
        var context = CreateContext($"BEARER {token}");

        _filter.OnActionExecuting(context);

        Assert.Null(context.Result);
    }

    // -------------------------------------------------------------------------
    // OnActionExecuting — token lifecycle
    // -------------------------------------------------------------------------

    [Fact]
    public void OnActionExecuting_LoggedOutToken_ReturnsUnauthorized()
    {
        var token = _auth.Login("admin", "secret")!;
        _auth.Logout(token);
        var context = CreateContext($"Bearer {token}");

        _filter.OnActionExecuting(context);

        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    // -------------------------------------------------------------------------
    // OnActionExecuted — no-op coverage
    // -------------------------------------------------------------------------

    [Fact]
    public void OnActionExecuted_DoesNotThrow()
    {
        var httpContext = new DefaultHttpContext();
        var actionContext = new ActionContext(
            httpContext,
            new RouteData(),
            new ActionDescriptor());

        var context = new ActionExecutedContext(
            actionContext,
            new List<IFilterMetadata>(),
            new object());

        // The method is a deliberate no-op; it must not throw under any input.
        var ex = Record.Exception(() => _filter.OnActionExecuted(context));

        Assert.Null(ex);
    }
}
