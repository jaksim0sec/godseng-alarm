package com.godseng.alarm;

/** Pure scheduling rules so battery behavior can be tested without Android. */
public final class MonitorPolicy {
    public static final long ONE_MINUTE_MS = 60_000L;
    public static final long ACTIVE_POLL_MS = 12_000L;
    public static final long IDLE_POLL_MS = 30_000L;
    public static final long USAGE_CACHE_MS = 60_000L;

    private MonitorPolicy() {}

    /** A single reminder per uninterrupted session of an explicitly monitored app. */
    public static boolean shouldNotifyMinute(boolean monitored, boolean alreadySent, long elapsedMs) {
        return monitored && !alreadySent && elapsedMs >= ONE_MINUTE_MS;
    }

    /** -1 means suspend polling until ACTION_SCREEN_ON/ACTION_USER_PRESENT. */
    public static long nextPollDelay(boolean screenInteractive, boolean monitored, long sessionElapsedMs) {
        if (!screenInteractive) return -1L;
        if (!monitored) return IDLE_POLL_MS;
        if (sessionElapsedMs < ONE_MINUTE_MS) {
            long remaining = ONE_MINUTE_MS - Math.max(0L, sessionElapsedMs);
            return Math.min(ACTIVE_POLL_MS, Math.max(1_000L, remaining));
        }
        return ACTIVE_POLL_MS;
    }

    /** Daily usage stats are needed only for a configured time-spent condition. */
    public static boolean shouldRefreshDailyUsage(
            boolean hasAfterCondition, boolean hasCached, long cachedAtElapsedMs, long nowElapsedMs) {
        return hasAfterCondition && (!hasCached || nowElapsedMs < cachedAtElapsedMs
                || nowElapsedMs - cachedAtElapsedMs >= USAGE_CACHE_MS);
    }
}
