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
    '.fi .tile svg:has(.native-installed-icon),.ag .tile svg:has(.native-installed-icon),.dhead .tile svg:has(.native-installed-icon),.add-item .tile svg:has(.native-installed-icon){width:100%!important;height:100%!important;stroke:none!important}',
    '.card .tile svg:has(.native-installed-icon){width:36px!important;height:36px!important;stroke:none!important}',
    '.achip .tile svg:has(.native-installed-icon){width:18px!important;height:18px!important;stroke:none!important}',
    '.rk>svg:has(.native-installed-icon){stroke:none!important}',
    '#dots{overflow-x:auto;scrollbar-width:none;justify-content:flex-start;padding:0 12px}',
    '#dots::-webkit-scrollbar{display:none}',
    '#dots i{flex:none}',
    '#perm .pi{cursor:pointer}'
  ].join('');
  document.head.appendChild(css);

  // Lightweight asynchronous catalog: names first, icons only when requested.
  let catalogReady = false;
  let catalogPending = false;
  let carouselReady = false;
  let managedApps = new Set(); // Explicitly added by the user, never all installed apps.
  const requestedIcons = new Set();

  const fallbackIcon = '<rect x="4" y="4" width="16" height="16" rx="5"/>';
  function requestCatalog() {
    if (catalogPending) return;
    catalogPending = true;
    Android.requestInstalledApps();
  }
  function buildCarousel() {
    if (!catalogReady || carouselReady) return;
    flow.innerHTML = APPS.map(a => '<button type="button" class="fi" data-id="' +
      a.id + '" aria-label="' + a.name + ' 선택" aria-pressed="false">' +
      tile(a) + '<span class="badge">' + ic(CHECK) +
      '</span><span class="fl">' + a.name + '</span></button>').join('');
    fis.splice(0, fis.length, ...flow.children);
    dots.innerHTML = APPS.map(() => '<i></i>').join('');
    centerIdx = 0;
    flow.scrollLeft = 0;
    carouselReady = true;
    updCount();
    requestAnimationFrame(() => { updFlow(); watchIcons(); });
  }

  function receiveCatalog(payload) {
    catalogPending = false;
    try {
      const raw = JSON.parse(payload);
      if (!Array.isArray(raw) || !raw.length) throw Error('Empty installed-app catalog');
      const entries = raw.filter(a => typeof a.id === 'string' &&
        /^[A-Za-z0-9_.]+$/.test(a.id) && typeof a.name === 'string' && a.name.length)
        .map(a => ({id:a.id, name:html(a.name), mins:0, p:fallbackIcon}));
      if (!entries.length) throw Error('No eligible installed apps');
      APPS.splice(0, APPS.length, ...entries);
      S.sel = new Set([...S.sel].filter(id => entries.some(a => a.id === id)));
      // Unconfigured apps must not appear as pre-made "inactive" home cards.
      // S.removed is already honored by the ORIGINAL home and add-app UI.
      for (const app of APPS) {
        if (!managedApps.has(app.id)) S.removed.add(app.id);
      }
      catalogReady = true;
      if (cur === 's-home') {
        renderHome();
        refreshUsage();
      } else if (cur === 's-pick') {
        carouselReady = false;
        buildCarousel();
      } else if (cur === 's-perm') {
        syncPermissions();
      }
    } catch (error) {
      console.error('Installed-app catalog unavailable', error);
      if (cur === 's-perm') toast('설치된 앱 목록을 불러오지 못했어요');
    }
  }

  function requestIcon(id) {
    const app = APPS.find(a => a.id === id);
    if (!app || requestedIcons.has(id) || app.p !== fallbackIcon) return;
    requestedIcons.add(id);
    Android.requestAppIcon(id);
  }
  function receiveAppIcon(id, uri) {
    const app = APPS.find(a => a.id === id);
    if (!app) return;
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(uri)) {
      requestedIcons.delete(id);
      return;
    }
    app.p = '<image class="native-installed-icon" href="' + uri +
      '" x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>';
    // Replace only image children; never rebuild a card, button or screen.
    document.querySelectorAll('[data-id]').forEach(element => {
      if (element.dataset.id !== id) return;
      element.querySelectorAll('.tile svg.i').forEach(svg => { svg.innerHTML = app.p; });
    });
    if (cur === 's-detail' && typeof dId !== 'undefined' && dId === id) {
      document.querySelectorAll('#dbody .tile svg.i').forEach(svg => { svg.innerHTML = app.p; });
    }
    if (typeof T !== 'undefined' && T && T.id === id) {
      document.querySelectorAll('#at-chip .tile svg.i,#as-chip .tile svg.i')
        .forEach(svg => { svg.innerHTML = app.p; });
    }
  }
  const iconObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        iconObserver.unobserve(entry.target);
        requestIcon(entry.target.dataset.id);
      }
    });
  }, {rootMargin:'100px'});
  function watchIcons() {
    iconObserver.disconnect();
    const screen = document.getElementById(cur);
    if (!catalogReady || !screen) return;
    screen.querySelectorAll('.fi[data-id],.ag[data-id],.card[data-id]')
      .forEach(element => iconObserver.observe(element));
    if (cur === 's-detail' && typeof dId !== 'undefined' && dId) requestIcon(dId);
  }
  // Preserve original handlers; only attach visibility tracking after screen changes.
  const originalGo = go;
  go = function(...args) {
    const value = originalGo(...args);
    requestAnimationFrame(watchIcons);
    return value;
  };
  const originalRenderHome = renderHome;
  renderHome = function(...args) {
    const value = originalRenderHome(...args);
    if (cur === 's-home') requestAnimationFrame(watchIcons);
    return value;
  };
  let wasInitialized = false;
  let saved = {};
  try {
    const raw = Android.loadState();
    if (raw) saved = JSON.parse(raw);
    wasInitialized = !!saved.initialized;
  } catch (error) { console.error('Could not load state', error); }

  managedApps = toSet(saved.managedApps || saved.sel);
  // Migration: old saves had no explicit "added apps" list.
  if (!Array.isArray(saved.managedApps)) {
    Object.entries(saved.on || {}).forEach(([id,on]) => { if (on) managedApps.add(id); });
  }
  if (wasInitialized) {
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
      // Wait for the real catalog before rendering home, never flash demo entries.
      renderAlertConfig();
    } catch (error) { console.error('Could not restore state', error); }
  }

  function snapshot() {
    return JSON.stringify({
      version:3, initialized:wasInitialized || Object.values(S.on).some(Boolean),
      managedApps:[...managedApps],
      sel:[...S.sel], methods:[...S.methods],
      method:S.method, after:S.after, range:S.range,
      baseStage:S.baseStage, escalate:S.escalate,
      feedback:[...S.feedback], message:S.message,
      on:S.on, removed:[...S.removed].filter(id => managedApps.has(id)), pin:[...S.pin],
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
    if (!catalogReady) { requestCatalog(); return; }
    if (!wasInitialized) buildCarousel();
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
      behavior:'auto'
    });
  }), {passive:true});

  // Never enumerate and encode all installed icons on every Add button press.
  byId('b-add').addEventListener('click', event => {
    if (catalogReady) return;
    event.stopImmediatePropagation();
    requestCatalog();
    toast('설치된 앱을 불러오는 중이에요');
  }, {capture:true});

  // New installs remain available only in the add-app picker, not on Home.
  byId('b-final').addEventListener('click', () => {
    managedApps = new Set(S.sel);
    S.removed = new Set(APPS.filter(a => !managedApps.has(a.id)).map(a => a.id));
  }, {capture:true});
  byId('as-apply').addEventListener('click', () => {
    if (typeof T !== 'undefined' && T) managedApps.add(T.id);
  }, {capture:true});

  function refreshUsage() {
    if (!catalogReady) return;
    try {
      const usage = JSON.parse(Android.usageJson());
      if (!usage || !Object.keys(usage).length) return;
      let changed = false;
      APPS.forEach(a => {
        const next = Number.isFinite(usage[a.id]) ? usage[a.id] : 0;
        if (a.mins !== next) { a.mins = next; changed = true; }
      });
      if (changed && cur === 's-home') renderHome();
    } catch (error) { console.warn('Usage refresh failed', error); }
  }

  window.NativeApp = {
    refreshUsage, syncPermissions, refreshInstalledApps:requestCatalog,
    receiveCatalog, receiveAppIcon
  };
  requestCatalog();
  setTimeout(refreshUsage, 1200);
  setInterval(refreshUsage, 45000);
})();
