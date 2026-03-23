// JoinCodeView.mc — 6-digit join code entry screen.
//
// Layout (top → bottom):
//   Title row     "PulseRealm"
//   Code row      [ _ ][ _ ][ _ ][ _ ][ _ ][ _ ]   (active digit highlighted)
//   Status row    "Enter Join Code" / error / "Connecting…"
//
// Input model (via JoinCodeDelegate / BehaviorDelegate):
//   UP / onPreviousPage  → decrement active digit (0-9, wraps)
//   DOWN / onNextPage    → increment active digit (0-9, wraps)
//   SELECT / onSelect    → confirm digit, advance to next; on digit 6, submit
//   BACK / onBack        → delete last confirmed digit (or go back when empty)

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Custom digit colour (approximate PulseRealm cyan #33DFFF)
const COLOR_CYAN    = 0x33DFFF;
const COLOR_RED     = 0xFF5C75;
const COLOR_DIM     = 0x666666;
const COLOR_SURFACE = 0x1A1A1A;

class JoinCodeView extends WatchUi.View {

    // The 6-digit array.  -1 means "not yet entered".
    private var _digits   as Array;        // Array of Number (-1 or 0–9)
    private var _active   as Number;       // index of the digit being selected (0–5)
    private var _current  as Number;       // value currently shown on the active digit
    private var _statusMsg as String;
    private var _isError  as Boolean;
    private var _client   as SignalRClient;

    function initialize(client as SignalRClient) {
        View.initialize();
        _client    = client;
        _digits    = [-1, -1, -1, -1, -1, -1];
        _active    = 0;
        _current   = 0;
        _statusMsg = "Enter Join Code";
        _isError   = false;
    }

    // -------------------------------------------------------------------------
    // Digit manipulation (called by JoinCodeDelegate)
    // -------------------------------------------------------------------------

    function incrementDigit() as Void {
        _current = (_current + 1) % 10;
        WatchUi.requestUpdate();
    }

    function decrementDigit() as Void {
        _current = (_current + 9) % 10;  // +9 mod 10 = decrement with wrap
        WatchUi.requestUpdate();
    }

    // Confirm the active digit and advance, or submit when all 6 are entered.
    // Returns true if the code is complete and submission was triggered.
    function confirmDigit() as Boolean {
        _digits[_active] = _current;
        if (_active < 5) {
            _active++;
            _current = 0;
            WatchUi.requestUpdate();
            return false;
        }
        // All 6 digits confirmed — attempt join.
        _submitCode();
        return true;
    }

    // Delete the last confirmed digit (go back one step).
    function deleteDigit() as Void {
        if (_active > 0) {
            _active--;
        }
        _digits[_active] = -1;
        _current = 0;
        _isError = false;
        _statusMsg = "Enter Join Code";
        WatchUi.requestUpdate();
    }

    function setStatus(msg as String, isError as Boolean) as Void {
        _statusMsg = msg;
        _isError   = isError;
        WatchUi.requestUpdate();
    }

    function getActiveIndex() as Number { return _active; }

    // -------------------------------------------------------------------------
    // Draw
    // -------------------------------------------------------------------------

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();

        // Background
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        // Title
        dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.10, Graphics.FONT_SMALL,
                    "PulseRealm", Graphics.TEXT_JUSTIFY_CENTER);

        // Six digit boxes
        _drawDigits(dc, w, h);

        // Status / instruction
        var statusColor = _isError ? COLOR_RED : COLOR_DIM;
        dc.setColor(statusColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.78, Graphics.FONT_XTINY,
                    _statusMsg, Graphics.TEXT_JUSTIFY_CENTER);

        // Connecting overlay
        var state = _client.getState();
        if (state == SR_NEGOTIATING || state == SR_CONNECTING || state == SR_HANDSHAKING) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.88, Graphics.FONT_XTINY,
                        "Connecting...", Graphics.TEXT_JUSTIFY_CENTER);
        } else if (state == SR_ERROR) {
            dc.setColor(COLOR_RED, Graphics.COLOR_TRANSPARENT);
            var err = _client.getLastError();
            if (err.length() > 22) { err = err.substring(0, 22); }
            dc.drawText(w / 2, h * 0.88, Graphics.FONT_XTINY,
                        err, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    private function _drawDigits(dc as Graphics.Dc, w as Number, h as Number) as Void {
        // Six boxes horizontally centred, each BOX_W wide with GAP between them.
        var boxCount  = 6;
        var boxW      = (w * 0.10).toNumber();
        var boxH      = (h * 0.22).toNumber();
        var gap       = (w * 0.02).toNumber();
        var totalW    = boxCount * boxW + (boxCount - 1) * gap;
        var startX    = (w - totalW) / 2;
        var boxY      = (h * 0.35).toNumber();

        for (var i = 0; i < boxCount; i++) {
            var bx = startX + i * (boxW + gap);
            var isActive = (i == _active);

            // Box background
            if (isActive) {
                dc.setColor(COLOR_SURFACE, Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(bx, boxY, boxW, boxH, 4);
            }

            // Box border
            if (isActive) {
                dc.setColor(COLOR_CYAN, Graphics.COLOR_TRANSPARENT);
            } else if (_digits[i] >= 0) {
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            } else {
                dc.setColor(COLOR_DIM, Graphics.COLOR_TRANSPARENT);
            }
            dc.drawRoundedRectangle(bx, boxY, boxW, boxH, 4);

            // Digit text
            var label;
            if (isActive) {
                label = _current.toString();
            } else if (_digits[i] >= 0) {
                label = _digits[i].toString();
            } else {
                label = "-";
            }

            var textColor = isActive ? COLOR_CYAN :
                            (_digits[i] >= 0 ? Graphics.COLOR_WHITE : COLOR_DIM);
            dc.setColor(textColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(
                bx + boxW / 2,
                boxY + boxH / 2 - Graphics.getFontHeight(Graphics.FONT_MEDIUM) / 2,
                Graphics.FONT_MEDIUM,
                label,
                Graphics.TEXT_JUSTIFY_CENTER
            );
        }
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    private function _submitCode() as Void {
        var code = "";
        for (var i = 0; i < 6; i++) {
            code = code + _digits[i].toString();
        }
        _statusMsg = "Joining...";
        _isError   = false;
        WatchUi.requestUpdate();

        // Connect to server then join the realm.
        var app = getApp();
        _client.connect(app.getServerUrl());

        // Store join code for the delegate to use after WS opens.
        Application.Storage.setValue("pendingJoinCode", code);
    }
}
