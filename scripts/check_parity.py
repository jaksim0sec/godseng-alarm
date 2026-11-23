#!/usr/bin/env python3
"""Fail CI if the original user-supplied HTML was edited or partially dropped."""
from pathlib import Path
import hashlib
import re
root = Path(__file__).resolve().parents[1]
html = (root / "app/src/main/assets/index.html").read_bytes()
expected = "a9607d5a113846cfaf99c98734b6ecf767c3decf9b4b4ab49222cfd761fc69aa"
actual = hashlib.sha256(html).hexdigest()
assert actual == expected, f"Original HTML changed: {actual} != {expected}"
source = html.decode("utf-8")
ids = re.findall(r'<section\b[^>]*\bid="([^"]+)"', source)
buttons = len(re.findall(r'<button\b', source))
assert len(ids) == 12, (len(ids), ids)
assert buttons >= 20, buttons
assert all(s in source for s in ("@keyframes", "triggerWarning", "showWatch", "showPopup", "showCountdown", "renderStages", "openInsight", "openDetail"))
print(f"Original HTML exact: SHA256={actual}; screens={len(ids)}; static buttons={buttons}")
