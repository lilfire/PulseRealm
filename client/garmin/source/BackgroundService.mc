// BackgroundService.mc — Temporal event handler for background data streaming.
//
// Garmin wakes this service every 30 seconds (registered in onJoinedRealm).
// The foreground SignalRClient WebSocket is not accessible from background
// context.  This service opens a fresh ephemeral WebSocket connection per
// temporal event, sends one SendWearableData frame, then closes.
//
// Annotation strategy (same as SignalRClient.mc):
//   (:websocket)  — compiled for CIQ 4.0+ devices (has Communications.WebSocket)
//   (:!websocket) — compiled for older devices in monkey.jungle excludeAnnotations
//
// On non-WebSocket devices the service reads sensors but silently skips the
// upload; the foreground session handles all sends while the screen is on.

import Toybox.ActivityMonitor;
import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;

class BackgroundService extends System.ServiceDelegate {

    private var _serverUrl as String;
    private var _realmId   as String;
    private var _clientId  as String;
    private var _ws        as Object?;  // Communications.WebSocket on CIQ 4.0+
    private var _connToken as String;
    private var _hr        as Number;
    private var _steps     as Number;
    private var _phase     as Number;  // 0=idle,1=negotiating,2=connecting,3=handshaking,4=done

    function initialize() {
        System.ServiceDelegate.initialize();
        _serverUrl = "";
        _realmId   = "";
        _clientId  = "";
        _ws        = null;
        _connToken = "";
        _hr        = 0;
        _steps     = 0;
        _phase     = 0;
    }

    // OS calls this when the temporal event fires.
    function onTemporalEvent() as Void {
        var streaming = Application.Storage.getValue("streaming");
        if (!(streaming instanceof Boolean) || !(streaming as Boolean)) {
            return;  // Not streaming — nothing to do
        }

        var url = Application.Storage.getValue("serverUrl");
        var rid = Application.Storage.getValue("realmId");
        var cid = Application.Storage.getValue("clientId");

        if (!(url instanceof String) || !(rid instanceof String) || !(cid instanceof String)) {
            return;  // Missing required state
        }

        _serverUrl = url as String;
        _realmId   = rid as String;
        _clientId  = cid as String;

        // Read sensor values — ActivityMonitor is available in background context.
        // Note: real-time HR is unavailable in background; _hr stays 0.
        var info = ActivityMonitor.getInfo();
        if (info != null && info.steps != null) {
            _steps = info.steps as Number;
        }

        _phase = 1;
        _negotiate();
    }

    // -------------------------------------------------------------------------
    // HTTP negotiate (all devices)
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
            method(:onNegotiate)
        );
    }

    function onNegotiate(responseCode as Number, data as Dictionary?) as Void {
        if (responseCode != 200 || data == null) { return; }
        var token = data["connectionToken"];
        if (!(token instanceof String)) { return; }
        _connToken = token as String;
        _phase = 2;
        _openWebSocket();
    }

    // -------------------------------------------------------------------------
    // WebSocket open — annotated versions
    // -------------------------------------------------------------------------

    (:websocket)
    private function _openWebSocket() as Void {
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
        // WebSocket not available on this device; background upload skipped.
        _phase = 4;
    }

    // -------------------------------------------------------------------------
    // WebSocket callbacks — only compiled for CIQ 4.0+ devices
    // -------------------------------------------------------------------------

    (:websocket)
    function onWsOpen() as Void {
        _phase = 3;
        _ws.send("{\"protocol\":\"json\",\"version\":1}" + SIGNALR_RS);
    }

    (:websocket)
    function onWsMessage(message as Object) as Void {
        if (_phase == 3) {
            _phase = 4;

            // JoinRealm (fire-and-forget, no profile needed from background)
            var joinMsg = "{\"type\":" + MSG_INVOCATION
                + ",\"target\":\"JoinRealm\""
                + ",\"arguments\":[\"" + _realmId + "\",\"" + _clientId + "\",null]}"
                + SIGNALR_RS;
            _ws.send(joinMsg);

            // SendWearableData immediately after
            var ts      = _buildTimestamp();
            var dataStr = "{\"clientId\":\"" + _clientId
                + "\",\"heartRate\":" + _hr.toString()
                + ",\"steps\":" + _steps.toString()
                + ",\"timestamp\":\"" + ts + "\"}";
            var sendMsg = "{\"type\":" + MSG_INVOCATION
                + ",\"target\":\"SendWearableData\""
                + ",\"arguments\":[\"" + _realmId + "\"," + dataStr + "]}"
                + SIGNALR_RS;
            _ws.send(sendMsg);
            _closeWs();
        }
    }

    (:websocket)
    function onWsClose(code as Number, reason as String) as Void {
        _ws = null;
        _phase = 4;
    }

    (:websocket)
    function onWsError(error as String) as Void {
        _closeWs();
    }

    // -------------------------------------------------------------------------
    // Close helpers — annotated
    // -------------------------------------------------------------------------

    (:websocket)
    private function _closeWs() as Void {
        if (_ws != null) {
            _ws.close();
            _ws = null;
        }
        _phase = 4;
    }

    (:noWebSocket)
    private function _closeWs() as Void {
        _ws = null;
        _phase = 4;
    }

    // -------------------------------------------------------------------------
    // Timestamp helper (all devices)
    // -------------------------------------------------------------------------

    private function _buildTimestamp() as String {
        var now = Time.now();
        var cal = Time.Gregorian.info(now, Time.FORMAT_SHORT);
        return Lang.format("$1$-$2$-$3$T$4$:$5$:$6$Z", [
            cal.year.format("%04d"),
            cal.month.format("%02d"),
            cal.day.format("%02d"),
            cal.hour.format("%02d"),
            cal.min.format("%02d"),
            cal.sec.format("%02d")
        ]);
    }
}
