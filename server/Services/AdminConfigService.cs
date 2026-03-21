using System.Text.Json;
using PulseRealm.Server.Models;

namespace PulseRealm.Server.Services;

public class AdminConfigService
{
    private AdminConfig _config;
    private readonly object _lock = new();
    private readonly string _filePath;
    private readonly ILogger<AdminConfigService> _logger;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public AdminConfigService(IConfiguration configuration, ILogger<AdminConfigService> logger)
    {
        _logger = logger;
        var dataDir = configuration["DATA_DIR"] ?? "data";
        Directory.CreateDirectory(dataDir);
        _filePath = Path.Combine(dataDir, "admin-config.json");
        _config = Load();
    }

    /// <summary>
    /// Returns the current admin configuration.
    /// Callers must treat the returned object as read-only; mutate only via UpdateConfig.
    /// </summary>
    public AdminConfig GetConfig()
    {
        lock (_lock)
        {
            return _config;
        }
    }

    public void UpdateConfig(AdminConfig config)
    {
        lock (_lock)
        {
            _config = config;
            Save(config);
        }
    }

    private AdminConfig Load()
    {
        try
        {
            if (File.Exists(_filePath))
            {
                var json = File.ReadAllText(_filePath);
                return JsonSerializer.Deserialize<AdminConfig>(json, _jsonOptions) ?? new AdminConfig();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load admin config from {Path}, using defaults", _filePath);
        }
        return new AdminConfig();
    }

    private void Save(AdminConfig config)
    {
        try
        {
            var json = JsonSerializer.Serialize(config, _jsonOptions);
            File.WriteAllText(_filePath, json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save admin config to {Path}", _filePath);
        }
    }
}
