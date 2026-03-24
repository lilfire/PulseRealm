// StreamingDelegate.mc — Input handling for StreamingView.
//
// BACK / MENU held:  leave realm and return to JoinCodeView.

import Toybox.Lang;
import Toybox.WatchUi;

class StreamingDelegate extends WatchUi.BehaviorDelegate {

    private var _view      as StreamingView;
    private var _client    as SignalRClient;
    private var _sensorMgr as SensorManager;

    function initialize(view as StreamingView, client as SignalRClient,
                        sensorMgr as SensorManager) {
        BehaviorDelegate.initialize();
        _view      = view;
        _client    = client;
        _sensorMgr = sensorMgr;
    }

    function onBack() as Boolean {
        // Disconnect and return to join screen.
        getApp().onLeftRealm();

        var joinView     = new JoinCodeView(_client);
        var joinDelegate = new JoinCodeDelegate(joinView, _client);
        WatchUi.switchToView(joinView, joinDelegate, WatchUi.SLIDE_RIGHT);
        return true;
    }

    // Consume UP/DOWN so they don't trigger default OS behaviours during streaming.
    function onNextPage() as Boolean     { return true; }
    function onPreviousPage() as Boolean { return true; }
}
