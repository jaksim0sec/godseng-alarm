package com.godseng.alarm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class WarningActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !"com.godseng.alarm.WARNING_ACTION".equals(intent.getAction())) return;
        // Same notification buttons as a live warning, but editor replay actions
        // must never start the foreground service or advance a warning stage.
        if ("previewDismiss".equals(intent.getStringExtra("action"))) {
            WarningNotifications.dismissPreview(context);
            return;
        }
        Intent monitor = new Intent(context, MonitorService.class);
        monitor.setAction("com.godseng.alarm.WARNING_ACTION");
        monitor.putExtra("category", intent.getStringExtra("category"));
        monitor.putExtra("action", intent.getStringExtra("action"));
        try {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(monitor);
            else context.startService(monitor);
        } catch (Exception e) {
            android.util.Log.w("GodsengAlarm", "Could not handle warning action", e);
        }
    }
}
