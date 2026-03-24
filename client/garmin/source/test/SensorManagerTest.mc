// SensorManagerTest.mc — Unit tests for SensorManager.

import Toybox.Lang;
import Toybox.Test;

(:test)
function testSensorManagerInitialHeartRate(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    var hr = sm.getHeartRate();
    logger.debug("Initial HR: " + hr.toString());
    return hr == 0;
}

(:test)
function testSensorManagerInitialSteps(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    var steps = sm.getSteps();
    logger.debug("Initial steps: " + steps.toString());
    return steps == 0;
}

(:test)
function testSensorManagerIsRunningInitiallyFalse(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    return !sm.isRunning();
}

(:test)
function testSensorManagerStartSetsRunning(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    sm.start();
    var running = sm.isRunning();
    sm.stop();
    return running;
}

(:test)
function testSensorManagerStopClearsRunning(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    sm.start();
    sm.stop();
    return !sm.isRunning();
}

(:test)
function testSensorManagerStopResetsValues(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    sm.start();
    sm.stop();
    return sm.getHeartRate() == 0 && sm.getSteps() == 0;
}

(:test)
function testSensorManagerStartIdempotent(logger as Test.Logger) as Boolean {
    // Calling start() twice should not error or change state.
    var sm = new SensorManager();
    sm.start();
    sm.start();
    var running = sm.isRunning();
    sm.stop();
    return running;
}

(:test)
function testSensorManagerStopIdempotent(logger as Test.Logger) as Boolean {
    // Calling stop() when not running should be a no-op.
    var sm = new SensorManager();
    sm.stop();
    return !sm.isRunning();
}

(:test)
function testSensorManagerSnapshotFormat(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    var snap = sm.snapshot();
    var hasHr = snap.hasKey("heartRate");
    var hasSteps = snap.hasKey("steps");
    logger.debug("Snapshot has heartRate: " + hasHr.toString() + ", steps: " + hasSteps.toString());
    return hasHr && hasSteps;
}

(:test)
function testSensorManagerSnapshotDefaultValues(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    var snap = sm.snapshot();
    return snap["heartRate"] == 0 && snap["steps"] == 0;
}

(:test)
function testSensorManagerOnSensorDataWithNullHr(logger as Test.Logger) as Boolean {
    // After start, if sensor reports null HR, heartRate stays at 0.
    var sm = new SensorManager();
    sm.start();
    var hr = sm.getHeartRate();
    sm.stop();
    // Without real sensor data, HR should remain 0.
    return hr == 0;
}
