using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Filters;

public class AdminAuthFilter : IActionFilter
{
    private readonly AdminAuthService _auth;

    public AdminAuthFilter(AdminAuthService auth)
    {
        _auth = auth;
    }

    public void OnActionExecuting(ActionExecutingContext context)
    {
        var header = context.HttpContext.Request.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(header) || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        var token = header["Bearer ".Length..].Trim();
        if (!_auth.ValidateToken(token))
        {
            context.Result = new UnauthorizedResult();
        }
    }

    public void OnActionExecuted(ActionExecutedContext context) { }
}
