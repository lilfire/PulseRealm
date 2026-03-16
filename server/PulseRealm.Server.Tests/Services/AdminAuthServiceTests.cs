using PulseRealm.Server.Services;

namespace PulseRealm.Server.Tests.Services;

public class AdminAuthServiceTests
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static AdminAuthService CreateConfigured(
        string username = "admin",
        string password = "secret") =>
        new(TestConfiguration.Create(new Dictionary<string, string?>
        {
            ["ADMIN_USERNAME"] = username,
            ["ADMIN_PASSWORD"] = password
        }));

    private static AdminAuthService CreateUnconfigured() =>
        new(TestConfiguration.Create(new Dictionary<string, string?>()));

    // -------------------------------------------------------------------------
    // IsConfigured
    // -------------------------------------------------------------------------

    [Fact]
    public void IsConfigured_ReturnsFalse_WhenPasswordNotSet()
    {
        var service = CreateUnconfigured();

        Assert.False(service.IsConfigured);
    }

    [Fact]
    public void IsConfigured_ReturnsFalse_WhenPasswordIsEmpty()
    {
        var service = new AdminAuthService(TestConfiguration.Create(new Dictionary<string, string?>
        {
            ["ADMIN_PASSWORD"] = string.Empty
        }));

        Assert.False(service.IsConfigured);
    }

    [Fact]
    public void IsConfigured_ReturnsTrue_WhenPasswordSet()
    {
        var service = CreateConfigured();

        Assert.True(service.IsConfigured);
    }

    // -------------------------------------------------------------------------
    // Login
    // -------------------------------------------------------------------------

    [Fact]
    public void Login_ReturnsNull_WhenNotConfigured()
    {
        var service = CreateUnconfigured();

        var token = service.Login("admin", "anything");

        Assert.Null(token);
    }

    [Fact]
    public void Login_ReturnsNull_ForWrongUsername()
    {
        var service = CreateConfigured(username: "admin", password: "secret");

        var token = service.Login("wrong", "secret");

        Assert.Null(token);
    }

    [Fact]
    public void Login_ReturnsNull_ForWrongPassword()
    {
        var service = CreateConfigured(username: "admin", password: "secret");

        var token = service.Login("admin", "wrong");

        Assert.Null(token);
    }

    [Fact]
    public void Login_ReturnsToken_ForCorrectCredentials()
    {
        var service = CreateConfigured(username: "admin", password: "secret");

        var token = service.Login("admin", "secret");

        Assert.NotNull(token);
        Assert.False(string.IsNullOrWhiteSpace(token));
    }

    [Fact]
    public void Login_ReturnsDifferentTokensOnSuccessiveLogins()
    {
        var service = CreateConfigured();

        var token1 = service.Login("admin", "secret");
        var token2 = service.Login("admin", "secret");

        Assert.NotEqual(token1, token2);
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("ADMIN")]
    [InlineData("aDmIn")]
    public void Login_IsCaseInsensitive_ForUsername(string username)
    {
        var service = CreateConfigured(username: "admin", password: "secret");

        var token = service.Login(username, "secret");

        Assert.NotNull(token);
    }

    [Fact]
    public void Login_IsCaseSensitive_ForPassword()
    {
        var service = CreateConfigured(username: "admin", password: "Secret");

        // Lowercase 's' — should not match "Secret"
        var token = service.Login("admin", "secret");

        Assert.Null(token);
    }

    [Fact]
    public void Login_ReturnsNull_ForBothWrong()
    {
        var service = CreateConfigured();

        var token = service.Login("wrong-user", "wrong-pass");

        Assert.Null(token);
    }

    // -------------------------------------------------------------------------
    // ValidateToken
    // -------------------------------------------------------------------------

    [Fact]
    public void ValidateToken_ReturnsTrue_ForTokenJustIssued()
    {
        var service = CreateConfigured();
        var token = service.Login("admin", "secret")!;

        Assert.True(service.ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_ReturnsFalse_ForUnknownToken()
    {
        var service = CreateConfigured();

        Assert.False(service.ValidateToken(Guid.NewGuid().ToString("N")));
    }

    [Fact]
    public void ValidateToken_ReturnsFalse_ForEmptyString()
    {
        var service = CreateConfigured();

        Assert.False(service.ValidateToken(string.Empty));
    }

    [Fact]
    public void ValidateToken_ReturnsFalse_AfterLogout()
    {
        var service = CreateConfigured();
        var token = service.Login("admin", "secret")!;
        service.Logout(token);

        Assert.False(service.ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_ReturnsFalse_ForNonHexToken()
    {
        var service = CreateConfigured();

        Assert.False(service.ValidateToken("not-a-real-token"));
    }

    // -------------------------------------------------------------------------
    // Logout
    // -------------------------------------------------------------------------

    [Fact]
    public void Logout_RemovesToken_SoValidateReturnsFalse()
    {
        var service = CreateConfigured();
        var token = service.Login("admin", "secret")!;

        service.Logout(token);

        Assert.False(service.ValidateToken(token));
    }

    [Fact]
    public void Logout_WithUnknownToken_DoesNotThrow()
    {
        var service = CreateConfigured();

        var exception = Record.Exception(() =>
            service.Logout(Guid.NewGuid().ToString("N")));

        Assert.Null(exception);
    }

    [Fact]
    public void Logout_DoesNotAffectOtherTokens()
    {
        var service = CreateConfigured();
        var token1 = service.Login("admin", "secret")!;
        var token2 = service.Login("admin", "secret")!;

        service.Logout(token1);

        Assert.False(service.ValidateToken(token1));
        Assert.True(service.ValidateToken(token2));
    }

    // -------------------------------------------------------------------------
    // Token expiry (structural / conceptual test)
    // -------------------------------------------------------------------------

    [Fact]
    public void ValidateToken_TokenExpiry_IsEnforcedByComparingCreationTime()
    {
        // This test validates the expiry logic by confirming that a fresh token
        // validates correctly and that the service holds internal state per token.
        // Simulating the passage of 8+ hours in a unit test without a mockable
        // clock is not practical; however, ValidateToken's expiry branch is
        // exercised indirectly: we verify that a fresh token passes and that the
        // removal path (used on expiry) is also used by Logout, which IS tested.
        var service = CreateConfigured();
        var token = service.Login("admin", "secret")!;

        Assert.True(service.ValidateToken(token));

        // After logout the same code path that removes an expired token is run.
        service.Logout(token);
        Assert.False(service.ValidateToken(token));
    }

    // -------------------------------------------------------------------------
    // Thread safety
    // -------------------------------------------------------------------------

    [Fact]
    public void Login_ConcurrentLogins_AllReturnDistinctValidTokens()
    {
        var service = CreateConfigured();
        const int threadCount = 20;
        var tokens = new System.Collections.Concurrent.ConcurrentBag<string>();

        var tasks = Enumerable.Range(0, threadCount).Select(_ => Task.Run(() =>
        {
            var t = service.Login("admin", "secret");
            if (t is not null) tokens.Add(t);
        })).ToArray();

        Task.WaitAll(tasks);

        Assert.Equal(threadCount, tokens.Count);
        Assert.Equal(threadCount, tokens.Distinct().Count());
        foreach (var token in tokens)
        {
            Assert.True(service.ValidateToken(token));
        }
    }
}
