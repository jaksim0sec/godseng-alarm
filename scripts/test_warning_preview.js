#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warning-preview.js','utf8');
const callbacks=[];
const box={addEventListener(type,listener,capture){callbacks.push({type,listener,capture})}};
const editor={value:'아직도 {앱} 사용 중?'};
const document={getElementById(id){return id==='pv'?box:id==='ed-in'?editor:null}};
const calls=[];
const Android={previewWarning(raw){calls.push(JSON.parse(raw));return true}};
const T={id:'com.example.app',methods:new Set(['after','range']),after:15,
  range:{sh:23,sm:30,eh:7,em:0},order:[1,2,3],msg:{2:'기존'},vib:false};
let stage=1;
const a={id:'com.example.app',name:'시험 앱',mins:42};
const toasts=[];
const run=new Function('window','document','Android','T','EK','DEF_MSG','appOf','toast',source);
run({Android},document,Android,T,stage,['가벼운 알림','경고 문구','경고 팝업','마지막 단계'],()=>a,text=>toasts.push(text));
assert.equal(callbacks.length,1,'one click delegate');
assert.equal(callbacks[0].type,'click');
assert.equal(callbacks[0].capture,true,'intercept before original demo playback');
function fire(isPlay){
 let prevented=false,stopped=false;
 callbacks[0].listener({
  target:{closest(selector){return isPlay&&selector==='#pv-play'?{}:null}},
  preventDefault(){prevented=true},
  stopImmediatePropagation(){stopped=true}
 });
 return {prevented,stopped};
}
let event=fire(false);
assert.deepEqual(event,{prevented:false,stopped:false},'normal editing click is untouched');
event=fire(true);
assert.deepEqual(event,{prevented:true,stopped:true},'demo handler cannot also run');
assert.equal(calls.length,1);
assert.equal(calls[0].id,'com.example.app');
assert.equal(calls[0].stage,1);
assert.equal(calls[0].minutes,42);
assert.deepEqual(calls[0].cfg.methods,['after','range']);
assert.equal(calls[0].cfg.after,15);
assert.deepEqual(calls[0].cfg.range,T.range);
assert.equal(calls[0].cfg.vib,false);
assert.equal(calls[0].cfg.msg[1],'아직도 {앱} 사용 중?');
assert.equal(calls[0].cfg.msg[2],'기존','other unsaved stage values preserved');
assert.equal(T.msg[1],undefined,'the editor draft must not mutate saved staging state');
assert.equal(toasts.length,0);

// Every original warning stage enters the same native bridge, not another UI.
const defaults=['가벼운 알림','시선 경고','경고 팝업','마지막 단계'];
for(const phase of [0,2,3]){
  const previous=callbacks.length;
  run({Android},document,Android,T,phase,defaults,()=>a,text=>toasts.push(text));
  assert.equal(callbacks.length,previous+1);
  const delegate=callbacks[callbacks.length-1].listener;
  delegate({
    target:{closest(selector){return selector==='#pv-play'?{}:null}},
    preventDefault(){},stopImmediatePropagation(){}
  });
  const last=calls[calls.length-1];
  assert.equal(last.stage,phase,'native bridge gets selected original stage');
  assert.equal(last.cfg.msg[phase],editor.value,'current draft is always used');
  assert.equal(T.msg[phase],phase===2?'기존':undefined,'no editor state mutation');
}

// When Android permission is missing, never fall back to a simulated preview.
const denialWindow={Android:{previewWarning(){return false}}};
run(denialWindow,document,denialWindow.Android,T,1,defaults,()=>a,text=>toasts.push(text));
callbacks[callbacks.length-1].listener({
  target:{closest(){return {}}},
  preventDefault(){},stopImmediatePropagation(){}
});
assert.equal(toasts[toasts.length-1],'다른 앱 위에 표시 권한을 확인해 주세요');
assert.ok(!source.includes('triggerWarning('),'no fake WebView warning replay');
assert.ok(!source.includes('sandbox:true'),'no legacy sandbox preview');
console.log('PASS real native warning preview for stages 0-3, draft isolation and permission failure');
