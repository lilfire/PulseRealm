using PulseRealm.Server.Filters;
using PulseRealm.Server.Hubs;
using PulseRealm.Server.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddControllers();
builder.Services.AddSingleton<RealmManager>();
builder.Services.AddSingleton<AdminConfigService>();
builder.Services.AddSingleton<AdminAuthService>();
builder.Services.AddTransient<AdminAuthFilter>();
builder.Services.AddHostedService<ServerDiscoveryService>();
builder.Services.AddHostedService<RealmCleanupService>();

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

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();
app.MapHub<RealmHub>("/hubs/realm");
app.MapFallbackToFile("index.html");

app.Run();
