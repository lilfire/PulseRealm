// SignalRClient.mc — WebSocket + SignalR JSON protocol client for PulseRealm.
//
// SignalR over WebSocket protocol (JSON transport):
//   1. HTTP POST  <hub>/negotiate?negotiateVersion=1  → connectionToken
//   2. Open WebSocket  ws://<host>/hubs/realm?id=<connectionToken>
//   3. Send handshake  {"protocol":"json","version":1}  + RS (0x1E)
//   4. Receive         {}  + RS  (handshake ACK)
//   5. Exchange invocation/event frames, each terminated by RS (0x1E)
//
// WebSocket support requires Connect IQ 4.0+ (Communications.WebSocket).
// Devices listed in monkey.jungle with `excludeAnnotations = websocket` will
// compile the (:!websocket) stub paths instead and show a graceful error.
//
// Messages sent:
//   JoinRealm       — after WS connection + handshake
//   SendWearableData — every ~2 s while streaming (also from BackgroundService)
//
// Messages received:
//   ClientJoined / JoinedRealm  → triggers onJoinedRealm callback
//   Error                       → surfaces message to the UI
//   Ping / Close                → handled internally

import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

// Record separator that frames each SignalR JSON message (ASCII 30 / 0x1E).
const SIGNALR_RS = "\u001E";

// SignalR message type constants (JSON "type" field).
const MSG_INVOCATION = 1;
const MSG_COMPLETION = 3;
const MSG_PING       = 6;
const MSG_CLOSE      = 7;

// Connection states exposed to views via getState().
enum SignalRState {
    SR_DISCONNECTED = 0,
    SR_NEGOTIATING  = 1,
    SR_CONNECTING   = 2,
    SR_HANDSHAKING  = 3,
    SR_JOINED       = 4,
    SR_STREAMING    = 5,
    SR_ERROR        = 6
}

class SignalRClient {

    private var _state       as SignalRState;
    private var _ws          as Object?;  // Communications.WebSocket on CIQ 4.0+
    private var _serverUrl   as String;
    private var _connToken   as String;
    private var _realmId     as String;
    private var _lastError   as String;
    private var _pingTimer   as Timer.Timer?;

