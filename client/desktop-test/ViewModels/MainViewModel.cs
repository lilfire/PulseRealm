using System.Collections.ObjectModel;
using System.Globalization;
using System.Text.Json;
using Avalonia.Data.Converters;
using Avalonia.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PulseRealm.DesktopTest.Services;

namespace PulseRealm.DesktopTest.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly ServerDiscoveryClient _discovery = new();
    private readonly SignalRService _signalR = new();

    private Timer? _sendTimer;
    private Timer? _targetHrTimer;
    private Timer? _smoothHrTimer;
    private Timer? _simulationTimer;
    private double _lastMouseX = double.NaN;
    private double _lastMouseY = double.NaN;
    private double _mouseDistAccum;
    private int _prevStepsSnapshot;
    private int _targetHr = 65;
    private double _simPhase;

    [ObservableProperty] private string _clientId = $"desktop-test-{Random.Shared.Next(0x100000, 0xFFFFFF):x6}";

    [ObservableProperty] private string _serverUrl = "";
    [ObservableProperty] private string _joinCode = "";
    [ObservableProperty] private string _playerName = "TestPlayer";
    [ObservableProperty] private int _age = 25;
    [ObservableProperty] private double _heightCm = 175;
    [ObservableProperty] private double _weightKg = 70;
    [ObservableProperty] private double _strideFactor = 0.415;
    [ObservableProperty] private bool _isConnected;
    [ObservableProperty] private bool _realmIsEnded;
    [ObservableProperty] private string _summaryText = "";
    [ObservableProperty] private int _heartRate;
    [ObservableProperty] private int _steps;
    [ObservableProperty] private int _sendCount;
    [ObservableProperty] private int _sendIntervalMs = 1000;
    [ObservableProperty] private bool _isSimulating;
    [ObservableProperty] private double _incline;

    // Bind request state
    [ObservableProperty] private bool _showBindRequest;
    [ObservableProperty] private string _bindCode = "";

    // Discovery state
    [ObservableProperty] private bool _isSearching;
    [ObservableProperty] private string _searchStatus = "";
    [ObservableProperty] private bool _showManualEntry;
    [ObservableProperty] private bool _showServerSelection;
    [ObservableProperty] private string _manualUrl = "";
    [ObservableProperty] private string _manualError = "";

    public ObservableCollection<DiscoveredServer> DiscoveredServers { get; } = new();

    // Connection mode: false = local, true = remote
    [ObservableProperty] private bool _isRemoteMode;
    [ObservableProperty] private string _remoteUrl = "";

    public ObservableCollection<LogEntry> LogEntries { get; } = new();

    public MainViewModel()
    {
        _discovery.ScanningChanged += scanning =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() => IsSearching = scanning);

        _discovery.ServersChanged += servers =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                SearchStatus = $"Found {servers.Count} server(s)…");

        _signalR.LogReceived += (msg, cls) =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() => AddLog(msg, cls));

        _signalR.ConnectionChanged += connected =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() => IsConnected = connected);

        _signalR.RealmEnded += summary =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() => OnRealmEnded(summary));

        _signalR.RealmStarted += () =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                Steps = 0;
                _prevStepsSnapshot = 0;
                AddLog("Realm started — steps reset.", "info");
            });

        _signalR.BindRequested += code =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                BindCode = code;
                ShowBindRequest = true;
                AddLog($"Bind request received — code: {code}", "info");
            });

        _signalR.BindCancelled += () =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                ShowBindRequest = false;
                BindCode = "";
                AddLog("Bind request cancelled by dashboard.", "info");
            });

        _signalR.InclineChanged += (cid, incline) =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                if (cid == ClientId)
                    Incline = incline;
            });

        // HR target update — every 1 second, recompute target from activity
        _targetHrTimer = new Timer(_ =>
        {
            Avalonia.Threading.Dispatcher.UIThread.Post(UpdateTargetHr);
        }, null, 1000, 1000);

        // HR smoothing — every 200ms, move HR toward target
        _smoothHrTimer = new Timer(_ =>
        {
            Avalonia.Threading.Dispatcher.UIThread.Post(SmoothHeartRate);
        }, null, 200, 200);

        AddLog($"Client ID: {ClientId}", "info");
    }

    public async Task StartDiscoveryAsync()
    {
        ShowManualEntry = false;
        ShowServerSelection = false;
        SearchStatus = "Sending broadcast discovery request…";
        IsSearching = true;

        var servers = await _discovery.ScanAsync();

        IsSearching = false;
        DiscoveredServers.Clear();

        if (servers.Count == 1)
        {
            var server = servers[0];
            ServerUrl = server.BuildServerUrl();
            AddLog($"Server found: {server.Name} at {ServerUrl} (v{server.Version})", "info");
        }
        else if (servers.Count > 1)
        {
            foreach (var s in servers) DiscoveredServers.Add(s);
            ShowServerSelection = true;
            AddLog($"Found {servers.Count} servers on the network.", "info");
        }
        else
        {
            ShowManualEntry = true;
            AddLog("No server found via broadcast discovery.", "warn");
        }
    }

    [RelayCommand]
    private void SelectServer(DiscoveredServer server)
    {
        ServerUrl = server.BuildServerUrl();
        ShowServerSelection = false;
        AddLog($"Selected server: {server.Name} at {ServerUrl} (v{server.Version})", "info");
    }

    [RelayCommand]
    private async Task RetrySearch()
    {
        await StartDiscoveryAsync();
    }

    [RelayCommand]
    private void ShowManual()
    {
        ShowManualEntry = true;
        ManualError = "";
    }

    [RelayCommand]
    private void SwitchToLocal()
    {
        IsRemoteMode = false;
        ShowServerSelection = false;
        ServerUrl = "";
        _ = StartDiscoveryAsync();
    }

    [RelayCommand]
    private void SwitchToRemote()
    {
        IsRemoteMode = true;
        IsSearching = false;
        ShowManualEntry = false;
        ShowServerSelection = false;
    }

    private static string EnsureScheme(string raw)
    {
        var trimmed = raw.Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(trimmed)) return trimmed;
        if (trimmed.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            trimmed.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            return trimmed;
        return "https://" + trimmed;
    }

    [RelayCommand]
    private async Task RemoteConnect()
    {
        ManualError = "";
        var url = EnsureScheme(RemoteUrl);

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var resp = await http.GetAsync($"{url}/api/discovery");
            if (resp.IsSuccessStatusCode)
            {
                var json = await resp.Content.ReadAsStringAsync();
                if (json.Contains("PulseRealm"))
                {
                    ServerUrl = url;
                    IsRemoteMode = false;
                    AddLog($"Connected to remote server: {url}", "info");
                    return;
                }
            }
        }
        catch { }

        ManualError = "Could not reach a PulseRealm server at that address.";
    }

    [RelayCommand]
    private async Task ManualConnect()
    {
        ManualError = "";
        var url = EnsureScheme(ManualUrl);

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            var resp = await http.GetAsync($"{url}/api/discovery");
            if (resp.IsSuccessStatusCode)
            {
                var json = await resp.Content.ReadAsStringAsync();
                if (json.Contains("PulseRealm"))
                {
                    ServerUrl = url;
                    ShowManualEntry = false;
                    ShowServerSelection = false;
                    AddLog($"Connected to {url}", "info");
                    return;
                }
            }
        }
        catch { }

        ManualError = "Could not reach a PulseRealm server at that address.";
    }

    [RelayCommand]
    private async Task JoinRealm()
    {
        if (string.IsNullOrWhiteSpace(JoinCode))
        {
            AddLog("Enter a join code first.", "warn");
            return;
        }

        if (string.IsNullOrWhiteSpace(ServerUrl))
        {
            AddLog("No server URL. Run discovery or enter manually.", "warn");
            return;
        }

        AddLog($"Connecting to {ServerUrl}/hubs/realm …", "info");
        var ok = await _signalR.ConnectAsync(ServerUrl, JoinCode.Trim().ToUpperInvariant(), ClientId,
            PlayerName, Age, HeightCm, WeightKg, StrideFactor);

        if (ok)
        {
            StartSendTimer();
        }
    }

    [RelayCommand]
    private async Task Disconnect()
    {
        StopSimulation();
        StopSendTimer();
        Steps = 0;
        _prevStepsSnapshot = 0;
        await _signalR.LeaveRealmAsync();
    }

    [RelayCommand]
    private async Task SimulateConnectionLost()
    {
        StopSimulation();
        StopSendTimer();
        await _signalR.SimulateConnectionLostAsync();
    }

    [RelayCommand]
    private async Task ApproveBind()
    {
        ShowBindRequest = false;
        await _signalR.RespondBindAsync(true);
        AddLog("Bind approved.", "info");
        BindCode = "";
    }

    [RelayCommand]
    private async Task DeclineBind()
    {
        ShowBindRequest = false;
        await _signalR.RespondBindAsync(false);
        AddLog("Bind declined.", "warn");
        BindCode = "";
    }

    [RelayCommand]
    private void ToggleSimulation()
    {
        if (IsSimulating)
        {
            StopSimulation();
        }
        else
        {
            _simPhase = 0;
            IsSimulating = true;
            _simulationTimer = new Timer(_ =>
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(SimulationTick);
            }, null, 0, 500);
            AddLog("Auto-simulation started.", "info");
        }
    }

    private void SimulationTick()
    {
        // Steps: 1–3 per tick (500ms), simulating ~120–360 spm
        Steps += Random.Shared.Next(1, 4);

        // HR: sine wave between 90–160 bpm with slight random jitter
        _simPhase += 0.05;
        var base_hr = 125 + 35 * Math.Sin(_simPhase);
        _targetHr = (int)(base_hr + Random.Shared.Next(-3, 4));
        _targetHr = Math.Clamp(_targetHr, 90, 160);
    }

    private void StopSimulation()
    {
        _simulationTimer?.Dispose();
        _simulationTimer = null;
        if (IsSimulating)
        {
            IsSimulating = false;
            AddLog("Auto-simulation stopped.", "info");
        }
    }

    private void OnRealmEnded(JsonElement summary)
    {
        StopSimulation();
        StopSendTimer();

        var duration = summary.TryGetProperty("durationSeconds", out var d) ? d.GetDouble() : 0;
        var distance = summary.TryGetProperty("totalDistanceMeters", out var dist) ? dist.GetDouble() : 0;
        var totalSteps = summary.TryGetProperty("totalSteps", out var st) ? st.GetInt32() : 0;
        var avgHr = summary.TryGetProperty("averageHeartRate", out var ahr) ? ahr.GetInt32() : 0;
        var maxHr = summary.TryGetProperty("maxHeartRate", out var mhr) ? mhr.GetInt32() : 0;
        var avgCadence = summary.TryGetProperty("avgCadenceSpm", out var cad) ? cad.GetInt32() : 0;
        var activePeriod = summary.TryGetProperty("activePeriodSeconds", out var ap) ? ap.GetDouble() : 0;
        var participantCount = summary.TryGetProperty("participantCount", out var pc) ? pc.GetInt32() : 0;
        var isTeamFormat = summary.TryGetProperty("isTeamFormat", out var tf) && tf.GetBoolean();

        var hasClientSummaries = summary.TryGetProperty("clientSummaries", out var csArr)
                                 && csArr.ValueKind == JsonValueKind.Array
                                 && csArr.GetArrayLength() > 0;

        string FormatDur(double s) { var m2 = (int)(s / 60); var s2 = (int)(s % 60); return m2 > 0 ? $"{m2}m {s2}s" : $"{s2}s"; }
        string FormatDist(double m) => m >= 1000 ? $"{m / 1000:F2} km" : $"{m:F0} m";
        string FormatZone(int secs) { var zm = secs / 60; var zs = secs % 60; return zm > 0 ? $"{zm}m {zs:D2}s" : $"{zs}s"; }

        // ── Find personal stats first (needed by team section too) ──
        JsonElement? mySummary = null;
        if (hasClientSummaries)
        {
            foreach (var cs in csArr.EnumerateArray())
            {
                var cid = cs.TryGetProperty("clientId", out var cidVal) ? cidVal.GetString() : null;
                if (cid == ClientId)
                {
                    mySummary = cs;
                    break;
                }
            }
        }

        // ── Realm stats ──
        SummaryText = $"── Realm ──\nDuration: {FormatDur(duration)}  |  Active: {FormatDur(activePeriod)}  |  Participants: {participantCount}";

        // ── Team stats (competition team format only) ──
        if (isTeamFormat && hasClientSummaries)
        {
            // Find this client's team from clientSummaries
            string? myTeam = null;
            if (mySummary is { } myCs)
            {
                myTeam = myCs.TryGetProperty("teamName", out var tn) ? tn.GetString() : null;
            }

            // Compute team-specific stats by filtering to teammates
            double teamDist = 0;
            int teamSteps = 0;
            int teamHrSum = 0, teamHrCount = 0, teamMaxHr = 0;
            foreach (var cs in csArr.EnumerateArray())
            {
                var csTeam = cs.TryGetProperty("teamName", out var ctn) ? ctn.GetString() : null;
                if (myTeam != null && csTeam != myTeam) continue;

                teamDist += cs.TryGetProperty("distanceMeters", out var cdm) ? cdm.GetDouble() : 0;
                teamSteps += cs.TryGetProperty("steps", out var csp) ? csp.GetInt32() : 0;
                var csHr = cs.TryGetProperty("averageHeartRate", out var cahr) ? cahr.GetInt32() : 0;
                if (csHr > 0) { teamHrSum += csHr; teamHrCount++; }
                var csMhr = cs.TryGetProperty("maxHeartRate", out var cmhr2) ? cmhr2.GetInt32() : 0;
                if (csMhr > teamMaxHr) teamMaxHr = csMhr;
            }
            var teamAvgHr = teamHrCount > 0 ? teamHrSum / teamHrCount : 0;
            var teamLabel = myTeam ?? "Team";

            SummaryText += $"\n\n── {teamLabel} ──\nDistance: {FormatDist(teamDist)}  |  Steps: {teamSteps}" +
                           $"\nAvg HR: {teamAvgHr} bpm  |  Peak HR: {teamMaxHr} bpm";
        }

        if (mySummary is { } my)
        {
            var name = my.TryGetProperty("name", out var n) ? n.GetString() ?? "?" : "?";
            var cSteps = my.TryGetProperty("steps", out var cst) ? cst.GetInt32() : 0;
            var cDist = my.TryGetProperty("distanceMeters", out var cd) ? cd.GetDouble() : 0;
            var cAvgHr = my.TryGetProperty("averageHeartRate", out var cah) ? cah.GetInt32() : 0;
            var cMaxHr = my.TryGetProperty("maxHeartRate", out var cmh) ? cmh.GetInt32() : 0;
            var cCadence = my.TryGetProperty("avgCadenceSpm", out var ccad) ? ccad.GetInt32() : 0;
            SummaryText += $"\n\n── Personal ({name}) ──";
            SummaryText += $"\n  {cSteps} steps, {FormatDist(cDist)}, Avg HR {cAvgHr}, Peak HR {cMaxHr}, Cadence {cCadence} spm";

            if (my.TryGetProperty("timeInZone", out var tiz) && tiz.ValueKind == JsonValueKind.Object)
            {
                var zones = new List<string>();
                for (var z = 1; z <= 5; z++)
                {
                    if (tiz.TryGetProperty(z.ToString(), out var zv) && zv.GetInt32() > 0)
                        zones.Add($"Z{z}: {FormatZone(zv.GetInt32())}");
                }
                if (zones.Count > 0)
                    SummaryText += $"\n  Zones: {string.Join(", ", zones)}";
            }
        }
        else
        {
            SummaryText += $"\n\n── Personal ──\nDistance: {FormatDist(distance)}  |  Steps: {totalSteps}" +
                           $"\nAvg HR: {avgHr} bpm  |  Peak HR: {maxHr} bpm  |  Cadence: {avgCadence} spm";

            if (summary.TryGetProperty("timeInZone", out var tiz) && tiz.ValueKind == JsonValueKind.Object)
            {
                var zones = new List<string>();
                for (var z = 1; z <= 5; z++)
                {
                    if (tiz.TryGetProperty(z.ToString(), out var zv) && zv.GetInt32() > 0)
                        zones.Add($"Z{z}: {FormatZone(zv.GetInt32())}");
                }
                if (zones.Count > 0)
                    SummaryText += $"\nZones: {string.Join(", ", zones)}";
            }
        }

        RealmIsEnded = true;
        AddLog("Realm ended by dashboard.", "warn");
        AddLog(SummaryText, "info");
    }

    [RelayCommand]
    private async Task DismissSummary()
    {
        await _signalR.DisconnectAsync();
        RealmIsEnded = false;
        SummaryText = "";
        IsConnected = false;
        Steps = 0;
        SendCount = 0;
        JoinCode = "";
        AddLog("Disconnected.", "warn");
    }

    partial void OnSendIntervalMsChanged(int value)
    {
        if (IsConnected)
        {
            StopSendTimer();
            StartSendTimer();
        }
    }

    private void StartSendTimer()
    {
        StopSendTimer();
        _sendTimer = new Timer(async _ =>
        {
            await _signalR.SendDataAsync(ClientId, HeartRate, Steps);
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                SendCount++;
                AddLog($"→ HR={HeartRate} Steps={Steps}", "send");
            });
        }, null, 0, SendIntervalMs);
    }

    private void StopSendTimer()
    {
        _sendTimer?.Dispose();
        _sendTimer = null;
    }

    // Called from the view on PointerPressed
    public void OnClick()
    {
        Steps++;
    }

    // Called from the view on PointerMoved
    public void OnMouseMove(double x, double y)
    {
        if (!double.IsNaN(_lastMouseX))
        {
            var dx = x - _lastMouseX;
            var dy = y - _lastMouseY;
            _mouseDistAccum += Math.Sqrt(dx * dx + dy * dy);
        }
        _lastMouseX = x;
        _lastMouseY = y;
    }

    /// <summary>Runs every 1s — computes a new target HR from mouse + step activity.</summary>
    private void UpdateTargetHr()
    {
        const int RestingHr = 65;
        const int MaxHr = 190;

        // Mouse: total pixels moved in the last 1s. 500px = moderate, 1500px+ = intense.
        var mouseDist = _mouseDistAccum;
        _mouseDistAccum = 0;
        var mouseActivity = Math.Min(mouseDist / 1500.0, 1.0);

        // Steps: clicks in the last 1s. 3 cps = intense (180 spm equivalent).
        var stepDelta = Steps - _prevStepsSnapshot;
        _prevStepsSnapshot = Steps;
        var stepActivity = Math.Min(stepDelta / 3.0, 1.0);

        var activity = Math.Max(mouseActivity, stepActivity);
        _targetHr = (int)(RestingHr + activity * (MaxHr - RestingHr));
    }

    /// <summary>Runs every 200ms — smoothly moves HR toward target.</summary>
    private void SmoothHeartRate()
    {
        if (HeartRate < _targetHr)
            HeartRate = Math.Min(_targetHr, HeartRate + 5);
        else if (HeartRate > _targetHr)
            HeartRate = Math.Max(_targetHr, HeartRate - 2);
    }

    internal void AddLog(string message, string level)
    {
        var ts = DateTime.Now.ToString("HH:mm:ss.f");
        LogEntries.Add(new LogEntry($"[{ts}] {message}", level));

        // Keep log manageable
        while (LogEntries.Count > 500)
            LogEntries.RemoveAt(0);
    }
}

