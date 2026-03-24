// JoinCodeDelegateTest.mc — Unit tests for JoinCodeDelegate input handling.

import Toybox.Lang;
import Toybox.Test;

(:test)
function testJoinCodeDelegateInitializes(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    var delegate = new JoinCodeDelegate(view, client);
    return delegate != null;
}

(:test)
function testJoinCodeDelegateOnBackAtZeroReturnsFalse(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    var delegate = new JoinCodeDelegate(view, client);
    // At position 0, onBack should return false (let OS handle).
    return !delegate.onBack();
}

(:test)
function testJoinCodeDelegateOnBackAfterConfirmReturnsTrue(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    var delegate = new JoinCodeDelegate(view, client);
    // Confirm a digit to advance to position 1.
    delegate.onSelect();
    // Now onBack should return true (handled).
    return delegate.onBack();
}

(:test)
function testJoinCodeDelegateOnNextPage(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    var delegate = new JoinCodeDelegate(view, client);
    return delegate.onNextPage();
}

(:test)
function testJoinCodeDelegateOnPreviousPage(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    var delegate = new JoinCodeDelegate(view, client);
    return delegate.onPreviousPage();
}

(:test)
function testJoinCodeDelegateOnSelect(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    var delegate = new JoinCodeDelegate(view, client);
    // onSelect should always return true.
    return delegate.onSelect();
}

(:test)
function testJoinCodeDelegateOnSelectAdvancesDigit(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    var delegate = new JoinCodeDelegate(view, client);
    delegate.onSelect();
    // After select, view should have advanced to index 1.
    return view.getActiveIndex() == 1;
}
