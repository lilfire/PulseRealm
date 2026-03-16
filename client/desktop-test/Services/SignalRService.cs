using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace PulseRealm.DesktopTest.Services;

public class SignalRService : IAsyncDisposable
{
    private HubConnection? _connection;
    private string? _realmId;

    public event Action<string, string>? LogReceived; // message, css class
    public event Action<bool>? ConnectionChanged;
    public event Action<JsonElement>? RealmEnded;

    public bool IsConnected => _connection?.State == HubConnectionState.Connected;
    public string? RealmId => _realmId;

    public async Task<bool> ConnectAsync(string serverUrl, string joinCode, string clientId,
        string playerName = "", double heightCm = 0, double weightKg = 0)
    {
        try
        {
            var baseUrl = serverUrl.TrimEnd('/');

            _connection = new HubConnectionBuilder()
                .WithUrl($"{baseUrl}/hubs/realm")
                .WithAutomaticReconnect()
                .Build();

            _connection.On<string>("ClientJoined", cid =>
                LogReceived?.Invoke($"Client joined: {cid}", "info"));

            _connection.On<JsonElement>("WearableDataReceived", data =>
            {
                var cid = data.TryGetProperty("clientId", out var c) ? c.GetString() : "?";
                if (cid != clientId)
                {
                    var hr = data.TryGetProperty("heartRate", out var h) ? h.GetInt32() : 0;
                    var steps = data.TryGetProperty("steps", out var s) ? s.GetInt32() : 0;
                    LogReceived?.Invoke($"Data from {cid}: HR={hr} Steps={steps}", "info");
                }
            });

            _connection.On<JsonElement>("RealmEnded", summary =>
            {
                RealmEnded?.Invoke(summary);
            });

            _connection.On<string>("Error", msg =>
                LogReceived?.Invoke($"Server error: {msg}", "error"));

            _connection.On<string>("JoinedRealm", sid =>
                LogReceived?.Invoke($"Confirmed in realm: {sid}", "info"));

            _connection.Closed += _ =>
            {
                LogReceived?.Invoke("Connection closed.", "warn");
                ConnectionChanged?.Invoke(false);
                return Task.CompletedTask;
            };

            _connection.Reconnecting += _ =>
            {
                LogReceived?.Invoke("Reconnecting...", "warn");
                ConnectionChanged?.Invoke(false);
                return Task.CompletedTask;
            };

            _connection.Reconnected += _ =>
            {
                LogReceived?.Invoke("Reconnected.", "info");
                ConnectionChanged?.Invoke(true);
                return Task.CompletedTask;
            };

            await _connection.StartAsync();
            LogReceived?.Invoke("SignalR connected. Joining realm...", "info");

            var profile = new
            {
                clientId,
                name = playerName,
                heightCm,
                weightKg,
            };
            await _connection.InvokeAsync("JoinRealm", joinCode, clientId, profile);

            // Look up realm ID
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var resp = await http.GetAsync($"{baseUrl}/api/realm/{joinCode}");
            if (!resp.IsSuccessStatusCode)
            {
                LogReceived?.Invoke("Could not look up realm info.", "error");
                await _connection.StopAsync();
                return false;
            }

            var realm = JsonSerializer.Deserialize<JsonElement>(await resp.Content.ReadAsStringAsync());
            _realmId = realm.GetProperty("id").GetString();

            LogReceived?.Invoke($"Joined realm {_realmId} (code: {joinCode}) as {clientId}", "info");
            ConnectionChanged?.Invoke(true);
            return true;
        }
        catch (Exception ex)
        {
            // HubException carries the server's validation message directly
            var msg = ex is HubException
                ? ex.Message
                : $"Connection failed: {ex.Message}";
            LogReceived?.Invoke(msg, "error");
            ConnectionChanged?.Invoke(false);
            return false;
        }
    }

    public async Task SendDataAsync(string clientId, int heartRate, int steps)
    {
        if (_connection is null || _realmId is null) return;

        var data = new
        {
            clientId,
            heartRate,
            steps,
            timestamp = DateTime.UtcNow.ToString("o"),
        };

        try
        {
            await _connection.InvokeAsync("SendWearableData", _realmId, data);
        }
        catch (Exception ex)
        {
            LogReceived?.Invoke($"Send failed: {ex.Message}", "error");
        }
    }

    public async Task DisconnectAsync()
    {
        _realmId = null;
        if (_connection is not null)
        {
            await _connection.StopAsync();
            _connection = null;
        }
        ConnectionChanged?.Invoke(false);
    }

    public async ValueTask DisposeAsync()
    {
        if (_connection is not null)
        {
            await _connection.DisposeAsync();
        }
    }
}
