// StreamingView.mc — Active streaming status screen.
//
// Shows live heart rate, step count, connection state and realm ID.
// A 2-second Timer drives sensor reads and SendWearableData calls.
//
// Layout:
//   Top bar     connection indicator dot + "STREAMING" / "DISCONNECTED"
//   Centre      Heart rate (large)  bpm label
//   Below HR    Step count
//   Bottom bar  Realm ID (short)   •   elapsed time

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.Time;
import Toybox.WatchUi;

class StreamingView extends WatchUi.View {

    private var _sensorMgr as SensorManager;
    private var _client    as SignalRClient;
    private var _timer     as Timer.Timer?;
    private var _startTime as Time.Moment;
    private var _tickCount as Number;

    function initialize(sensorMgr as SensorManager, client as SignalRClient) {
        View.initialize();
        _sensorMgr = sensorMgr;
        _client    = client;
        _timer     = null;
        _startTime = Time.now();
        _tickCount = 0;
    }

    function onShow() as Void {
        _sensorMgr.start();
        _timer = new Timer.Timer();
        (_timer as Timer.Timer).start(method(:onStreamTick), 2000, true);
    }

    function onHide() as Void {
        if (_timer != null) {
            (_timer as Timer.Timer).stop();
            _timer = null;
        }
    }

    // Called every 2 seconds — read sensors and send data to server.
    function onStreamTick() as Void {
        _tickCount++;
        var app = getApp();
        var realmId = _client.getRealmId();

        if (_client.isStreaming() && realmId.length() > 0) {
            var hr    = _sensorMgr.getHeartRate();
            var steps = _sensorMgr.getSteps();
            var ts    = _buildTimestamp();
            _client.sendWearableData(realmId, app.getClientId(), hr, steps, ts);
        }
        WatchUi.requestUpdate();
    }

    // -------------------------------------------------------------------------
    // Draw
    // -------------------------------------------------------------------------

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var state   = _client.getState();
        var hr      = _sensorMgr.getHeartRate();
        var steps   = _sensorMgr.getSteps();
        var realmId = _client.getRealmId();

        // --- Status bar ---
        _drawStatusBar(dc, w, h, state);

        // --- Heart rate (centred, large) ---
        var hrStr   = hr > 0 ? hr.toString() : "--";
        var hrColor = _hrColor(hr);
        dc.setColor(hrColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.28, Graphics.FONT_NUMBER_HOT,
                    hrStr, Graphics.TEXT_JUSTIFY_CENTER);

        // BPM label
        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.58, Graphics.FONT_XTINY,
                    "bpm", Graphics.TEXT_JUSTIFY_CENTER);

        // --- Steps ---
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.66, Graphics.FONT_SMALL,
                    steps.toString() + " steps", Graphics.TEXT_JUSTIFY_CENTER);

        // --- Bottom bar: realm ID + elapsed ---
        _drawBottomBar(dc, w, h, realmId);
    }

    private function _drawStatusBar(dc as Graphics.Dc, w as Number, h as Number,
                                    state as SignalRState) as Void {
        var isOk    = (state == SR_STREAMING);
        var dotColor = isOk ? 0x00FF88 : COLOR_RED;
        var label    = isOk ? "STREAMING" : "DISCONNECTED";
        var textColor = isOk ? 0x00FF88 : COLOR_RED;

        // Dot
        var dotR = 5;
        var dotX = w / 2 - 30;
        var dotY = (h * 0.08).toNumber();
        dc.setColor(dotColor, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(dotX, dotY + dotR, dotR);

        // Label
        dc.setColor(textColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dotX + dotR + 4, dotY, Graphics.FONT_XTINY,
                    label, Graphics.TEXT_JUSTIFY_LEFT);
    }

    private function _drawBottomBar(dc as Graphics.Dc, w as Number, h as Number,
                                    realmId as String) as Void {
        var elapsed = Time.now().subtract(_startTime).value();
        var mins    = elapsed / 60;
        var secs    = elapsed % 60;
        var timeStr = mins.format("%02d") + ":" + secs.format("%02d");

        // Short realm ID (first 6 chars or full if shorter)
        var shortId = realmId.length() > 6 ? realmId.substring(0, 6) : realmId;
        if (shortId.length() == 0) { shortId = "------"; }

        dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w * 0.25, h * 0.87, Graphics.FONT_XTINY,
                    shortId, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.75, h * 0.87, Graphics.FONT_XTINY,
                    timeStr, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Colour-code heart rate by zone (rough 5-zone model, max HR 190).
    private function _hrColor(hr as Number) as Number {
        if (hr <= 0)   { return COLOR_DIM; }
        if (hr < 95)   { return Graphics.COLOR_WHITE; }    // Zone 1
        if (hr < 114)  { return 0x66CCFF; }                // Zone 2 (blue)
        if (hr < 133)  { return 0x00FF88; }                // Zone 3 (green)
        if (hr < 152)  { return 0xFFAA00; }                // Zone 4 (orange)
        return COLOR_RED;                                   // Zone 5
    }

    // Build an ISO-8601 UTC timestamp from the current time.
    // Garmin's Time module doesn't expose UTC formatting directly, so we use
    // a simplified format from the Gregorian moment.
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
