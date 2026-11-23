/**
 * Headless regression for the Android adapter. Uses the real injected JS,
 * no Android/WebView dependencies or copied business logic.
 */
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app/src/main/assets/native-adapter.js', 'utf8');
const elements = new Map();
function el(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id, children:[], listeners:{}, dataset:{}, style:{}, clientWidth:320,
      classList:{add(){},remove(){},contains(){return false}},
      addEventListener(type,fn){(this.listeners[type] ||= []).push(fn);},
      scrollTo(){}, querySelector(){return null}, querySelectorAll(){return []},
      set innerHTML(value){this._html=value},
      get innerHTML(){return this._html || ''}
    });
  }
  return elements.get(id);
}
const document = {
  head:{appendChild(){}}, createElement(){return {}}, getElementById:el,
  addEventListener(){},
  querySelectorAll(selector){return selector === '#perm .pi' ? [el('p1'),el('p2'),el('p3')] : []}
};
const apps = [{id:'short',name:'original demo data',mins:200,p:'<rect/>'}];
const state = {sel:new Set(),methods:new Set(),feedback:new Set(),cfg:{},on:{},
  removed:new Set(),pin:new Set(),stageByApp:{},filter:'on'};
let catalogRequests=0,iconRequests=0,savedSnapshot;
const Android = {
  loadState(){return JSON.stringify({version:2,initialized:true,
    sel:['com.example.selected'], on:{'com.example.selected':true,'com.example.unselected':false},removed:[]})},
  permissionStatusJson(){return JSON.stringify({usage:true,overlay:true,notification:true})},
  requestInstalledApps(){catalogRequests++},requestAppIcon(){iconRequests++},
  usageJson(){return '{}'},saveState(value){savedSnapshot=JSON.parse(value)},
  startMonitoring(){},requestPermissions(){}
};
const window = {Android,events:{},addEventListener(event,fn){this.events[event]=fn}};
const flow=el('flow'),dots=el('dots'),fis=[];
const callbacks=[];
const factory = new Function('window','document','Android','APPS','S','go','renderHome',
  'flow','fis','dots','updCount','updFlow','toast','ic','CHECK','tile','requestAnimationFrame',
  'setTimeout','setInterval','IntersectionObserver','cur','dId','T',
  'const renderAlertConfig=()=>{};\n'+source+'\nreturn {select(ids){S.sel=new Set(ids);'+
  'document.getElementById("b-final").listeners.click.forEach(fn=>fn());'+
  'APPS.forEach(a=>S.on[a.id]=S.sel.has(a.id))},'+
  'added(id){S.removed.delete(id);S.on[id]=true;document.getElementById("as-apply").listeners.click.forEach(fn=>fn())},'+
  'getManaged(){return [...managedApps]}}');
function Observer(){return {observe(){},unobserve(){},disconnect(){}}}
const bridge = factory(window,document,Android,apps,state,()=>{},()=>{},flow,fis,dots,
  ()=>{},()=>{},()=>{},x=>x,'check',x=>x.p,cb=>callbacks.push(cb),()=>0,()=>0,
  Observer,'s-home',null,{id:'com.example.third'});
assert.equal(catalogRequests,1,'catalog requested once on startup');
assert.equal(iconRequests,0,'no app icons encoded at startup');
window.NativeApp.receiveCatalog(JSON.stringify([
  {id:'com.example.selected',name:'Selected'},
  {id:'com.example.unselected',name:'Never added'},
  {id:'com.example.third',name:'Third'}
]));
const visible = () => apps.filter(a=>!state.removed.has(a.id)
  && !!state.on[a.id] === (state.filter === 'on')).map(a=>a.id);
assert.deepEqual(visible(),['com.example.selected']);
assert.equal(iconRequests,0,'catalog callback does not request all images');
bridge.select(['com.example.third']);
assert.deepEqual(visible(),['com.example.third'],'new initial selection is the only home card');
state.filter='off';
assert.deepEqual(visible(),[],'never-added apps do not show in disabled tab');
state.on['com.example.third']=false;
assert.deepEqual(visible(),['com.example.third'],'disabled configured apps stay in disabled tab');
state.filter='on';
window.events.pagehide();
assert.deepEqual(savedSnapshot.managedApps,['com.example.third'],'managed app membership persists');
assert.deepEqual(savedSnapshot.removed,[],'unconfigured apps are not persisted as user-removed');
assert.equal(savedSnapshot.version,3);
console.log('PASS 10 native adapter lifecycle assertions');
