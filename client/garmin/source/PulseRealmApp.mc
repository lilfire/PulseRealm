// PulseRealmApp.mc — App entry point and global state for PulseRealm Garmin client.
//
// Flow:
//   1. JoinCodeView: user enters 6-digit realm code
//   2. SignalRClient negotiates + connects via WebSocket
//   3. JoinRealm sent; on ClientJoined → switch to StreamingView
//   4. StreamingView streams HR + steps every 2 s via SendWearableData
//   5. BackgroundService temporal event keeps streaming if screen goes off

import Toybox.Application;
import Toybox.Background;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

class PulseRealmApp extends Application.AppBase {

    private var _signalRClient as SignalRClient;
    private var _sensorManager as SensorManager;

    function initialize() {
        AppBase.initialize();
        _signalRClient = new SignalRClient();
        _sensorManager = new SensorManager();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        var view = new JoinCodeView(_signalRClient);
        var delegate = new JoinCodeDelegate(view, _signalRClient);
        return [view, delegate];
    }

    // Called by the OS when registered for Background temporal events.
    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new BackgroundService()];
    }

    // Called by JoinCodeDelegate when the server confirms we joined.
    function onJoinedRealm(realmId as String) as Void {
        // Persist state for the background service
        Application.Storage.setValue("realmId", realmId);
        Application.Storage.setValue("clientId", getClientId());
        Application.Storage.setValue("serverUrl", getServerUrl());
        Application.Storage.setValue("streaming", true as Object);

        var view = new StreamingView(_sensorManager, _signalRClient);
        var delegate = new StreamingDelegate(view, _signalRClient, _sensorManager);
        WatchUi.switchToView(view, delegate, WatchUi.SLIDE_LEFT);

        // Register for periodic background wake-ups every 30 seconds
        Background.registerForTemporalEvent(new Time.Duration(30));
    }

    // Called by StreamingDelegate when the user explicitly leaves.
    function onLeftRealm() as Void {
        Application.Storage.setValue("streaming", false as Object);
        Background.deleteTemporalEvent();
        _signalRClient.disconnect();
        _sensorManager.stop();
    }

    function getSignalRClient() as SignalRClient {
        return _signalRClient;
    }

    function getSensorManager() as SensorManager {
        return _sensorManager;
    }

    // Stable per-device client ID, generated once and persisted.
    function getClientId() as String {
        var stored = Application.Storage.getValue("clientId");
        if (stored instanceof String) {
            return stored;
        }
        var id = "garmin-" + System.getTimer().toString();
        Application.Storage.setValue("clientId", id);
        return id;
    }

    // Server URL from Connect IQ Settings (Garmin Connect phone app), with fallback.
    function getServerUrl() as String {
        var url = Application.Properties.getValue("serverUrl");
        if (url instanceof String && (url as String).length() > 0) {
            return url as String;
        }
        return "http://192.168.1.100:5062";
    }

    function getPlayerName() as String {
        var name = Application.Properties.getValue("playerName");
        if (name instanceof String && (name as String).length() > 0) {
            return name as String;
        }
        return "Garmin User";
    }

    function getHeightCm() as Number {
        var h = Application.Properties.getValue("heightCm");
        if (h instanceof Number) { return h as Number; }
        return 170;
    }

    function getWeightKg() as Number {
        var w = Application.Properties.getValue("weightKg");
        if (w instanceof Number) { return w as Number; }
        return 70;
    }
}

// Module-level helper so any source file can call getApp().
function getApp() as PulseRealmApp {
    return Application.getApp() as PulseRealmApp;
}
