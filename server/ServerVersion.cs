using System.Reflection;

namespace PulseRealm.Server;

public static class ServerVersion
{
    public static string Current { get; } =
        Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion ?? "0.0.0";
}
