package com.godseng.alarm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.text.SimpleDateFormat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MonitorService extends Service {
    private static final String MONITOR_CHANNEL = "godseng_monitor";
    private static final String WARNING_CHANNEL = "godseng_warning";
    private static final int ONGOING_ID = 5001;
    private static final int WARNING_ID = 5002;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, Long> warnedAt = new HashMap<>();
    private String lastCategory;
    private String pendingHeads;
    private WarningOverlay overlay;
    private Boolean shownFreeDay;

    private void updateMonitorNotification(boolean paused) {
        if (shownFreeDay != null && shownFreeDay.booleanValue() == paused) return;
        shownFreeDay = paused;
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, MONITOR_CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("갓생알리미")
                .setContentText(paused ? "프리데이 · 오늘은 감시 일시 중단 · 내일 자동 재개"
                        : "선택한 앱의 사용 시간을 감시하는 중")
                .setContentIntent(content).setOngoing(true).build();
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(ONGOING_ID, notification);
    }
    private static final String ONE_MINUTE_CHANNEL = "godseng_one_minute";
    private static final int ONE_MINUTE_ID = 5003;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean polling;
    private boolean destroyed;
    private boolean screenInteractive = true;
    private boolean lastWasMonitored;
    private long screenResumedAtMillis;
    private long lastSessionElapsedMs;
    private String reminderSessionKey;
    private boolean reminderSentForSession;
    // These cached fields are accessed only by the single usage worker.
    private String cachedUsagePackage;
    private String cachedUsageDay;
    private long cachedUsageAtElapsed;
    private long cachedUsageMinutes;
    private boolean cachedUsageValid;

    private static final class PollResult {
        final JSONObject state;
        final UsageEngine.ForegroundState foreground;
        final boolean permitted;
        final boolean freeDay;
        final boolean monitored;
        final long minutes;
        PollResult(JSONObject state, UsageEngine.ForegroundState foreground,
                   boolean permitted, boolean freeDay, boolean monitored, long minutes) {
            this.state = state;
            this.foreground = foreground;
            this.permitted = permitted;
            this.freeDay = freeDay;
            this.monitored = monitored;
            this.minutes = minutes;
        }
    }

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String action = intent == null ? null : intent.getAction();
            if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                screenInteractive = false;
                handler.removeCallbacks(tick);
                if (lastWasMonitored && lastCategory != null) resetStage(lastCategory);
                lastWasMonitored = false;
                lastCategory = null;
                reminderSessionKey = null;
                reminderSentForSession = false;
                if (overlay != null) overlay.dismiss();
                if (pendingHeads != null)
                    ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(WARNING_ID);
                pendingHeads = null;
            } else if (Intent.ACTION_SCREEN_ON.equals(action) ||
                    Intent.ACTION_USER_PRESENT.equals(action)) {
                screenInteractive = true;
                screenResumedAtMillis = System.currentTimeMillis();
                requestPollNow();
            }
        }
    };

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (destroyed || !screenInteractive || polling) return;
            polling = true;
            try {
                worker.execute(() -> {
                    PollResult result = null;
                    try { result = collectPoll(); }
                    catch (Exception error) {
                        android.util.Log.w("GodsengAlarm", "Usage query failed", error);
                    }
                    final PollResult delivered = result;
                    handler.post(() -> {
                        polling = false;
                        if (destroyed || !screenInteractive) return;
                        boolean monitored = false;
                        long nextDelay = MonitorPolicy.IDLE_POLL_MS;
                        if (delivered != null) {
                            try {
                                monitored = evaluate(delivered);
                                if (delivered.freeDay) {
                                    // No foreground queries until tomorrow unless settings change.
                                    nextDelay = millisUntilTomorrow();
                                } else {
                                    nextDelay = MonitorPolicy.nextPollDelay(
                                            screenInteractive, monitored, lastSessionElapsedMs);
                                }
                            } catch (Exception error) {
                                android.util.Log.w("GodsengAlarm", "Monitor evaluation failed", error);
                            }
                        }
                        if (nextDelay >= 0L) handler.postDelayed(tick, nextDelay);
                    });
                });
            } catch (Exception error) {
                polling = false;
                android.util.Log.w("GodsengAlarm", "Usage worker unavailable", error);
                handler.postDelayed(this, MonitorPolicy.IDLE_POLL_MS);
            }
        }
    };

    private void requestPollNow() {
        handler.removeCallbacks(tick);
        if (!destroyed && screenInteractive && !polling) handler.post(tick);
    }

    private static long millisUntilTomorrow() {
        Calendar tomorrow = Calendar.getInstance();
        tomorrow.add(Calendar.DAY_OF_MONTH, 1);
        tomorrow.set(Calendar.HOUR_OF_DAY, 0);
        tomorrow.set(Calendar.MINUTE, 0);
        tomorrow.set(Calendar.SECOND, 0);
        tomorrow.set(Calendar.MILLISECOND, 0);
        return Math.max(1_000L, tomorrow.getTimeInMillis() - System.currentTimeMillis());
    }

    private static boolean enabled(JSONObject state, String packageName) {
        if (packageName == null) return false;
        JSONObject on = state.optJSONObject("on");
        if (on == null || !on.optBoolean(packageName, false)) return false;
        JSONArray removed = state.optJSONArray("removed");
        if (removed != null) for (int i = 0; i < removed.length(); i++)
            if (packageName.equals(removed.optString(i))) return false;
        return true;
    }

    private PollResult collectPoll() {
        JSONObject saved = state();
        if (!MainActivity.hasUsagePermission(this))
            return new PollResult(saved, null, false, false, false, 0L);
        boolean freeDay = isFreeDayToday(saved);
        if (freeDay) return new PollResult(saved, null, true, true, false, 0L);
        UsageEngine.ForegroundState foreground = UsageEngine.currentForegroundState(this);
        String pkg = foreground.packageName;
        boolean monitored = !getPackageName().equals(pkg) && enabled(saved, pkg);
        long minutes = 0L;
        if (monitored) {
            JSONObject configs = saved.optJSONObject("cfg");
            JSONObject cfg = configs == null ? null : configs.optJSONObject(pkg);
            if (cfg == null) cfg = new JSONObject();
            boolean afterConfigured = hasMethod(saved, cfg, "after");
            if (afterConfigured) {
                long nowElapsed = SystemClock.elapsedRealtime();
                String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
                boolean matching = cachedUsageValid &&
                        pkg.equals(cachedUsagePackage) && today.equals(cachedUsageDay);
                if (MonitorPolicy.shouldRefreshDailyUsage(
                        afterConfigured, matching, cachedUsageAtElapsed, nowElapsed)) {
                    cachedUsageMinutes = UsageEngine.getUsageMinutes(this, pkg);
                    cachedUsageAtElapsed = nowElapsed;
                    cachedUsagePackage = pkg;
                    cachedUsageDay = today;
                    cachedUsageValid = true;
                }
                minutes = cachedUsageMinutes;
            }
        }
        return new PollResult(saved, foreground, true, false, monitored, minutes);
    }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(MONITOR_CHANNEL,
                "앱 사용 감시", NotificationManager.IMPORTANCE_LOW));
        NotificationChannel warnings = new NotificationChannel(WARNING_CHANNEL,
                "갓생 경고", NotificationManager.IMPORTANCE_HIGH);
        warnings.setDescription("선택한 앱 사용 조건을 만족하면 경고");
        nm.createNotificationChannel(warnings);
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, MONITOR_CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("갓생알리미")
                .setContentText("선택한 앱의 사용 시간을 감시하는 중")
                .setContentIntent(content)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else startForeground(ONGOING_ID, notification);
        overlay = new WarningOverlay(this, this::handleAction);
        handler.post(tick);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "com.godseng.alarm.WARNING_ACTION".equals(intent.getAction())) {
            handleAction(intent.getStringExtra("action"), intent.getStringExtra("category"));
        }
        if (intent != null && "com.godseng.alarm.FREE_DAY_CHANGED".equals(intent.getAction())) {
            if (overlay != null) overlay.dismiss();
            pendingHeads = null;
            lastCategory = null;
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(WARNING_ID);
            handler.removeCallbacks(tick);
            handler.post(tick);
        }
        return START_STICKY;
    }

    private JSONObject state() {
        try {
            return new JSONObject(getSharedPreferences("MainActivity", MODE_PRIVATE)
                    .getString("state", "{}"));
        } catch (Exception e) { return new JSONObject(); }
    }

    private static String label(String category) {
        if (category == null) return "앱";
        switch (category) {
            case "short": return "숏폼";
            case "feed": return "사진피드";
            case "toon": return "웹툰";
            case "game": return "게임";
            case "comm": return "커뮤니티";
            case "video": return "동영상";
            case "shop": return "쇼핑";
            case "msg": return "메신저";
            case "news": return "뉴스";
            case "music": return "음악";
            default: return "앱";
        }
    }

    private static int indexOfStage(JSONArray order, int position) {
        if (order == null || order.length() == 0) return 1;
        return order.optInt(Math.min(Math.max(position, 0), order.length() - 1), 1);
    }

    private static JSONArray orderOf(JSONObject state, JSONObject cfg) {
        JSONArray explicit = cfg.optJSONArray("order");
        if (explicit != null && explicit.length() != 0) return explicit;
        JSONArray order = new JSONArray();
        int base = Math.max(0, Math.min(3, state.optInt("baseStage", 1)));
        int last = state.optBoolean("escalate", true) ? 3 : base;
        for (int i = base; i <= last; i++) order.put(i);
        return order;
    }

    private static boolean hasMethod(JSONObject state, JSONObject cfg, String name) {
        JSONArray methods = cfg.has("methods") ? cfg.optJSONArray("methods") : state.optJSONArray("methods");
        if (methods == null) return false;
        for (int i = 0; i < methods.length(); i++)
            if (name.equals(methods.optString(i))) return true;
        return false;
    }

    static boolean inRange(int minute, JSONObject range) {
        int start = range.optInt("sh", 23) * 60 + range.optInt("sm", 0);
        int end = range.optInt("eh", 7) * 60 + range.optInt("em", 0);
        return start < end ? minute >= start && minute < end
                : minute >= start || minute < end;
    }

    private boolean condition(JSONObject state, JSONObject cfg, long minutes) {
        int after = cfg.optInt("after", state.optInt("after", 30));
        JSONObject range = cfg.optJSONObject("range");
        if (range == null) range = state.optJSONObject("range");
        Calendar now = Calendar.getInstance();
        int minute = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        return (hasMethod(state, cfg, "after") && minutes >= after)
                || (hasMethod(state, cfg, "range") && range != null && inRange(minute, range));
    }

    static boolean isFreeDayToday(JSONObject saved) {
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        return today.equals(saved.optString("freeDayDate", ""));
    }

    private void evaluate() {
        if (!MainActivity.hasUsagePermission(this)) return;
        JSONObject s = state();
        updateMonitorNotification(isFreeDayToday(s));
        if (isFreeDayToday(s)) {
            if (overlay != null) overlay.dismiss();
            if (pendingHeads != null) {
                ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(WARNING_ID);
            }
            pendingHeads = null;
            lastCategory = null;
            return;
        }
        String pkg = UsageEngine.currentForeground(this);
        // State keys now are real package IDs, not predefined category names.
        String category = getPackageName().equals(pkg) ? null : pkg;
        if (lastCategory != null && !lastCategory.equals(category)) {
            resetStage(lastCategory);
            if (overlay != null) overlay.dismiss();
            pendingHeads = null;
        }
        lastCategory = category;
        if (category == null || !UsageEngine.isEnabled(this, category)) return;
        JSONObject configs = s.optJSONObject("cfg");
        JSONObject cfg = configs == null ? null : configs.optJSONObject(category);
        if (cfg == null) cfg = new JSONObject();
        long minutes = sLong(UsageEngine.getUsageJson(this), category);
        if (!condition(s, cfg, minutes)) return;
        long now = System.currentTimeMillis();
        if (now - warnedAt.getOrDefault(category, 0L) < 120000) return;
        if (overlay != null && overlay.isShowing()) return;
        if (pendingHeads != null) return;
        warnedAt.put(category, now);
        JSONObject stages = s.optJSONObject("stageByApp");
        int step = stages == null ? 0 : stages.optInt(category, 0);
        int stage = indexOfStage(orderOf(s, cfg), step);
        String message = InstalledApps.label(this, category) + " 사용 시간을 확인해 봐";
        if (stage == 0 || !android.provider.Settings.canDrawOverlays(this)) {
            showHeads(category, message);
        } else {
            overlay.show(category, stage, (int) minutes, s);
        }
    }

    private static long sLong(JSONObject json, String key) { return json.optLong(key, 0); }

    private PendingIntent actionIntent(String category, String action, int code) {
        Intent i = new Intent(this, WarningActionReceiver.class);
        i.setAction("com.godseng.alarm.WARNING_ACTION");
        i.putExtra("category", category);
        i.putExtra("action", action);
        return PendingIntent.getBroadcast(this, code, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void showHeads(String category, String message) {
        pendingHeads = category;
        Notification notification = new Notification.Builder(this, WARNING_CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("갓생알리미")
                .setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setPriority(Notification.PRIORITY_HIGH)
                .setAutoCancel(true)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_close_clear_cancel, "무시",
                        actionIntent(category, "ignore", 21)).build())
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_view, "앱에서 나가기",
                        actionIntent(category, "stop", 22)).build())
                .build();
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                .notify(WARNING_ID, notification);
        handler.postDelayed(() -> {
            if (category.equals(pendingHeads)) handleAction("ignore", category);
        }, 6500);
    }

    private void resetStage(String category) { updateStage(category, 0); }

    private void updateStage(String category, int newStep) {
        JSONObject s = state();
        try {
            JSONObject stages = s.optJSONObject("stageByApp");
            if (stages == null) { stages = new JSONObject(); s.put("stageByApp", stages); }
            stages.put(category, newStep);
            getSharedPreferences("MainActivity", MODE_PRIVATE)
                    .edit().putString("state", s.toString()).apply();
        } catch (Exception e) { android.util.Log.w("GodsengAlarm", "Cannot save stage", e); }
    }

    void handleAction(String action, String category) {
        if (category == null) return;
        // The original HTML resets its warning step after the final HOME action.
        // Do the same for the background monitor, including repeat mode.
        if ("home".equals(action)) { resetStage(category); goHome(); return; }
        if ("done".equals(action)) {
            if (overlay != null) overlay.dismiss();
            return;
        }
        if (category.equals(pendingHeads)) {
            pendingHeads = null;
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(WARNING_ID);
        }
        if ("ignore".equals(action)) {
            JSONObject s = state();
            JSONObject configurations = s.optJSONObject("cfg");
            JSONObject cfg = configurations == null ? null : configurations.optJSONObject(category);
            if (cfg == null) cfg = new JSONObject();
            JSONArray order = orderOf(s, cfg);
            JSONObject stages = s.optJSONObject("stageByApp");
            int current = stages == null ? 0 : stages.optInt(category, 0);
            int next = cfg.optBoolean("repeat", false) && order.length() > 0
                    ? (current + 1) % order.length()
                    : Math.min(current + 1, Math.max(0, order.length() - 1));
            updateStage(category, next);
        } else if ("stop".equals(action)) {
            resetStage(category);
            goHome();
        }
        if (overlay != null) overlay.dismiss();
    }

    private void goHome() {
        try {
            Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_HOME);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            android.util.Log.w("GodsengAlarm", "System blocked HOME navigation", e);
        }
    }

    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (overlay != null) overlay.dismiss();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
