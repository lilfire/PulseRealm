using PulseRealm.Server.Filters;
using PulseRealm.Server.Hubs;
using PulseRealm.Server.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddControllers();
builder.Services.AddSingleton<RealmManager>();
builder.Services.AddSingleton<AdminConfigService>();
builder.Services.AddSingleton<RealmStatsTracker>();
builder.Services.AddSingleton<AdminAuthService>();
builder.Services.AddTransient<AdminAuthFilter>();
builder.Services.AddHostedService<ServerDiscoveryService>();
builder.Services.AddHostedService<RealmCleanupService>();
builder.Services.AddHttpClient();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true) // Allow any origin (dev: file://, Vite, etc.)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    await next();
});

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();
app.MapHub<RealmHub>("/hubs/realm");
app.MapFallbackToFile("index.html");

app.Run();
