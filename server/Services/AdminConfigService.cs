using System.Text.Json;
using PulseRealm.Server.Models;

namespace PulseRealm.Server.Services;

public class AdminConfigService
{
    private AdminConfig _config;
    private readonly object _lock = new();
    private readonly string _filePath;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public AdminConfigService(IConfiguration configuration)
    {
        var dataDir = configuration["DATA_DIR"] ?? "data";
        Directory.CreateDirectory(dataDir);
        _filePath = Path.Combine(dataDir, "admin-config.json");
        _config = Load();
    }

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
        catch
        {
            // If the file is corrupt, start fresh
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
        catch
        {
            // Log would be nice, but don't crash on save failure
        }
    }
}
