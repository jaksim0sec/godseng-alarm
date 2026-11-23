#!/usr/bin/env node
/* Real feature-layer logic under a small DOM facade: identity, FLIP, undo,
 * Free Day and infinite repeat. Android integration is separately audited. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('app/src/main/assets/features.js','utf8');
const nodes=new Map();let made=0,animated=0,css='';
const cssClass=()=>{const all=new Set();return{
  add(x){all.add(x)},remove(x){all.delete(x)},contains(x){return all.has(x)},
  toggle(x,force){const value=force===undefined?!all.has(x):!!force;
    value?all.add(x):all.delete(x);return value}
}};
function el(id){
  if(nodes.has(id))return nodes.get(id);
  const obj={
    id,children:[],dataset:{},style:{},classList:cssClass(),nodeType:1,childNodes:[],
    addEventListener(){},setAttribute(){},click(){this.onclick?.()},
    querySelector(q){this.parts??={};return this.parts[q]??=el(this.id+'/'+q)},
    querySelectorAll(){return []},
    appendChild(n){this.children.push(n);n.parentElement=this;n.isConnected=true},
    insertBefore(n,target){
      if(n.parentElement){const arr=n.parentElement.children,old=arr.indexOf(n);
        if(old>=0)arr.splice(old,1)}
      const at=target?this.children.indexOf(target):-1;
      this.children.splice(at<0?this.children.length:at,0,n);
      n.parentElement=this;n.isConnected=true;
    },
    remove(){if(this.parentElement){const arr=this.parentElement.children;
      const i=arr.indexOf(this);if(i>=0)arr.splice(i,1)}
      this.parentElement=null;this.isConnected=false;
    },
    getBoundingClientRect(){const i=this.parentElement?.children.indexOf(this)??-1;
      return {width:i<0?0:150,height:150,left:20+(i%2)*160,top:80+Math.floor(i/2)*180}},
    animate(){animated++;return {onfinish:null,oncancel:null}},
    cloneNode(){return el(this.id+'-ghost')}
  };
  Object.defineProperty(obj,'innerHTML',{
    get(){return this._html||''},
    set(value){this._html=value;
      const match=/class="card native-persist-card" data-id="([^"]+)"/.exec(value);
      if(match){const item=el('card-'+match[1]);item.dataset.id=match[1];
        item.isConnected=false;this.firstElementChild=item;made++}
    }
  });
  nodes.set(id,obj);return obj;
}
const grid=el('grid'),home=el('s-home'),active=el('tab-on'),inactive=el('tab-off');
active.firstChild={textContent:'감시중 '};
inactive.firstChild={textContent:'비활 '};
home.querySelector=q=>q.includes('data-f')?(q.includes('"on"')?active:inactive):
  q==='.nbtns'?el('nav-right'):q==='.filt'?el('filter'):null;
el('filter').parentElement=el('hbody');
el('s-add-stage').querySelector=()=>el('vibrow');
el('vibrow').parentElement=el('stage-scroll');
const document={
  body:el('body'),head:{appendChild(node){css+=node.textContent}},
  getElementById:el,createElement:()=>el('temporary-'+Math.random()),
  querySelectorAll:()=>[]
};
const S={sel:new Set(),cfg:{},methods:new Set(),on:{a:true,b:true},
  removed:new Set(),pin:new Set(),stageByApp:{},filter:'on',freeDayDate:null};
let saved=0,changed=0;
const Android={freeDayChanged(){changed++}};
const NativeApp={persistState(){saved++},observeIcons(){}};
const window={Android,NativeApp};
const prelude=[
  'let T=null,warnSandbox=false;',
  'function renderHome(){}',
  'function setOn(){}',
  'function go(){}',
  'function toast(message){return message}',
  'function startFlow(id,edit){T={id,edit,order:[0,1],repeat:false,methods:new Set()}}',
  'function renderStages(hint){window.hinted=hint}',
  'function ignored(id){S.stageByApp[id]=Math.min(1,(S.stageByApp[id]||0)+1)}',
  'function cfgOf(id){return S.cfg[id]||{order:[0,1],repeat:false}}',
  'function openDetail(id){return id}',
  'function openSheet(id){return id}',
  "document.getElementById('as-apply').onclick=()=>{S.cfg[T.id]={order:[...T.order]}};"
].join('\n');
const actions=[
  'return {',
  'render:()=>renderHome(),',
  'set:(id,v)=>setOn(id,v),',
  'start:id=>startFlow(id,true),',
  'repeat:()=>document.getElementById("native-repeat").onclick(),',
  'apply:()=>document.getElementById("as-apply").onclick(),',
  'ignored:id=>ignored(id),',
  'stage:()=>renderStages(true),',
  'getT:()=>T,',
  'undo:()=>document.getElementById("app").children[0].querySelector("button").onclick()',
  '}'
].join('\n');
const factory=new Function('window','document','Android','NativeApp','S','APPS',
  'PIN','KEB','tile','useTxt','updMeta','requestAnimationFrame','setTimeout',
  'clearTimeout','setInterval','cur','dId','fmt',prelude+'\n'+source+'\n'+actions);
const app=[{id:'a',name:'App A',mins:30,p:'<rect/>'},
  {id:'b',name:'App B',mins:20,p:'<rect/>'}];
const feature=factory(window,document,Android,NativeApp,S,app,
  '<svg/>','<svg/>',()=>'<svg/>',()=> 'today',()=>{},cb=>cb(),
  ()=>0,()=>0,()=>0,'s-home',null,v=>v);
assert.equal(active.firstChild.textContent,'활성 ');
assert.equal(inactive.firstChild.textContent,'비활성 ');
assert.match(css,/height:88px/);assert.match(css,/font-size:33px/);
feature.render();
const original=[...grid.children];assert.equal(original.length,2);
feature.set('a',false);
assert.equal(grid.children[0],original[1],'remaining card DOM object is retained');
assert.ok(animated>0,'grid reflow animates existing nodes');
assert.ok(el('app').children[0].classList.contains('on'),'undo visible');
feature.undo();
assert.equal(S.on.a,true,'undo re-enables app');
assert.ok(grid.children.some(c=>c===original[0]),'undo reuses original card DOM');
window.NativeApp.toggleFreeDay();
assert.ok(S.freeDayDate,'Free Day saves date');
assert.equal(saved,1);assert.equal(changed,1);
assert.equal(S.on.a,true);assert.equal(S.on.b,true);
window.NativeApp.toggleFreeDay();
assert.equal(S.freeDayDate,null);assert.equal(changed,2);
feature.start('a');feature.repeat();
assert.equal(feature.getT().repeat,true);
feature.apply();
assert.equal(S.cfg.a.repeat,true);
feature.stage();assert.equal(window.hinted,true);
feature.ignored('a');feature.ignored('a');
assert.equal(S.stageByApp.a,0,'infinite repeat wraps to first warning');
S.filter='off';feature.render();assert.equal(grid.children.length,0);
S.filter='on';feature.render();
assert.deepEqual(grid.children,original,'filter change reuses original nodes');
console.log('PASS feature behavior: home identity, FLIP, undo, free day, repeat, swipe flow');
