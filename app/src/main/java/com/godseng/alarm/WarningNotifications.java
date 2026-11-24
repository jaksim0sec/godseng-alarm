package com.godseng.alarm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.Locale;

/**
 * The actual stage-zero Android notification, shared by live monitoring and
 * the customization editor replay. Neither path uses a simulated HTML toast.
 */
public final class WarningNotifications {
    public static final String CHANNEL = "godseng_warning";
    public static final int LIVE_ID = 5002;
    public static final int PREVIEW_ID = 5102;
    private static final String[] DEFAULT_MESSAGES = {
            "{앱} {사용시간}째 쓰는 중이야",
            "아직도 {앱} 보고 있어?",
            "이제 잠깐 쉬어갈 시간이야",
            "그만 봐. {앱} 닫는다"
    };

    private WarningNotifications() {}

    public static boolean canNotify(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled()) return false;
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    private static String minutes(long value) {
        long m = Math.max(0L, value);
        return m >= 60L
                ? (m / 60L) + "시간" + (m % 60L != 0L ? " " + (m % 60L) + "분" : "")
                : m + "분";
    }

    public static String message(Context context, String packageName,
                                 int stage, long useMinutes, JSONObject cfg) {
        int index = Math.max(0, Math.min(DEFAULT_MESSAGES.length - 1, stage));
        JSONObject messages = cfg == null ? null : cfg.optJSONObject("msg");
        String template = messages == null ? "" : messages.optString(String.valueOf(index), "");
        if (template.isEmpty()) template = DEFAULT_MESSAGES[index];
        JSONObject range = cfg == null ? null : cfg.optJSONObject("range");
        if (range == null) range = new JSONObject();
        String timeRange = String.format(Locale.US, "%02d:%02d ~ %02d:%02d",
                range.optInt("sh", 23), range.optInt("sm", 0),
                range.optInt("eh", 7), range.optInt("em", 0));
        Calendar now = Calendar.getInstance();
        String clock = String.format(Locale.US, "%02d:%02d",
                now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.MINUTE));
        String name = InstalledApps.label(context, packageName);
        return template.replace("{앱}", name)
                .replace("{사용시간}", minutes(useMinutes))
                .replace("{제한시간}", minutes(cfg == null ? 30 : cfg.optInt("after", 30)))
                .replace("{시간대}", timeRange)
                .replace("{지금}", clock);
    }

    private static PendingIntent action(Context context, String category,
                                        String action, int requestCode) {
        Intent intent = new Intent(context, WarningActionReceiver.class);
        intent.setAction("com.godseng.alarm.WARNING_ACTION");
        intent.putExtra("category", category);
        intent.putExtra("action", action);
        return PendingIntent.getBroadcast(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    public static void show(Context context, String category, String message, boolean preview) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !canNotify(context)) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL,
                "갓생 경고", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("선택한 앱 사용 조건을 만족하면 경고");
        manager.createNotificationChannel(channel);
        String ignoreAction = preview ? "previewDismiss" : "ignore";
        String stopAction = preview ? "previewDismiss" : "stop";
        int code = preview ? 121 : 21;
        Notification notification = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("갓생알리미")
                .setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setPriority(Notification.PRIORITY_HIGH)
                .setAutoCancel(true)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_close_clear_cancel, "무시",
                        action(context, category, ignoreAction, code)).build())
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_view, "앱에서 나가기",
                        action(context, category, stopAction, code + 1)).build())
                .build();
        manager.notify(preview ? PREVIEW_ID : LIVE_ID, notification);
    }

    public static void dismissPreview(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(PREVIEW_ID);
    }
}