public record LogEntry(string Text, string Level);

// Simple value converters for XAML bindings
public class FuncValueConverter<TIn, TOut>(Func<TIn?, TOut> convert) : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is TIn v ? convert(v) : default;

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public partial class MainViewModel
{
    public static readonly IValueConverter ConnectedBgConverter =
        new FuncValueConverter<bool, IBrush>(v => new SolidColorBrush(v ? Color.Parse("#166534") : Color.Parse("#991b1b")));

    public static readonly IValueConverter ConnectedFgConverter =
        new FuncValueConverter<bool, IBrush>(v => new SolidColorBrush(v ? Color.Parse("#86efac") : Color.Parse("#fca5a5")));

    public static readonly IValueConverter ConnectedTextConverter =
        new FuncValueConverter<bool, string>(v => v ? "Connected" : "Disconnected");

    public static readonly IValueConverter IntervalTextConverter =
        new FuncValueConverter<int, string>(v => v >= 1000 ? $"{v / 1000.0:0.#}s" : $"{v}ms");

    public static readonly IValueConverter SimBgConverter =
        new FuncValueConverter<bool, IBrush>(v => new SolidColorBrush(v ? Color.Parse("#34d399") : Color.Parse("#38bdf8")));

    public static readonly IValueConverter SimFgConverter =
        new FuncValueConverter<bool, IBrush>(v => new SolidColorBrush(v ? Color.Parse("#0f172a") : Color.Parse("#0f172a")));

    public static readonly IValueConverter SimTextConverter =
        new FuncValueConverter<bool, string>(v => v ? "Stop Sim" : "Simulate");

    public static readonly IValueConverter LogColorConverter =
        new FuncValueConverter<string, IBrush>(level => new SolidColorBrush(level switch
        {
            "info" => Color.Parse("#38bdf8"),
            "warn" => Color.Parse("#fbbf24"),
            "error" => Color.Parse("#f87171"),
            "send" => Color.Parse("#a78bfa"),
            _ => Color.Parse("#64748b"),
        }));
}
