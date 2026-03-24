// PulseRealmAppTest.mc — Unit tests for PulseRealmApp utility functions.

import Toybox.Application;
import Toybox.Lang;
import Toybox.Test;

(:test)
function testGetAppReturnsApp(logger as Test.Logger) as Boolean {
    var app = getApp();
    return app != null;
}

(:test)
function testGetSignalRClient(logger as Test.Logger) as Boolean {
    var app = getApp();
    var client = app.getSignalRClient();
    return client != null;
}

(:test)
function testGetSensorManager(logger as Test.Logger) as Boolean {
    var app = getApp();
    var sm = app.getSensorManager();
    return sm != null;
}

(:test)
function testGetClientIdConsistent(logger as Test.Logger) as Boolean {
    var app = getApp();
    var id1 = app.getClientId();
    var id2 = app.getClientId();
    logger.debug("ClientId: " + id1);
    // Same call should return the same ID.
    return id1.equals(id2);
}

(:test)
function testGetClientIdNotEmpty(logger as Test.Logger) as Boolean {
    var app = getApp();
    return app.getClientId().length() > 0;
}

(:test)
function testGetServerUrlDefault(logger as Test.Logger) as Boolean {
    var app = getApp();
    var url = app.getServerUrl();
    logger.debug("Server URL: " + url);
    // Should return a non-empty string (either configured or default).
    return url.length() > 0;
}

(:test)
function testGetPlayerNameDefault(logger as Test.Logger) as Boolean {
    var app = getApp();
    var name = app.getPlayerName();
    logger.debug("Player name: " + name);
    return name.length() > 0;
}

(:test)
function testGetHeightCmDefault(logger as Test.Logger) as Boolean {
    var app = getApp();
    var h = app.getHeightCm();
    logger.debug("Height: " + h.toString());
    // Default is 170 or a positive configured value.
    return h > 0;
}

(:test)
function testGetWeightKgDefault(logger as Test.Logger) as Boolean {
    var app = getApp();
    var w = app.getWeightKg();
    logger.debug("Weight: " + w.toString());
    return w > 0;
}
