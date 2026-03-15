using Microsoft.AspNetCore.Mvc;
using PulseRealm.Server.Filters;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;

namespace PulseRealm.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly AdminAuthService _auth;
    private readonly AdminConfigService _configService;

    public AdminController(AdminAuthService auth, AdminConfigService configService)
    {
        _auth = auth;
        _configService = configService;
    }

    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        if (!_auth.IsConfigured)
            return StatusCode(403, new { error = "Admin not configured" });

        var token = _auth.Login(request.Username, request.Password);
        if (token == null)
            return Unauthorized(new { error = "Invalid credentials" });

        return Ok(new { token });
    }

    [HttpPost("logout")]
    [ServiceFilter(typeof(AdminAuthFilter))]
    public IActionResult Logout()
    {
        var header = Request.Headers.Authorization.ToString();
        var token = header["Bearer ".Length..].Trim();
        _auth.Logout(token);
        return Ok();
    }

    [HttpGet("config")]
    [ServiceFilter(typeof(AdminAuthFilter))]
    public IActionResult GetConfig()
    {
        return Ok(_configService.GetConfig());
    }

    [HttpPut("config")]
    [ServiceFilter(typeof(AdminAuthFilter))]
    public IActionResult UpdateConfig([FromBody] AdminConfig config)
    {
        _configService.UpdateConfig(config);
        return Ok(_configService.GetConfig());
    }
}

public class LoginRequest
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}
