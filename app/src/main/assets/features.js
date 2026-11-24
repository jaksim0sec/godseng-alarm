/*
 * Feature layer, loaded after the unmodified HTML and native-adapter.js.
 * Keep source page markup, its stage swipe gesture, and all original CSS keyframes.
 */
(() => {
  if (!window.Android || window.__godsengFeatures) return;
  window.__godsengFeatures = true;
  const get = id => document.getElementById(id);
  const grid = get('grid');
  const home = get('s-home');
  const style = document.createElement('style');
  style.textContent = [
    '#s-home .nav{height:88px}',
    '#s-home .nav h2{font-size:33px}',
    '#s-home .nb{width:46px;height:46px;min-width:46px}',
    '#s-home .nb svg.i{width:34px;height:34px}',
    '#s-home .nbtns{gap:12px;margin-right:0;align-items:center}',
    '#s-home .native-free-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:42px;padding:0 12px;border-radius:999px;background:var(--g1);color:var(--fg);font-size:13px;font-weight:700;white-space:nowrap}',
    '#s-home .native-free-btn svg{width:16px;height:16px;stroke-width:2;flex:none}',
    '#s-home .native-free-btn[aria-pressed="true"]{background:var(--fg);color:#000}',
    '#s-home .native-free-banner{display:none;margin:0 2px 14px;background:var(--g1);padding:14px;border-radius:17px;font-size:13px;color:var(--fg)}',
    '#s-home.native-free-day .native-free-banner{display:block}',
    '#s-home.native-free-day .card{opacity:.65}',
    '#s-home .card.native-persist-card{animation:none}',
    '.native-undo{position:absolute;left:18px;right:18px;bottom:calc(94px + env(safe-area-inset-bottom,0px));z-index:50;background:var(--fg);color:#000;border-radius:18px;display:flex;align-items:center;justify-content:space-between;padding:9px 10px 9px 17px;min-height:54px;box-shadow:0 12px 30px #0008;opacity:0;transform:translateY(20px);pointer-events:none;transition:opacity .23s,transform .3s}',
    '.native-undo.on{opacity:1;transform:none;pointer-events:auto}',
    '.native-undo span{font-size:14px;font-weight:700}',
    '.native-undo button{height:38px;padding:0 14px;border-radius:999px;background:#111;color:white;font-weight:700;font-size:14px}',
    '.native-repeat-btn{display:flex;width:100%;align-items:center;gap:14px;border-radius:18px;background:var(--g1);color:var(--fg);text-align:left;padding:13px 18px;margin:10px 0 16px}',
    '.native-repeat-mark{width:38px;height:38px;flex:none;display:grid;place-items:center;background:var(--g2);border-radius:50%;font-size:26px;font-weight:700}',
    '.native-repeat-info{flex:1;font-weight:700;font-size:15px}',
    '.native-repeat-info small{display:block;margin-top:4px;font-weight:400;color:var(--g4);font-size:12px}',
    '.native-repeat-check{display:grid;place-items:center;border:2px solid var(--g3);width:24px;height:24px;border-radius:8px;font-size:15px;font-weight:800}',
    '.native-repeat-btn[aria-pressed="true"] .native-repeat-mark{background:var(--fg);color:#000}',
    '.native-repeat-btn[aria-pressed="true"] .native-repeat-check{background:var(--fg);border-color:var(--fg);color:#000}',
    '@media(prefers-reduced-motion:reduce){.native-undo,.native-repeat-btn{transition:none!important}}'
  ].join('');
  document.head.appendChild(style);

  // Preserve status text nodes and native counts, including on the detail screen.
  for (const [which,label] of [['on','활성'],['off','비활성']]) {
    const button = home.querySelector('.fp[data-f="' + which + '"]');
    if (button && button.firstChild) button.firstChild.textContent = label + ' ';
  }
  const originalToast = toast;
  toast = function(message) {
    return originalToast(String(message)
      .replace('다시 감시해요','활성화했어요')
      .replace('비활했어요','비활성화했어요'));
  };

  // Home reconciliation: existing card nodes survive toggles, moves and filter changes.
  // FLIP animations shift remaining cells up instead of re-running the entrance animation.
  const cachedCards = new Map();
  for (const c of grid.children) if (c.dataset && c.dataset.id) cachedCards.set(c.dataset.id,c);
  const pinIcon = PIN;
  const menuIcon = KEB;
  function newCard(a) {
    const shell = document.createElement('div');
    shell.innerHTML = '<div class="card native-persist-card" data-id="' + a.id + '">' +
      '<div class="top">' + tile(a) + '<span class="tr"><button class="keb" aria-label="더보기">' + menuIcon + '</button></span></div>' +
      '<div class="nm">' + a.name + '</div><div class="use"></div>' +
      '<div class="foot"><button class="switch csw" role="switch" aria-label="' + a.name + ' 감시"><i></i></button></div></div>';
    return shell.firstElementChild;
  }
  function updateCard(card,a) {
    const active = !!S.on[a.id];
    card.classList.add('native-persist-card');
    card.classList.toggle('off',!active);
    const sw = card.querySelector('.csw');
    if (sw) { sw.classList.toggle('on',active); sw.setAttribute('aria-checked',String(active)); }
    const usage = card.querySelector('.use');
    if (usage) usage.textContent = useTxt(a);
    const name = card.querySelector('.nm');
    if (name && name.textContent !== a.name) name.textContent = a.name;
    const trail = card.querySelector('.tr');
    if (trail) {
      let pin = trail.querySelector('.pinb');
      const pinned = S.pin.has(a.id);
      if (pinned && !pin) {
        pin = document.createElement('span');pin.className = 'pinb';
        pin.innerHTML=pinIcon;trail.insertBefore(pin,trail.firstChild);
      } else if (!pinned && pin) pin.remove();
    }
    card.style.opacity = '';
    card.style.transform = '';
  }
  function exitGhost(card,rect) {
    if (!rect || !rect.width || cur !== 's-home') return;
    const ghost = card.cloneNode(true);
    Object.assign(ghost.style,{
      position:'fixed',left:rect.left+'px',top:rect.top+'px',
      width:rect.width+'px',height:rect.height+'px',
      zIndex:'30',pointerEvents:'none',animation:'none',margin:'0'
    });
    document.body.appendChild(ghost);
    if (ghost.animate) {
      const anim=ghost.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.9)'}],
        {duration:280,easing:'ease-out',fill:'forwards'});
      anim.onfinish=()=>ghost.remove();
      anim.oncancel=()=>ghost.remove();
    } else ghost.remove();
  }
  function reconcileHome() {
    const want = S.filter === 'on';
    const list = APPS.filter(a => !S.removed.has(a.id) && !!S.on[a.id] === want)
      .sort((a,b)=>(Number(S.pin.has(b.id))-Number(S.pin.has(a.id))) || b.mins-a.mins);
    const previous = [...grid.children];
    const prior = new Map();
    for (const card of previous) {
      if (card.dataset && card.dataset.id) {
        cachedCards.set(card.dataset.id,card);
        prior.set(card.dataset.id,card.getBoundingClientRect());
      }
    }
    const desired = new Set(list.map(a=>a.id));
    for (const card of previous) {
      if (!desired.has(card.dataset.id)) exitGhost(card,prior.get(card.dataset.id));
    }
    list.forEach((a,i)=>{
      let card=cachedCards.get(a.id);
      if (!card) {card=newCard(a);cachedCards.set(a.id,card);}
      updateCard(card,a);
      const current=grid.children[i];
      if (current!==card) grid.insertBefore(card,current||null);
    });
    for (const card of [...grid.children]) {
      if (!desired.has(card.dataset.id)) card.remove();
    }
    if (cur==='s-home') {
      requestAnimationFrame(()=>{
        list.forEach(a=>{
          const card=cachedCards.get(a.id);
          if (!card || !card.isConnected || !card.animate) return;
          const last=card.getBoundingClientRect(),first=prior.get(a.id);
          if (first && first.width && last.width) {
            const dx=first.left-last.left,dy=first.top-last.top;
            if (Math.abs(dx)+Math.abs(dy)>1) {
              card.animate([{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'translate(0,0)'}],
                {duration:370,easing:'cubic-bezier(.22,1,.36,1)'});
            }
          } else {
            card.animate([{opacity:0,transform:'scale(.95)'},{opacity:1,transform:'scale(1)'}],
              {duration:270,easing:'ease-out'});
          }
        });
        if (window.NativeApp && NativeApp.observeIcons) NativeApp.observeIcons();
      });
    }
    updMeta();
    paintFreeDay();
  }
  renderHome = reconcileHome;

  // Undo lives independently of the original toast and keeps a five-second window.
  const undo = document.createElement('div');
  undo.className='native-undo';
  undo.innerHTML='<span>비활성화했어요</span><button type="button">되돌리기</button>';
  get('app').appendChild(undo);
  let lastDisabledId=null, undoTimer=0;
  function closeUndo(){clearTimeout(undoTimer);lastDisabledId=null;undo.classList.remove('on');}
  function showUndo(id) {
    lastDisabledId=id;undo.classList.add('on');
    clearTimeout(undoTimer);undoTimer=setTimeout(closeUndo,5000);
  }
  undo.querySelector('button').onclick=()=>{
    const id=lastDisabledId;
    closeUndo();
    if (!id) return;
    setOn(id, true);
    if (cur==='s-detail' && dId===id) openDetail(id);
    toast('다시 활성화했어요');
  };
  setOn = function(id,active) {
    const previous=!!S.on[id];
    S.on[id]=active;
    if (!active) delete S.stageByApp[id];
    reconcileHome();
    // Persist before asking Android to stop/start, even if the app is backgrounded immediately.
    if (window.NativeApp && NativeApp.applyMonitoringChange) NativeApp.applyMonitoringChange();
    if (previous && !active) showUndo(id);
    else if (lastDisabledId===id) closeUndo();
  };

  // Free Day is a local calendar-day suspension, not an edit to each app's switch.
  function todayKey(date=new Date()) {
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+
      '-'+String(date.getDate()).padStart(2,'0');
  }
  function isFreeDay() {return S.freeDayDate === todayKey();}
  const freeBtn=document.createElement('button');
  freeBtn.className='native-free-btn';
  freeBtn.type='button';
  freeBtn.setAttribute('aria-label','프리데이, 오늘 하루 모든 앱 감시 일시 중단');
  freeBtn.innerHTML='<svg class="i" viewBox="0 0 24 24"><path d="M6 5v14M11 5v14M17 12h4M19 10v4"/></svg><span>프리데이</span>';
  home.querySelector('.nbtns').appendChild(freeBtn);
  const banner=document.createElement('div');
  banner.className='native-free-banner';
  banner.textContent='프리데이 · 오늘은 감시를 쉬어요. 내일 자동으로 다시 시작해요.';
  const filters=home.querySelector('.filt');
  filters.parentElement.insertBefore(banner,filters.nextSibling);
  function paintFreeDay(){
    const active=isFreeDay();
    home.classList.toggle('native-free-day',active);
    freeBtn.setAttribute('aria-pressed',String(active));
    const label=freeBtn.querySelector('span');
    if (label) label.textContent=active?'프리데이 ON':'프리데이';
  }
  function syncFreeDay(){paintFreeDay();}
  freeBtn.onclick=()=>{
    S.freeDayDate=isFreeDay()?null:todayKey();
    paintFreeDay();
    if (window.NativeApp && NativeApp.persistState) NativeApp.persistState();
    if (Android.freeDayChanged) Android.freeDayChanged();
    if (cur==='s-detail' && dId) openDetail(dId);
    toast(isFreeDay()?'오늘 하루 감시를 쉬어요':'프리데이를 종료했어요');
  };
  paintFreeDay();
  // One timer near local midnight instead of a perpetual once-per-minute wakeup.
  function scheduleNextMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    setTimeout(() => { syncFreeDay(); scheduleNextMidnight(); },
      Math.max(1000, next.getTime() - now.getTime() + 250));
  }
  scheduleNextMidnight();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncFreeDay();
  });

  // All original stage-order, nudge, left-swipe removal, drag and tap-to-restore
  // interactions remain owned by the original HTML. We only add a sibling switch.
  const repeatBtn=document.createElement('button');
  repeatBtn.type='button';repeatBtn.className='native-repeat-btn';repeatBtn.id='native-repeat';
  repeatBtn.innerHTML='<span class="native-repeat-mark">∞</span>'+
    '<span class="native-repeat-info">행동 반복<small>마지막 경고 다음에 처음부터 반복</small></span>'+
    '<span class="native-repeat-check"></span>';
  const vibRow=get('s-add-stage').querySelector('.vibrow');
  vibRow.parentElement.insertBefore(repeatBtn,vibRow.nextSibling);
  function syncRepeat(){
    const active=!!(typeof T!=='undefined' && T && T.repeat);
    repeatBtn.setAttribute('aria-pressed',String(active));
    repeatBtn.querySelector('.native-repeat-check').textContent=active?'✓':'';
  }
  repeatBtn.onclick=()=>{if(typeof T==='undefined'||!T)return;T.repeat=!T.repeat;syncRepeat();};
  const sourceStartFlow=startFlow;
  startFlow=function(id,edit){
    const result=sourceStartFlow(id,edit);
    if (T) T.repeat=!!(S.cfg[id] && S.cfg[id].repeat);
    syncRepeat();
    return result;
  };
  const sourceRenderStages=renderStages;
  renderStages=function(hint){
    const result=sourceRenderStages(hint); // nudge + pointer-swipe behavior unchanged
    syncRepeat();
    return result;
  };
  const sourceApply=get('as-apply').onclick;
  get('as-apply').onclick=function(event){
    const id=T && T.id,repeat=!!(T && T.repeat);
    const result=sourceApply.call(this,event);
    if (id && S.cfg[id]) S.cfg[id].repeat=repeat;
    return result;
  };
  const sourceIgnored=ignored;
  ignored=function(id) {
    const c=cfgOf(id),before=S.stageByApp[id]??0;
    const repeat=!!c.repeat && c.order.length>0 && !warnSandbox;
    const result=sourceIgnored(id);
    if (repeat) {
      const next=(before+1)%c.order.length;
      S.stageByApp[id]=next;
      if(cur==='s-detail' && dId===id)
        document.querySelectorAll('#dbody .cn').forEach((e,j)=>e.classList.toggle('now',j===next));
    }
    return result;
  };

  // Status vocabulary on details and bottom sheet, without touching source markup.
  const sourceDetail=openDetail;
  openDetail=function(id){
    const result=sourceDetail(id);
    const badge=get('dbody').querySelector('.dhead .st');
    if (badge) {
      const label=(isFreeDay()&&S.on[id])?'일시 중단':S.on[id]?'활성':'비활성';
      const text=[...badge.childNodes].find(n=>n.nodeType===3);
      if (text) text.textContent=label;
    }
    const toggle=get('b-dtog');
    if(toggle)toggle.textContent=S.on[id]?'비활성화':'다시 활성화';
    return result;
  };
  const sourceSheet=openSheet;
  openSheet=function(id){
    const result=sourceSheet(id);
    if (S.on[id]) get('sh-s').textContent=isFreeDay()?'오늘은 일시 중단 중이에요.':'활성 상태예요. 오늘 '+fmt(APPS.find(a=>a.id===id).mins)+' 사용했어요.';
    return result;
  };
  window.NativeApp = Object.assign(window.NativeApp||{}, {
    syncFreeDay,
    getFreeDayDate:()=>S.freeDayDate,
    toggleFreeDay:()=>freeBtn.click()
  });
})();
