import com.godseng.alarm.MonitorPolicy;

public final class MonitorPolicyTest {
    private static int checked;
    private static void ok(boolean actual, String description) {
        checked++;
        if (!actual) throw new AssertionError(description);
    }
    private static void eq(long actual, long expected, String description) {
        ok(actual == expected, description + " expected " + expected + " received " + actual);
    }
    public static void main(String[] args) {
        ok(!MonitorPolicy.shouldNotifyMinute(false, false, 60000), "unregistered apps never notify");
        ok(!MonitorPolicy.shouldNotifyMinute(true, true, 65000), "once per foreground session");
        ok(!MonitorPolicy.shouldNotifyMinute(true, false, 59999), "not before one minute");
        ok(MonitorPolicy.shouldNotifyMinute(true, false, 60000), "notify at one minute");
        ok(MonitorPolicy.shouldNotifyMinute(true, false, 90000), "late detection still notifies");
        eq(MonitorPolicy.nextPollDelay(true, false, 0), 30000, "idle screen-on is 30 seconds");
        eq(MonitorPolicy.nextPollDelay(true, true, 15000), 12000, "active app is 12 seconds");
        eq(MonitorPolicy.nextPollDelay(true, true, 59000), 1000, "approaching one minute");
        eq(MonitorPolicy.nextPollDelay(true, true, 54000), 6000, "wake at the one-minute boundary");
        eq(MonitorPolicy.nextPollDelay(true, true, 80000), 12000, "after reminder, normal cadence");
        eq(MonitorPolicy.nextPollDelay(false, true, 5000), -1, "screen off disables polling");
        ok(!MonitorPolicy.shouldRefreshDailyUsage(false, false, 0, 60000),
                "do not query daily stats when after condition disabled");
        ok(MonitorPolicy.shouldRefreshDailyUsage(true, false, 0, 0),
                "first enabled after condition checks immediately");
        ok(!MonitorPolicy.shouldRefreshDailyUsage(true, true, 10000, 51000),
                "cached daily stats within 60 seconds");
        ok(MonitorPolicy.shouldRefreshDailyUsage(true, true, 10000, 70000),
                "daily usage refreshed after 60 seconds");
        System.out.println("PASS MonitorPolicyTest " + checked + " assertions");
    }
}
