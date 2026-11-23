/*
 * Android-only adapter, injected AFTER the unmodified HTML.
 * Replaces demo data with the actual Android launcher catalog.
 */
(() => {
  if (!window.Android || window.__godsengNativeAdapter) return;
  window.__godsengNativeAdapter = true;
  const byId = id => document.getElementById(id);
  const toSet = items => new Set(Array.isArray(items) ? items : []);
  const html = v => String(v).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const toCfg = value => ({
    methods: toSet(value.methods),
    after: value.after ?? 30,
    range: {...(value.range || {sh:23,sm:0,eh:7,em:0})},
    order: [...(value.order || [1,2,3])],
    msg: {...(value.msg || {})},
    vib: value.vib !== false
  });

  const css = document.createElement('style');
  css.textContent = [
    '.tile:has(.native-installed-icon){background:transparent!important;overflow:hidden}',
    '.tile svg:has(.native-installed-icon){width:100%!important;height:100%!important;stroke:none!important}',
    '.rk>svg:has(.native-installed-icon){stroke:none!important}',
    '#dots{overflow-x:auto;scrollbar-width:none;justify-content:flex-start;padding:0 12px}',
    '#dots::-webkit-scrollbar{display:none}',
    '#dots i{flex:none}',
    '#perm .pi{cursor:pointer}'
  ].join('');
  document.head.appendChild(css);

  let catalogReady = false;
  function installCatalog() {
    try {
      const raw = JSON.parse(Android.installedAppsJson());
      if (!Array.isArray(raw) || !raw.length) throw Error('No launcher apps returned');
      const entries = raw
        .filter(a => typeof a.id === 'string' && /^[a-zA-Z0-9_.]+$/.test(a.id) &&
          typeof a.name === 'string' && a.name.length > 0)
        .map(a => {
          const uri = typeof a.icon === 'string' &&
            /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(a.icon) ? a.icon : '';
          return {
            id:a.id, name:html(a.name), mins:0,
            p:uri ? '<image class="native-installed-icon" href="' + uri +
              '" x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>'
              : '<rect x="4" y="4" width="16" height="16" rx="5"/>'
          };
        });
      if (!entries.length) throw Error('No valid launcher apps');
      APPS.splice(0, APPS.length, ...entries);
      S.sel = new Set([...S.sel].filter(id => entries.some(a => a.id === id)));
      flow.innerHTML = APPS.map(a => '<button type="button" class="fi" data-id="' +
        a.id + '" aria-label="' + a.name + ' 선택" aria-pressed="false">' +
        tile(a) + '<span class="badge">' + ic(CHECK) +
        '</span><span class="fl">' + a.name + '</span></button>').join('');
      fis.splice(0, fis.length, ...flow.children);
      dots.innerHTML = APPS.map(() => '<i></i>').join('');
      centerIdx = 0;
      flow.scrollLeft = 0;
      updCount();
      requestAnimationFrame(updFlow);
      catalogReady = true;
      return true;
    } catch (error) {
      catalogReady = false;
      console.error('Installed app catalog failed', error);
      return false;
    }
  }

  let wasInitialized = false;
  let saved = {};
  try {
    const raw = Android.loadState();
    if (raw) saved = JSON.parse(raw);
    wasInitialized = !!saved.initialized;
  } catch (error) { console.error('Could not load state', error); }

  if (wasInitialized && installCatalog()) {
    try {
      S.sel = new Set([...toSet(saved.sel)].filter(id => APPS.some(a => a.id === id)));
      S.methods = toSet(saved.methods);
      S.method = saved.method || null;
      S.after = saved.after ?? 30;
      S.range = saved.range || {sh:23,sm:0,eh:7,em:0};
      S.baseStage = saved.baseStage ?? 1;
      S.escalate = saved.escalate !== false;
      S.feedback = toSet(saved.feedback || ['light', 'vibrate']);
      S.message = saved.message || '이제 잠깐 쉬어갈 시간이야';
      S.on = saved.on || {};
      S.removed = toSet(saved.removed);
      S.pin = toSet(saved.pin);
      S.filter = saved.filter || 'on';
      S.cfg = Object.fromEntries(Object.entries(saved.cfg || {})
        .map(([id, value]) => [id, toCfg(value)]));
      S.stageByApp = saved.stageByApp || {};
      const status = JSON.parse(Android.permissionStatusJson());
      const granted = ['usage','overlay','notification'].every(key => status[key] === true);
      go(granted ? 's-home' : 's-perm');
      renderHome();
      updCount();
      renderAlertConfig();
    } catch (error) { console.error('Could not restore state', error); }
  }

  function snapshot() {
    return JSON.stringify({
      version:2, initialized:wasInitialized || Object.values(S.on).some(Boolean),
      sel:[...S.sel], methods:[...S.methods],
      method:S.method, after:S.after, range:S.range,
      baseStage:S.baseStage, escalate:S.escalate,
      feedback:[...S.feedback], message:S.message,
      on:S.on, removed:[...S.removed], pin:[...S.pin],
      filter:S.filter, stageByApp:S.stageByApp,
      cfg:Object.fromEntries(Object.entries(S.cfg).map(([id,c]) => [id,{
        methods:[...c.methods],after:c.after,range:c.range,
        order:c.order,msg:c.msg,vib:c.vib
      }]))
    });
  }
  let pending = 0;
  const save = () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      Android.saveState(snapshot());
      if (Object.values(S.on).some(Boolean)) Android.startMonitoring();
    }, 440);
  };
  document.addEventListener('click', save, false);
  document.addEventListener('pointerup', save, false);
  document.addEventListener('change', save, false);
  document.addEventListener('input', save, false);
  document.addEventListener('scroll', save, true);
  window.addEventListener('pagehide', () => Android.saveState(snapshot()));

  const keys = ['usage','overlay','notification'];
  const rows = [...document.querySelectorAll('#perm .pi')];
  const waiting = new Set();
  let finished = false;
  let permissionTimer = 0;
  let latest = {};
  const allGranted = p => keys.every(key => p[key] === true);

  function syncPermissions() {
    if (cur !== 's-perm') return;
    let status;
    try { status = JSON.parse(Android.permissionStatusJson()); }
    catch (error) { console.warn('Permission query failed', error); return; }
    latest = status;
    rows.forEach((row,i) => {
      if (!status[keys[i]]) {
        row.classList.remove('done');
        waiting.delete(i);
      } else if (!row.classList.contains('done') && !waiting.has(i)) {
        waiting.add(i);
        setTimeout(() => {
          waiting.delete(i);
          if (cur === 's-perm' && latest[keys[i]]) row.classList.add('done');
        }, 320 + 150 * i);
      }
    });
    if (!allGranted(status) || finished) return;
    if (!catalogReady && !installCatalog()) return;
    finished = true;
    clearTimeout(permissionTimer);
    permissionTimer = setTimeout(() => {
      if (cur !== 's-perm') return;
      let now;
      try { now = JSON.parse(Android.permissionStatusJson()); }
      catch (error) { finished = false; return; }
      if (!allGranted(now)) { finished = false; syncPermissions(); return; }
      rows.forEach(row => row.classList.add('done'));
      if (wasInitialized) {
        go('s-home');
        renderHome();
      } else {
        go('s-pick');
        requestAnimationFrame(updFlow);
      }
      refreshUsage();
    }, 1400);
  }

  // Override ONLY the original mock permission-success timer.
  // The original DOM and its spinner/check CSS classes are reused.
  byId('b-start').onclick = () => {
    rows.forEach(row => row.classList.remove('done'));
    waiting.clear();
    finished = false;
    clearTimeout(permissionTimer);
    go('s-perm');
    syncPermissions();
    if (!allGranted(latest)) Android.requestPermissions();
  };
  rows.forEach(row => row.addEventListener('click', () => {
    if (cur !== 's-perm') return;
    if (!allGranted(latest)) Android.requestPermissions();
    else if (!catalogReady) syncPermissions();
  }));
  setInterval(syncPermissions, 450);
  // Keep the original carousel's active dot visible even with 100+ installed apps.
  flow.addEventListener('scroll', () => requestAnimationFrame(() => {
    const selected = dots.children[centerIdx];
    if (selected) dots.scrollTo({
      left:selected.offsetLeft - dots.clientWidth / 2 + selected.clientWidth / 2,
      behavior:'instant'
    });
  }), {passive:true});

  // The installed list can change while the app is open.
  // Refresh before the original add-app click handler reads APPS.
  byId('b-add').addEventListener('click', () => {
    if (installCatalog()) refreshUsage();
  }, {capture:true});

  function refreshUsage() {
    try {
      const usage = JSON.parse(Android.usageJson());
      if (!usage || !Object.keys(usage).length) return;
      APPS.forEach(a => { a.mins = Number.isFinite(usage[a.id]) ? usage[a.id] : 0; });
      if (cur === 's-home') renderHome();
    } catch (error) { console.warn('Usage refresh failed', error); }
  }

  window.NativeApp = {refreshUsage, syncPermissions, refreshInstalledApps:installCatalog};
  setTimeout(refreshUsage, 600);
  setInterval(refreshUsage, 45000);
})();
