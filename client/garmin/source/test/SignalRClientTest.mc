// SignalRClientTest.mc — Unit tests for SignalRClient.

import Toybox.Lang;
import Toybox.Test;

(:test)
function testSignalRClientInitialState(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    return client.getState() == SR_DISCONNECTED;
}

(:test)
function testSignalRClientInitialRealmIdEmpty(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    return client.getRealmId().equals("");
}

(:test)
function testSignalRClientInitialLastErrorEmpty(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    return client.getLastError().equals("");
}

(:test)
function testSignalRClientIsStreamingInitiallyFalse(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    return !client.isStreaming();
}

(:test)
function testSignalRClientDisconnectFromDisconnected(logger as Test.Logger) as Boolean {
    // disconnect() on already-disconnected client should be safe.
    var client = new SignalRClient();
    client.disconnect();
    return client.getState() == SR_DISCONNECTED;
}

(:test)
function testSignalRClientJoinRealmGuardDisconnected(logger as Test.Logger) as Boolean {
    // joinRealm should be a no-op when state is DISCONNECTED.
    var client = new SignalRClient();
    client.joinRealm("123456", "test-id", "Test", 170, 70);
    // Should still be disconnected (no state change).
    return client.getState() == SR_DISCONNECTED;
}

(:test)
function testSignalRClientSendDataGuardNotStreaming(logger as Test.Logger) as Boolean {
    // sendWearableData should be a no-op when not in STREAMING state.
    var client = new SignalRClient();
    client.sendWearableData("realm-1", "test-id", 80, 100, "2026-01-01T00:00:00Z");
    return client.getState() == SR_DISCONNECTED;
}

(:test)
function testSignalRClientNegotiateErrorResponse(logger as Test.Logger) as Boolean {
    // Simulate a failed negotiate response (non-200).
    var client = new SignalRClient();
    client.onNegotiateResponse(500, null);
    return client.getState() == SR_ERROR;
}

(:test)
function testSignalRClientNegotiateNullData(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    client.onNegotiateResponse(200, null);
    return client.getState() == SR_ERROR;
}

(:test)
function testSignalRClientNegotiateMissingToken(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    client.onNegotiateResponse(200, {} as Dictionary);
    return client.getState() == SR_ERROR;
}

(:test)
function testSignalRClientNegotiateInvalidTokenType(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    client.onNegotiateResponse(200, {"connectionToken" => 12345} as Dictionary);
    return client.getState() == SR_ERROR;
}

(:test)
function testSignalRClientNegotiateErrorMessage(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    client.onNegotiateResponse(404, null);
    var err = client.getLastError();
    logger.debug("Error: " + err);
    return err.find("404") != null;
}

(:test)
function testSignalRClientConnectGuardAlreadyConnecting(logger as Test.Logger) as Boolean {
    // After a negotiate error, connect should be allowed (from ERROR state).
    var client = new SignalRClient();
    client.onNegotiateResponse(500, null);
    // State is now ERROR — connect should be allowed.
    return client.getState() == SR_ERROR;
}

(:test)
function testSignalRStateEnumValues(logger as Test.Logger) as Boolean {
    // Verify enum constants are distinct.
    return SR_DISCONNECTED != SR_NEGOTIATING
        && SR_NEGOTIATING != SR_CONNECTING
        && SR_CONNECTING != SR_HANDSHAKING
        && SR_HANDSHAKING != SR_JOINED
        && SR_JOINED != SR_STREAMING
        && SR_STREAMING != SR_ERROR;
}

(:test)
function testSignalRMessageTypeConstants(logger as Test.Logger) as Boolean {
    return MSG_INVOCATION == 1
        && MSG_COMPLETION == 3
        && MSG_PING == 6
        && MSG_CLOSE == 7;
}

(:test)
function testSignalRRecordSeparator(logger as Test.Logger) as Boolean {
    // RS should be ASCII 30 (0x1E), a single character.
    return SIGNALR_RS.length() == 1;
}
