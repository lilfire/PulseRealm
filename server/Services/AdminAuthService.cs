namespace PulseRealm.Server.Services;

public class AdminAuthService
{
    private readonly string? _username;
    private readonly string? _password;
    private readonly HashSet<string> _tokens = [];
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
        if (password != _password) return null;

        var token = Guid.NewGuid().ToString("N");
        lock (_lock)
        {
            _tokens.Add(token);
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
            return _tokens.Contains(token);
        }
    }
}
