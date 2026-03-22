using Microsoft.Extensions.Configuration;

namespace PulseRealm.Server.Tests;

public static class TestConfiguration
{
    public static IConfiguration Create(Dictionary<string, string?> values)
    {
        return new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();
    }
}
