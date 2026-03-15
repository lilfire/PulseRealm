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
    private double _lastMouseX = double.NaN;
    private double _lastMouseY = double.NaN;
    private double _mouseDistAccum;
    private int _prevStepsSnapshot;
    private int _targetHr = 65;

    public string ClientId { get; } = $"desktop-test-{Random.Shared.Next(0x100000, 0xFFFFFF):x6}";

    [ObservableProperty] private string _serverUrl = "";
    [ObservableProperty] private string _joinCode = "";
    [ObservableProperty] private string _playerName = "";
    [ObservableProperty] private double _heightCm;
    [ObservableProperty] private double _weightKg;
    [ObservableProperty] private bool _isConnected;
    [ObservableProperty] private bool _realmIsEnded;
    [ObservableProperty] private string _summaryText = "";
    [ObservableProperty] private int _heartRate;
    [ObservableProperty] private int _steps;
    [ObservableProperty] private int _sendCount;
    [ObservableProperty] private int _sendIntervalMs = 1000;

    // Discovery state
    [ObservableProperty] private bool _isSearching;
    [ObservableProperty] private string _searchStatus = "";
    [ObservableProperty] private bool _showManualEntry;
    [ObservableProperty] private string _manualUrl = "http://";
    [ObservableProperty] private string _manualError = "";

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
        SearchStatus = "Sending broadcast discovery request…";
        IsSearching = true;

        var servers = await _discovery.ScanAsync();

        if (servers.Count > 0)
        {
            var server = servers[0];
            ServerUrl = server.BuildServerUrl();
            AddLog($"Server found: {server.Name} at {ServerUrl} (v{server.Version})", "info");
            IsSearching = false;
        }
        else
        {
            SearchStatus = "No server found on the network.";
            IsSearching = false;
            ShowManualEntry = true;
            AddLog("No server found via broadcast discovery.", "warn");
        }
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
    private async Task ManualConnect()
    {
        ManualError = "";
        var url = ManualUrl.TrimEnd('/');

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
            PlayerName, HeightCm, WeightKg);

        if (ok)
        {
            StartSendTimer();
        }
    }

    [RelayCommand]
    private async Task Disconnect()
    {
        StopSendTimer();
        await _signalR.DisconnectAsync();
        AddLog("Disconnected.", "warn");
    }

    private void OnRealmEnded(JsonElement summary)
    {
        StopSendTimer();

        var duration = summary.TryGetProperty("durationSeconds", out var d) ? d.GetDouble() : 0;
        var distance = summary.TryGetProperty("totalDistanceMeters", out var dist) ? dist.GetDouble() : 0;
        var totalSteps = summary.TryGetProperty("totalSteps", out var st) ? st.GetInt32() : 0;
        var avgHr = summary.TryGetProperty("averageHeartRate", out var ahr) ? ahr.GetInt32() : 0;
        var maxHr = summary.TryGetProperty("maxHeartRate", out var mhr) ? mhr.GetInt32() : 0;
        var avgSpeed = summary.TryGetProperty("averageSpeedKmh", out var spd) ? spd.GetDouble() : 0;

        var mins = (int)(duration / 60);
        var secs = (int)(duration % 60);
        var durationText = mins > 0 ? $"{mins}m {secs}s" : $"{secs}s";
        var distanceText = distance >= 1000 ? $"{distance / 1000:F2} km" : $"{distance:F0} m";

        SummaryText = $"Duration: {durationText}  |  Distance: {distanceText}  |  Steps: {totalSteps}\n" +
                      $"Avg Speed: {avgSpeed:F1} km/h  |  Avg HR: {avgHr} bpm  |  Max HR: {maxHr} bpm";

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

    private void AddLog(string message, string level)
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
