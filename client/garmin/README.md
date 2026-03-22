# PulseRealm — Garmin Connect IQ Client

Monkey C-based wearable data collector for Garmin devices.

## Overview

This client reads sensor data (heart rate, step count) from Garmin wearables and streams it to the PulseRealm server.

## Setup

1. Install the [Connect IQ SDK](https://developer.garmin.com/connect-iq/sdk/)
2. Open this directory in VS Code with the Monkey C extension
3. Build and deploy to a Garmin device or simulator

## TODO

- [ ] Scaffold Connect IQ project with manifest and resources
- [ ] Implement sensor data collection via Garmin APIs
- [ ] Implement HTTP/WebSocket communication to the server
- [ ] Add join code entry UI
- [ ] Handle Garmin background service constraints
