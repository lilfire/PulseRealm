# Changelog

## [0.1.0] - 2026-03-22

Initial release of PulseRealm — a real-time treadmill workout platform where wearable devices stream biometric data to a web dashboard that renders interactive gameplay modes.

### Platform

- **Server**: ASP.NET Core 8 with SignalR real-time hub at `/hubs/realm`
- **Frontend**: React 19 + TypeScript 5.9 + Vite 8 (Chrome 74+ compatible)
- **Android Client**: Kotlin + Jetpack Compose for Wear OS with Hilt DI
- **Desktop Test Client**: Avalonia .NET for simulating wearable data during development
- **Containerization**: Docker multi-stage build (Node 22 + .NET 8) with docker-compose

### Realm Modes

Six gameplay modes, each with a lobby (configuration) and gameplay component:

- **Competition** — Up to 8 players compete in real-time with four sub-modes:
  - Race (first to target distance), Elimination (slowest eliminated each round), Heart Zone (points for staying in target HR zone), King (hold the crown by running most distance)
  - Supports individual and team formats (up to 8 teams with color assignment)
- **Street View** — Navigate Google Street View panoramas by walking on a treadmill; 30+ curated global landmarks; search via Google Places API; auto-rotation and pan/tilt controls
- **YouTube Trail** — Follow along with walking tour videos; playback rate tied to player speed (0.25x–2.0x); 13+ curated YouTube walking tours
- **Route** — Follow a walking/driving route on Google Maps; real-time position tracking along polyline with progress bar; 10+ curated routes; Google Directions API integration
- **Dungeon** — Team-based dungeon crawl (up to 4 players) with corridor phases, enemy rooms, trap rooms, rest rooms, treasure rooms, and boss fights; cadence-based and HR-based mechanics
- **Social** — Casual group workout (up to 4 players) with shared stats and real-time leaderboard; no competition mechanics

### Server Features

- **Realm lifecycle**: Create (6-digit join codes), join, start, end, leave, kick; auto-cleanup of abandoned realms (15 min inactivity) and ended realms (30 min TTL)
- **Speed estimation**: Server-side calculation from step deltas and client height using biomechanical stride model; EMA smoothing (alpha 0.15); idle decay (3s grace + 4s linear); clamped 0–25 km/h
- **Stride model**: Speed-dependent piecewise linear curve with three modes — default biomechanical, user stride factor multiplier, or per-user calibration data (2+ points)
- **Stride calibration sessions**: Standalone calibration flow where dashboard collects stride samples at target speeds and sends calibration curve to wearable for storage
- **Wearable data binding**: Dashboard binds to wearable clients via 4-digit approval codes; bound dashboards can set incline (0–15%) and speed overrides (0–30 km/h)
- **Statistics tracking**: Per-client and per-realm accumulation of steps, distance, HR (avg/max), 5 HR zones (configurable boundaries), speed, cadence, calories (Keytel et al. 2005 formula), elevation gain; full realm summary with optional team breakdown
- **HR zones**: 5 zones with configurable per-profile boundaries (default: 57%, 63%, 76%, 89% of max HR); max HR from profile, age-based (220 - age), or default (190)
- **Admin system**: Bearer token authentication (8-hour TTL); config management (competition/dungeon defaults, protection settings); curated content CRUD for Street View locations, YouTube videos, and routes; thumbnail uploads; active realm monitoring with force-end/kick; config backup/restore
- **Google Maps proxy**: Server-side proxy for Static Maps, Street View, Directions, Places Autocomplete, and Places Details APIs with parameter whitelisting, 300s response caching, and API key protection
- **Server discovery**: UDP broadcast on port 5063 every 3 seconds with listener for client discovery requests
- **Rate limiting**: 20 realm creations/minute; configurable wearable message rate (default 5/sec/client)
- **Security**: CORS, security headers (nosniff, frame denial, referrer policy, feature policy), timing-safe password comparison
- **In-memory architecture**: All state held in memory (intentionally ephemeral, like Kahoot); admin config persisted to `data/admin-config.json`

