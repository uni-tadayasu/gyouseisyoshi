/* 行政書士 MASTER — 六法ライブラリ。官公庁公開のe-Gov法令APIで本文を取得。
   IndexedDB: 法令本文のキャッシュ、localStorage: マーカー/メモ/設定（旧版と別キー）。
   This viewer does not assert an effective date: verify against e-Gov before relying on text. */
(function(){
'use strict';
const CATALOG=[
 ['321CONSTITUTION','日本国憲法','六法','憲法'],
 ['129AC0000000089','民法','六法','民法'],
 ['140AC0000000045','刑法','六法','刑法'],
 ['132AC0000000048','商法','六法','商法'],
 ['408AC0000000109','民事訴訟法','六法','民事訴訟'],
 ['323AC0000000131','刑事訴訟法','六法','刑事訴訟'],
 ['405AC0000000088','行政手続法','行政法令','行政手続'],
 ['426AC0000000068','行政不服審査法','行政法令','行政救済'],
 ['337AC0000000139','行政事件訴訟法','行政法令','行政救済'],
 ['322AC0000000125','国家賠償法','行政法令','国家賠償'],
 ['322AC0000000067','地方自治法','行政法令','地方自治'],
 ['326AC1000000004','行政書士法','行政法令','資格・業務'],
 ['417AC0000000086','会社法','行政法令','商法関連'],
 ['415AC0000000057','個人情報の保護に関する法律','行政法令','個人情報'],
 ['411AC0000000042','行政機関の保有する情報の公開に関する法律','行政法令','情報公開']
];
const METAKEY='gyosei_master_roppo_meta_v1';
const DBNAME='gyosei_master_lawtexts_v1';
const DBSTORE='laws';
const API='https://laws.e-gov.go.jp/api/1/lawdata/';
const LISTAPI='https://laws.e-gov.go.jp/api/1/lawlists/2';
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EL=id=>document.getElementById(id);
const NF=n=>Number(n||0).toLocaleString('ja-JP');
const COLORS=['yellow','mint','pink','blue'];
function fresh(){return {marks:[],bookmarks:[],notes:{},rate:1,voice:'',lastLaw:'321CONSTITUTION',custom:[]};}
function cleanMeta(m){
 const f=fresh();if(!m||typeof m!=='object'||Array.isArray(m))return f;
 f.marks=Array.isArray(m.marks)?m.marks.filter(x=>x&&typeof x.lawId==='string'&&typeof x.articleId==='string'&&Number.isInteger(x.block)&&Number.isInteger(x.start)&&Number.isInteger(x.end)&&x.start>=0&&x.end>x.start&&x.end-x.start<=10000&&COLORS.includes(x.color)).slice(-15000).map(x=>({id:String(x.id||'m'+Date.now()),lawId:x.lawId,articleId:x.articleId,block:x.block,start:x.start,end:x.end,color:x.color,at:Number(x.at)||Date.now(),excerpt:String(x.excerpt||'').slice(0,160),stale:x.stale===true})):[];
 f.bookmarks=Array.isArray(m.bookmarks)?[...new Set(m.bookmarks.filter(x=>typeof x==='string'&&x.length<200))].slice(0,3000):[];
 f.notes=m.notes&&typeof m.notes==='object'&&!Array.isArray(m.notes)?Object.fromEntries(Object.entries(m.notes).filter(([k,v])=>typeof k==='string'&&typeof v==='string').slice(0,3000).map(([k,v])=>[k,v.slice(0,4000)])):{};
 f.rate=[.7,.85,1,1.15,1.3,1.5].includes(Number(m.rate))?Number(m.rate):1;
 f.voice=typeof m.voice==='string'?m.voice.slice(0,300):'';
 f.lastLaw=typeof m.lastLaw==='string'?m.lastLaw:'321CONSTITUTION';
 f.custom=Array.isArray(m.custom)?m.custom.filter(x=>x&&/^[0-9A-Z]{10,22}$/.test(x.id)&&typeof x.name==='string').slice(0,100).map(x=>({id:x.id,name:x.name.slice(0,80),group:'追加法令',topic:'インポート'})):[];
 return f;
}
let meta;try{meta=cleanMeta(JSON.parse(localStorage.getItem(METAKEY)||'null'));}catch(e){meta=fresh();}
function writeMeta(){try{localStorage.setItem(METAKEY,JSON.stringify(meta));return true;}catch(e){note('メモやマーカーを端末に保存できません。容量・設定をご確認ください。','bad');return false;}}
let dbPromise;
function db(){if(!('indexedDB'in window))return Promise.reject(new Error('この環境ではIndexedDBが利用できません。'));
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open(DBNAME,1);
  req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(DBSTORE))d.createObjectStore(DBSTORE,{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error('保存用データベースの起動に失敗しました。'));
  req.onblocked=()=>reject(new Error('別のタブがデータベースを使用しています。'));
 }).catch(err=>{dbPromise=null;throw err;});return dbPromise;
}
async function storeGet(id){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(DBSTORE,'readonly');const req=tx.objectStore(DBSTORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
async function storePut(value){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(DBSTORE,'readwrite');tx.objectStore(DBSTORE).put(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
async function storeDelete(id){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(DBSTORE,'readwrite');tx.objectStore(DBSTORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
const mem=new Map();
const s={lawId:CATALOG.some(x=>x[0]===meta.lastLaw)||meta.custom.some(x=>x.id===meta.lastLaw)?meta.lastLaw:'321CONSTITUTION',group:'all',lawFilter:'',textFilter:'',articleScope:'main',onlyMarked:false,onlyBookmarked:false,page:1,pageSize:18,mobileCatalog:false,loading:false,fetchingAll:false,bulkStatus:'',loadingIndex:false,indexOpen:false,indexSearch:'',indexError:'',error:'',selection:[],selectedText:'',pendingImport:false};
let mountVersion=0,lawReqToken=0,officialIndex=null,indexLoadedAt=null;
const allLaws=()=>[...CATALOG.map(([id,name,group,topic])=>({id,name,group,topic})),...meta.custom];
const selectedInfo=()=>allLaws().find(x=>x.id===s.lawId)||{id:s.lawId,name:s.lawId,group:'追加法令',topic:''};
const bid=(law,art)=>law+'::'+art;
function note(msg,type='info'){
 const host=EL('toasts');if(host){const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=msg;host.appendChild(el);setTimeout(()=>el.remove(),4500);}
 else if(type==='bad')console.warn(msg);
}
function timeText(iso){const d=new Date(iso);return !iso||isNaN(d)?'—':d.toLocaleString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function normalizeText(str){return String(str||'').replace(/[\r\n\t ]+/g,' ').replace(/\s{2,}/g,' ').trim();}
function directChild(parent,name){return [...(parent?.children||[])].find(n=>n.localName===name)||null;}
function directChildren(parent,name){return [...(parent?.children||[])].filter(n=>n.localName===name);}
function childText(el,name){return normalizeText(directChild(el,name)?.textContent||'');}
function descendants(el,name){return [...(el?.getElementsByTagName(name)||[])];}
function blocksFromItem(item,level=0){
 const out=[];const title=childText(item,'ItemTitle')||childText(item,'Subitem1Title')||childText(item,'Subitem2Title')||childText(item,'Subitem3Title')||childText(item,'Subitem4Title')||childText(item,'Subitem5Title')||childText(item,'Subitem6Title')||childText(item,'Subitem7Title')||childText(item,'Subitem8Title')||childText(item,'Subitem9Title')||childText(item,'Subitem10Title');
 const body=[...item.children].filter(n=>/^(ItemSentence|Subitem\d+Sentence|Subitem\d+Column|ItemColumn)$/.test(n.localName)).map(n=>normalizeText(n.textContent)).filter(Boolean).join(' ');
 if(title||body)out.push({t:(title?title+'　':'')+body,indent:Math.min(level+1,5)});
 for(const c of item.children){if(/^(Subitem\d+|Item)$/.test(c.localName))out.push(...blocksFromItem(c,level+1));}
 return out;
}
function extractArticle(a,zone,index,lawTitle,heading){
 const title=childText(a,'ArticleTitle')||'第'+(a.getAttribute('Num')||index)+'条';
 const caption=childText(a,'ArticleCaption');
 const num=a.getAttribute('Num')||String(index);
 const blocks=[];
 for(const p of directChildren(a,'Paragraph')){
  const pn=childText(p,'ParagraphNum');
  const sent=[...p.children].filter(n=>['ParagraphSentence','ParagraphColumn'].includes(n.localName)).map(n=>normalizeText(n.textContent)).filter(Boolean).join(' ');
  if(sent||pn)blocks.push({t:(pn?pn+'　':'')+sent,indent:0});
  for(const c of p.children){if(c.localName==='Item')blocks.push(...blocksFromItem(c));else if(['TableStruct','FigStruct','StyleStruct','List'].includes(c.localName)){
   const t=normalizeText(c.textContent);if(t)blocks.push({t,indent:1});
  }}
 }
 if(!blocks.length){const txt=normalizeText(a.textContent);const stripped=txt.replace(caption,'').replace(title,'').trim();if(stripped)blocks.push({t:stripped,indent:0});}
 return {id:zone+'-'+num,title,caption,number:num,heading,zone,blocks,search:[title,caption,heading,...blocks.map(b=>b.t)].join(' ').toLowerCase()};
}
function findHead(a){for(let x=a.parentElement;x&&x.localName!=='MainProvision'&&x.localName!=='SupplProvision';x=x.parentElement){const names=['SubsectionTitle','SectionTitle','ChapterTitle','PartTitle','DivisionTitle'];for(const key of names){const t=childText(x,key);if(t)return t;}}return '';}
function readXml(xml,id,imported=false){
 const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('XMLの構文が正しくありません。');
 const result=doc.querySelector('DataRoot > Result > Code');if(result&&result.textContent.trim()!=='0')throw Error('e-Gov API がエラーを返しました：'+(doc.querySelector('Result > Message')?.textContent||result.textContent));
 const root=doc.querySelector('LawFullText > Law')||doc.querySelector('Law');if(!root)throw Error('e-Gov法令標準XMLの Law 要素が見つかりません。');
 const body=directChild(root,'LawBody');if(!body)throw Error('法令本文の LawBody が見つかりません。');
 const name=childText(body,'LawTitle')||selectedInfo().name;
 const lawNumber=childText(root,'LawNum');const articles=[];
 const pre=directChild(body,'Preamble');if(pre){const preText=normalizeText(pre.textContent);if(preText)articles.push({id:'preamble',title:'前文',caption:'',number:'',heading:'前文',zone:'main',blocks:[{t:preText,indent:0}],search:('前文 '+preText).toLowerCase()});}
 const main=directChild(body,'MainProvision');if(main){const nodes=descendants(main,'Article').filter(a=>!a.parentElement?.closest('Article'));nodes.forEach((a,i)=>articles.push(extractArticle(a,'main',i+1,name,findHead(a))));}
 // 付則は原始附則と各改正附則を識別するため、XML内の改正法令番号も表示する
 for(const [k,sup] of directChildren(body,'SupplProvision').entries()){
  const label=childText(sup,'SupplProvisionLabel')||'附則';const amend=sup.getAttribute('AmendLawNum');const heading=amend?label+'（'+amend+'）':label;
  const nodes=descendants(sup,'Article').filter(a=>!a.parentElement?.closest('Article'));
  nodes.forEach((a,i)=>articles.push(extractArticle(a,'suppl-'+k,i+1,name,heading)));
  if(!nodes.length){const text=normalizeText(sup.textContent);if(text)articles.push({id:'suppl-'+k+'-text',title:heading,caption:'',number:'',heading,zone:'suppl-'+k,blocks:[{t:text,indent:0}],search:(heading+' '+text).toLowerCase()});}
 }
 for(const [i,part] of [...body.children].filter(c=>/^(Appdx|AppdxTable|AppdxStyle|AppdxFig|AppdxNote|AppdxFormat|AppdxForm|AppdxList)/.test(c.localName)).entries()){
  const label=[...part.children].filter(c=>/Title$/.test(c.localName)).map(x=>normalizeText(x.textContent)).filter(Boolean).join(' ')||'別表・別記 '+(i+1);
  const text=normalizeText(part.textContent);if(text)articles.push({id:'appendix-'+i,title:label,caption:'',number:'',heading:'別表・別記',zone:'appendix',blocks:[{t:text,indent:0}],search:(label+' '+text).toLowerCase()});
 }
 // ArticleだけでなくParagraphのみの法令（条建てでない法令）も表示可能にする
 if(!articles.length&&main){let j=0;for(const node of [...main.children]){const text=normalizeText(node.textContent);if(text)articles.push({id:'section-'+j,title:'本文 '+(++j),caption:'',number:'',heading:'本則',zone:'main',blocks:[{t:text,indent:0}],search:text.toLowerCase()});}}
 if(!articles.length)throw Error('このXMLから表示できる条文を抽出できませんでした。');
 const plainChars=articles.reduce((n,a)=>n+a.blocks.reduce((t,b)=>t+b.t.length,0),0);
 if(plainChars>5000000)throw Error('本文が大きすぎるため、読み込みを中止しました。');
 return {id,name,number:lawNumber,imported,source:imported?'公式XMLの手動取込':'e-Gov法令API Version1',fetchedAt:new Date().toISOString(),count:articles.length,articles};
}
async function loadOfficialIndex(force=false){
 if(s.loadingIndex)return;s.loadingIndex=true;s.indexError='';refresh();
 try{
  if(!force){const saved=await storeGet('__official_list__').catch(()=>null);if(saved?.list?.length){officialIndex=saved.list;indexLoadedAt=saved.at;return;}}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  let r;try{r=await fetch(LISTAPI,{mode:'cors',signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timeout);}
  if(!r.ok)throw Error('HTTP '+r.status);
  const text=await r.text();if(text.length>22000000)throw Error('法令一覧データが大きすぎます。');
  const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('一覧XMLを解析できません。');
  const result=doc.querySelector('DataRoot > Result > Code');if(result&&result.textContent.trim()!=='0')throw Error('公式法令一覧APIがエラーを返しました。');
  const lawlist=[...doc.querySelectorAll('LawNameListInfo')].map(x=>({id:childText(x,'LawId'),name:childText(x,'LawName'),no:childText(x,'LawNo')})).filter(x=>/^[0-9A-Z]{10,22}$/.test(x.id)&&x.name);
  if(!lawlist.length)throw Error('法令一覧が空でした。');
  officialIndex=lawlist;indexLoadedAt=new Date().toISOString();
  await storePut({id:'__official_list__',list:lawlist,at:indexLoadedAt}).catch(()=>{});
  note(`公式法令一覧を${NF(lawlist.length)}件読み込みました。`);
 }catch(e){s.indexError='法令一覧の取得に失敗しました。通信環境・API提供状況をご確認ください：'+e.message;}
 finally{s.loadingIndex=false;refresh();}
}
function officialSearchHTML(){
 if(!s.indexOpen)return '';
 if(!officialIndex)return `<p class="rp-muted">e-Govの「憲法・法律」一覧を取得し、法令名から追加できます。初回には通信が必要です。</p><button class="rp-button rp-secondary rp-full" data-rp="load-index" ${s.loadingIndex?'disabled':''}>${s.loadingIndex?'取得中…':'↓ 公式法令一覧を読み込む'}</button>${s.indexError?`<p class="rp-index-error" role="alert">${ESC(s.indexError)}</p>`:''}`;
 const term=s.indexSearch.trim().toLowerCase(),hits=term?officialIndex.filter(x=>x.name.toLowerCase().includes(term)||x.no.toLowerCase().includes(term)):[];
 return `<label class="rp-custom-label" for="rp-index-search">法令名・法令番号で検索</label><input class="rp-input" id="rp-index-search" type="search" placeholder="例：民法、行政手続法" value="${ESC(s.indexSearch)}"><div class="rp-index-meta">${NF(officialIndex.length)}件 · 一覧取得 ${timeText(indexLoadedAt)}</div><div class="rp-index-results">${!term?'<div class="rp-mini-empty">検索したい法令名を入力してください。</div>':hits.length?hits.slice(0,22).map(x=>`<button data-rp="add-index" data-id="${x.id}" data-name="${ESC(x.name)}"><strong>${ESC(x.name)}</strong><small>${ESC(x.no)} · 本文を取得する</small></button>`).join(''):'<div class="rp-mini-empty">法令名が見つかりません。</div>'}</div>${hits.length>22?`<div class="rp-muted">${NF(hits.length)}件中、先頭22件を表示</div>`:''}<button class="rp-link" data-rp="load-index" ${s.loadingIndex?'disabled':''}>公式一覧を更新</button>${s.indexError?`<p class="rp-index-error" role="alert">${ESC(s.indexError)}</p>`:''}`;
}
async function cacheRead(id){if(mem.has(id))return mem.get(id);try{const item=await storeGet(id);if(item){mem.set(id,item);return item;}return null;}catch(e){return null;}}
function reanchor(doc){
 // 法改正で条文内の文字位置が変わった際、誤った位置へのマーカー移動を防ぐ
 let changed=false;
 for(const m of meta.marks){if(m.lawId!==doc.id)continue;
  const a=doc.articles.find(a=>a.id===m.articleId),block=a?.blocks[m.block],snippet=m.excerpt||'';
  if(block&&snippet&&block.t.slice(m.start,m.start+snippet.length)===snippet){if(m.stale){m.stale=false;changed=true;}continue;}
  if(a&&snippet&&snippet.length===m.end-m.start){
   const hits=[];for(let i=0;i<a.blocks.length;i++){const t=a.blocks[i].t;let n=t.indexOf(snippet);while(n>=0){hits.push({block:i,start:n});n=t.indexOf(snippet,n+1);}}
   if(hits.length===1){m.block=hits[0].block;m.start=hits[0].start;m.end=m.start+snippet.length;m.stale=false;changed=true;continue;}
  }
  if(!m.stale){m.stale=true;changed=true;}
 }
 if(changed){writeMeta();note('条文更新に伴い、マーカーを照合しました。位置を確認できないものはマーカー管理から確認してください。');}
}
async function cacheWrite(doc){reanchor(doc);mem.set(doc.id,doc);const custom=meta.custom.find(x=>x.id===doc.id);if(custom&&custom.name!==doc.name){custom.name=doc.name;writeMeta();}try{await storePut(doc);return true;}catch(e){note('法令データを端末に保存できませんでした。今回の閲覧中のみ保持します。','bad');return false;}}
async function ensureSelected(){const token=++lawReqToken,id=s.lawId;if(mem.has(id))return;
 const cached=await cacheRead(id);if(token!==lawReqToken)return;if(cached){refresh();}
}
async function fetchOne(id,{silent=false}={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const r=await fetch(API+encodeURIComponent(id),{method:'GET',mode:'cors',signal:controller.signal,cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  const body=await r.text();if(body.length>26000000)throw Error('本文が大きすぎます。');
  const law=readXml(body,id,false);await cacheWrite(law);return law;
 }catch(e){if(!silent)throw e;return null;}
 finally{clearTimeout(timeout);}
}
async function fetchCurrent(force=false){
 if(s.loading||s.fetchingAll)return;const id=s.lawId;if(!force&&mem.has(id))return;
 s.loading=true;s.error='';refresh();try{await fetchOne(id);s.page=1;s.textFilter='';note(selectedInfo().name+'の条文を取得しました。');}
 catch(e){s.error='公式法令データを取得できませんでした。ネット接続・API提供状況をご確認ください。e-GovからXMLを保存して「XMLを取り込む」も利用できます。詳細：'+(e.name==='AbortError'?'通信がタイムアウトしました':e.message);}
 finally{s.loading=false;refresh();}
}
async function fetchSix(){if(s.fetchingAll||s.loading)return;s.fetchingAll=true;s.bulkStatus='六法の取得を開始しています';refresh();let success=0;
 for(let i=0;i<6;i++){const [id,name]=CATALOG[i];s.bulkStatus=`六法を保存中 ${i+1}/6：${name}`;refresh();try{await fetchOne(id);success++;}catch(e){s.bulkStatus=`${name} の取得に失敗。続行します。`;refresh();}}
 s.fetchingAll=false;s.bulkStatus='';refresh();note(`六法のうち${success}/6法令を取得・保存しました。${success<6?'通信に失敗した法令は個別に再取得できます。':''}`);
}
function onSelect(id){if(!allLaws().some(x=>x.id===id))return;stopVoice();s.lawId=id;meta.lastLaw=id;writeMeta();s.page=1;s.articleScope='main';s.textFilter='';s.onlyMarked=false;s.onlyBookmarked=false;s.mobileCatalog=false;s.error='';s.selection=[];s.selectedText='';++lawReqToken;refresh();ensureSelected();}
function shownArticles(doc){if(!doc)return [];
 const search=s.textFilter.trim().toLowerCase();return doc.articles.filter(a=>{
  if(s.articleScope==='main'&&a.zone!=='main')return false;
  if(s.articleScope==='suppl'&&a.zone==='main'||s.articleScope==='suppl'&&a.zone==='appendix')return false;
  if(s.articleScope==='appendix'&&a.zone!=='appendix')return false;
  if(search&&!a.search.includes(search))return false;
  if(s.onlyMarked&&!meta.marks.some(m=>m.lawId===s.lawId&&m.articleId===a.id))return false;
  if(s.onlyBookmarked&&!meta.bookmarks.includes(bid(s.lawId,a.id)))return false;
  return true;
 });
}
function markedContent(a,i,txt){
 const marks=meta.marks.filter(m=>m.lawId===s.lawId&&m.articleId===a.id&&m.block===i&&!m.stale&&m.start<txt.length&&m.end>0);
 if(!marks.length)return ESC(txt);
 const boundaries=[0,txt.length,...marks.flatMap(m=>[Math.max(0,Math.min(txt.length,m.start)),Math.max(0,Math.min(txt.length,m.end))])].sort((x,y)=>x-y);
 let html='';for(let k=0;k<boundaries.length-1;k++){
  const l=boundaries[k],r=boundaries[k+1];if(l===r)continue;
  const active=marks.filter(m=>m.start<=l&&m.end>=r).sort((a,b)=>(b.at||0)-(a.at||0))[0];
  const chunk=ESC(txt.slice(l,r));html+=active?`<mark class="rp-mark rp-${active.color}" title="保存済みマーカー">${chunk}</mark>`:chunk;
 }
 return html;
}
function articleHTML(a){
 const marked=meta.marks.filter(m=>m.lawId===s.lawId&&m.articleId===a.id),book=meta.bookmarks.includes(bid(s.lawId,a.id));
 const noteText=meta.notes[bid(s.lawId,a.id)]||'';
 return `<article class="rp-article" id="rp-a-${ESC(a.id)}" data-article="${ESC(a.id)}"><div class="rp-article-top"><div class="rp-article-title"><div class="rp-topic">${ESC(a.heading|| (a.zone==='main'?'本則':'附則・別表'))}</div>${a.caption?`<div class="rp-caption">${ESC(a.caption)}</div>`:''}<h3>${ESC(a.title)}</h3></div><div class="rp-art-actions"><button class="rp-mini ${book?'is-active':''}" data-rp="bookmark" data-id="${ESC(a.id)}" aria-label="${book?'ブックマーク解除':'ブックマーク'}" title="条文をブックマーク">${book?'★':'☆'}</button><button class="rp-mini" data-rp="speak-article" data-id="${ESC(a.id)}" title="条文を読み上げ" aria-label="${ESC(a.title)}を読み上げ">🔊</button><button class="rp-mini" data-rp="note-toggle" data-id="${ESC(a.id)}" title="条文メモ" aria-label="${ESC(a.title)}のメモを開く">✎</button></div></div>
 <div class="rp-article-body">${a.blocks.map((b,i)=>`<p class="rp-paragraph ${b.indent?'rp-indent':''}" data-rpblock="${i}" data-artid="${ESC(a.id)}">${markedContent(a,i,b.t)}</p>`).join('')}</div>
 <div class="rp-article-foot"><span>${marked.length?`<span class="rp-foot-count">${marked.length}件のマーカー</span>`:'文章を選択してマーカー線を保存'}</span>${marked.length?`<button class="rp-link" data-rp="marks-manage" data-id="${ESC(a.id)}">マーカーを管理</button>`:''}</div>
 <div class="rp-notebox ${noteText?'has-note':''}" id="rp-note-${ESC(a.id)}" hidden><label for="rp-note-input-${ESC(a.id)}">✎ ${ESC(a.title)}の学習メモ（自動保存）</label><textarea id="rp-note-input-${ESC(a.id)}" class="rp-textarea" data-rp="note-input" data-id="${ESC(a.id)}" maxlength="4000" placeholder="判例・関連問題・覚え方を記録">${ESC(noteText)}</textarea><small>このメモは学習バックアップに含まれます。</small></div></article>`;
}
function catalogHTML(){
 const needle=s.lawFilter.trim().toLowerCase(),list=allLaws().filter(x=>(s.group==='all'||x.group===s.group)&&(!needle||(x.name+x.topic).toLowerCase().includes(needle)));
 return `<aside class="rp-catalog ${s.mobileCatalog?'rp-catalog-open':''}" aria-label="六法・法令一覧"><div class="rp-catalog-top"><div><strong>法令ライブラリ</strong><div class="rp-muted">6基本法＋重要行政法令</div></div><span class="rp-count">${allLaws().length}法令</span></div><input class="rp-input rp-catalog-search" type="search" id="rp-lawfilter" placeholder="法令名を検索" value="${ESC(s.lawFilter)}" aria-label="法令名を検索"><div class="rp-tabs" role="group" aria-label="法令グループ">${[['all','すべて'],['六法','六法'],['行政法令','行政法令'],['追加法令','追加']].map(([x,t])=>`<button class="${s.group===x?'active':''}" data-rp="group" data-val="${x}">${t}</button>`).join('')}</div><div class="rp-lawlist">${list.length?list.map(x=>`<button class="rp-lawitem ${s.lawId===x.id?'selected':''}" data-rp="select" data-id="${x.id}"><span class="rp-lawitem-body"><strong>${ESC(x.name)}</strong><small>${ESC(x.topic||x.group)}</small></span><span class="rp-cache-status ${mem.has(x.id)?'cached':''}" title="${mem.has(x.id)?'本文を保存済み':'未取得'}">${mem.has(x.id)?'保存済':'取得'}</span></button>`).join(''):'<div class="rp-mini-empty">該当する法令がありません。</div>'}</div><div class="rp-catalog-bottom"><button class="rp-button rp-secondary rp-full" data-rp="bulk" ${s.fetchingAll?'disabled':''}>${s.fetchingAll?'取得処理中…':'↓ 六法6法令をまとめて保存'}</button>${s.bulkStatus?`<p class="rp-muted" role="status">${ESC(s.bulkStatus)}</p>`:''}<button class="rp-button rp-ghost rp-full" data-rp="choose-xml">＋ e-Gov法令XMLを取り込む</button><label class="rp-custom-label" for="rp-add-id">ほかの法令を追加（e-Gov法令ID）</label><div class="rp-custom-row"><input id="rp-add-id" class="rp-input" placeholder="例：321CONSTITUTION" maxlength="22" autocapitalize="characters" aria-label="追加する法令ID"><button class="rp-button rp-secondary" data-rp="add-law">追加</button></div><div class="rp-official-panel"><button class="rp-official-toggle" data-rp="toggle-index" aria-expanded="${s.indexOpen}">⌕ e-Govの全法律から名前で探す <span>${s.indexOpen?'−':'＋'}</span></button>${officialSearchHTML()}</div><small>条文本文の初回取得にはネット接続が必要です。取得済みの法令はオフラインでも閲覧できます。</small></div></aside>`;
}
function readerHTML(){
 const doc=mem.get(s.lawId),info=selectedInfo(),available=Boolean(doc);
 const official=`https://laws.e-gov.go.jp/law/${encodeURIComponent(s.lawId)}`;
 const counts=available?shownArticles(doc):[],pages=Math.max(1,Math.ceil(counts.length/s.pageSize)),pg=Math.min(Math.max(1,s.page),pages);s.page=pg;
 const shown=counts.slice((pg-1)*s.pageSize,pg*s.pageSize);
 const markCount=meta.marks.filter(x=>x.lawId===s.lawId).length;
 return `<section class="rp-reader" aria-label="六法条文閲覧"><div class="rp-reader-head"><div><div class="rp-eyebrow">OFFICIAL LAW TEXT · e-Gov</div><h2>${ESC(doc?.name||info.name)}</h2>${doc?.number?`<p class="rp-muted">${ESC(doc.number)}</p>`:''}</div><div class="rp-source-actions"><a class="rp-button rp-ghost" href="${official}" target="_blank" rel="noopener noreferrer">公式原文 ↗</a><button class="rp-button rp-secondary" data-rp="fetch" ${s.loading||s.fetchingAll?'disabled':''}>${s.loading?'取得中…':available?'↻ 最新データを取得':'↓ 条文を取得'}</button></div></div>
 <div class="rp-statusrow"><span class="rp-status-pill ${available?'ready':''}">${available?'✓ 本文保存済み':'本文未取得'}</span>${available?`<span>${NF(doc.count)}件の表示項目</span><span>取得：${timeText(doc.fetchedAt)}</span>`:'<span>未取得の法令は本文を表示しません</span>'}<span>${markCount}マーカー</span></div>
 ${s.error?`<div class="rp-alert error" role="alert">${ESC(s.error)}<div class="rp-actions"><button class="rp-button rp-secondary" data-rp="choose-xml">XMLを取り込む</button><a href="${official}" target="_blank" rel="noopener noreferrer">e-Gov原文を開く ↗</a></div></div>`:''}
 ${!available?`<div class="rp-blank"><div class="rp-blank-icon">六</div><h3>${ESC(info.name)}の条文を読み込む</h3><p>公式e-Gov法令APIから現在提供されている法令本文を取得し、この端末に保存します。保存後はオフラインでも閲覧・検索・読み上げ・マーカーの利用ができます。</p><div class="rp-actions center"><button class="rp-button rp-primary" data-rp="fetch" ${s.loading||s.fetchingAll?'disabled':''}>${s.loading?'読み込み中…':'公式条文を取得して保存'}</button><button class="rp-button rp-secondary" data-rp="choose-xml">保存したXMLを取り込む</button></div><div class="rp-mini-note">※ このアプリに法令全文が初期同梱されているわけではありません。ネット接続による取得が必要です。内容は取得日時点のデータで、適用する施行日や最新の改正状況を自動検証しません。</div></div>`:
 `<div class="rp-readtools"><div class="rp-field"><label for="rp-textsearch">本文を検索</label><input class="rp-input" type="search" id="rp-textsearch" value="${ESC(s.textFilter)}" placeholder="例：取消し、第三条、債権"></div><div class="rp-field rp-scope"><label for="rp-scope">表示範囲</label><select class="rp-input" id="rp-scope" data-rp="scope"><option value="main" ${s.articleScope==='main'?'selected':''}>本則・前文</option><option value="suppl" ${s.articleScope==='suppl'?'selected':''}>附則</option><option value="appendix" ${s.articleScope==='appendix'?'selected':''}>別表・別記</option><option value="all" ${s.articleScope==='all'?'selected':''}>すべて</option></select></div></div>
 <div class="rp-filter-row"><button class="rp-filter ${s.onlyBookmarked?'active':''}" data-rp="only-book">★ ブックマークのみ</button><button class="rp-filter ${s.onlyMarked?'active':''}" data-rp="only-mark">◉ マーカーのみ</button><span class="rp-results">${NF(counts.length)}件該当 · ${pg}/${pages}ページ</span></div>
 <div class="rp-annotation-tools"><div class="rp-annotation-label"><strong>マーカー線</strong><span>条文の文章を指・マウスで選択 → 色を押す</span></div><div class="rp-color-row" aria-label="マーカー線の色">${[['yellow','黄'],['mint','緑'],['pink','桃'],['blue','青']].map(([c,t])=>`<button class="rp-paint rp-paint-${c}" data-rp="mark" data-color="${c}" title="選択範囲に${t}色のマーカー線" aria-label="${t}色のマーカー線"><span></span>${t}</button>`).join('')}</div><button class="rp-button rp-ghost rp-speak-selection" data-rp="speak-selection">🔊 選択文を読む</button></div>
 <div class="rp-voicebar" role="group" aria-label="日本語読み上げ"><span class="rp-voiceicon">🔊</span><label for="rp-rate">読み上げ速度</label><select class="rp-input rp-rate" id="rp-rate" data-rp="rate">${[[.7,'0.7倍'],[.85,'0.85倍'],[1,'標準'],[1.15,'1.15倍'],[1.3,'1.3倍'],[1.5,'1.5倍']].map(([n,t])=>`<option value="${n}" ${meta.rate===n?'selected':''}>${t}</option>`).join('')}</select><button class="rp-button rp-secondary" data-rp="speak-page">▶ このページを読む</button><button class="rp-button rp-ghost" data-rp="pause" id="rp-voice-pause">一時停止</button><button class="rp-button rp-ghost" data-rp="stop">■ 停止</button><span class="rp-muted rp-tts-state" id="rp-tts-state" role="status">停止中</span></div>
 <div class="rp-read-meta"><p>本文：${ESC(doc.source)}。条文は学習用に整形して表示します。公式の脚注・図表等は原文で確認してください。</p></div>
 <div class="rp-articles" id="rp-articles">${shown.length?shown.map(articleHTML).join(''):'<div class="rp-empty">一致する条文がありません。検索条件・本則／附則の切替をご確認ください。</div>'}</div>
 ${pages>1?`<nav class="rp-pagination" aria-label="条文ページ"><button class="rp-button rp-secondary" data-rp="page" data-page="${pg-1}" ${pg===1?'disabled':''}>← 前へ</button><span>${pg} / ${pages} ページ</span><button class="rp-button rp-secondary" data-rp="page" data-page="${pg+1}" ${pg===pages?'disabled':''}>次へ →</button></nav>`:''}
 <div class="rp-reader-bottom"><button class="rp-button rp-ghost" data-rp="delete-law">この法令の保存本文を削除</button><a href="${official}" target="_blank" rel="noopener noreferrer">この法令の最新状況をe-Govで確認 ↗</a></div>`}
 <input id="rp-import" type="file" accept=".xml,text/xml,application/xml" hidden>
 </section>`;
}
function renderHTML(){const cached=[...mem.keys()].length;return `<div class="rp-page"><div class="rp-page-banner"><div><div class="rp-eyebrow">LAW LIBRARY · READ / LISTEN / MARK</div><h1>六法・法令ライブラリ</h1><p>日本国憲法・民法・刑法・商法・民事訴訟法・刑事訴訟法と、行政書士試験の重要法令。条文検索、音声読み上げ、カラーのマーカー線、ブックマーク、学習メモをまとめて利用できます。</p></div><div class="rp-banner-symbol">六</div></div><div class="rp-banner-bottom"><span>六法6法令＋行政法令9法令</span><span>本文保存 ${NF(cached)}法令</span><span>マーカー ${NF(meta.marks.length)}件</span><a href="https://laws.e-gov.go.jp/" target="_blank" rel="noopener noreferrer">公式 e-Gov ↗</a></div><button class="rp-mobile-catalog-button" data-rp="toggle-catalog" aria-expanded="${s.mobileCatalog}">☰ ${s.mobileCatalog?'法令一覧を閉じる':'法令一覧を開く・切り替える'} <span>${ESC(selectedInfo().name)}</span></button><div class="rp-workspace">${catalogHTML()}${readerHTML()}</div><div class="rp-disclaimer"><strong>法令のご利用にあたって</strong>：本文はe-Govから閲覧時に取得・端末に保存します。取得日時が最新改正の施行日を示すものではありません。法令の規定には未施行・改正予定・経過措置・別表・図の影響があり得ます。試験学習や実務で引用する前に、必ず<a href="https://laws.e-gov.go.jp/" target="_blank" rel="noopener noreferrer">公式e-Gov法令検索</a>の原文と施行時点を確認してください。音声合成は端末搭載の音声エンジンを使用します。</div></div>`;}
function refresh({keepFocus=false,scroll=true}={}){
 const c=EL('content');if(!c||location.hash!=='#roppo')return;
 let id=null,pos=null;if(keepFocus&&document.activeElement?.id){id=document.activeElement.id;pos=typeof document.activeElement.selectionStart==='number'?document.activeElement.selectionStart:null;}
 const y=scroll?window.scrollY:null;c.innerHTML=renderHTML();if(id&&EL(id)){const e=EL(id);e.focus({preventScroll:true});if(pos!==null&&e.setSelectionRange)try{e.setSelectionRange(pos,pos);}catch{}}
 if(y!==null)window.scrollTo(0,y);
}
function display(){requestAnimationFrame(()=>{ensureSelected();});return renderHTML();}
function selectionCapture(){
 const sel=window.getSelection?.();if(!sel||sel.isCollapsed||!sel.rangeCount)return;
 const r=sel.getRangeAt(0),root=EL('rp-articles');if(!root||!root.contains(r.commonAncestorContainer))return;
 const result=[];for(const node of root.querySelectorAll('.rp-paragraph')){
  if(!r.intersectsNode(node))continue;
  let begin=0,end=node.textContent.length;
  if(node.contains(r.startContainer)){const t=document.createRange();t.selectNodeContents(node);t.setEnd(r.startContainer,r.startOffset);begin=t.toString().length;}
  if(node.contains(r.endContainer)){const t=document.createRange();t.selectNodeContents(node);t.setEnd(r.endContainer,r.endOffset);end=t.toString().length;}
  if(end>begin)result.push({articleId:node.dataset.artid,block:Number(node.dataset.rpblock),start:begin,end,excerpt:node.textContent.slice(begin,end)});
  if(result.length>80)break;
 }
 if(result.length){s.selection=result;s.selectedText=result.map(x=>x.excerpt).join(' ').slice(0,6000);}
}
function markSelected(color){selectionCapture();if(!s.selection.length){note('先に条文の文章をドラッグ・長押しして選択してください。');return;}
 if(!COLORS.includes(color))return;
 const source=mem.get(s.lawId);if(!source)return;let n=0;
 for(const k of s.selection){const a=source.articles.find(a=>a.id===k.articleId),b=a?.blocks[k.block];if(!b||k.end>b.t.length||k.start<0||k.end<=k.start)continue;
  meta.marks.push({id:'m'+Date.now()+'-'+Math.random().toString(36).slice(2,9),lawId:s.lawId,articleId:k.articleId,block:k.block,start:k.start,end:k.end,color,at:Date.now(),excerpt:k.excerpt.slice(0,160)});n++;
 }
 if(meta.marks.length>15000)meta.marks=meta.marks.slice(-15000);
 if(n){writeMeta();s.selection=[];s.selectedText='';window.getSelection()?.removeAllRanges();refresh();note(n+'か所にマーカー線を保存しました。');}else note('選択範囲を条文に結び付けられませんでした。');
}
function getArticle(id){return mem.get(s.lawId)?.articles.find(x=>x.id===id);}
function speaker(){return typeof window.speechSynthesis!=='undefined'&&typeof window.SpeechSynthesisUtterance!=='undefined';}
let speaking=false,paused=false,speakTokens=0,segments=[],segIndex=0;
function voiceState(t){const e=EL('rp-tts-state');if(e)e.textContent=t;const p=EL('rp-voice-pause');if(p)p.textContent=paused?'▶ 再開':'一時停止';}
function stopVoice(){speakTokens++;segments=[];segIndex=0;speaking=false;paused=false;try{window.speechSynthesis?.cancel();}catch(e){}voiceState('停止中');}
function splitSpeech(str){const parts=String(str).replace(/\s+/g,' ').match(/[^。！？!？\n]+[。！？!？]?/g)||[str],chunks=[];
 for(const part of parts){let cur=part;while(cur.length>150){let cut=cur.lastIndexOf('、',150);if(cut<65)cut=150;else cut++;chunks.push(cur.slice(0,cut));cur=cur.slice(cut);}if(cur.trim())chunks.push(cur.trim());}
 return chunks.slice(0,1500);
}
function getVoice(){const voices=window.speechSynthesis?.getVoices?.()||[];return voices.find(x=>x.lang?.toLowerCase().startsWith('ja')&&(x.voiceURI===meta.voice))||voices.find(x=>x.lang?.toLowerCase().startsWith('ja'))||null;}
function speakNext(token){if(token!==speakTokens)return;if(segIndex>=segments.length){speaking=false;paused=false;voiceState('読み上げ完了');return;}
 const text=segments[segIndex++],utter=new SpeechSynthesisUtterance(text);utter.lang='ja-JP';utter.rate=meta.rate;utter.pitch=1;const voice=getVoice();if(voice)utter.voice=voice;
 utter.onend=()=>{if(token===speakTokens)requestAnimationFrame(()=>speakNext(token));};utter.onerror=(event)=>{if(token!==speakTokens)return;if(event.error==='canceled'||event.error==='interrupted')return;speaking=false;voiceState('読み上げを終了しました');};
 voiceState(`読み上げ中 ${segIndex}/${segments.length}`);try{window.speechSynthesis.speak(utter);}catch(e){stopVoice();note('この端末では読み上げを開始できません。','bad');}
}
function startSpeech(text){stopVoice();if(!speaker()){note('このブラウザは音声読み上げに対応していません。OSとブラウザの音声機能をご確認ください。','bad');return;}
 if(!text.trim()){note('読み上げる文章がありません。');return;}
 segments=splitSpeech(text);if(!segments.length)return;speaking=true;paused=false;const token=speakTokens;speakNext(token);
}
function speechPage(){const d=mem.get(s.lawId);if(!d)return;const shown=shownArticles(d).slice((s.page-1)*s.pageSize,s.page*s.pageSize);startSpeech(shown.map(a=>`${a.heading}。${a.title}。${a.caption}。`+a.blocks.map(b=>b.t).join('。')).join('。'));}
function togglePause(){if(!speaker()||!speaking){note('先に読み上げを開始してください。');return;}try{if(paused){window.speechSynthesis.resume();paused=false;}else{window.speechSynthesis.pause();paused=true;}voiceState(paused?'一時停止中':`読み上げ中 ${segIndex}/${segments.length}`);}catch(e){note('一時停止に失敗しました。');}}
function manageMarks(articleId){
 const list=meta.marks.filter(x=>x.lawId===s.lawId&&x.articleId===articleId);
 if(!list.length){note('この条文にはマーカーがありません。');return;}
 const a=getArticle(articleId);const current=EL('rp-mark-manager');if(current){current.remove();}
 const host=EL('rp-articles');if(!host)return;
 const overlay=document.createElement('div');overlay.className='rp-dialog-overlay';overlay.id='rp-mark-manager';overlay.setAttribute('role','presentation');
 overlay.innerHTML=`<div class="rp-dialog" role="dialog" aria-modal="true" aria-labelledby="rp-dialog-title"><div class="rp-dialog-title"><h3 id="rp-dialog-title">${ESC(a?.title||'条文')}のマーカー</h3><button class="rp-mini" data-rp="close-manager" aria-label="閉じる">×</button></div><div class="rp-mark-items">${list.map(m=>`<div class="rp-mark-item"><span class="rp-mark rp-${m.color}">${ESC(m.excerpt||'マーカー線')}${m.stale?'（本文変更・要確認）':''}</span><button class="rp-button rp-ghost" data-rp="delete-mark" data-id="${ESC(m.id)}">削除</button></div>`).join('')}</div><div class="rp-dialog-footer"><button class="rp-button rp-secondary" data-rp="close-manager">閉じる</button></div></div>`;
 overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
 document.body.appendChild(overlay);
}
function addImportedLaw(data){const found=CATALOG.some(x=>x[0]===data.id)||meta.custom.some(x=>x.id===data.id);if(!found)meta.custom.push({id:data.id,name:data.name,group:'追加法令',topic:'XML取込'});writeMeta();}
async function importXml(file){if(!file)return;if(file.size>28*1024*1024){note('取り込めるXMLは28MB以内です。','bad');return;}
 try{const str=await file.text(),dom=new DOMParser().parseFromString(str,'application/xml');if(dom.querySelector('parsererror'))throw Error('XMLとして解析できません。');
  const apiId=dom.querySelector('ApplData > LawId')?.textContent?.trim();const lawId=apiId||dom.querySelector('Law')?.getAttribute('LawId')||s.lawId;
  if(!/^[0-9A-Z]{10,22}$/.test(lawId))throw Error('法令IDが判別できません。対象法令を一覧から選択してから取り込んでください。');
  const parsed=readXml(str,lawId,true);
  const expected=selectedInfo().name;if(parsed.id===s.lawId&&expected&&parsed.name!==expected&&CATALOG.some(x=>x[0]===parsed.id)){
   throw Error(`選択中の「${expected}」とXMLの法令名「${parsed.name}」が異なります。先に正しい法令を選択してください。`);
  }
  await cacheWrite(parsed);addImportedLaw(parsed);s.lawId=parsed.id;meta.lastLaw=parsed.id;writeMeta();s.textFilter='';s.page=1;s.error='';refresh();note(parsed.name+'のXMLを取り込みました。');
 }catch(e){note('XMLの取り込みに失敗しました：'+e.message,'bad');}
}
function handlerClick(ev){const el=ev.target.closest('[data-rp]');if(!el||!EL('content')?.contains(el)&&!EL('rp-mark-manager')?.contains(el))return;
 const op=el.dataset.rp,id=el.dataset.id||'',v=el.dataset.val||'';
 if(op==='toggle-catalog'){s.mobileCatalog=!s.mobileCatalog;refresh();return;}
 if(op==='group'){s.group=v;refresh({keepFocus:true});return;}
 if(op==='select'){onSelect(id);return;}
 if(op==='toggle-index'){s.indexOpen=!s.indexOpen;refresh();if(s.indexOpen&&officialIndex===null)loadOfficialIndex(false);return;}
 if(op==='load-index'){loadOfficialIndex(true);return;}
 if(op==='add-index'){if(!/^[0-9A-Z]{10,22}$/.test(id))return;if(!allLaws().some(x=>x.id===id)){meta.custom.push({id,name:(el.dataset.name||id).slice(0,80),group:'追加法令',topic:'公式法令一覧'});writeMeta();}s.group='all';onSelect(id);note('法令を追加しました。条文を取得すると閲覧できます。');return;}
 if(op==='add-law'){const raw=(EL('rp-add-id')?.value||'').trim().toUpperCase();if(!/^[0-9A-Z]{10,22}$/.test(raw)){note('e-Govで確認した10〜22文字の法令IDを入力してください。');return;}if(!allLaws().some(x=>x.id===raw)){meta.custom.push({id:raw,name:'追加法令 '+raw,group:'追加法令',topic:'公式API'});writeMeta();}s.group='all';onSelect(raw);note('法令を追加しました。公式条文を取得してください。');return;}
 if(op==='fetch'){fetchCurrent(true);return;}
 if(op==='bulk'){fetchSix();return;}
 if(op==='choose-xml'){EL('rp-import')?.click();return;}
 if(op==='page'){s.page=Number(el.dataset.page)||1;refresh({scroll:false});EL('rp-articles')?.scrollIntoView({behavior:'instant',block:'start'});return;}
 if(op==='only-mark'){s.onlyMarked=!s.onlyMarked;s.page=1;refresh();return;}
 if(op==='only-book'){s.onlyBookmarked=!s.onlyBookmarked;s.page=1;refresh();return;}
 if(op==='mark'){markSelected(el.dataset.color);return;}
 if(op==='bookmark'){const key=bid(s.lawId,id),at=meta.bookmarks.indexOf(key);if(at<0)meta.bookmarks.push(key);else meta.bookmarks.splice(at,1);writeMeta();refresh();note(at<0?'条文をブックマークしました。':'ブックマークを外しました。');return;}
 if(op==='note-toggle'){const box=EL('rp-note-'+id);if(box){box.hidden=!box.hidden;if(!box.hidden)box.querySelector('textarea')?.focus();}return;}
 if(op==='marks-manage'){manageMarks(id);return;}
 if(op==='close-manager'){EL('rp-mark-manager')?.remove();return;}
 if(op==='delete-mark'){meta.marks=meta.marks.filter(x=>x.id!==id);writeMeta();EL('rp-mark-manager')?.remove();refresh();note('マーカーを削除しました。');return;}
 if(op==='speak-article'){const a=getArticle(id);if(a)startSpeech([a.title,a.caption,...a.blocks.map(b=>b.t)].filter(Boolean).join('。'));return;}
 if(op==='speak-selection'){selectionCapture();startSpeech(s.selectedText||window.getSelection?.()?.toString()||'');return;}
 if(op==='speak-page'){speechPage();return;}
 if(op==='pause'){togglePause();return;}
 if(op==='stop'){stopVoice();return;}
 if(op==='delete-law'){if(!confirm(`${selectedInfo().name}の保存済み本文を端末から削除しますか？\nマーカー・メモ・ブックマークは残ります。`))return;const lawId=s.lawId;mem.delete(lawId);storeDelete(lawId).then(()=>{refresh();note('本文データを削除しました。');}).catch(()=>note('保存済み本文を削除できませんでした。','bad'));refresh();return;}
}
function handlerInput(ev){const el=ev.target;if(location.hash!=='#roppo')return;
 if(el.id==='rp-textsearch'){s.textFilter=el.value.slice(0,150);s.page=1;refresh({keepFocus:true});}
 if(el.id==='rp-lawfilter'){s.lawFilter=el.value.slice(0,150);refresh({keepFocus:true});}
 if(el.id==='rp-index-search'){s.indexSearch=el.value.slice(0,120);refresh({keepFocus:true});}
 if(el.dataset.rp==='note-input'){
  meta.notes[bid(s.lawId,el.dataset.id)]=el.value.slice(0,4000);writeMeta();
 }
}
function handlerChange(ev){const el=ev.target;if(location.hash!=='#roppo')return;
 if(el.id==='rp-scope'){s.articleScope=el.value;s.page=1;refresh();}
 if(el.id==='rp-rate'){meta.rate=Number(el.value)||1;writeMeta();note('次の読み上げから速度を変更します。');}
 if(el.id==='rp-import'){const f=el.files?.[0];if(f)importXml(f);el.value='';}
}
let bound=false;
function bind(){if(bound)return;bound=true;document.addEventListener('click',handlerClick);document.addEventListener('input',handlerInput);document.addEventListener('change',handlerChange);
 document.addEventListener('selectionchange',()=>{if(location.hash==='#roppo')selectionCapture();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){EL('rp-mark-manager')?.remove();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoice();});
 window.addEventListener('pagehide',stopVoice);
 window.addEventListener('hashchange',()=>{if(location.hash!=='#roppo')stopVoice();});
}
function exportMeta(){return JSON.parse(JSON.stringify(meta));}
function importMeta(data){meta=cleanMeta(data);writeMeta();refresh();}
function resetMeta(){meta=fresh();writeMeta();stopVoice();refresh();}
window.GYOSHI_ROPPO={render:display,bind,stop:stopVoice,exportMeta,importMeta,resetMeta,getCatalog:allLaws,__test:{readXml,splitSpeech,shownArticles,normalizeText,cleanMeta,meta:()=>meta,mem,s}};
bind();
})();
