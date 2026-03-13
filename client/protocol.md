# PulseRealm — Client-Server Protocol

All wearable clients communicate with the server using the same JSON protocol over WebSocket (SignalR).

## Messages: Client → Server

### JoinSession
```json
{
  "joinCode": "ABC123",
  "clientId": "android-user-1"
}
```

### SendWearableData
```json
{
  "sessionId": "...",
  "data": {
    "clientId": "android-user-1",
    "heartRate": 142,
    "steps": 1523,
    "timestamp": "2026-03-13T10:30:00Z"
  }
}
```

## Messages: Server → Client

### ClientJoined
```json
{ "clientId": "android-user-1" }
```

### WearableDataReceived
```json
{
  "clientId": "android-user-1",
  "heartRate": 142,
  "steps": 1523,
  "timestamp": "2026-03-13T10:30:00Z"
}
```

### Error
```json
{ "message": "Invalid join code." }
```
