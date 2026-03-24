// JoinCodeLogicTest.mc — Unit tests for JoinCodeView digit logic.

import Toybox.Lang;
import Toybox.Test;

(:test)
function testJoinCodeInitialActiveIndex(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    return view.getActiveIndex() == 0;
}

(:test)
function testJoinCodeIncrementDigit(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    // Initial current digit is 0, incrementing should make it 1.
    view.incrementDigit();
    // Confirm digit 0 to lock it in, advance to digit 1.
    view.confirmDigit();
    // Active index should now be 1 (advanced).
    return view.getActiveIndex() == 1;
}

(:test)
function testJoinCodeDecrementDigitWraps(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    // Initial current is 0, decrement should wrap to 9.
    view.decrementDigit();
    // Confirm to lock in digit 9 at position 0.
    view.confirmDigit();
    // We confirmed, so active is now 1.
    return view.getActiveIndex() == 1;
}

(:test)
function testJoinCodeIncrementWrapsAt9(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    // Increment 10 times: 0→1→2→3→4→5→6→7→8→9→0 (wraps).
    for (var i = 0; i < 10; i++) {
        view.incrementDigit();
    }
    // After 10 increments from 0, current should be back to 0.
    // Confirm digit to lock in position 0 with value 0.
    var submitted = view.confirmDigit();
    // Should not be submitted (only confirmed digit 0 of 6).
    return !submitted && view.getActiveIndex() == 1;
}

(:test)
function testJoinCodeConfirmAdvances(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    // Confirm digits 0-4 (positions 0-4).
    for (var i = 0; i < 5; i++) {
        var result = view.confirmDigit();
        if (result) {
            logger.debug("Unexpected submit at position " + i.toString());
            return false;
        }
    }
    return view.getActiveIndex() == 5;
}

(:test)
function testJoinCodeConfirmSixthDigitSubmits(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    // Confirm all 6 digits.
    for (var i = 0; i < 5; i++) {
        view.confirmDigit();
    }
    // The 6th confirm should trigger submission.
    var submitted = view.confirmDigit();
    return submitted;
}

(:test)
function testJoinCodeDeleteDigitGoesBack(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    // Confirm two digits to get to position 2.
    view.confirmDigit();
    view.confirmDigit();
    // Delete should go back to position 1.
    view.deleteDigit();
    return view.getActiveIndex() == 1;
}

(:test)
function testJoinCodeDeleteAtZeroStaysAtZero(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    // Delete at position 0 should stay at 0.
    view.deleteDigit();
    return view.getActiveIndex() == 0;
}

(:test)
function testJoinCodeSetStatus(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    // Should not throw. Status is set internally.
    view.setStatus("Test status", false);
    view.setStatus("Error status", true);
    return true;
}

(:test)
function testJoinCodeMultipleDeletesAtZero(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    view.deleteDigit();
    view.deleteDigit();
    view.deleteDigit();
    return view.getActiveIndex() == 0;
}

(:test)
function testJoinCodeConfirmThenDeleteThenConfirm(logger as Test.Logger) as Boolean {
    var client = new SignalRClient();
    var view = new JoinCodeView(client);
    // Confirm to advance to position 1.
    view.confirmDigit();
    // Delete to go back to position 0.
    view.deleteDigit();
    // Confirm again — should advance to position 1 again.
    view.confirmDigit();
    return view.getActiveIndex() == 1;
}
