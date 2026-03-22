# PulseRealm — Android / Wear OS Client

Kotlin-based wearable data collector for Android and Wear OS devices.

## Overview

This client reads sensor data (heart rate, step count) from the wearable and streams it to the PulseRealm server via WebSocket (SignalR).

## Setup

1. Open this directory in Android Studio
2. Build and deploy to a Wear OS device or emulator

## TODO

- [ ] Scaffold Kotlin Wear OS project (Android Studio recommended)
- [ ] Implement sensor data collection (heart rate, step counter)
- [ ] Implement SignalR WebSocket client for server communication
- [ ] Add join code entry UI
- [ ] Handle connection lifecycle (reconnect, battery optimization)
