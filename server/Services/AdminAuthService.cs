using System.Security.Cryptography;
using System.Text;

namespace PulseRealm.Server.Services;

public class AdminAuthService
{
    private static readonly TimeSpan TokenTtl = TimeSpan.FromHours(8);

    private readonly string? _username;
    private readonly string? _password;
    private readonly Dictionary<string, DateTime> _tokens = new();
    private readonly object _lock = new();

    public AdminAuthService(IConfiguration configuration)
    {
        _username = configuration["ADMIN_USERNAME"];
        _password = configuration["ADMIN_PASSWORD"];
    }

    public bool IsConfigured => !string.IsNullOrEmpty(_password);

    public string? Login(string username, string password)
    {
        if (!IsConfigured) return null;
        if (!string.Equals(username, _username, StringComparison.OrdinalIgnoreCase)) return null;
        if (!TimingSafeEqual(password, _password!)) return null;

        var token = Guid.NewGuid().ToString("N");
        lock (_lock)
        {
            _tokens[token] = DateTime.UtcNow;
        }
        return token;
    }

    public void Logout(string token)
    {
        lock (_lock)
        {
            _tokens.Remove(token);
        }
    }

    public bool ValidateToken(string token)
    {
        lock (_lock)
        {
            if (!_tokens.TryGetValue(token, out var createdAt))
                return false;

            if (DateTime.UtcNow - createdAt > TokenTtl)
            {
                _tokens.Remove(token);
                return false;
            }

            return true;
        }
    }

    /// <summary>
    /// Removes all tokens that have exceeded the TTL. Called periodically by RealmCleanupService.
    /// </summary>
    public void CleanupExpiredTokens()
    {
        lock (_lock)
        {
            var now = DateTime.UtcNow;
            var expired = _tokens
                .Where(kvp => now - kvp.Value > TokenTtl)
                .Select(kvp => kvp.Key)
                .ToList();
            foreach (var token in expired)
                _tokens.Remove(token);
        }
    }

    private static bool TimingSafeEqual(string a, string b)
    {
        var bytesA = Encoding.UTF8.GetBytes(a);
        var bytesB = Encoding.UTF8.GetBytes(b);
        return CryptographicOperations.FixedTimeEquals(bytesA, bytesB);
    }
}
