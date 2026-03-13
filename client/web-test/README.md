# PulseRealm — Web Test Client

A browser-based test client that simulates wearable data using mouse input. Useful for testing the server and dashboard without a physical wearable device.

## How It Works

| Mouse Input    | Wearable Metric | Mapping                              |
| -------------- | --------------- | ------------------------------------ |
| **Click**      | Steps           | Each click = 1 step (cumulative)     |
| **Movement**   | Heart Rate      | Movement speed → 60–200 bpm          |

## Usage

1. Start the PulseRealm server (`dotnet run` in `server/`)
2. Open `index.html` in a browser (no build step needed)
3. Create a session from the dashboard and copy the join code
4. Paste the join code and click **Join**
5. Click in the tracking area to add steps, move the mouse to generate heart rate

## Features

- Connects via SignalR (loaded from CDN)
- Configurable server URL and send interval (200ms–5s)
- Visual click ripple feedback
- Live stats display (HR, steps, messages sent)
- Activity log with timestamps
- Auto-reconnect support
