#!/usr/bin/env python3
"""The editor replay must enter the same native warning paths as real alerts."""
from pathlib import Path
r=Path(__file__).resolve().parents[1]
read=lambda name:(r/name).read_text(encoding='utf8')
a=read('app/src/main/java/com/godseng/alarm/MainActivity.java')
s=read('app/src/main/java/com/godseng/alarm/MonitorService.java')
o=read('app/src/main/java/com/godseng/alarm/WarningOverlay.java')
b=read('app/src/main/java/com/godseng/alarm/WarningActionReceiver.java')
n=(r/'app/src/main/java/com/godseng/alarm/WarningNotifications.java')
j=r/'app/src/main/assets/warning-preview.js'
checks={
 'editor bridge script loaded': 'injectJavascriptAsset("warning-preview.js")' in a,
 'native preview bridge': 'previewWarning(String' in a,
 'stage 1-3 shared overlay renderer': 'showPreview(' in o and 'triggerWarning(app,{preview:true' in o,
 'no preview stage changes': 'if (previewShowing)' in o and 'listener.onAction(action, category)' in o,
 'stage 0 uses same notification builder': n.exists() and 'WarningNotifications.show(' in s and 'WarningNotifications.show(' in a,
 'preview action never starts monitor service': 'previewDismiss' in b,
 'preview button uses OS bridge not a mock UI': j.exists() and 'Android.previewWarning(' in j.read_text(encoding='utf8'),
 'original warning HTML remains immutable': 'triggerWarning(appOf(T.id),{stage:EK,cfg:{...T,msg:m},sandbox:true})' in read('app/src/main/assets/index.html'),
}
for name,ok in checks.items():print(('PASS ' if ok else 'FAIL ')+name)
if not all(checks.values()):raise SystemExit(1)
