/* Compressed, unchanged Law XML sections from the e-Gov API. */
(function(){
 'use strict';
 const snapshot='2026-11-12T07:18:19Z';
 const ids=Object.freeze([
  '321CONSTITUTION','129AC0000000089','140AC0000000045',
  '132AC0000000048','408AC0000000109','323AC0000000131',
  '405AC0000000088','426AC0000000068','337AC0000000139',
  '322AC0000000125','322AC0000000067','326AC1000000004',
  '417AC0000000086','415AC0000000057','411AC0000000042'
 ]);
 const dir=new URL('laws/',document.currentScript.src);
 const payloads=new Map(),requests=new Map();
 const has=id=>ids.includes(id);
 function load(id){
  if(!has(id)&&id!=='index')return Promise.reject(new Error('収録対象外の法令です。'));
  if(requests.has(id))return requests.get(id);
  const promise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=new URL(id+'.js?v=20261112-r2',dir);
   script.onload=()=>{
    script.remove();
    const payload=payloads.get(id);payloads.delete(id);
    if(payload)resolve(payload);
    else reject(new Error('収録データを開けませんでした。'));
   };
   script.onerror=()=>{script.remove();reject(new Error('ZIPを展開したときのlawsフォルダーの配置を確認してください。'));};
   document.head.appendChild(script);
  }).then(encoded=>window.pako.inflate(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),{to:'string'}))
    .finally(()=>requests.delete(id));
  requests.set(id,promise);
  return promise;
 }
 window.GYOSHI_EDITION=Object.freeze({
  snapshot,ids,has,register(id,payload){payloads.set(id,payload);},
  loadLaw:load,
  async loadIndex(){return JSON.parse(await load('index')).map(([id,name,no])=>({id,name,no}));}
 });
})();
