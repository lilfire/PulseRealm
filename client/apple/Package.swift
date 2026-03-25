// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PulseRealm",
    platforms: [.macOS(.v13)],
    targets: [
        .target(
            name: "PulseRealm_Watch_App",
            path: "PulseRealm Watch App",
            sources: ["Models.swift", "SignalRClient.swift", "ServerDiscovery.swift"]
        ),
        .testTarget(
            name: "PulseRealmTests",
            dependencies: ["PulseRealm_Watch_App"],
            path: "PulseRealmTests",
            sources: [
                "ModelsTests.swift",
                "SignalRClientTests.swift",
                "AnyCodableTests.swift",
                "ServerDiscoveryTests.swift"
            ]
        )
    ]
)
