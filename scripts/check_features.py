#!/usr/bin/env python3
"""Feature regression gates for user-requested app improvements."""
from pathlib import Path
p = Path(__file__).resolve().parents[1]
read = lambda n: (p/n).read_text(encoding="utf-8")
a = read("app/src/main/assets/features.js")
adapter = read("app/src/main/assets/native-adapter.js")
m = read("app/src/main/java/com/godseng/alarm/MonitorService.java")
manifest = read("app/src/main/AndroidManifest.xml")
original = read("app/src/main/assets/index.html")
conditions = {
 "nav active label": "활성" in a and "home.querySelector('.fp[data-f=" in a,
 "larger home navigation": "#s-home .nav" in a and "font-size:33px" in a,
 "non-destructive home reconciliation": "function reconcileHome(" in a and "card.animate(" in a,
 "undo on deactivation": "native-undo" in a and "setOn(id, true)" in a,
 "repeat infinity editor": "T.repeat" in a and "∞" in a,
 "repeat persisted": "repeat:!!c.repeat" in adapter,
 "repeat advances native warnings": 'cfg.optBoolean("repeat", false)' in m,
 "original swipe to remove retained": "classList.add('nudge')" in original and "mode==='swipe'" in original,
 "free-day stores local date": "freeDayDate" in adapter and "todayKey()" in a,
 "free-day suppresses monitoring": "isFreeDayToday" in m,
 "launcher references registered logo": '@mipmap/ic_launcher' in manifest,
 "transparent icon foreground": (p/"app/src/main/res/drawable/ic_launcher_foreground.xml").exists()
}
for name, ok in conditions.items():
    print(("PASS" if ok else "FAIL"),name)
if not all(conditions.values()):
    raise SystemExit("Missing feature paths: " + ", ".join(k for k,v in conditions.items() if not v))
print("PASS all feature integration gates")
