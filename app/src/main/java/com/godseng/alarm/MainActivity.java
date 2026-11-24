package com.godseng.alarm;

import android.Manifest;
import android.app.Activity;
import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private WebView browser;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int permissionsStep = -1;
    private boolean pageLoaded = false;
    private final ExecutorService appWorker = Executors.newSingleThreadExecutor();

    public static boolean hasUsagePermission(Context context) {
        AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
        return ops != null && ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(), context.getPackageName()) == AppOpsManager.MODE_ALLOWED;
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().setNavigationBarColor(Color.BLACK);
        browser = new WebView(this);
        browser.setBackgroundColor(Color.BLACK);
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowFileAccess(true);
        browser.getSettings().setAllowFileAccessFromFileURLs(false);
        browser.getSettings().setAllowUniversalAccessFromFileURLs(false);
        browser.getSettings().setMediaPlaybackRequiresUserGesture(true);
        browser.addJavascriptInterface(new MainBridge(), "Android");
        browser.setWebChromeClient(new WebChromeClient());
        browser.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                injectAdapter();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // The UI is a single local HTML asset. Never give remote pages the JS bridge.
                return !request.getUrl().toString().equals("file:///android_asset/index.html");
            }
        });
        setContentView(browser);
        browser.loadUrl("file:///android_asset/index.html");
    }

    private void injectAdapter() {
        injectJavascriptAsset("native-adapter.js");
        injectJavascriptAsset("features.js");
    }

    private void injectJavascriptAsset(String assetName) {
        try (InputStream in = getAssets().open(assetName);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) >= 0) output.write(chunk, 0, n);
            browser.evaluateJavascript(output.toString("UTF-8"), null);
        } catch (Exception e) {
            android.util.Log.e("GodsengAlarm", "JavaScript asset failed to load: " + assetName, e);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (browser != null) browser.onResume();
        handler.postDelayed(() -> {
            if (pageLoaded && browser != null) {
                browser.evaluateJavascript("window.NativeApp && (NativeApp.refreshUsage(), NativeApp.syncPermissions && NativeApp.syncPermissions(), NativeApp.syncFreeDay && NativeApp.syncFreeDay())", null);
            }
            maybeStartMonitor();
        }, 650);
    }

    @Override protected void onPause() {
        if (browser != null) browser.onPause();
        super.onPause();
    }

    private void maybeStartMonitor() {
        if (!hasUsagePermission(this)) return;
        String value = getPreferences(MODE_PRIVATE).getString("state", "");
        boolean active = false;
        try {
            JSONObject state = new JSONObject(value);
            if (state.optBoolean("initialized", false)) {
                JSONObject enabled = state.optJSONObject("on");
                if (enabled != null) {
                    java.util.Iterator<String> keys = enabled.keys();
                    while (keys.hasNext()) {
                        if (enabled.optBoolean(keys.next(), false)) { active = true; break; }
                    }
                }
            }
        } catch (Exception ignored) { }
        if (!active) { stopService(new Intent(this, MonitorService.class)); return; }
        try {
            Intent intent = new Intent(this, MonitorService.class);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
            else startService(intent);
        } catch (Exception e) {
            android.util.Log.w("GodsengAlarm", "Background monitoring unavailable", e);
        }
    }

    private void requestPermissionsInOrder() {
        permissionsStep = 0;
        nextPermission();
    }

    private void nextPermission() {
        if (permissionsStep == 0) {
            permissionsStep = 1;
            if (!hasUsagePermission(this)) {
                startActivityForResult(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS), 501);
                return;
            }
        }
        if (permissionsStep == 1) {
            permissionsStep = 2;
            if (!Settings.canDrawOverlays(this)) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
                startActivityForResult(intent, 502);
                return;
            }
        }
        if (permissionsStep == 2) {
            permissionsStep = 3;
            android.app.NotificationManager manager =
                    (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            boolean enabled = manager != null && manager.areNotificationsEnabled();
            boolean granted = Build.VERSION.SDK_INT < 33 ||
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            if (!enabled || !granted) {
                boolean asked = getPreferences(MODE_PRIVATE).getBoolean("notificationAsked", false);
                if (Build.VERSION.SDK_INT >= 33 && !asked && !granted) {
                    getPreferences(MODE_PRIVATE).edit().putBoolean("notificationAsked", true).apply();
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 503);
                } else {
                    Intent settings = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    settings.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivityForResult(settings, 504);
                }
                return;
            }
        }
        permissionsStep = -1;
        maybeStartMonitor();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if ((request == 501 || request == 502 || request == 504) && permissionsStep != -1) nextPermission();
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 503 && permissionsStep != -1) nextPermission();
    }

    @Override public void onBackPressed() {
        if (browser == null) { super.onBackPressed(); return; }
        browser.evaluateJavascript(
                "(function(){if(typeof cur==='undefined'||cur==='s-home'||cur==='s-hero'){" +
                "return false;} if(cur==='s-add-time')go('s-add-pick',true);" +
                "else if(cur==='s-add-stage')go('s-add-time',true);" +
                "else if(cur==='s-edit')$('ed-back').click();" +
                "else if(cur==='s-detail')go('s-home',true);" +
                "else if(cur==='s-insight')go('s-home',true);" +
                "else if(cur==='s-method')go('s-pick',true);" +
                "else if(cur==='s-alert')go('s-method',true);" +
                "else if(cur==='s-pick'||cur==='s-perm')go('s-hero',true);" +
                "else if(cur==='s-add-pick')go('s-home',true);" +
                "else go('s-home',true);return true;})()",
                value -> { if ("false".equals(value)) MainActivity.super.onBackPressed(); }
        );
    }

    @Override protected void onDestroy() {
        appWorker.shutdownNow();
        if (browser != null) {
            browser.removeJavascriptInterface("Android");
            browser.destroy();
            browser = null;
        }
        super.onDestroy();
    }

    private final class MainBridge {
        @JavascriptInterface public String loadState() {
            return getPreferences(MODE_PRIVATE).getString("state", "");
        }
        @JavascriptInterface public void saveState(String json) {
            try {
                new JSONObject(json); // Reject corrupt payloads.
                getPreferences(MODE_PRIVATE).edit().putString("state", json).apply();
            } catch (Exception ignored) { }
        }
        @JavascriptInterface public String usageJson() {
            return UsageEngine.getUsageJson(MainActivity.this).toString();
        }
        // The original synchronous bridge generated hundreds of PNGs and blocked WebView startup.
        // Package enumeration and icon encoding now happen off the UI/JavaScript thread.
        @JavascriptInterface public void requestInstalledApps() {
            appWorker.execute(() -> {
                String payload = InstalledApps.list(MainActivity.this).toString();
                handler.post(() -> {
                    if (browser != null) browser.evaluateJavascript(
                            "window.NativeApp && NativeApp.receiveCatalog(" +
                            JSONObject.quote(payload) + ")", null);
                });
            });
        }
        @JavascriptInterface public void requestAppIcon(String packageId) {
            if (packageId == null || !packageId.matches("[A-Za-z0-9_.]+")) return;
            appWorker.execute(() -> {
                String uri = InstalledApps.iconDataUri(MainActivity.this, packageId);
                handler.post(() -> {
                    if (browser != null) browser.evaluateJavascript(
                            "window.NativeApp && NativeApp.receiveAppIcon(" +
                            JSONObject.quote(packageId) + "," +
                            JSONObject.quote(uri) + ")", null);
                });
            });
        }
        @JavascriptInterface public String permissionStatusJson() {
            JSONObject status = new JSONObject();
            try {
                status.put("usage", hasUsagePermission(MainActivity.this));
                status.put("overlay", Settings.canDrawOverlays(MainActivity.this));
                android.app.NotificationManager manager =
                    (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                boolean granted = Build.VERSION.SDK_INT < 33 ||
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
                status.put("notification", granted && manager != null && manager.areNotificationsEnabled());
            } catch (Exception e) {
                android.util.Log.w("GodsengAlarm", "Permission status failed", e);
            }
            return status.toString();
        }
        @JavascriptInterface public void startMonitoring() {
            runOnUiThread(MainActivity.this::maybeStartMonitor);
        }
        @JavascriptInterface public void freeDayChanged() {
            runOnUiThread(() -> {
                maybeStartMonitor();
                try {
                    JSONObject saved = new JSONObject(getPreferences(MODE_PRIVATE).getString("state", "{}"));
                    JSONObject enabled = saved.optJSONObject("on");
                    boolean hasEnabled = false;
                    if (enabled != null) {
                        java.util.Iterator<String> keys = enabled.keys();
                        while (keys.hasNext()) {
                            if (enabled.optBoolean(keys.next(), false)) {hasEnabled = true; break;}
                        }
                    }
                    if (!hasEnabled || !hasUsagePermission(MainActivity.this)) return;
                    Intent intent = new Intent(MainActivity.this, MonitorService.class);
                    intent.setAction("com.godseng.alarm.FREE_DAY_CHANGED");
                    startService(intent);
                } catch (Exception error) {
                    android.util.Log.w("GodsengAlarm", "Free Day update unavailable", error);
                }
            });
        }
        @JavascriptInterface public void requestPermissions() {
            runOnUiThread(MainActivity.this::requestPermissionsInOrder);
        }
    }
}
