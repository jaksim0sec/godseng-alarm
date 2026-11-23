package com.godseng.alarm;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Android usage statistics, mapped onto the ten UNCHANGED categories in the source HTML. */
public final class UsageEngine {
    private UsageEngine() {}
    static final String[] CATEGORIES =
            {"short", "feed", "toon", "game", "comm", "video", "shop", "msg", "news", "music"};

    public static boolean isEnabled(Context context, String category) {
        try {
            JSONObject state = new JSONObject(context.getSharedPreferences(
                    "MainActivity", Context.MODE_PRIVATE).getString("state", "{}"));
            if (!state.optJSONObject("on").optBoolean(category, false)) return false;
            org.json.JSONArray removed = state.optJSONArray("removed");
            if (removed != null) for (int i = 0; i < removed.length(); i++)
                if (category.equals(removed.optString(i))) return false;
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    public static JSONObject getUsageJson(Context context) {
        JSONObject json = new JSONObject();
        if (!MainActivity.hasUsagePermission(context)) return json;
        Map<String, Long> times = new HashMap<>();
        for (String category : CATEGORIES) times.put(category, 0L);
        UsageStatsManager mgr = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
        if (mgr == null) return json;
        Calendar today = Calendar.getInstance();
        today.set(Calendar.HOUR_OF_DAY, 0);
        today.set(Calendar.MINUTE, 0);
        today.set(Calendar.SECOND, 0);
        today.set(Calendar.MILLISECOND, 0);
        List<UsageStats> stats = mgr.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY, today.getTimeInMillis(), System.currentTimeMillis());
        if (stats == null) return json;
        for (UsageStats entry : stats) {
            String category = classify(context, entry.getPackageName());
            if (category != null) times.put(category,
                    times.get(category) + Math.max(0L, entry.getTotalTimeInForeground()));
        }
        try {
            for (String category : CATEGORIES) json.put(category, times.get(category) / 60000L);
        } catch (Exception ignored) {}
        return json;
    }

    public static String currentForeground(Context context) {
        UsageStatsManager mgr = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
        if (mgr == null || !MainActivity.hasUsagePermission(context)) return null;
        long now = System.currentTimeMillis();
        // A long-running foreground session may not emit new resume events. Retain the
        // result between service polling iterations and use the most recent activity event.
        UsageEvents events = mgr.queryEvents(now - 8 * 60 * 60 * 1000L, now);
        if (events == null) return null;
        UsageEvents.Event event = new UsageEvents.Event();
        String current = null;
        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            int type = event.getEventType();
            if (type == UsageEvents.Event.ACTIVITY_RESUMED
                    || type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                current = event.getPackageName();
            } else if (type == UsageEvents.Event.ACTIVITY_PAUSED
                    || type == UsageEvents.Event.MOVE_TO_BACKGROUND) {
                if (event.getPackageName().equals(current)) current = null;
            }
        }
        return current;
    }

    public static String classify(Context context, String packageName) {
        if (packageName == null) return null;
        String p = packageName.toLowerCase(java.util.Locale.ROOT);
        if (p.contains("musically") || p.contains("tiktok") || p.contains("kwai")
                || p.contains("snackvideo")) return "short";
        if (p.contains("instagram") || p.contains("facebook") || p.contains("pinterest")
                || p.contains("lemon8")) return "feed";
        if (p.contains("webtoon") || p.contains("kakaopage") || p.contains("kakaowebtoon")
                || p.contains("lezhin")) return "toon";
        if (p.contains("reddit") || p.contains("twitter") || p.contains("discord")
                || p.contains("threads") || p.contains("dcinside")) return "comm";
        if (p.contains("youtube") && p.contains("music")) return "music";
        if (p.contains("youtube") || p.contains("netflix") || p.contains("twitch")
                || p.contains("wavve") || p.contains("tving")) return "video";
        if (p.contains("coupang") || p.contains("aliexpress") || p.contains("amazon.shopping")
                || p.contains("shopping")) return "shop";
        if (p.contains("kakao.talk") || p.contains("telegram") || p.contains("whatsapp")
                || p.contains("line.android") || p.contains("messenger")) return "msg";
        if (p.contains("news") || p.contains("newspaper")) return "news";
        if (p.contains("spotify") || p.contains("melon") || p.contains("genie")
                || p.contains("bugs.music") || p.contains("flo.music")) return "music";
        try {
            ApplicationInfo info = context.getPackageManager().getApplicationInfo(packageName, 0);
            if (android.os.Build.VERSION.SDK_INT >= 26 &&
                    info.category == ApplicationInfo.CATEGORY_GAME) return "game";
        } catch (PackageManager.NameNotFoundException ignored) { }
        return null;
    }
}
