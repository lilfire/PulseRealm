# PulseRealm

A live treadmill realm platform with wearable integration and multiple gameplay modes. Connect wearable devices, pick a mode, and turn treadmill workouts into interactive experiences rendered on a web dashboard.

## Architecture

PulseRealm consists of three main parts that work together in real-time:

```
┌─────────────┐     WebSocket/SignalR      ┌──────────────┐     SignalR      ┌─────────────┐
│  Wearable   │  ──── step/HR data ──────► │   ASP.NET    │ ── live push ──►│   React     │
│  Client     │  ◄── realm commands ────── │   Server     │ ◄── actions ─── │   Dashboard │
└─────────────┘                            └──────────────┘                 └─────────────┘
```

- **Server** (`server/`) — ASP.NET Core 8 Web API with SignalR hub for real-time communication
- **Frontend** (`frontend/`) — React 19 + TypeScript 5.9 + Vite 8 web dashboard for realm management and live rendering
- **Client** (`client/`) — Native wearable data collectors (Android/Wear OS, desktop test client)
- **Shared** (`shared/`) — TypeScript type definitions (currently outdated — server and frontend define types independently)

## How It Works

1. The **web dashboard** auto-discovers the server on the local network (or connects to a remote URL)
2. A user creates a **realm** by selecting a **mode**
3. The realm generates a **6-digit numeric join code** (Kahoot-style)
4. The **wearable client** enters the code and connects to the realm
5. The wearable streams **live data** (steps, heart rate) to the server
6. The server calculates speed from step data and client height, then forwards everything to the dashboard in real-time

## Realm Modes

| Mode           | Players | Description                                                                                                                                                       |
| -------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `competition`  | Up to 8 | Race on treadmills with a live leaderboard. Sub-modes: race, elimination (last-man-standing), heart zone, king of the hill. Supports team and individual formats. |
| `streetview`   | 1       | Walk through Google Street View — the panorama advances based on treadmill pace.                                                                                  |
| `youtubetrail` | 1       | Progress through a YouTube video synced to walking speed.                                                                                                         |
| `route`        | 1       | Follow real-world hiking routes on a map with GPS-based progress tracking.                                                                                        |
| `dungeon`      | Up to 4 | Cooperative dungeon crawler powered by treadmill movement.                                                                                                        |
| `social`       | Up to 4 | Co-presence workout with group and individual activity summaries.                                                                                                 |

## Running Locally

### Server

Requires [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0).

```bash
cd server
dotnet run
```

The server starts at `http://localhost:5062` with the SignalR hub at `/hubs/realm`. It also broadcasts its presence on the local network via UDP port 5063 for auto-discovery.

### Frontend

Requires [Node.js 22+](https://nodejs.org/).

```bash
cd frontend
npm install
npm run dev
```

The dashboard starts at `http://localhost:5173`. It can discover the server automatically on the local network or connect to a remote server URL. Supports Chrome 74+ (including Wear OS browsers) via `@vitejs/plugin-legacy`.

### Docker

```bash
docker compose up
```

This builds and runs the full stack (server + frontend) on port 8080 with UDP discovery on port 5063.

### Wearable Clients

- [`client/android/`](client/android/) — Kotlin / Jetpack Compose for Wear OS
- [`client/apple/`](client/apple/) — Swift / watchOS (planned)
- [`client/garmin/`](client/garmin/) — Monkey C / Connect IQ (planned)
- [`client/desktop-test/`](client/desktop-test/) — Avalonia .NET desktop client for simulating wearable data during development

All clients communicate using the same [wire protocol](client/protocol.md).

### Environment Variables

| Variable              | Description                                                         |
| --------------------- | ------------------------------------------------------------------- |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key for Street View and Route modes (set in `.env`) |
| `ADMIN_PASSWORD`      | Admin dashboard password (set in `.env`)                            |
| `ASPNETCORE_URLS`     | Server listen URL (default: `http://localhost:5062`)                |
| `SERVER_NAME`         | Server display name for discovery (default: `PulseRealm`)           |

## Testing

### Server

```bash
cd server/PulseRealm.Server.Tests
dotnet test
```

Uses xUnit with Moq for mocking and coverlet for code coverage.

### Frontend

```bash
cd frontend
npm run test
npm run test:coverage
```

Uses Vitest with @testing-library/react. Coverage thresholds: 80% statements, 74% branches, 80% functions, 80% lines.

## CI/CD

- **Android APK** — GitHub Actions manual workflow (`workflow_dispatch`) to build a debug APK. Creates a GitHub Release with the APK artifact.
- **Docker Image** — Manual workflow to build and push to GitHub Container Registry (GHCR) with a version tag.

## Project Structure

```
pulserealm/
├── server/                  # ASP.NET Core 8 + SignalR
│   ├── Controllers/         # REST API (admin, config, discovery, maps proxy, realm)
│   ├── Hubs/                # SignalR real-time hub
│   ├── Models/              # Data models (realm, wearable data, client profile, admin config)
│   ├── Services/            # Business logic (realm management, discovery, admin, stats, cleanup)
│   ├── Filters/             # Request/response filters
│   └── ServerVersion.cs     # Assembly version helper
├── frontend/                # React 19 + TypeScript 5.9 + Vite 8
│   └── src/
│       ├── components/
│       │   ├── admin/       # Admin dashboard (login, realm defaults, editors)
│       │   ├── modes/       # Mode-specific gameplay renderers
│       │   └── lobbies/     # Pre-game configuration screens per mode
│       ├── hooks/           # SignalR, server connection, Google Maps hooks
│       ├── types/           # TypeScript type definitions
│       └── utils/           # Utility functions
├── client/                  # Wearable clients
│   ├── android/             # Kotlin / Wear OS (Jetpack Compose, Hilt DI)
│   ├── apple/               # Swift / watchOS (planned)
│   ├── garmin/              # Monkey C / Connect IQ (planned)
│   ├── desktop-test/        # Avalonia .NET test client
│   └── protocol.md          # Shared wire protocol spec
├── shared/                  # Shared TypeScript types
├── Dockerfile               # Multi-stage build (Node 22 + .NET 8)
├── docker-compose.yml       # Single-command deployment
└── .env                     # Environment config (API keys, admin password)
```
