# PulseRealm — Apple Watch Client

Swift-based wearable data collector for Apple Watch (watchOS).

## Overview

This client reads sensor data (heart rate, step count) via HealthKit and streams it to the PulseRealm server via WebSocket.

## Setup

1. Open the Xcode project in this directory
2. Build and deploy to an Apple Watch or simulator

## TODO

- [ ] Scaffold watchOS project in Xcode
- [ ] Implement HealthKit data collection (heart rate, step counter)
- [ ] Implement WebSocket client for server communication
- [ ] Add join code entry UI
- [ ] Handle watchOS background session constraints