### Frontend Features

- **Server connection**: Local network auto-discovery (WebRTC IP detection, subnet scanning, batch probing) or remote manual URL entry; cached in localStorage
- **Dark mode only UI**: Dark backgrounds (#16171d), light text, red (#FF5C75) + cyan (#33DFFF) branding
- **Desktop-first layout**: Wide layouts with responsive breakpoints for tablets (1024px) and phones (768px, 480px)
- **Chrome 74 compatibility**: No flexbox gap, no optional chaining, AbortSignal.timeout polyfill, viewport height fix
- **Lobby system**: Host/guest permission model; join code display; player list with capacity; wearable binding with approval flow; auto-bind for single-player modes; debounced settings broadcast via SignalR
- **Admin dashboard**: Tab-based interface for managing realms, competition/dungeon defaults, curated Street View/YouTube/route content, and protection settings; backup/restore; active realm monitoring with 5s polling
- **Session summary**: Post-realm stats display with global and per-client breakdowns (duration, distance, steps, HR, cadence, calories, speed, elevation, zone distribution); team view for team modes
- **Calibration panel**: Stride calibration tool with speed groups (3–15 km/h), 30-second samples, and calibration curve saving
- **Toast notifications**: Error/info messages with 5-second auto-dismiss
- **Connection banner**: Reconnecting/disconnected state with retry capability; 2-second delay to avoid flicker
- **Terms of Service**: Comprehensive ToS covering eligibility, acceptable use, health disclaimers, and data practices
- **Static fallbacks**: Static image rendering for Street View and Route modes when Google Maps JS API is unavailable
- **Fullscreen**: Automatic fullscreen request on gameplay mode mount

### Android Client (Wear OS)

- **Profile setup**: Name, age, height, weight with validation and persistent storage in SharedPreferences
- **Server discovery**: UDP broadcast discovery on port 5063 with manual remote URL fallback (default: pulserealm.app)
- **Join flow**: 6-digit numeric keypad; configurable HR zone boundaries with BPM display; stride profile viewer showing calibration status
- **Real-time streaming**: Foreground service sends HR + steps to server every 1 second via SignalR
- **Sensors**: Heart rate sensor (1/sec) and step counter/detector; graceful fallback to simulated data if hardware unavailable or permissions denied
- **Reconnection**: Exponential backoff (2s–32s, up to 10 attempts); health check ping every 10s; network restoration callback for immediate reconnect
- **Wearable binding**: Bind code display with approve/decline UI
- **Session summary**: Multi-page pager with personal stats, team stats, and realm stats; activity gauge
- **Stride calibration**: Supports joining calibration sessions; auto-saves calibration points to SharedPreferences
- **Power management**: WiFi lock, wake lock (4-hour timeout), battery optimization exemption request, keep screen on during realm
- **Human-readable errors**: All server and network errors mapped to plain-language messages; no technical jargon exposed to users

### Desktop Test Client

- **Server discovery**: UDP broadcast + HTTP probing of local network (ports 5062, 8080)
- **Data simulation**: Click-based steps, mouse movement activity, or automatic sine-wave HR simulation (90–160 bpm)
- **Full realm lifecycle**: Join, stream data, bind approval, incline control, session summary display
- **Logging console**: Time-stamped, color-coded log entries (info, warn, error, send)

### CI/CD

- **Docker**: Manual workflow to build and push to GitHub Container Registry (ghcr.io) with custom tags
- **Android**: Manual workflow to build debug APK with artifact upload; auto-release on main with versioned tags
- **Tests**: Manual workflow for Android unit tests with optional module/test filtering

### Testing

- **Server**: xUnit + Moq tests covering controllers, hub, models, services, filters, and utilities
- **Frontend**: Vitest + @testing-library/react with 80% coverage thresholds
- **Android**: Unit tests with Robolectric, dependency injection, and overridable dispatchers for coroutine testing
