// BackgroundServiceTest.mc — Unit tests for BackgroundService.

import Toybox.Application;
import Toybox.Lang;
import Toybox.Test;

(:test)
function testBackgroundServiceInitializes(logger as Test.Logger) as Boolean {
    // Should not throw on construction.
    var svc = new BackgroundService();
    return svc != null;
}

(:test)
function testBackgroundServiceSkipsWhenNotStreaming(logger as Test.Logger) as Boolean {
    // Clear the streaming flag — service should return early.
    Application.Storage.setValue("streaming", false as Object);
    var svc = new BackgroundService();
    svc.onTemporalEvent();
    // If it returned early without error, the test passes.
    return true;
}

(:test)
function testBackgroundServiceSkipsWhenStreamingNull(logger as Test.Logger) as Boolean {
    // If "streaming" key is missing entirely.
    Application.Storage.deleteValue("streaming");
    var svc = new BackgroundService();
    svc.onTemporalEvent();
    return true;
}

(:test)
function testBackgroundServiceSkipsMissingServerUrl(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("streaming", true as Object);
    Application.Storage.deleteValue("serverUrl");
    Application.Storage.setValue("realmId", "test-realm");
    Application.Storage.setValue("clientId", "test-client");
    var svc = new BackgroundService();
    svc.onTemporalEvent();
    // Should return early without error due to missing serverUrl.
    return true;
}

(:test)
function testBackgroundServiceSkipsMissingRealmId(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("streaming", true as Object);
    Application.Storage.setValue("serverUrl", "http://test:5062");
    Application.Storage.deleteValue("realmId");
    Application.Storage.setValue("clientId", "test-client");
    var svc = new BackgroundService();
    svc.onTemporalEvent();
    return true;
}

(:test)
function testBackgroundServiceSkipsMissingClientId(logger as Test.Logger) as Boolean {
    Application.Storage.setValue("streaming", true as Object);
    Application.Storage.setValue("serverUrl", "http://test:5062");
    Application.Storage.setValue("realmId", "test-realm");
    Application.Storage.deleteValue("clientId");
    var svc = new BackgroundService();
    svc.onTemporalEvent();
    return true;
}

(:test)
function testBackgroundServiceNegotiateErrorHandling(logger as Test.Logger) as Boolean {
    // Simulate a failed negotiate response — should not crash.
    var svc = new BackgroundService();
    svc.onNegotiate(500, null);
    return true;
}

(:test)
function testBackgroundServiceNegotiateNullData(logger as Test.Logger) as Boolean {
    var svc = new BackgroundService();
    svc.onNegotiate(200, null);
    return true;
}

(:test)
function testBackgroundServiceNegotiateMissingToken(logger as Test.Logger) as Boolean {
    var svc = new BackgroundService();
    svc.onNegotiate(200, {} as Dictionary);
    return true;
}

(:test)
function testBackgroundServiceNegotiateInvalidTokenType(logger as Test.Logger) as Boolean {
    var svc = new BackgroundService();
    svc.onNegotiate(200, {"connectionToken" => 999} as Dictionary);
    return true;
}

// Cleanup helper — reset storage state after tests.
(:test)
function testBackgroundServiceCleanup(logger as Test.Logger) as Boolean {
    Application.Storage.deleteValue("streaming");
    Application.Storage.deleteValue("serverUrl");
    Application.Storage.deleteValue("realmId");
    Application.Storage.deleteValue("clientId");
    return true;
}
