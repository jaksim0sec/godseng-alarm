/*
 * Native adapter. This file is injected AFTER the unmodified HTML executes.
 * No source markup, CSS, original event handler or animation is rewritten.
 */
(() => {
  if (!window.Android || window.__godsengNativeAdapter) return;
  window.__godsengNativeAdapter = true;

  const toSet = (values) => new Set(Array.isArray(values) ? values : []);
  const toCfg = (value) => ({
    methods: toSet(value.methods),
    after: value.after,
    range: {...value.range},
    order: [...value.order],
    msg: {...(value.msg || {})},
    vib: value.vib !== false
  });

  let wasInitialized = false;
  try {
    const raw = Android.loadState();
    if (raw) {
      const saved = JSON.parse(raw);
      wasInitialized = !!saved.initialized;
      if (wasInitialized) {
        S.sel = toSet(saved.sel);
        S.methods = toSet(saved.methods);
        S.method = saved.method || null;
        S.after = saved.after ?? 30;
        S.range = saved.range || {sh: 23, sm: 0, eh: 7, em: 0};
        S.baseStage = saved.baseStage ?? 1;
        S.escalate = saved.escalate !== false;
        S.feedback = toSet(saved.feedback || ['light', 'vibrate']);
        S.message = saved.message || '이제 잠깐 쉬어갈 시간이야';
        S.on = saved.on || {};
        S.removed = toSet(saved.removed);
        S.pin = toSet(saved.pin);
        S.filter = saved.filter || 'on';
        S.cfg = Object.fromEntries(Object.entries(saved.cfg || {}).map(([id, value]) => [id, toCfg(value)]));
        S.stageByApp = saved.stageByApp || {};
        go('s-home');
        renderHome();
        updCount();
        renderAlertConfig();
      }
    }
  } catch (error) {
    console.error('Could not restore saved settings', error);
  }

  function snapshot() {
    const initialized = wasInitialized || Object.keys(S.on).length > 0;
    return JSON.stringify({
      version: 1, initialized, sel: [...S.sel], methods: [...S.methods],
      method: S.method, after: S.after, range: S.range,
      baseStage: S.baseStage, escalate: S.escalate,
      feedback: [...S.feedback], message: S.message,
      on: S.on, removed: [...S.removed], pin: [...S.pin],
      filter: S.filter, stageByApp: S.stageByApp,
      cfg: Object.fromEntries(Object.entries(S.cfg).map(([id, c]) => [id, {
        methods: [...c.methods], after: c.after, range: c.range,
        order: c.order, msg: c.msg, vib: c.vib
      }]))
    });
  }

  let pending = 0;
  const save = () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      const value = snapshot();
      Android.saveState(value);
      if (Object.keys(S.on).length) Android.startMonitoring();
    }, 440);
  };

  // Capture UI changes without replacing any original click/gesture handler.
  document.addEventListener('click', save, false);
  document.addEventListener('pointerup', save, false);
  document.addEventListener('change', save, false);
  document.addEventListener('input', save, false);
  document.addEventListener('scroll', save, true);
  window.addEventListener('pagehide', () => Android.saveState(snapshot()));

  const start = document.getElementById('b-start');
  start.addEventListener('click', () => {
    // Give the original permissions-screen transition time to start.
    setTimeout(() => Android.requestPermissions(), 400);
  }, false);

  const refreshUsage = () => {
    try {
      const usage = JSON.parse(Android.usageJson());
      if (!usage || !Object.keys(usage).length) return;
      APPS.forEach(a => {
        if (typeof usage[a.id] === 'number') a.mins = usage[a.id];
      });
      if (cur === 's-home') renderHome();
      if (cur === 's-insight') openInsight();
      if (cur === 's-detail' && typeof dId !== 'undefined' && dId) openDetail(dId);
    } catch (error) {
      console.warn('Usage refresh failed', error);
    }
  };

  window.NativeApp = {refreshUsage};
  setTimeout(refreshUsage, 600);
  setInterval(refreshUsage, 45000);
})();
