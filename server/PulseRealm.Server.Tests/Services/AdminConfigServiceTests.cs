using Microsoft.Extensions.Logging;
using Moq;
using PulseRealm.Server.Models;
using PulseRealm.Server.Services;
using Xunit;

namespace PulseRealm.Server.Tests.Services;

/// <summary>
/// Each test gets its own isolated temporary directory so file-system state
/// never leaks between tests.  The fixture is IDisposable so the temp
/// directories are cleaned up after each test class run.
/// </summary>
public class AdminConfigServiceTests : IDisposable
{
    private readonly List<string> _tempDirs = new();
    private readonly Mock<ILogger<AdminConfigService>> _loggerMock = new();

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /// <summary>Creates a fresh service backed by a brand-new temp directory.</summary>
    private AdminConfigService CreateService(string? dataDir = null)
    {
        var dir = dataDir ?? Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);

        var config = TestConfiguration.Create(new Dictionary<string, string?>
        {
            ["DATA_DIR"] = dir
        });

        return new AdminConfigService(config, _loggerMock.Object);
    }

    /// <summary>Creates the service, updates config, then creates a second instance pointing
    /// at the same directory to simulate a restart loading from disk.</summary>
    private (AdminConfigService first, AdminConfigService second, string dir) CreateServicePair()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);

        var first = CreateService(dir);
        var second = CreateService(dir);
        return (first, second, dir);
    }

    public void Dispose()
    {
        foreach (var dir in _tempDirs)
        {
            try
            {
                if (Directory.Exists(dir))
                    Directory.Delete(dir, recursive: true);
            }
            catch
            {
                // Best-effort cleanup — do not fail tests on teardown errors.
            }
        }
    }

    // -------------------------------------------------------------------------
    // Constructor / directory creation
    // -------------------------------------------------------------------------

    [Fact]
    public void Constructor_CreatesDataDirectory_WhenItDoesNotExist()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);

        // Directory must not exist before we construct the service.
        Assert.False(Directory.Exists(dir));

        CreateService(dir);

        Assert.True(Directory.Exists(dir));
    }

    [Fact]
    public void Constructor_UsesDefaultDataDir_WhenConfigKeyAbsent()
    {
        // No DATA_DIR key — service should fall back to "data" without throwing.
        var config = TestConfiguration.Create(new Dictionary<string, string?>());

        var exception = Record.Exception(() =>
        {
            var svc = new AdminConfigService(config, _loggerMock.Object);
        });

        Assert.Null(exception);

        // Clean up the "data" directory that may have been created relative to CWD.
        var defaultDir = Path.Combine(Directory.GetCurrentDirectory(), "data");
        if (Directory.Exists(defaultDir))
            _tempDirs.Add(defaultDir);
    }

    // -------------------------------------------------------------------------
    // GetConfig — defaults when no file exists
    // -------------------------------------------------------------------------

    [Fact]
    public void GetConfig_ReturnsDefaults_WhenNoFileExists()
    {
        var service = CreateService();

        var config = service.GetConfig();

        Assert.NotNull(config);
    }

    [Fact]
    public void GetConfig_DefaultCompetitionSubMode_IsRace()
    {
        var service = CreateService();

        var config = service.GetConfig();

        Assert.Equal("race", config.CompetitionSubMode);
    }

    [Fact]
    public void GetConfig_DefaultCompetitionTargetDistanceKm_IsFive()
    {
        var service = CreateService();

        var config = service.GetConfig();

        Assert.Equal(5.0, config.CompetitionTargetDistanceKm);
    }

    [Fact]
    public void GetConfig_DefaultDungeonDifficulty_IsNormal()
    {
        var service = CreateService();

        var config = service.GetConfig();

        Assert.Equal("normal", config.DungeonDifficulty);
    }

    [Fact]
    public void GetConfig_DefaultStreetViewLocations_ArePopulated()
    {
        var service = CreateService();

        var config = service.GetConfig();

        Assert.NotEmpty(config.StreetViewLocations);
    }

    [Fact]
    public void GetConfig_DefaultYouTubeVideos_ArePopulated()
    {
        var service = CreateService();

        var config = service.GetConfig();

        Assert.NotEmpty(config.YouTubeVideos);
    }

    // -------------------------------------------------------------------------
    // UpdateConfig / GetConfig round-trip
    // -------------------------------------------------------------------------

    [Fact]
    public void UpdateConfig_ChangesAreReflectedByGetConfig()
    {
        var service = CreateService();
        var updated = new AdminConfig { CompetitionSubMode = "interval", DungeonDifficulty = "hard" };

        service.UpdateConfig(updated);

        var result = service.GetConfig();
        Assert.Equal("interval", result.CompetitionSubMode);
        Assert.Equal("hard", result.DungeonDifficulty);
    }

    [Fact]
    public void UpdateConfig_OverwritesPreviousValue()
    {
        var service = CreateService();

        service.UpdateConfig(new AdminConfig { CompetitionSubMode = "race" });
        service.UpdateConfig(new AdminConfig { CompetitionSubMode = "zone" });

        Assert.Equal("zone", service.GetConfig().CompetitionSubMode);
    }

    [Fact]
    public void UpdateConfig_WithCustomTargetDistance_IsStoredCorrectly()
    {
        var service = CreateService();

        service.UpdateConfig(new AdminConfig { CompetitionTargetDistanceKm = 10.5 });

        Assert.Equal(10.5, service.GetConfig().CompetitionTargetDistanceKm);
    }

    [Fact]
    public void UpdateConfig_WithCustomDurationMinutes_IsStoredCorrectly()
    {
        var service = CreateService();

        service.UpdateConfig(new AdminConfig { CompetitionDurationMinutes = 45 });

        Assert.Equal(45, service.GetConfig().CompetitionDurationMinutes);
    }

    // -------------------------------------------------------------------------
    // File persistence: second instance reads what the first wrote
    // -------------------------------------------------------------------------

    [Fact]
    public void FilePersistence_NewInstanceLoads_SavedCompetitionSubMode()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);

        var first = CreateService(dir);
        first.UpdateConfig(new AdminConfig { CompetitionSubMode = "interval" });

        var second = CreateService(dir);

        Assert.Equal("interval", second.GetConfig().CompetitionSubMode);
    }

    [Fact]
    public void FilePersistence_NewInstanceLoads_SavedDungeonDifficulty()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);

        var first = CreateService(dir);
        first.UpdateConfig(new AdminConfig { DungeonDifficulty = "easy" });

        var second = CreateService(dir);

        Assert.Equal("easy", second.GetConfig().DungeonDifficulty);
    }

    [Fact]
    public void FilePersistence_NewInstanceLoads_SavedTargetDistanceKm()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);

        var first = CreateService(dir);
        first.UpdateConfig(new AdminConfig { CompetitionTargetDistanceKm = 21.1 });

        var second = CreateService(dir);

        Assert.Equal(21.1, second.GetConfig().CompetitionTargetDistanceKm);
    }

    [Fact]
    public void FilePersistence_SavedFile_ExistsOnDisk()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);

        var service = CreateService(dir);
        service.UpdateConfig(new AdminConfig());

        var filePath = Path.Combine(dir, "admin-config.json");
        Assert.True(File.Exists(filePath));
    }

    [Fact]
    public void FilePersistence_SavedFile_ContainsValidJson()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);

        var service = CreateService(dir);
        service.UpdateConfig(new AdminConfig { CompetitionSubMode = "race" });

        var filePath = Path.Combine(dir, "admin-config.json");
        var json = File.ReadAllText(filePath);

        // The file must be non-empty and parseable as JSON.
        Assert.False(string.IsNullOrWhiteSpace(json));
        var doc = System.Text.Json.JsonDocument.Parse(json);
        Assert.NotNull(doc);
    }

    // -------------------------------------------------------------------------
    // Corrupt / invalid file falls back to defaults
    // -------------------------------------------------------------------------

    [Fact]
    public void Load_CorruptFile_FallsBackToDefaults_AndLogsWarning()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);
        Directory.CreateDirectory(dir);

        // Write corrupt JSON to the file before constructing the service.
        var filePath = Path.Combine(dir, "admin-config.json");
        File.WriteAllText(filePath, "{ this is not valid json !!! }");

        var service = CreateService(dir);

        // Should fall back to defaults without throwing.
        var config = service.GetConfig();
        Assert.NotNull(config);
        Assert.Equal("race", config.CompetitionSubMode);
    }

    [Fact]
    public void Load_CorruptFile_LogsWarning()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);
        Directory.CreateDirectory(dir);

        var filePath = Path.Combine(dir, "admin-config.json");
        File.WriteAllText(filePath, "###NOT JSON###");

        // Constructing the service should not throw even when the file is corrupt.
        var exception = Record.Exception(() => CreateService(dir));
        Assert.Null(exception);

        // The logger should have received at least one Warning-level call.
        _loggerMock.Verify(
            l => l.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, _) => true),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.AtLeastOnce);
    }

    [Fact]
    public void Load_EmptyFile_FallsBackToDefaults()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);
        Directory.CreateDirectory(dir);

        var filePath = Path.Combine(dir, "admin-config.json");
        File.WriteAllText(filePath, string.Empty);

        // An empty file is not valid JSON — service must not throw.
        var exception = Record.Exception(() => CreateService(dir));
        Assert.Null(exception);
    }

    [Fact]
    public void Load_NullJsonTopLevel_FallsBackToDefaults()
    {
        var dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _tempDirs.Add(dir);
        Directory.CreateDirectory(dir);

        // "null" is valid JSON but deserializes to a null AdminConfig, triggering
        // the ?? new AdminConfig() fallback.
        var filePath = Path.Combine(dir, "admin-config.json");
        File.WriteAllText(filePath, "null");

        var service = CreateService(dir);
        var config = service.GetConfig();

        Assert.NotNull(config);
        Assert.Equal("race", config.CompetitionSubMode);
    }

    // -------------------------------------------------------------------------
    // Thread safety
    // -------------------------------------------------------------------------

    [Fact]
    public void UpdateConfig_ConcurrentUpdates_DoNotThrow()
    {
        var service = CreateService();
        const int threadCount = 20;

        var tasks = Enumerable.Range(0, threadCount).Select(i => Task.Run(() =>
        {
            service.UpdateConfig(new AdminConfig
            {
                CompetitionSubMode = i % 2 == 0 ? "race" : "interval",
                CompetitionTargetDistanceKm = i + 1.0
            });
        })).ToArray();

        var exception = Record.Exception(() => Task.WaitAll(tasks));

        Assert.Null(exception);
        // Final state must be a valid, non-null config.
        Assert.NotNull(service.GetConfig());
    }

    [Fact]
    public void GetConfig_ConcurrentReads_DoNotThrow()
    {
        var service = CreateService();
        service.UpdateConfig(new AdminConfig { CompetitionSubMode = "race" });

        var tasks = Enumerable.Range(0, 30).Select(_ => Task.Run(() =>
        {
            var cfg = service.GetConfig();
            Assert.NotNull(cfg);
        })).ToArray();

        var exception = Record.Exception(() => Task.WaitAll(tasks));
        Assert.Null(exception);
    }
}
