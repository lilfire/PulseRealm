// SensorManager.mc — Heart rate and step count collection for Garmin devices.
//
// Heart rate: Toybox.Sensor real-time callback (SENSOR_HEARTRATE).
// Steps: Toybox.ActivityMonitor cumulative daily count, delta from session start.
//
// Usage:
//   var sm = new SensorManager();
//   sm.start();
//   var hr = sm.getHeartRate();   // 0 if unavailable
//   var steps = sm.getSteps();    // steps since start() was called
//   sm.stop();

import Toybox.ActivityMonitor;
import Toybox.Lang;
import Toybox.Sensor;
import Toybox.System;

class SensorManager {

    private var _heartRate as Number;
    private var _stepBaseline as Number;  // daily step count at session start
    private var _steps as Number;         // steps since session start
    private var _running as Boolean;

    function initialize() {
        _heartRate = 0;
        _stepBaseline = 0;
        _steps = 0;
        _running = false;
    }

    // Start real-time HR sensor and record step baseline.
    function start() as Void {
        if (_running) { return; }
        _running = true;

        // Snapshot the current daily step total so we report deltas.
        var info = ActivityMonitor.getInfo();
        if (info != null && info.steps != null) {
            _stepBaseline = info.steps as Number;
        }

        // Enable real-time HR sensor events.
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
        Sensor.enableSensorEvents(method(:onSensorData));
    }

    function stop() as Void {
        if (!_running) { return; }
        _running = false;
        Sensor.setEnabledSensors([]);
        Sensor.enableSensorEvents(null);
        _steps = 0;
        _stepBaseline = 0;
        _heartRate = 0;
    }

    // Sensor callback — fires on each new HR sample.
    // Garmin SDK passes Sensor.Info (not Sensor.SensorData).
    function onSensorData(info as Sensor.Info) as Void {
        if (info.heartRate != null) {
            var hr = info.heartRate as Number;
            if (hr > 0) {
                _heartRate = hr;
            }
        }

        // Refresh step delta on every sensor tick (cheap read).
        _refreshSteps();
    }

    // Current heart rate in bpm; 0 if sensor hasn't reported yet.
    function getHeartRate() as Number {
        return _heartRate;
    }

    // Steps taken since start() was called.
    function getSteps() as Number {
        _refreshSteps();
        return _steps;
    }

    private function _refreshSteps() as Void {
        var info = ActivityMonitor.getInfo();
        if (info != null && info.steps != null) {
            var current = info.steps as Number;
            if (current >= _stepBaseline) {
                _steps = current - _stepBaseline;
            }
        }
    }

    function isRunning() as Boolean {
        return _running;
    }

    // Snapshot for the background service (no live sensor in background context).
    // Returns the last-known values without triggering a new read.
    function snapshot() as Dictionary {
        return {
            "heartRate" => _heartRate as Object,
            "steps"     => _steps as Object
        };
    }
}
