# PulseRealm

A live treadmill realm platform with wearable integration and multiple run modes.

## Architecture

PulseRealm consists of three main parts that work together in real-time:

```
┌─────────────┐     WebSocket/SignalR      ┌──────────────┐     SignalR      ┌─────────────┐
│  Wearable   │  ──── step/HR data ──────► │   ASP.NET    │ ── live push ──►│   React     │
│  Client     │  ◄── realm commands ────── │   Server     │ ◄── actions ─── │   Dashboard │
└─────────────┘                            └──────────────┘                 └─────────────┘
```

- **Server** (`server/`) — ASP.NET Core 8 Web API with SignalR hub for real-time communication
- **Frontend** (`frontend/`) — React + TypeScript + Vite web dashboard for realm management and live rendering
- **Client** (`client/`) — Native wearable data collectors (Android/Wear OS, Garmin Connect IQ, Apple Watch)
- **Shared** (`shared/`) — TypeScript type definitions and protocol contracts shared across parts

## How It Works

1. A user opens the **web dashboard** and creates a **realm** by selecting a **mode**
2. The realm generates a **short join code** (Kahoot-style, e.g. `ABC123`)
3. The **wearable client** enters the code and connects to the realm
4. The wearable streams **live data** (steps, heart rate) to the server
5. The server forwards data to the dashboard in real-time, which renders it based on the active mode

## Realm Modes

| Mode | Description |
|------|-------------|
| `competition` | Multiple clients race on treadmills. The dashboard renders a live leaderboard. |
| `streetview` | Single or multi-client. The dashboard renders Google Street View that advances based on treadmill pace. |

More modes can be added by extending the `RealmMode` type and creating a new React component in `frontend/src/components/modes/`.

## Running Locally

### Server

Requires [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0).

```bash
cd server
dotnet run
```

The server starts at `http://localhost:5062` with the SignalR hub at `/hubs/realm`.

### Frontend

Requires [Node.js 18+](https://nodejs.org/).

```bash
cd frontend
npm install
npm run dev
```

The dashboard starts at `http://localhost:5173` and connects to the server automatically.

### Wearable Clients

Each platform has its own native project — see the README in each subdirectory:

- [`client/android/`](client/android/README.md) — Kotlin / Wear OS
- [`client/garmin/`](client/garmin/README.md) — Monkey C / Connect IQ
- [`client/apple/`](client/apple/README.md) — Swift / watchOS

All clients communicate using the same [wire protocol](client/protocol.md).

## Project Structure

```
pulserealm/
├── server/             # ASP.NET Core 8 + SignalR
│   ├── Controllers/    # REST API endpoints
│   ├── Hubs/           # SignalR real-time hub
│   ├── Models/         # Data models
│   └── Services/       # Business logic (realm management)
├── frontend/           # React + TypeScript + Vite
│   └── src/
│       ├── components/modes/   # Mode-specific renderers
│       ├── hooks/              # SignalR connection hook
│       └── types/              # TypeScript type definitions
├── client/             # Wearable clients
│   ├── android/        # Kotlin / Wear OS
│   ├── garmin/         # Monkey C / Connect IQ
│   ├── apple/          # Swift / watchOS
│   └── protocol.md     # Shared wire protocol spec
├── shared/             # Shared TypeScript types
│   └── src/
└── README.md
```
