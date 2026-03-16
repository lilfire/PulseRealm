# Android Client Code Review

## Critical Issues

### 1. SignalRClient — Blocking calls on coroutine threads
**Files:** `SignalRClient.kt:95,197,213,224,256,267`

`blockingAwait()` is called throughout on `Dispatchers.IO` coroutine threads. While IO dispatchers tolerate blocking, `connect()` at line 95 blocks the caller's thread without its own dispatcher context. More critically, `sendWearableData()` at line 213 calls `blockingAwait()` in a tight loop from `DataStreamingService`, blocking an IO thread every second indefinitely. Consider using the async/RxJava `subscribe()` pattern or wrapping in `withContext(Dispatchers.IO)` within the SignalR client itself.

### 2. SignalRClient — Thread safety of mutable state
**Files:** `SignalRClient.kt:54-63`

Multiple mutable fields (`hubConnection`, `currentServerUrl`, `currentJoinCode`, `intentionalDisconnect`, etc.) are read/written from multiple threads (main thread, IO dispatcher, reconnect scope) with no synchronization. For example, `attemptReconnect()` reads `currentServerUrl` at line 246 while `disconnect()` sets it to null at line 229 — this is a race condition.

### 3. DataStreamingService — Static MutableStateFlow for sendCount
**Files:** `DataStreamingService.kt:154-155`

`_sendCount` is in the companion object (static), meaning it persists across service restarts and is shared globally. The `_sendCount.value + 1` at line 91 is also not atomic — under concurrent access this could lose increments. Use `update { it + 1 }` instead.

### 4. ServerDiscoveryClient — Binding to privileged port
**Files:** `ServerDiscoveryClient.kt:52-53`

The client binds to port 5063 — the same port the server broadcasts on. Two simultaneous scans would conflict, and on some Android devices binding to this port may fail. Consider using port 0 (ephemeral) for sending and a separate receive socket, or at least handle `BindException` explicitly.

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

A new `Retrofit` instance is created every time `join()` is called. Retrofit instances are expensive to create. This should be provided via Hilt DI or cached.

### 7. SignalRClient — Reconnect scope never cancelled
**Files:** `SignalRClient.kt:63`

`reconnectScope = CoroutineScope(Dispatchers.IO + Job())` is created but never cancelled when the client is done. The `disconnect()` method cancels `reconnectJob` but not the scope itself.

### 8. SensorDataCollector — Timer instead of coroutines
**Files:** `SensorDataCollector.kt:105-121`

The simulation uses `java.util.Timer` which creates its own thread, while the rest of the app uses coroutines. This is inconsistent and wastes a thread. Use a coroutine with `delay()` instead.

### 9. SignalRClient.connect() — Flags manipulation race
**Files:** `SignalRClient.kt:78-80`

```kotlin
intentionalDisconnect = true
disconnect()
intentionalDisconnect = false
```
The `onClosed` handler checks `intentionalDisconnect` on whatever thread SignalR fires it from. Setting it to `false` on line 80 happens synchronously after `disconnect()`, but the `onClosed` callback may fire asynchronously after line 80, causing an unintentional reconnect attempt.

## Minor Issues

### 10. Naming inconsistency: SessionInfo.kt / SessionApi.kt
**Files:** `data/model/SessionInfo.kt`, `data/network/SessionApi.kt`

Per project convention, "session" was renamed to "realm" everywhere. The filenames are stale — `SessionInfo.kt` should be `RealmInfo.kt` and `SessionApi.kt` should be `RealmApi.kt`.

### 11. Hardcoded colors everywhere
**Files:** `JoinScreen.kt`, `SessionScreen.kt`

Colors like `Color(0xFF38BDF8)`, `Color(0xFF1E293B)`, `Color(0xFFF87171)` are repeated dozens of times. Extract to a theme or constants object.

### 12. SignalRClient.RealmEnded handler — Unsafe casts
**Files:** `SignalRClient.kt:124-165`

The `@Suppress("UNCHECKED_CAST")` and manual map parsing is fragile. If the server changes the payload shape, this silently produces zeroed data. Consider using Gson deserialization.

### 13. SensorDataCollector — No accuracy filtering
**Files:** `SensorDataCollector.kt:74-78`

Heart rate of 0 is filtered, but no check on `event.accuracy`. The sensor may report `SENSOR_STATUS_UNRELIABLE` which should probably be filtered.

### 14. build.gradle.kts — Using kapt instead of KSP
**Files:** `build.gradle.kts:5,96`

Hilt now supports KSP which is faster than kapt. Consider migrating.

### 15. build.gradle.kts — Version name derived from versionCode
**Files:** `build.gradle.kts:17`

`versionName = (versionCode!! / 10.0).toString()` produces `"0.2"` for versionCode 2. This is unconventional.

### 16. RealmViewModel.serverUrl — URL-encoded value not decoded
**Files:** `SessionViewModel.kt:26`

`serverUrl` is read from `SavedStateHandle` but the value was URL-encoded in `MainActivity.kt:63`. It should be URL-decoded:
```kotlin
val serverUrl: String = java.net.URLDecoder.decode(savedStateHandle["serverUrl"] ?: "", "UTF-8")
```

## Suggestions

- **DataStreamingService** — Consider using `LifecycleService` instead of plain `Service` to leverage lifecycle-aware coroutine scopes.
- **JoinViewModel.ensureScheme()** — Defaults to `https://` for remote URLs (line 178), but local discovery returns `http://` URLs. Correct for remote flow, but could confuse users entering a local IP without scheme.
- **SignalRClient** — Consider adding a `dispose()`/`close()` method that cancels the `reconnectScope` for clean app shutdown.
- **ExperimentalFoundationApi opt-ins** — `HorizontalPager` usage may no longer need opt-in depending on Compose version; verify and remove if stable.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 4 |
| Major | 5 |
| Minor | 7 |
| Suggestion | 4 |

The most impactful issues are the thread safety problems in `SignalRClient` (race conditions on mutable state, blocking calls) and the composition side-effect for navigation in `JoinScreen`. The architecture is otherwise clean — good use of MVVM, proper DI setup, sensible foreground service for streaming, and nice UX touches like auto-discovery with fallback.
