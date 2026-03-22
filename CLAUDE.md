# CLAUDE.md

## Project Overview

PulseRealm is a real-time treadmill workout platform. Wearable devices stream heart rate and step data to an ASP.NET Core server via SignalR, which forwards it to a React web dashboard that renders interactive gameplay modes.

## Tech Stack

- **Server**: ASP.NET Core 8, SignalR, C# — runs on `http://localhost:5062`
- **Frontend**: React 19, TypeScript 5.9, Vite 8 — runs on `http://localhost:5173` — must support **Chrome 74+**
- **Android Client**: Kotlin, Jetpack Compose for Wear OS, Hilt DI, SignalR client
- **Apple Client**: Swift/watchOS — reads heart rate and steps via HealthKit, streams via WebSocket (scaffolding only, not yet implemented)
- **Garmin Client**: Monkey C / Connect IQ SDK — reads sensor data from Garmin wearables (scaffolding only, not yet implemented)
- **Desktop Test Client**: Avalonia .NET (simulates wearable data for testing)
- **Shared Types**: `@pulserealm/shared` — TypeScript package with shared types (Realm, ClientProfile, WearableData, RealmMode) used by frontend
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

# Apple (not yet implemented — requires Xcode project setup)
# Garmin (not yet implemented — requires Connect IQ SDK + VS Code Monkey C extension)
```

## Key Architecture Decisions

- SignalR hub is at `/hubs/realm` — all real-time communication goes through this
- Server auto-discovery uses UDP broadcast on port 5063
- Frontend can connect in **local** (auto-discover on LAN) or **remote** (manual URL) mode
- Speed is estimated server-side from step deltas and client height using a piecewise-linear stride model (`server/Utils/StrideModel.cs`) — stride factor varies by speed (0.35 at 0–3 km/h up to 0.75 at 15 km/h), with support for personal calibration and a user stride multiplier
- Realms use 6-digit numeric join codes
- All realm state is in-memory (no database)

## Verification After Code Changes

After making code changes, **always** run the relevant build/check commands before considering the task done:

- **Frontend**: `cd frontend && npx tsc -b --noEmit` — must pass with zero errors
- **Server**: `cd server && dotnet build` — must pass with zero errors
- **Tests**: Run `npm run test` (frontend) or `dotnet test` (server) if changes touch testable logic

Do not skip this step. TypeScript and C# type errors have repeatedly slipped through code review.

## Code Conventions

- TypeScript `strict` mode is enabled — all code must pass strict checks:
  - Never use `string` when a union type exists (e.g. use `CompetitionSubMode` not `string`, `DungeonDifficulty` not `string`)
  - `useRef` must always have an explicit initial value: `useRef<T | undefined>(undefined)`, not `useRef<T>()`
  - Interfaces that mirror external types must use the exact same types, not looser equivalents
- All CSS/styling MUST work on **Chrome 74** — do not use `gap` in flexbox, or other features unavailable in Chrome 74. Use `margin` instead.
- Frontend is **desktop-first** with wide layouts, but includes responsive breakpoints for tablets and phones
- UI is **dark mode only** — dark backgrounds, light text, red (#FF5C75) + cyan (#33DFFF) branding
- Realm modes each have a lobby component (`frontend/src/components/lobbies/`) and a gameplay component (`frontend/src/components/modes/`)
- Shared lobby infrastructure: `LobbyShell` (base UI wrapper for all lobbies), `DefaultLobby` (generic lobby used by social mode and as fallback), `OptionGrid` (reusable paginated card picker used by multiple lobbies)
- Static mode variants (`StaticRouteMode`, `StaticStreetViewMode`) render Google Static Maps/Street View images as fallbacks when dynamic maps aren't available
- The term "realm" is used throughout (previously "session" — fully renamed)

## Realm Modes

Six modes: `competition`, `streetview`, `youtubetrail`, `route`, `dungeon`, `social`. Each has a lobby and mode component pair, except `social` which uses `DefaultLobby` (no configuration needed). Multi-client modes: `competition` (max 8), `dungeon` (multi), `social` (max 4).

## Testing

- **Server**: xUnit tests in `server/PulseRealm.Server.Tests/` (with Moq)
- **Frontend**: Vitest with @testing-library/react 
- **Manual**: Use the desktop test client (`client/desktop-test/`) to simulate wearable data during development

## Environment

- `.env` at project root contains `GOOGLE_MAPS_API_KEY` and `ADMIN_PASSWORD`
- Server config in `server/appsettings.json`
- Client communication protocol documented in `client/protocol.md`

## CI/CD

- GitHub Actions workflows in `.github/workflows/` — all manual trigger only (`workflow_dispatch`)
- `main.yml` — Docker build & push to GitHub Container Registry (`ghcr.io`)
- `build-android.yml` — Android APK build, artifact upload, and GitHub release with auto-versioning
- `JavaTests.yml` — Android unit tests with Gradle caching and test report artifacts

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
