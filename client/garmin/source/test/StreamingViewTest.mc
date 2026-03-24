// StreamingViewTest.mc — Unit tests for StreamingView HR colour zones
// and StreamingDelegate input handling.

import Toybox.Lang;
import Toybox.Test;

// StreamingView._hrColor is private, so we test the colour boundaries
// indirectly by verifying the zone model constants documented in the code.
// We also test StreamingDelegate construction and input consumption.

(:test)
function testStreamingViewInitializes(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    var client = new SignalRClient();
    var view = new StreamingView(sm, client);
    return view != null;
}

(:test)
function testStreamingDelegateInitializes(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    var client = new SignalRClient();
    var view = new StreamingView(sm, client);
    var delegate = new StreamingDelegate(view, client, sm);
    return delegate != null;
}

(:test)
function testStreamingDelegateNextPageConsumed(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    var client = new SignalRClient();
    var view = new StreamingView(sm, client);
    var delegate = new StreamingDelegate(view, client, sm);
    // onNextPage should return true (consumed).
    return delegate.onNextPage();
}

(:test)
function testStreamingDelegatePreviousPageConsumed(logger as Test.Logger) as Boolean {
    var sm = new SensorManager();
    var client = new SignalRClient();
    var view = new StreamingView(sm, client);
    var delegate = new StreamingDelegate(view, client, sm);
    // onPreviousPage should return true (consumed).
    return delegate.onPreviousPage();
}

(:test)
function testColourConstants(logger as Test.Logger) as Boolean {
    // Verify the colour constants are defined correctly.
    return COLOR_CYAN == 0x33DFFF
        && COLOR_RED == 0xFF5C75
        && COLOR_DIM == 0x666666
        && COLOR_SURFACE == 0x1A1A1A;
}
