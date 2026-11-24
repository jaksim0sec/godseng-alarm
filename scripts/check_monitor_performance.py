#!/usr/bin/env python3
"""Static guards for high-frequency Android monitoring and one-minute reminders."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
monitor=(root/"app/src/main/java/com/godseng/alarm/MonitorService.java").read_text()
usage=(root/"app/src/main/java/com/godseng/alarm/UsageEngine.java").read_text()
adapter=(root/"app/src/main/assets/native-adapter.js").read_text()
activity=(root/"app/src/main/java/com/godseng/alarm/MainActivity.java").read_text()
ci=(root/".github/workflows/android.yml").read_text()
checks={
  "worker thread for Android usage reads": "Executors.newSingleThreadExecutor" in monitor and "worker.execute(" in monitor,
  "no poll when screen off": "Intent.ACTION_SCREEN_OFF" in monitor and "Intent.ACTION_SCREEN_ON" in monitor,
  "adaptive poll via policy": "MonitorPolicy.nextPollDelay(" in monitor,
  "minute reminder channel": "ONE_MINUTE_CHANNEL" in monitor and "showOneMinuteReminder(" in monitor,
  "minute per-session gate": "MonitorPolicy.shouldNotifyMinute(" in monitor,
  "cached daily usage": "MonitorPolicy.shouldRefreshDailyUsage(" in monitor,
  "targeted usage query": "UsageEngine.getUsageMinutes(" in monitor and "UsageEngine.getUsageJson(this)" not in monitor,
  "foreground event timestamp": "ForegroundState" in usage and "event.getTimeStamp()" in usage,
  "no excessive permission poll": "setInterval(syncPermissions, 450)" not in adapter,
  "monitor shutdown when last app disabled": "lastMonitorSignature" in adapter and "Android.startMonitoring();" in adapter,
  "native launch excludes removed apps": 'state.optJSONArray("removed")' in activity,
  "CI runs behavior test": "MonitorPolicyTest.java" in ci and "check_monitor_performance.py" in ci,
}
failed=0
for key,yes in checks.items():
    print(("PASS" if yes else "FAIL")+" "+key)
    failed+=not yes
if failed: raise SystemExit(str(failed)+" monitoring gates failed")