    function initialize() {
        _state     = SR_DISCONNECTED;
        _ws        = null;
        _serverUrl = "";
        _connToken = "";
        _realmId   = "";
        _lastError = "";
        _pingTimer = null;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    // Step 1: negotiate then open WebSocket.
    function connect(serverUrl as String) as Void {
        if (_state != SR_DISCONNECTED && _state != SR_ERROR) {
            return;
        }
        _serverUrl = serverUrl;
        _setState(SR_NEGOTIATING);
        _negotiate();
    }

    // Send a JoinRealm invocation (called after WS handshake completes).
    function joinRealm(joinCode as String, clientId as String,
                       name as String, heightCm as Number, weightKg as Number) as Void {
        if (_state != SR_HANDSHAKING && _state != SR_JOINED) { return; }
        _setState(SR_JOINED);

        var profile = "{\"clientId\":\"" + clientId
            + "\",\"name\":\"" + name
            + "\",\"heightCm\":" + heightCm
            + ",\"weightKg\":" + weightKg + "}";

        var msg = "{\"type\":" + MSG_INVOCATION
            + ",\"target\":\"JoinRealm\""
            + ",\"arguments\":[\"" + joinCode + "\",\"" + clientId + "\"," + profile + "]}"
            + SIGNALR_RS;
        _wsSend(msg);
    }

    // Send wearable sensor data.  realmId must match what the server returned in ClientJoined.
    function sendWearableData(realmId as String, clientId as String,
                              heartRate as Number, steps as Number,
                              timestamp as String) as Void {
        if (_state != SR_STREAMING) { return; }

        var data = "{\"clientId\":\"" + clientId
            + "\",\"heartRate\":" + heartRate
            + ",\"steps\":" + steps.toString()
            + ",\"timestamp\":\"" + timestamp + "\"}";

        var msg = "{\"type\":" + MSG_INVOCATION
            + ",\"target\":\"SendWearableData\""
            + ",\"arguments\":[\"" + realmId + "\"," + data + "]}"
            + SIGNALR_RS;
        _wsSend(msg);
    }

    // Gracefully close the WebSocket.
    function disconnect() as Void {
        _stopPingTimer();
        _closeWs();
        _setState(SR_DISCONNECTED);
    }

    function getState() as SignalRState  { return _state;     }
    function getRealmId() as String      { return _realmId;   }
    function getLastError() as String    { return _lastError; }

    function isStreaming() as Boolean {
        return _state == SR_STREAMING;
    }

    // -------------------------------------------------------------------------
    // Step 1: HTTP negotiate (all devices)
    // -------------------------------------------------------------------------

    private function _negotiate() as Void {
        var url = _serverUrl + "/hubs/realm/negotiate?negotiateVersion=1";
        Communications.makeWebRequest(
            url,
            null,
            {
                :method       => Communications.HTTP_REQUEST_METHOD_POST,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onNegotiateResponse)
        );
    }

    function onNegotiateResponse(responseCode as Number, data as Dictionary?) as Void {
        if (responseCode != 200 || data == null) {
            _setError("Negotiate failed (" + responseCode.toString() + ")");
            return;
        }
        var token = data["connectionToken"];
        if (!(token instanceof String)) {
            _setError("No connectionToken in negotiate response");
            return;
        }
        _connToken = token as String;
        _openWebSocket();
    }

    // -------------------------------------------------------------------------
    // Step 2: Open WebSocket — two compiled versions via annotations
    // (:websocket)  → real implementation, included for CIQ 4.0+ devices
    // (:!websocket) → stub, compiled for devices in monkey.jungle excludeAnnotations
    // -------------------------------------------------------------------------

    (:websocket)
    private function _openWebSocket() as Void {
        _setState(SR_CONNECTING);

        var wsBase = _serverUrl;
        if (wsBase.substring(0, 8).equals("https://")) {
            wsBase = "wss://" + wsBase.substring(8, wsBase.length());
        } else if (wsBase.substring(0, 7).equals("http://")) {
            wsBase = "ws://" + wsBase.substring(7, wsBase.length());
        }
        var wsUrl = wsBase + "/hubs/realm?id=" + _connToken;

        _ws = new Communications.WebSocket({
            :url       => wsUrl,
            :onMessage => method(:onWsMessage),
            :onOpen    => method(:onWsOpen),
            :onClose   => method(:onWsClose),
            :onError   => method(:onWsError)
        });
        _ws.open();
    }

    (:noWebSocket)
    private function _openWebSocket() as Void {
        _setError("WebSocket not supported on this device");
    }

    // -------------------------------------------------------------------------
    // Step 3: WebSocket callbacks — only compiled for CIQ 4.0+ devices
    // -------------------------------------------------------------------------

    (:websocket)
    function onWsOpen() as Void {
        _setState(SR_HANDSHAKING);
        // Send SignalR JSON handshake, must be the very first message.
        _wsSend("{\"protocol\":\"json\",\"version\":1}" + SIGNALR_RS);
    }

    (:websocket)
    function onWsMessage(message as Object) as Void {
        var raw = message.data;
        if (!(raw instanceof String)) { return; }

        // Split on RS — a single TCP segment can carry multiple frames.
        var frames = _splitFrames(raw as String);
        for (var i = 0; i < frames.size(); i++) {
            _handleFrame(frames[i] as String);
        }
    }

    (:websocket)
    function onWsClose(code as Number, reason as String) as Void {
        _stopPingTimer();
        _ws = null;
        if (_state != SR_DISCONNECTED) {
            _setError("Disconnected (" + code.toString() + ")");
        }
    }

    (:websocket)
    function onWsError(error as String) as Void {
        _stopPingTimer();
        _setError("WS error: " + error);
    }

    // -------------------------------------------------------------------------
    // Frame parsing (websocket builds only)
    // -------------------------------------------------------------------------

    (:websocket)
    private function _splitFrames(raw as String) as Array {
        var frames = [] as Array;
        var start = 0;
        var len = raw.length();
        for (var i = 0; i < len; i++) {
            if (raw.substring(i, i + 1).equals(SIGNALR_RS)) {
                if (i > start) {
                    frames.add(raw.substring(start, i));
                }
                start = i + 1;
            }
        }
        return frames;
    }

    (:websocket)
    private function _handleFrame(frame as String) as Void {
        // Empty frame = handshake ACK
        if (frame.equals("{}") || frame.length() == 0) {
            if (_state == SR_HANDSHAKING) {
                WatchUi.requestUpdate();
            }
            return;
        }

        var msgType = _extractInt(frame, "\"type\":");
        if (msgType == null) { return; }

        if (msgType == MSG_PING) {
            _wsSend("{\"type\":" + MSG_PING + "}" + SIGNALR_RS);
            return;
        }
        if (msgType == MSG_CLOSE) {
            disconnect();
            return;
        }
        if (msgType == MSG_INVOCATION) {
            var target = _extractString(frame, "\"target\":\"");
            if (target == null) { return; }

            if (target.equals("ClientJoined")) {
                if (_state == SR_JOINED || _state == SR_HANDSHAKING) {
                    var rid = _extractString(frame, "\"realmId\":\"");
                    if (rid != null) { _realmId = rid; }
                    _setState(SR_STREAMING);
                    getApp().onJoinedRealm(_realmId);
                }
            } else if (target.equals("JoinedRealm")) {
                var rid = _extractString(frame, "\"arguments\":[\"");
                if (rid != null) { _realmId = rid; }
                _setState(SR_STREAMING);
                getApp().onJoinedRealm(_realmId);
            } else if (target.equals("Error")) {
                var errMsg = _extractString(frame, "\"message\":\"");
                _setError(errMsg != null ? errMsg : "Server error");
            }
        }
    }

    // -------------------------------------------------------------------------
    // Ping timer (websocket builds only)
    // -------------------------------------------------------------------------

    (:websocket)
    private function _startPingTimer() as Void {
        _stopPingTimer();
        _pingTimer = new Timer.Timer();
        (_pingTimer as Timer.Timer).start(method(:onPingTick), 15000, true);
    }

    (:noWebSocket)
    private function _startPingTimer() as Void {
        // No-op on devices without WebSocket
    }

    (:websocket)
    function onPingTick() as Void {
        if (_state == SR_STREAMING || _state == SR_JOINED) {
            _wsSend("{\"type\":" + MSG_PING + "}" + SIGNALR_RS);
        }
    }

    // -------------------------------------------------------------------------
    // Internal helpers — annotated where they reference WebSocket API
    // -------------------------------------------------------------------------

    (:websocket)
    private function _wsSend(msg as String) as Void {
        if (_ws != null) {
            _ws.send(msg);
        }
    }

    (:noWebSocket)
    private function _wsSend(msg as String) as Void {
        // No WebSocket available on this device
    }

    (:websocket)
    private function _closeWs() as Void {
        if (_ws != null) {
            _ws.close();
            _ws = null;
        }
    }

    (:noWebSocket)
    private function _closeWs() as Void {
        _ws = null;
    }

    private function _setState(s as SignalRState) as Void {
        _state = s;
        if (s == SR_STREAMING) {
            _startPingTimer();
        }
    }

    private function _setError(msg as String) as Void {
        _lastError = msg;
        _stopPingTimer();
        _closeWs();
        _setState(SR_ERROR);
        WatchUi.requestUpdate();
    }

    private function _stopPingTimer() as Void {
        if (_pingTimer != null) {
            (_pingTimer as Timer.Timer).stop();
            _pingTimer = null;
        }
    }

    // Minimal JSON field extraction — avoids a full parser dependency.
    private function _extractInt(json as String, key as String) as Number? {
        var idx = _findSubstring(json, key);
        if (idx < 0) { return null; }
        var start = idx + key.length();
        var end = start;
        var len = json.length();
        while (end < len) {
            var c = json.substring(end, end + 1);
            if (c.equals(",") || c.equals("}") || c.equals("]")) { break; }
            end++;
        }
        if (end <= start) { return null; }
        return json.substring(start, end).toNumber();
    }

    private function _extractString(json as String, key as String) as String? {
        var idx = _findSubstring(json, key);
        if (idx < 0) { return null; }
        var start = idx + key.length();
        var end = start;
        var len = json.length();
        while (end < len) {
            var c = json.substring(end, end + 1);
            if (c.equals("\"")) { break; }
            end++;
        }
        if (end <= start) { return null; }
        return json.substring(start, end);
    }

    private function _findSubstring(haystack as String, needle as String) as Number {
        var hLen = haystack.length();
        var nLen = needle.length();
        if (nLen == 0 || nLen > hLen) { return -1; }
        for (var i = 0; i <= hLen - nLen; i++) {
            if (haystack.substring(i, i + nLen).equals(needle)) {
                return i;
            }
        }
        return -1;
    }
}
