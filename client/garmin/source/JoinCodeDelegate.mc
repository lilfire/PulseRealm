// JoinCodeDelegate.mc — Input handling for JoinCodeView.
//
// Physical button mapping (BehaviorDelegate):
//   onPreviousPage  UP key / swipe-down  → decrement active digit
//   onNextPage      DOWN key / swipe-up  → increment active digit
//   onSelect        SELECT / ENTER       → confirm digit / submit code
//   onBack          BACK / ESC           → delete last digit
//
// Also drives the polling loop that watches for SignalR state changes so the
// view refreshes when the connection progresses (negotiating → handshaking → joined).

import Toybox.Application;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

class JoinCodeDelegate extends WatchUi.BehaviorDelegate {

    private var _view    as JoinCodeView;
    private var _client  as SignalRClient;
    private var _pollTimer as Timer.Timer?;
    private var _lastState as SignalRState;

    function initialize(view as JoinCodeView, client as SignalRClient) {
        BehaviorDelegate.initialize();
        _view      = view;
        _client    = client;
        _pollTimer = null;
        _lastState = SR_DISCONNECTED;
        _startPolling();
    }

    // -------------------------------------------------------------------------
    // Input handlers
    // -------------------------------------------------------------------------

    function onPreviousPage() as Boolean {
        _view.decrementDigit();
        return true;
    }

    function onNextPage() as Boolean {
        _view.incrementDigit();
        return true;
    }

    function onSelect() as Boolean {
        var submitted = _view.confirmDigit();
        // If submitted, the view will call _client.connect(); polling will detect
        // SR_HANDSHAKING and then trigger the JoinRealm send automatically.
        return true;
    }

    function onBack() as Boolean {
        if (_view.getActiveIndex() == 0) {
            // Nothing to delete on the first digit — let the OS handle back.
            return false;
        }
        _view.deleteDigit();
        return true;
    }

    // -------------------------------------------------------------------------
    // State polling — detects when SignalR is ready for JoinRealm
    // -------------------------------------------------------------------------

    private function _startPolling() as Void {
        _pollTimer = new Timer.Timer();
        (_pollTimer as Timer.Timer).start(method(:onPollTick), 300, true);
    }

    function onPollTick() as Void {
        var state = _client.getState();
        if (state == _lastState) { return; }
        _lastState = state;

        if (state == SR_HANDSHAKING) {
            // WebSocket + SignalR handshake complete — send JoinRealm.
            var pendingCode = Application.Storage.getValue("pendingJoinCode");
            if (pendingCode instanceof String) {
                var app = getApp();
                _client.joinRealm(
                    pendingCode as String,
                    app.getClientId(),
                    app.getPlayerName(),
                    app.getHeightCm(),
                    app.getWeightKg()
                );
                _view.setStatus("Joining realm...", false);
            }
        } else if (state == SR_ERROR) {
            _view.setStatus(_client.getLastError(), true);
            _stopPolling();
        } else if (state == SR_STREAMING) {
            // onJoinedRealm already called by SignalRClient — stop polling here.
            _stopPolling();
        }

        WatchUi.requestUpdate();
    }

    private function _stopPolling() as Void {
        if (_pollTimer != null) {
            (_pollTimer as Timer.Timer).stop();
            _pollTimer = null;
        }
    }
}
