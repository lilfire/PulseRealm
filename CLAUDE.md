# CLAUDE.md

## Project Overview

PulseRealm is a real-time treadmill workout platform. Wearable devices stream heart rate and step data to an ASP.NET Core server via SignalR, which forwards it to a React web dashboard that renders interactive gameplay modes.

## Tech Stack

- **Server**: ASP.NET Core 8, SignalR, C# — runs on `http://localhost:5062`
- **Frontend**: React 19, TypeScript 5.9, Vite 8 — runs on `http://localhost:5173`
- **Android Client**: Kotlin, Jetpack Compose for Wear OS, Hilt DI, SignalR client
- **Desktop Test Client**: Avalonia .NET (simulates wearable data for testing)
- **Containerization**: Docker multi-stage build (Node 22 + .NET 8), docker-compose

## Build & Run

```bash
# Server
cd server && dotnet run

# Frontend
cd frontend && npm install && npm run dev

# Docker (full stack)
docker compose up

# Android
cd client/android && ./gradlew assembleDebug
```

## Key Architecture Decisions

- SignalR hub is at `/hubs/realm` — all real-time communication goes through this
- Server auto-discovery uses UDP broadcast on port 5063
- Frontend can connect in **local** (auto-discover on LAN) or **remote** (manual URL) mode
- Speed is estimated server-side from step deltas and client height (stride = height * 0.415)
- Realms use 6-digit alphanumeric join codes
- All realm state is in-memory (no database)

## Code Conventions

- Frontend is **desktop-first** with wide layouts — no mobile-first responsive design
- UI is **dark mode only** — dark backgrounds, light text, red (#FF5C75) + cyan (#33DFFF) branding
- Realm modes each have a lobby component (`frontend/src/components/lobbies/`) and a gameplay component (`frontend/src/components/modes/`)
- The term "realm" is used throughout (previously "session" — fully renamed)

## Realm Modes

Six modes: `competition`, `streetview`, `youtubetrail`, `route`, `dungeon`, `social`. Each has a lobby and mode component pair.

## Testing

No automated test suite. Use the desktop test client (`client/desktop-test/`) to simulate wearable data during development.

## Environment

- `.env` at project root contains `VITE_GOOGLE_MAPS_API_KEY`
- Server config in `server/appsettings.json`

## Not In Scope

The following features are intentionally excluded — do not suggest or implement them:

- User accounts / authentication / registration (for players — admin auth is fine)
- Database / persistence / workout history — the app is intentionally in-memory like Kahoot
- In-game chat / reactions / messaging
- Sound effects / audio feedback
- Spectator mode
- New realm modes or sub-modes beyond the existing six
- Custom route creation / editing
- Multi-server scaling / distributed state
- Content moderation system
