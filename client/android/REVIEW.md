# Android Client Code Review

## Critical Issues

### 1. SignalRClient — Blocking calls on coroutine threads
**Files:** `SignalRClient.kt:95,197,213,224,256,267`

`blockingAwait()` is called throughout on `Dispatchers.IO` coroutine threads. While IO dispatchers tolerate blocking, `connect()` at line 95 blocks the caller's thread without its own dispatcher context. More critically, `sendWearableData()` at line 213 calls `blockingAwait()` in a tight loop from `DataStreamingService`, blocking an IO thread every second indefinitely. The SignalR Java client returns `CompletableFuture`-based types; the idiomatic Kotlin approach is to use `await()` (from `kotlinx-coroutines-jdk8`) instead of `blockingAwait()`, making the code safe across all dispatchers:

```kotlin
// Current (fragile):
hubConnection?.start()?.blockingAwait()

// Idiomatic fix:
hubConnection?.start()?.await()  // requires kotlinx-coroutines-jdk8
```

### 2. SignalRClient — Thread safety of mutable state
**Files:** `SignalRClient.kt:54-63`

Multiple mutable fields (`hubConnection`, `currentServerUrl`, `currentJoinCode`, `intentionalDisconnect`, etc.) are read/written from multiple threads (main thread, IO dispatcher, reconnect scope) with no synchronization. For example, `attemptReconnect()` reads `currentServerUrl` at line 246 while `disconnect()` sets it to null at line 229 — this is a race condition. `intentionalDisconnect` in particular is a plain `var Boolean` (not `@Volatile` and not `AtomicBoolean`) read and written from the calling coroutine and the SignalR IO callback thread that fires `onClosed`. Use `AtomicBoolean` or `@Volatile` at minimum.

### 3. DataStreamingService — Raw Job() instead of SupervisorJob()
**Files:** `DataStreamingService.kt:37`

```kotlin
private val scope = CoroutineScope(Dispatchers.IO + Job())
```

`Job()` here is a raw, non-supervised `Job`. If the streaming coroutine throws an uncaught exception, the `Job` cancels the entire scope and no further streaming is possible for the lifetime of the service — with no error reporting to the UI. Replace with `SupervisorJob()`. Additionally, the `while (true)` loop in `startStreaming()` has no exception handling — a transient crash silently kills streaming.

### 4. ServerDiscoveryClient — Binding to privileged port
**Files:** `ServerDiscoveryClient.kt:52-53`

The client binds to port 5063 — the same port the server broadcasts on. Two simultaneous scans would conflict (second throws `BindException` silently swallowed on line 93), and on some Android devices binding to this port may fail. Use an ephemeral port (`DatagramSocket()` with no argument) for sending.

## Major Issues

### 5. JoinScreen — Side effect in composition
**Files:** `JoinScreen.kt:66-73`

Navigation is triggered directly in the composable body when `uiState.isJoined` is true. This should be in a `LaunchedEffect` to avoid being called during every recomposition:
```kotlin
LaunchedEffect(uiState.isJoined, uiState.realmInfo) {
    if (uiState.isJoined && uiState.realmInfo != null) {
        onJoined(...)
    }
}
```

### 6. JoinViewModel — Retrofit created per-join
**Files:** `JoinViewModel.kt:345-350`

A new `Retrofit` instance is created every time `join()` is called. Retrofit instances are expensive (reflection, connection pool). This should be provided via Hilt DI or cached. As-is, this also bypasses DI entirely, making it impossible to mock the API for testing.

### 7. SignalRClient — Reconnect scope never cancelled
**Files:** `SignalRClient.kt:63`

`reconnectScope = CoroutineScope(Dispatchers.IO + Job())` is created but never cancelled when the client is done. The `disconnect()` method cancels `reconnectJob` but not the scope itself. As a `@Singleton`, this leaks until app termination.

### 8. SignalRClient.connect() — Flags manipulation race
**Files:** `SignalRClient.kt:78-80`

```kotlin
intentionalDisconnect = true
disconnect()
intentionalDisconnect = false
```
The `onClosed` handler checks `intentionalDisconnect` on whatever thread SignalR fires it from. Setting it to `false` on line 80 happens synchronously after `disconnect()`, but the `onClosed` callback may fire asynchronously after line 80, causing an unintentional reconnect attempt.

