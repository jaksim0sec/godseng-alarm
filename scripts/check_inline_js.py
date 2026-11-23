#!/usr/bin/env python3
"""Check the inline original JavaScript syntax without editing the immutable HTML."""
from pathlib import Path
import re
import subprocess
import tempfile

source = (Path(__file__).resolve().parents[1] / "app/src/main/assets/index.html").read_text()
blocks = re.findall(r"<script(?:\\s[^>]*)?>(.*?)</script>", source, re.S)
assert len(blocks) == 1, f"Expected one source script, found {len(blocks)}"
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / "source.js"
    path.write_text(blocks[0], encoding="utf-8")
    subprocess.run(["node", "--check", str(path)], check=True)
print("Original source JavaScript syntax: PASS")
