#!/usr/bin/env python3
"""Static integration safeguards for the native Android installed-app bridge."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
read = lambda name: (root / name).read_text(encoding="utf-8")
catalog = read("app/src/main/java/com/godseng/alarm/InstalledApps.java")
activity = read("app/src/main/java/com/godseng/alarm/MainActivity.java")
usage = read("app/src/main/java/com/godseng/alarm/UsageEngine.java")
monitor = read("app/src/main/java/com/godseng/alarm/MonitorService.java")
overlay = read("app/src/main/java/com/godseng/alarm/WarningOverlay.java")
adapter = read("app/src/main/assets/native-adapter.js")
manifest = read("app/src/main/AndroidManifest.xml")
conditions = {
    "launcher visibility": 'android.intent.category.LAUNCHER' in manifest,
    "real installed packages": "queryIntentActivities(launchers, 0)" in catalog and 'app.put("id", id)' in catalog,
    "real app icons": "getApplicationIcon(packageId)" in catalog and "Bitmap.CompressFormat.PNG" in catalog,
    "catalog bridge": "installedAppsJson()" in activity and "InstalledApps.list(" in activity,
    "permission status bridge": "permissionStatusJson()" in activity and 'status.put("usage"' in activity,
    "notification status": "areNotificationsEnabled()" in activity,
    "app catalog bound to original data": "APPS.splice(0, APPS.length, ...entries)" in adapter,
    "carousel cached items rebuilt": "fis.splice(0, fis.length, ...flow.children)" in adapter,
    "actual icon SVG": "native-installed-icon" in adapter,
    "permission checked before completion": "if (!allGranted(status) || finished) return;" in adapter,
    "permission preview timer replaced": "byId('b-start').onclick = () =>" in adapter,
    "live per-package usage": "times.merge(packageId," in usage,
    "package monitoring": "String category = getPackageName().equals(pkg) ? null : pkg;" in monitor,
    "warning for real app": "APPS.splice(0,APPS.length,app);" in overlay,
}
for label, good in conditions.items():
    assert good, "FAIL: " + label
print("Native Android installed-app/permission wiring: " + str(len(conditions)) + "/" + str(len(conditions)) + " PASS")
