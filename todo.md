# TODO

## New /Changes

### Calorie & Advanced Metrics
- [ ] Calorie burn estimation (using HR, weight, age, duration)
- [ ] Age-based max HR calculation (replace hardcoded 190)
- [ ] Richer real-time stats during gameplay
- [ ] Enhanced summary screen with additional metrics


### Rate Limiting / Abuse Prevention
- [ ] Rate limiting on API endpoints
- [ ] SignalR hub connection throttling
- [ ] Input validation hardening

### RealmHub
- [ ] Add `LeaveRealm` hub method so the server can distinguish intentional leaves from connection drops (send `ClientLeft` vs `ClientDisconnected` events)

### UI
- [ ] Fix the summary screen on frontend, maby use som graphs
- [ ] Height / Weight numeric input keyboard
- [ ] Remove debug data on Android (sent)

## BUGS

- [ ] Change server auto connect to exsisting server
