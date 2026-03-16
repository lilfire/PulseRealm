using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using PulseRealm.Server.Filters;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Tests.Filters;

public class AdminAuthFilterTests
{
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

    private static ActionExecutingContext CreateContext(string? authHeader = null)
    {
        var httpContext = new DefaultHttpContext();
        if (authHeader != null)
            httpContext.Request.Headers.Authorization = authHeader;

        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        return new ActionExecutingContext(
            actionContext,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            new object());
    }

    [Fact]
    public void OnActionExecuting_MissingHeader_ReturnsUnauthorized()
    {
        var context = CreateContext();
        _filter.OnActionExecuting(context);
        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuting_EmptyHeader_ReturnsUnauthorized()
    {
        var context = CreateContext("");
        _filter.OnActionExecuting(context);
        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuting_NonBearerHeader_ReturnsUnauthorized()
    {
        var context = CreateContext("Basic dXNlcjpwYXNz");
        _filter.OnActionExecuting(context);
        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuting_InvalidToken_ReturnsUnauthorized()
    {
        var context = CreateContext("Bearer invalid-token");
        _filter.OnActionExecuting(context);
        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuting_ValidToken_AllowsThrough()
    {
        var token = _auth.Login("admin", "secret")!;
        var context = CreateContext($"Bearer {token}");
        _filter.OnActionExecuting(context);
        Assert.Null(context.Result);
    }

    [Fact]
    public void OnActionExecuting_LoggedOutToken_ReturnsUnauthorized()
    {
        var token = _auth.Login("admin", "secret")!;
        _auth.Logout(token);
        var context = CreateContext($"Bearer {token}");
        _filter.OnActionExecuting(context);
        Assert.IsType<UnauthorizedResult>(context.Result);
    }

    [Fact]
    public void OnActionExecuted_DoesNothing()
    {
        // Just verify it doesn't throw
        var httpContext = new DefaultHttpContext();
        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        var context = new ActionExecutedContext(
            actionContext,
            new List<IFilterMetadata>(),
            new object());
        _filter.OnActionExecuted(context);
    }
}
