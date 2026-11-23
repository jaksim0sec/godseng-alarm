# Godseng Alarm Android Port Implementation Plan

> **For agentic workers:** Work from the uploaded original HTML as the immutable spec. Test every native enhancement without rewriting UI.

**Goal:** Package the exact source HTML as an Android app with native background usage monitoring and warnings.
**Architecture:** HTML/CSS/JS bytes are immutable; a WebView loads them verbatim and native Java services supply usage, permissions, persistence, notification and original-DOM warning overlays.
**Tech Stack:** Android Java, WebView, UsageStatsManager, WindowManager overlay, Android Gradle Plugin.
**Spec:** Uploaded `갓생알리미.html`; equivalence audit in `docs/PARITY_AUDIT.md`.

## Global Constraints
- Never modify `app/src/main/assets/index.html` relative to the source (SHA-256 pinned by `scripts/check_parity.py`).
- Preserve all 12 screens and all existing markup, keyframes and JavaScript.
- Work on original `main` branch (repository was empty).
- Separate genuine Android usage data from the HTML's simulated data.

## Tasks and Verification
- [x] Import byte-exact HTML. Verify full-string equality and SHA-256.
- [x] Create Android Gradle/manifest/launcher entrypoint.
- [x] Add separately injected state/persistence and usage-data adapter.
- [x] Add special-permission requests and foreground monitoring.
- [x] Add native system heads-up and original-WebView overlays.
- [x] Add parity regression script and Android APK GitHub Actions workflow.
- [ ] Observe Android APK build success and fix any compiler/runtime defects.
- [ ] Device-check every screen, control, animation and cross-midnight warning case.
- [ ] Reconcile visual and platform limitations in parity audit.

## Review Focus
- Declined permissions must not be misreported as real monitoring.
- Consecutive app sessions must reset warning stage.
- A midnight-spanning time window must remain active across midnight.
- Native overlays must be dismissed on the correct UI thread.
- Android 14+ foreground-service and notification restrictions need physical device validation.