### 9. FLAG_KEEP_SCREEN_ON set permanently
**Files:** `MainActivity.kt:47`

```kotlin
window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
```

Set unconditionally in `onCreate` and never cleared. On Wear OS, keeping the screen on indefinitely is extremely battery-hostile. Should only be active during the workout (`RealmScreen`), managed via `DisposableEffect`.

### 10. JoinViewModel.ensureScheme() defaults to https:// — breaks LAN HTTP
**Files:** `JoinViewModel.kt:172-179`

When the user types a bare IP address like `192.168.1.42:5062` in the manual entry field, `ensureScheme()` prepends `https://`, turning it into a TLS request that will fail. LAN servers will almost never have a valid TLS certificate. The default should be `http://` for manually entered addresses without a scheme.

### 11. SensorDataCollector — Non-atomic isRunning check
**Files:** `SensorDataCollector.kt:32-33`

`isRunning` is a plain `var Boolean`. `start()` can be called from both the service's `onStartCommand()` (main thread) and potentially from the ViewModel. The check-then-set is not atomic — concurrent calls can register duplicate sensor listeners, resulting in doubled step counts. Use `AtomicBoolean` or `@Synchronized`.

### 12. DataStreamingService — Static MutableStateFlow for sendCount
**Files:** `DataStreamingService.kt:154-155`

`_sendCount` is in the companion object (static), persists across service restarts and is shared globally. The non-atomic `_sendCount.value + 1` at line 91 could lose increments. Use `update { it + 1 }` instead. Ideally, move this to instance-level state.

### 13. JoinViewModel.join() — Error check after joinRealm() is racy
**Files:** `JoinViewModel.kt:321,337`

After `signalRClient.joinRealm()`, the error is checked synchronously by reading `signalRClient.error.value` — but the `Error` hub handler fires on the SignalR thread asynchronously, so the error value may not yet be set. Also, `signalRClient.clearError()` is never called before `joinRealm()`, meaning stale errors from a previous attempt can be misattributed.

## Minor Issues

### 14. Naming inconsistency: SessionInfo.kt / SessionApi.kt / SessionScreen.kt / SessionViewModel.kt
**Files:** `data/model/SessionInfo.kt`, `data/network/SessionApi.kt`, `ui/session/SessionScreen.kt`, `ui/session/SessionViewModel.kt`

Per project convention, "session" was renamed to "realm" everywhere. The filenames are stale — classes inside are already named `RealmInfo`, `RealmApi`, `RealmScreen`, `RealmViewModel` but the files still use "Session". Rename to match class names.

### 15. Hardcoded colors everywhere
**Files:** `JoinScreen.kt`, `SessionScreen.kt`

Colors like `Color(0xFF38BDF8)`, `Color(0xFF1E293B)`, `Color(0xFFF87171)` are repeated dozens of times. Extract to a theme or constants object.

### 16. SignalRClient.RealmEnded handler — Unsafe casts
**Files:** `SignalRClient.kt:124-165`

The `@Suppress("UNCHECKED_CAST")` and manual map parsing is fragile. The manual `HashMap<String, Any>` construction in `sendWearableData()` (line 207) also duplicates `WearableData` field names as string literals — a rename silently breaks the protocol. Consider using Gson serialization throughout.

### 17. SensorDataCollector — Timer instead of coroutines
**Files:** `SensorDataCollector.kt:105-121`

The simulation uses `java.util.Timer` which creates its own thread, while the rest of the app uses coroutines. Inconsistent and wastes a thread.

### 18. SensorDataCollector — No accuracy filtering
**Files:** `SensorDataCollector.kt:74-78`

Heart rate of 0 is filtered, but no check on `event.accuracy`. The sensor may report `SENSOR_STATUS_UNRELIABLE` which should probably be filtered.

### 19. RealmViewModel.serverUrl — URL-encoded value not decoded
**Files:** `SessionViewModel.kt:26`

`serverUrl` is read from `SavedStateHandle` but was URL-encoded in `MainActivity.kt:63`. It should be URL-decoded. Additionally, the field is never actually used after construction — dead field.

