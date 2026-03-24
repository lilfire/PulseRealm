# PulseRealm — Apple Watch Client

Swift-based wearable data collector for Apple Watch (watchOS).

## Overview

This client reads sensor data (heart rate, step count) via HealthKit and streams it to the PulseRealm server via WebSocket.

## Setup

1. Open the Xcode project in this directory
2. Build and deploy to an Apple Watch or simulator

## Testing

Unit tests live in `PulseRealmTests/` and cover:

- **ModelsTests** — Codable round-trips for ClientProfile, WearableData, RealmInfo; DiscoveredServer computed properties; enum cases
- **AnyCodableTests** — Encode/decode all supported types (Int, Double, Bool, String, Array, Dictionary, null)
- **SignalRClientTests** — WebSocket URL building, SignalR message decoding, error descriptions, initial state
- **AppStateTests** — Profile save/load, navigation state transitions, streaming lifecycle, leave realm
- **HealthKitManagerTests** — Simulator authorization, collection start/stop, simulation heart rate range and step increments
- **ServerDiscoveryTests** — Response parsing, invalid/missing data handling, DiscoveryResponse Codable, initial state

Run tests in Xcode: `Product > Test` (Cmd+U) targeting the `PulseRealmTests` scheme.

## Status

- [x] Scaffold watchOS project in Xcode
- [x] Implement HealthKit data collection (heart rate, step counter)
- [x] Implement WebSocket client for server communication
- [x] Add join code entry UI
- [x] Unit test suite with coverage target ≥80%
- [ ] Handle watchOS background realm constraints
