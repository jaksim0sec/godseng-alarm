package com.godseng.alarm;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

/**
 * Displays the ORIGINAL warning animation code in a full-screen Android overlay.
 * Never reimplements its SVGs, CSS, countdowns, button labels or event handlers.
 */
public final class WarningOverlay {
    public interface ActionListener { void onAction(String action, String category); }
    private final Context context;
    private final ActionListener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView surface;
    private String currentCategory;

    public WarningOverlay(Context context, ActionListener listener) {
        this.context = context;
        this.listener = listener;
    }

    public boolean isShowing() { return surface != null; }

    public void show(String category, int stage, int minutes, JSONObject savedState) {
        handler.post(() -> {
            dismissNow();
            if (!Settings.canDrawOverlays(context)) return;
            currentCategory = category;
            WebView view = new WebView(context);
            surface = view;
            view.setBackgroundColor(Color.TRANSPARENT);
            view.getSettings().setJavaScriptEnabled(true);
            view.getSettings().setAllowFileAccess(true);
            view.getSettings().setAllowFileAccessFromFileURLs(false);
            view.getSettings().setAllowUniversalAccessFromFileURLs(false);
            view.addJavascriptInterface(new WarningBridge(category), "WarningNative");
            view.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView web, String url) {
                    if (surface != web) return;
                    String js = "(function(){" +
                            "const nativeStyle=document.createElement('style');" +
                            "nativeStyle.textContent='html,body{background:transparent!important;}'+" +
                            "'.scr{display:none!important;}';" +
                            "document.head.appendChild(nativeStyle);" +
                            "const saved=" + savedState.toString() + ";" +
                            "const id=" + JSONObject.quote(category) + ";" +
                            "const app=APPS.find(x=>x.id===id);" +
                            "if(!app)return;" +
                            "app.mins=" + minutes + ";" +
                            "S.on[id]=true;" +
                            "const source=saved.cfg&&saved.cfg[id];" +
                            "if(source)S.cfg[id]={methods:new Set(source.methods||[])," +
                            "after:source.after,range:source.range,order:[...source.order]," +
                            "msg:{...(source.msg||{})},vib:source.vib!==false};" +
                            "const oldIgnore=ignored;ignored=function(i){" +
                            "oldIgnore(i);WarningNative.action('ignore');};" +
                            "const oldStop=stopped;stopped=function(i){" +
                            "oldStop(i);WarningNative.action('stop');};" +
                            "const oldComplete=completeCountdown;completeCountdown=function(a){" +
                            "oldComplete(a);WarningNative.action('home');};" +
                            "document.addEventListener('click',e=>{" +
                            "if(e.target.closest('#b-end-close'))WarningNative.action('done');},true);" +
                            "triggerWarning(app,{preview:true,stage:" + stage + ",sandbox:false});" +
                            "})()";
                    web.evaluateJavascript(js, null);
                }
            });
            WindowManager manager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
            WindowManager.LayoutParams options = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT);
            options.gravity = Gravity.CENTER;
            try {
                manager.addView(view, options);
                view.loadUrl("file:///android_asset/index.html");
            } catch (Exception e) {
                android.util.Log.w("GodsengAlarm", "Overlay unavailable", e);
                dismissNow();
            }
        });
    }

    public void dismiss() {
        if (Looper.myLooper() == Looper.getMainLooper()) dismissNow();
        else handler.post(this::dismissNow);
    }

    private void dismissNow() {
        if (surface == null) return;
        WebView v = surface;
        surface = null;
        currentCategory = null;
        try {
            ((WindowManager) context.getSystemService(Context.WINDOW_SERVICE)).removeView(v);
        } catch (Exception ignored) { }
        v.removeJavascriptInterface("WarningNative");
        v.destroy();
    }

    private final class WarningBridge {
        private final String category;
        WarningBridge(String category) { this.category = category; }
        @JavascriptInterface public void action(String action) {
            handler.post(() -> {
                if (category.equals(currentCategory)) listener.onAction(action, category);
            });
        }
    }
}