### 20. No back-pressure on data streaming
**Files:** `DataStreamingService.kt:80-95`

If `blockingAwait()` takes longer than `intervalMs`, the actual send rate silently drops below 1 Hz. During reconnection, `sendWearableData` returns early (line 204) — data is silently dropped with no buffering or indication to the user.

### 21. No ambient mode handling
**Files:** All UI files

No `AmbientMode` / `AmbientCallback` implementation. With `FLAG_KEEP_SCREEN_ON` always set, the screen stays fully lit during workouts, draining battery rapidly. Ambient mode would show a minimal dark display at low frame rate.

### 22. REQUEST_IGNORE_BATTERY_OPTIMIZATIONS dialog on every launch
**Files:** `MainActivity.kt:93-101`

Launches a system dialog on every app start if the exemption isn't granted. On Wear OS this is disruptive. `FOREGROUND_SERVICE_HEALTH` should be sufficient for API 30+.

### 23. build.gradle.kts — Using kapt instead of KSP
**Files:** `build.gradle.kts:5,96`

Hilt 2.51 supports KSP which is faster than kapt. Consider migrating.

### 24. build.gradle.kts — Version name derived from versionCode
**Files:** `build.gradle.kts:17`

`versionName = (versionCode!! / 10.0).toString()` produces `"0.2"` for versionCode 2. The `!!` operator will throw NPE if `versionCode` is ever null.

### 25. ProfileField key derived from display label
**Files:** `JoinScreen.kt:691-692`

The `RemoteInput` key is derived by `label.lowercase().replace(" ", "_")`. If the label text ever changes for localization, the stored value becomes unreadable. Define keys as constants.

### 26. ServerDiscoveryClient not DI-managed
**Files:** `JoinViewModel.kt:66`

`ServerDiscoveryClient()` is constructed with `new` inside the ViewModel rather than injected via Hilt. Untestable and creates a new instance on each ViewModel creation.

### 27. compileSdk/targetSdk at 34 — should be 35
**Files:** `build.gradle.kts:10,15`

API level 35 (Android 15) is current. Apps targeting 34 will receive Play Store warnings.

## Suggestions

- **Adopt `kotlinx.serialization`** — Eliminate all manual `HashMap<String, Any>` construction and field name duplication. Allow direct serialization of `WearableData` and profile maps.
- **Extract navigation routes** — Route strings like `"join"` and `"realm/{realmId}/{clientId}/{serverUrl}"` should be in a sealed class or object to prevent typos.
- **Use `LifecycleService`** — Instead of plain `Service` for `DataStreamingService`, to leverage lifecycle-aware coroutine scopes.
- **Add ProGuard rules** — `ClientSummaryData` and `RealmSummaryData` live in `data.network` but only `data.model` has keep rules. If ever deserialized by Gson, shrinking would strip fields.
- **Remove `ExperimentalFoundationApi` opt-ins** — `HorizontalPager` is stable since Compose 1.4 and with the BOM at `2024.01.00` the annotations are unnecessary.
- **Type timestamps** — `WearableData.timestamp` and `RealmInfo.createdAt` are `String` with no compile-time format contract. Use `Instant` or an inline class.
- **Document deprecated WiFi lock** — `WIFI_MODE_FULL_HIGH_PERF` is deprecated and has no effect on API 29+. The `@Suppress("DEPRECATION")` annotation should include a comment explaining the fallback.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 4 |
| Major | 9 |
| Minor | 14 |
| Suggestion | 7 |

**Priority fixes (most impactful):**
1. Atomicize `intentionalDisconnect` and other shared mutable state in `SignalRClient`
2. Use `SupervisorJob()` in `DataStreamingService` scope
3. Replace `blockingAwait()` with coroutine-based `await()`
4. Fix `ensureScheme()` to default to `http://` for LAN addresses
5. Scope `FLAG_KEEP_SCREEN_ON` to workout screen only

These five changes address correctness, stability, and battery efficiency — the three most critical dimensions for a Wear OS streaming app. The architecture is otherwise clean: good MVVM separation, proper Hilt DI setup, sensible foreground service for streaming, and nice UX touches like auto-discovery with fallback.
