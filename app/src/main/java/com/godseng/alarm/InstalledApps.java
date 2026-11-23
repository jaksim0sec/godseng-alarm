package com.godseng.alarm;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.text.Collator;

/**
 * Actual launcher-visible apps, not a hard-coded list or guessed icons.
 * Android 11+ visibility is granted only for MAIN/LAUNCHER activities in manifest <queries>.
 */
public final class InstalledApps {
    private InstalledApps() {}

    public static JSONArray list(Context context) {
        JSONArray output = new JSONArray();
        PackageManager pm = context.getPackageManager();
        Intent launchers = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> resolved = pm.queryIntentActivities(launchers, 0);
        LinkedHashMap<String, String> packages = new LinkedHashMap<>();
        for (ResolveInfo info : resolved) {
            if (info.activityInfo == null || info.activityInfo.packageName == null) continue;
            String id = info.activityInfo.packageName;
            if (context.getPackageName().equals(id)) continue;
            CharSequence title = info.loadLabel(pm);
            if (!packages.containsKey(id)) packages.put(id, title == null ? id : title.toString());
        }
        List<String> ids = new ArrayList<>(packages.keySet());
        Collator collator = Collator.getInstance(Locale.KOREAN);
        ids.sort(Comparator.comparing(packages::get, collator));
        for (String id : ids) {
            JSONObject app = new JSONObject();
            try {
                app.put("id", id);
                app.put("name", packages.get(id));
                app.put("icon", iconDataUri(context, id));
                output.put(app);
            } catch (Exception error) {
                android.util.Log.w("GodsengAlarm", "Could not encode launcher app " + id, error);
            }
        }
        return output;
    }

    public static String label(Context context, String packageId) {
        try {
            PackageManager pm = context.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(packageId, 0)).toString();
        } catch (Exception ignored) {
            return packageId;
        }
    }

    public static String iconDataUri(Context context, String packageId) {
        try {
            Drawable drawable = context.getPackageManager().getApplicationIcon(packageId).mutate();
            int size = 80;
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, size, size);
            drawable.draw(canvas);
            ByteArrayOutputStream stream = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 95, stream);
            bitmap.recycle();
            String encoded = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP);
            return "data:image/png;base64," + encoded;
        } catch (Exception ignored) {
            // A missing icon should not hide a real launcher entry.
            return "";
        }
    }
}
