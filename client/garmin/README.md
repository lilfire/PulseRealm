# PulseRealm — Garmin Connect IQ Client

Monkey C-based wearable data collector for Garmin devices.

## Overview

This client reads sensor data (heart rate, step count) from Garmin wearables and streams it to the PulseRealm server via the SignalR JSON WebSocket protocol.

## Project Structure

```
client/garmin/
├── monkey.jungle              # Connect IQ build configuration
├── manifest.xml               # App manifest (permissions, products, settings)
├── resources/
│   └── strings.xml            # UI string resources
└── source/
    ├── PulseRealmApp.mc       # App entry point + global state
    ├── SensorManager.mc       # Heart rate + step count (Sensor + ActivityMonitor)
    ├── SignalRClient.mc       # HTTP negotiate + WebSocket + SignalR protocol
    ├── JoinCodeView.mc        # 6-digit join code entry UI
    ├── JoinCodeDelegate.mc    # Button/touch input for code entry
    ├── StreamingView.mc       # Live HR / steps / connection status display
    ├── StreamingDelegate.mc   # Input handling during streaming
    └── BackgroundService.mc   # Temporal event handler (background streaming)
```

## Setup

1. Install the [Connect IQ SDK](https://developer.garmin.com/connect-iq/sdk/)
2. Open this directory in VS Code with the [Monkey C extension](https://marketplace.visualstudio.com/items?itemName=garmin.monkey-c)
3. Set the SDK path in VS Code settings (`monkeyC.sdkPath`)
4. Build and run in the simulator:
   - Press **F5** or run `Build for Device` from the Command Palette

## Configuration

App settings are configured via the **Garmin Connect phone app** under the app's settings panel, or in the simulator's Settings dialog:

| Setting      | Type   | Default              | Description                            |
|--------------|--------|----------------------|----------------------------------------|
| `serverUrl`  | String | `http://192.168.1.100:5062` | PulseRealm server base URL    |
| `playerName` | String | `Garmin User`        | Display name in the realm              |
| `heightCm`   | Number | `170`                | Height in cm (for speed estimation)    |
| `weightKg`   | Number | `70`                 | Weight in kg                           |

## App Flow

1. **JoinCodeView** — enter the 6-digit realm join code with UP/DOWN/SELECT
2. App connects to the server via HTTP negotiate → WebSocket → SignalR handshake
3. `JoinRealm` message sent; on `ClientJoined` → switch to **StreamingView**
4. **StreamingView** reads HR + steps every 2 s and sends `SendWearableData`
5. **BackgroundService** temporal event fires every 30 s to keep streaming when the screen is off

## Protocol

Follows `client/protocol.md` exactly:

| Direction | Message            | When                             |
|-----------|--------------------|----------------------------------|
| → Server  | `JoinRealm`        | After WS handshake confirmed     |
| → Server  | `SendWearableData` | Every 2 s while streaming        |
| ← Server  | `ClientJoined`     | Confirms join; triggers streaming|
| ← Server  | `WearableDataReceived` | Acknowledged (ignored)       |
| ← Server  | `Error`            | Surfaced in UI                   |

## Device Requirements

- Connect IQ 4.0+ required for `Communications.WebSocket` (foreground streaming)
- Devices without WebSocket show an informational error; background HTTP-only mode is not currently supported
- Compatible products listed in `manifest.xml`: Fenix 6/7, Forerunner 245/945/955, Vivoactive 4

## TODO

- [x] Scaffold Connect IQ project with manifest and resources
- [x] Implement sensor data collection via Garmin ActivityMonitor + Sensor APIs
- [x] Implement WebSocket + SignalR protocol communication to the server
- [x] Add 6-digit join code entry UI
- [x] Handle Garmin background service constraints (temporal event every 30 s)
- [ ] Verify build passes in Connect IQ SDK simulator
- [ ] Test against real PulseRealm server on device/simulator
- [ ] Add HTTP long-polling fallback for devices without WebSocket support
