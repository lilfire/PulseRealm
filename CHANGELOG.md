# Changelog

All notable changes to this project will be documented in this file.
Components are versioned independently: **Server**, **Frontend**, and **Android**.

## [Unreleased]

### Server v0.1.0
- Real-time heart rate and step data streaming via SignalR
- UDP broadcast server discovery on port 5063
- Speed estimation from step deltas and client height
- Realm management with 6-digit alphanumeric join codes
- Client profile support (name, height, weight)
- Session end flow with summary data
- Local/remote server connection mode support
- Six gameplay modes: Competition, Street View, YouTube Trail, Route, Dungeon, Social
- Docker multi-stage build with unified server and frontend image
- Version endpoint via `ServerVersion.cs`

### Frontend v0.1.0
- React dashboard with dark-only theme and red/cyan branding
- Home screen with mode selection cards
- Lobby and gameplay components for all six modes
- Street View mode with Google Maps dual-pano transitions
- YouTube Trail mode with speed-synced playback
- Route mode with map-based hiking directions and progress
- Dungeon mode with full game UI
- Social mode with co-presence UI and group/individual summaries
- Competition mode with last-man-standing elimination
- Server search UI with auto-discovery, retry, and manual entry fallback
- Local/remote server connection mode toggle
- Session end flow with summary screen

### Android v0.2
- Wear OS client app with Jetpack Compose
- Heart rate and step data streaming to server via SignalR
- Join screen with numeric keypad for realm codes
- Client profile support (name, height, weight)
- Server auto-discovery with URL caching
- Local/remote server connection mode toggle
- Toast-style error overlays
- Swipeable settings with server info and leave action
- GitHub Actions workflow for APK builds
