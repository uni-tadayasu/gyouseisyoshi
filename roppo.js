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
const EDITION=window.GYOSHI_EDITION;
const LAW_VOICE=window.GYOSHI_LAW_VOICE;
const readerRoute=()=>location.hash.split('?')[0]==='#roppo';
const fold=value=>String(value??'').normalize('NFKC').toLowerCase().trim();
const articlePattern=/^(preamble|main-[0-9_]+|suppl-[0-9]+-([0-9_]+|text)|appendix-[0-9]+|section-[0-9]+)$/;
const legalDigits='0-9〇零一二三四五六七八九十百千';
const articleQuery=new RegExp('^第?(['+legalDigits+']+)(?:条)?((?:[のノ_-]['+legalDigits+']+)*)$');
function jpNumber(value){
 const number=LAW_VOICE.numberValue(value);
 return Number.isSafeInteger(number)?String(number):'';
}
function articleNumber(value){
 const match=fold(value).replace(/\s+/g,'').match(articleQuery);
 if(!match)return '';
 const numbers=[match[1],...match[2].split(/[のノ_-]/).filter(Boolean)].map(jpNumber);
 return numbers.every(Boolean)?numbers.join('_'):'';
}
function lawURL(law,article=''){
 const query=new URLSearchParams({law});
 if(article)query.set('article',article);
 return '#roppo?'+query;
}
function articleLabel(id){
 if(id==='preamble')return '前文';
 const number=id.replace(/^main-|^suppl-[0-9]+-/,'');
 if(!/^[0-9]+(?:_[0-9]+)*$/.test(number))return '条文';
 const [first,...branches]=number.split('_');
 return '第'+first+'条'+branches.map(branch=>'の'+branch).join('');
}
function references(source){
 const aliases=new Map(CATALOG.map(([id,name])=>[name,id]));
 aliases.set('憲法','321CONSTITUTION');
 aliases.set('個人情報保護法','415AC0000000057');
 aliases.set('情報公開法','411AC0000000042');
 const text=fold(source);
 const names=[...text.matchAll(new RegExp([...aliases.keys()].sort((a,b)=>b.length-a.length).join('|'),'g'))];
 const pattern=new RegExp('第?['+legalDigits+']+条(?:の['+legalDigits+']+)*','g');
 const result=new Map();
 for(const [index,found] of names.entries()){
  const law=aliases.get(found[0]),name=CATALOG.find(row=>row[0]===law)[1];
  const tail=text.slice(found.index+found[0].length,names[index+1]?.index);
  const numbers=[...tail.matchAll(pattern)].map(match=>articleNumber(match[0])).filter(Boolean);
  if(tail.startsWith('前文'))result.set(lawURL(law,'preamble'),name+'前文');
  for(const number of numbers){
   const article='main-'+number;
   result.set(lawURL(law,article),name+articleLabel(article));
  }
  if(!numbers.length&&!tail.startsWith('前文'))result.set(lawURL(law),name);
 }
 return [...result].slice(0,6).map(([href,label])=>({href,label}));
}
function fingerprint(text){
 let hash=2166136261;
 for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
 return (hash>>>0).toString(36);
}
function fresh(){
 return {marks:[],bookmarks:[],notes:{},rate:1,voice:'',lastLaw:'321CONSTITUTION',custom:[],positions:{},
  voiceVolume:100,bgmVolume:22,bgmDuck:true,readings:[]};
}
function volumePercent(value,fallback){
 return typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(0,Math.min(100,value))):fallback;
}
function cleanMeta(m){
 const f=fresh();if(!m||typeof m!=='object'||Array.isArray(m))return f;
 f.marks=Array.isArray(m.marks)?m.marks.filter(x=>x&&typeof x.lawId==='string'&&typeof x.articleId==='string'&&Number.isInteger(x.block)&&Number.isInteger(x.start)&&Number.isInteger(x.end)&&x.start>=0&&x.end>x.start&&x.end-x.start<=10000&&COLORS.includes(x.color)).slice(-15000).map(x=>({id:String(x.id||'m'+Date.now()),lawId:x.lawId,articleId:x.articleId,block:x.block,start:x.start,end:x.end,color:x.color,at:Number(x.at)||Date.now(),excerpt:String(x.excerpt||'').slice(0,160),stale:x.stale===true,checksum:typeof x.checksum==='string'?x.checksum.slice(0,16):''})):[];
 f.bookmarks=Array.isArray(m.bookmarks)?[...new Set(m.bookmarks.filter(x=>typeof x==='string'&&x.length<200))].slice(0,3000):[];
 f.notes=m.notes&&typeof m.notes==='object'&&!Array.isArray(m.notes)?Object.fromEntries(Object.entries(m.notes).filter(([k,v])=>typeof k==='string'&&typeof v==='string').slice(0,3000).map(([k,v])=>[k,v.slice(0,4000)])):{};
 f.rate=[.7,.85,1,1.15,1.3,1.5].includes(Number(m.rate))?Number(m.rate):1;
 f.voice=typeof m.voice==='string'?m.voice.slice(0,300):'';
 f.voiceVolume=volumePercent(m.voiceVolume,f.voiceVolume);
 f.bgmVolume=volumePercent(m.bgmVolume,f.bgmVolume);
 f.bgmDuck=m.bgmDuck!==false;
 f.readings=LAW_VOICE.cleanReadings(m.readings);
 f.lastLaw=typeof m.lastLaw==='string'?m.lastLaw:'321CONSTITUTION';
 f.custom=Array.isArray(m.custom)?m.custom.filter(x=>x&&/^[0-9A-Z]{10,22}$/.test(x.id)&&typeof x.name==='string').slice(0,100).map(x=>({id:x.id,name:x.name.slice(0,80),group:'追加法令',topic:'インポート'})):[];
 f.positions=m.positions&&typeof m.positions==='object'?Object.fromEntries(Object.entries(m.positions).filter(([key,val])=>/^[0-9A-Z]{10,22}$/.test(key)&&articlePattern.test(val)).slice(0,115)):{};
 return f;
}
let meta;try{meta=cleanMeta(JSON.parse(localStorage.getItem(METAKEY)||'null'));}catch(e){meta=fresh();}
function writeMeta(){try{localStorage.setItem(METAKEY,JSON.stringify(meta));return true;}catch(e){note('設定や学習データを端末に保存できません。ブラウザの保存設定をご確認ください。','bad');return false;}}
const bgm=window.GYOSHI_READER_BGM.createBgm(syncBgmControls);
function syncBgmSettings(){bgm.configure(meta.bgmVolume,meta.bgmDuck);}
syncBgmSettings();
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
const s={lawId:CATALOG.some(x=>x[0]===meta.lastLaw)||meta.custom.some(x=>x.id===meta.lastLaw)?meta.lastLaw:'321CONSTITUTION',group:'all',lawFilter:'',textFilter:'',articleScope:'main',onlyMarked:false,onlyBookmarked:false,page:1,pageSize:18,mobileCatalog:false,loading:false,fetchingAll:false,bulkStatus:'',loadingIndex:false,indexOpen:false,indexSearch:'',indexError:'',error:'',selection:[],readingPack:false,packError:'',savedOpen:false,savedPage:1,controlsOpen:false,readingsOpen:false,noteIds:new Set(),addOpen:false};
let lawReqToken=0,officialIndex=null,indexLoadedAt=null,indexBundled=false;
let handledHash=null,requestedArticle='';
const readRequests=new Map();
const allLaws=()=>[...CATALOG.map(([id,name,group,topic])=>({id,name,group,topic})),...meta.custom];
const selectedInfo=()=>allLaws().find(x=>x.id===s.lawId)||{id:s.lawId,name:s.lawId,group:'追加法令',topic:''};
const bid=(law,art)=>law+'::'+art;
function note(msg,type='info'){
 const host=EL('toasts');if(host){const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=msg;host.appendChild(el);setTimeout(()=>el.remove(),4500);}
 else if(type==='bad')console.warn(msg);
}
function timeText(iso){const d=new Date(iso);return !iso||isNaN(d)?'—':d.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function normalizeText(str){return String(str||'').replace(/[\r\n\t ]+/g,' ').replace(/\s{2,}/g,' ').trim();}
function directChild(parent,name){return [...(parent?.children||[])].find(n=>n.localName===name)||null;}
function directChildren(parent,name){return [...(parent?.children||[])].filter(n=>n.localName===name);}
function childText(el,name){return normalizeText(directChild(el,name)?.textContent||'');}
function descendants(el,name){return [...(el?.getElementsByTagName(name)||[])];}
function xmlFragment(element){
 const raw=element?.textContent||'',t=normalizeText(raw);
 if(!t||!element.getElementsByTagName('Ruby').length)return {t};
 const ruby=[];
 let offset=0;
 function walk(node){
  if(node.nodeType===3||node.nodeType===4){offset+=node.data.length;return;}
  if(node.localName==='Ruby'){
   const text=node.textContent;
   const base=normalizeText([...node.childNodes].filter(child=>child.localName!=='Rt'&&(child.nodeType===1||child.nodeType===3||child.nodeType===4)).map(child=>child.textContent).join(''));
   const rt=childText(node,'Rt'),written=normalizeText(text);
   // A sentinel makes the prefix use the same trailing-space rules as the full text.
   const start=normalizeText(raw.slice(0,offset)+'\uE000').length-1;
   if(base&&rt&&t.slice(start,start+written.length)===written){
    const reading=rt==='しゆん'?'しゅん':/[ぁ-ゖァ-ヺ]/u.test(rt)?rt:base;
    ruby.push({start,end:start+written.length,base,reading});
   }
   offset+=text.length;
   return;
  }
  if(node.nodeType===1)for(const child of node.childNodes)walk(child);
 }
 walk(element);
 return ruby.length?{t,ruby}:{t};
}
function joinBlock(title,nodes,indent){
 let t=title.t?title.t+'　':'';
 const ruby=[...(title.ruby||[])];
 let hasBody=false;
 for(const node of nodes){
  const part=xmlFragment(node);
  if(!part.t)continue;
  if(hasBody)t+=' ';
  const offset=t.length;
  for(const hint of part.ruby||[])ruby.push({...hint,start:hint.start+offset,end:hint.end+offset});
  t+=part.t;hasBody=true;
 }
 return ruby.length?{t,indent,ruby}:{t,indent};
}
function blocksFromItem(item,level=0){
 const out=[];
 const title=xmlFragment([...item.children].find(node=>/^(ItemTitle|Subitem\d+Title)$/.test(node.localName)));
 const body=[...item.children].filter(node=>/^(ItemSentence|Subitem\d+Sentence|Subitem\d+Column|ItemColumn)$/.test(node.localName));
 const block=joinBlock(title,body,Math.min(level+1,5));
 if(block.t)out.push(block);
 for(const child of item.children)if(/^(Subitem\d+|Item)$/.test(child.localName))out.push(...blocksFromItem(child,level+1));
 return out;
}
function extractArticle(a,zone,index,heading){
 const titlePart=xmlFragment(directChild(a,'ArticleTitle')),captionPart=xmlFragment(directChild(a,'ArticleCaption'));
 const num=a.getAttribute('Num')||String(index);
 const title=titlePart.t||'第'+num+'条';
 const caption=captionPart.t,blocks=[];
 for(const p of directChildren(a,'Paragraph')){
  const lead=xmlFragment(directChild(p,'ParagraphNum'));
  const sentences=[...p.children].filter(node=>['ParagraphSentence','ParagraphColumn'].includes(node.localName));
  const block=joinBlock(lead,sentences,0);
  if(block.t)blocks.push(block);
  for(const child of p.children){
   if(child.localName==='Item')blocks.push(...blocksFromItem(child));
   else if(['TableStruct','FigStruct','StyleStruct','List'].includes(child.localName)){
    const part=xmlFragment(child);
    if(part.t)blocks.push({...part,indent:1});
   }
  }
 }
 if(!blocks.length){
  const fragment=xmlFragment(a);
  const text=fragment.t.replace(caption,'').replace(title,'').trim();
  const start=fragment.t.indexOf(text);
  if(text)blocks.push(start<0?{t:text,indent:0}:{...LAW_VOICE.sliceFragment(fragment,start,start+text.length),indent:0});
 }
 const result={id:zone+'-'+num,title,caption,number:num,heading,zone,blocks,
  search:[title,caption,heading,...blocks.map(block=>block.t)].join(' ').toLowerCase()};
 if(titlePart.ruby)result.titleRuby=titlePart.ruby;
 if(captionPart.ruby)result.captionRuby=captionPart.ruby;
 return result;
}
function findHead(a){for(let x=a.parentElement;x&&x.localName!=='MainProvision'&&x.localName!=='SupplProvision';x=x.parentElement){const names=['SubsectionTitle','SectionTitle','ChapterTitle','PartTitle','DivisionTitle'];for(const key of names){const t=childText(x,key);if(t)return t;}}return '';}
function readXml(xml,id,imported=false){
 const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('XMLの構文が正しくありません。');
 const result=doc.querySelector('DataRoot > Result > Code');if(result&&result.textContent.trim()!=='0')throw Error('e-Gov API がエラーを返しました：'+(doc.querySelector('Result > Message')?.textContent||result.textContent));
 const responseId=doc.querySelector('ApplData > LawId')?.textContent.trim();
 if(responseId&&responseId!==id)throw Error('法令IDが一致しません。');
 const root=doc.querySelector('LawFullText > Law')||doc.querySelector('Law');if(!root)throw Error('e-Gov法令標準XMLの Law 要素が見つかりません。');
 const body=directChild(root,'LawBody');if(!body)throw Error('法令本文の LawBody が見つかりません。');
 const name=childText(body,'LawTitle')||selectedInfo().name;
 const lawNumber=childText(root,'LawNum');const articles=[];
 const pre=xmlFragment(directChild(body,'Preamble'));if(pre.t)articles.push({id:'preamble',title:'前文',caption:'',number:'',heading:'前文',zone:'main',blocks:[{...pre,indent:0}],search:('前文 '+pre.t).toLowerCase()});
 const main=directChild(body,'MainProvision');if(main){const nodes=descendants(main,'Article').filter(a=>!a.parentElement?.closest('Article'));nodes.forEach((a,i)=>articles.push(extractArticle(a,'main',i+1,findHead(a))));}
 // 付則は原始附則と各改正附則を識別するため、XML内の改正法令番号も表示する
 for(const [k,sup] of directChildren(body,'SupplProvision').entries()){
  const label=childText(sup,'SupplProvisionLabel')||'附則';const amend=sup.getAttribute('AmendLawNum');const heading=amend?label+'（'+amend+'）':label;
  const nodes=descendants(sup,'Article').filter(a=>!a.parentElement?.closest('Article'));
  nodes.forEach((a,i)=>articles.push(extractArticle(a,'suppl-'+k,i+1,heading)));
  if(!nodes.length){const part=xmlFragment(sup);if(part.t)articles.push({id:'suppl-'+k+'-text',title:heading,caption:'',number:'',heading,zone:'suppl-'+k,blocks:[{...part,indent:0}],search:(heading+' '+part.t).toLowerCase()});}
 }
 const appendices=[...body.children].filter(c=>c.localName.startsWith('Appdx'));
 appendices.push(...directChildren(body,'SupplProvision').flatMap(el=>[...el.children].filter(c=>c.localName.startsWith('SupplProvisionAppdx'))));
 for(const [i,part] of appendices.entries()){
  const label=[...part.children].filter(c=>/Title$/.test(c.localName)).map(x=>normalizeText(x.textContent)).filter(Boolean).join(' ')||'別表・別記 '+(i+1);
  const fragment=xmlFragment(part);if(fragment.t)articles.push({id:'appendix-'+i,title:label,caption:'',number:'',heading:'別表・別記',zone:'appendix',blocks:[{...fragment,indent:0}],search:(label+' '+fragment.t).toLowerCase()});
 }
 // ArticleだけでなくParagraphのみの法令（条建てでない法令）も表示可能にする
 if(main&&!articles.some(a=>a.zone==='main'&&a.id!=='preamble')){let j=0;for(const node of [...main.children]){const part=xmlFragment(node);if(part.t)articles.push({id:'section-'+j,title:'本文 '+(++j),caption:'',number:'',heading:'本則',zone:'main',blocks:[{...part,indent:0}],search:part.t.toLowerCase()});}}
 if(!articles.length)throw Error('このXMLから表示できる条文を抽出できませんでした。');
 const plainChars=articles.reduce((n,a)=>n+a.blocks.reduce((t,b)=>t+b.t.length,0),0);
 if(plainChars>5000000)throw Error('本文が大きすぎるため、読み込みを中止しました。');
 return {id,name,number:lawNumber,imported,source:imported?'公式XMLの手動取込':'e-Gov法令API Version1',fetchedAt:new Date().toISOString(),count:articles.length,articles};
}
async function loadOfficialIndex(force=false){
 if(s.loadingIndex)return;s.loadingIndex=true;s.indexError='';refresh();
 try{
  if(!force){
   const saved=await storeGet('__official_list__').catch(()=>null);
   if(saved?.list?.length&&(!EDITION||Date.parse(saved.at)>=Date.parse(EDITION.snapshot))){
    officialIndex=saved.list;indexLoadedAt=saved.at;indexBundled=false;return;
   }
   if(EDITION){
    try{officialIndex=await EDITION.loadIndex();indexLoadedAt=EDITION.snapshot;indexBundled=true;return;}
    catch(error){if(saved?.list?.length){officialIndex=saved.list;indexLoadedAt=saved.at;return;}}
   }
  }
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  let r;try{r=await fetch(LISTAPI,{mode:'cors',signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timeout);}
  if(!r.ok)throw Error('HTTP '+r.status);
  const text=await r.text();if(text.length>22000000)throw Error('法令一覧データが大きすぎます。');
  const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('一覧XMLを解析できません。');
  const result=doc.querySelector('DataRoot > Result > Code');if(result&&result.textContent.trim()!=='0')throw Error('公式法令一覧APIがエラーを返しました。');
  const lawlist=[...doc.querySelectorAll('LawNameListInfo')].map(x=>({id:childText(x,'LawId'),name:childText(x,'LawName'),no:childText(x,'LawNo')})).filter(x=>/^[0-9A-Z]{10,22}$/.test(x.id)&&x.name);
  if(!lawlist.length)throw Error('法令一覧が空でした。');
  officialIndex=lawlist;indexLoadedAt=new Date().toISOString();indexBundled=false;
  await storePut({id:'__official_list__',list:lawlist,at:indexLoadedAt}).catch(()=>{});
  note(`公式法令一覧を${NF(lawlist.length)}件読み込みました。`);
 }catch(e){s.indexError='法令一覧の取得に失敗しました。通信環境・API提供状況をご確認ください：'+e.message;}
 finally{s.loadingIndex=false;refresh();}
}
function officialSearchHTML(){
 if(!s.indexOpen)return '';
 if(!officialIndex)return `<p class="rp-muted">e-Govの「憲法・法律」一覧を取得し、法令名から追加できます。初回には通信が必要です。</p><button class="rp-button rp-secondary rp-full" data-rp="load-index" ${s.loadingIndex?'disabled':''}>${s.loadingIndex?'取得中…':'↓ 公式法令一覧を読み込む'}</button>${s.indexError?`<p class="rp-index-error" role="alert">${ESC(s.indexError)}</p>`:''}`;
 const term=fold(s.indexSearch),hits=term?officialIndex.filter(x=>fold(x.name).includes(term)||fold(x.no).includes(term)||fold(x.id).includes(term)):[];
 return `<label class="rp-custom-label" for="rp-index-search">法令名・法令番号で検索</label><input class="rp-input" id="rp-index-search" type="search" placeholder="例：民法、行政手続法" value="${ESC(s.indexSearch)}"><div class="rp-index-meta">${NF(officialIndex.length)}件 · 目録${indexBundled?'収録':'取得'} ${timeText(indexLoadedAt)}</div><div class="rp-index-results">${!term?'<div class="rp-mini-empty">検索したい法令名を入力してください。</div>':hits.length?hits.slice(0,22).map(x=>`<button data-rp="add-index" data-id="${x.id}" data-name="${ESC(x.name)}"><strong>${ESC(x.name)}</strong><small>${ESC(x.no)} · 本文を取得する</small></button>`).join(''):'<div class="rp-mini-empty">法令名が見つかりません。</div>'}</div>${hits.length>22?`<div class="rp-muted">${NF(hits.length)}件中、先頭22件を表示</div>`:''}<button class="rp-link" data-rp="load-index" ${s.loadingIndex?'disabled':''}>公式一覧を更新</button>${s.indexError?`<p class="rp-index-error" role="alert">${ESC(s.indexError)}</p>`:''}`;
}

function reanchor(doc,previous){
 const articles=new Map(doc.articles.map(a=>[a.id,a]));
 const oldArticles=new Map(previous?.articles.map(a=>[a.id,a])||[]);
 let changed=false;
 for(const mark of meta.marks){
  if(mark.lawId!==doc.id)continue;
  const article=articles.get(mark.articleId),length=mark.end-mark.start;
  const old=oldArticles.get(mark.articleId)?.blocks[mark.block]?.t?.slice(mark.start,mark.end);
  const excerpt=mark.excerpt||'';
  const complete=excerpt.length===length?excerpt:old?.length===length&&old.startsWith(excerpt)?old:'';
  const exact=article?.blocks[mark.block]?.t?.slice(mark.start,mark.end);
  if(exact?.length===length&&(mark.checksum?fingerprint(exact)===mark.checksum:complete&&exact===complete)){
   if(mark.stale){mark.stale=false;changed=true;}continue;
  }
  if(article&&complete){
   let hit=null,multiple=false;
   for(const [index,block] of article.blocks.entries()){
    const start=block.t.indexOf(complete);if(start<0)continue;
    if(hit||block.t.indexOf(complete,start+1)>=0){multiple=true;break;}
    hit={index,start};
   }
   if(hit&&!multiple){
    mark.block=hit.index;mark.start=hit.start;mark.end=hit.start+length;mark.stale=false;
    changed=true;continue;
   }
  }
  if(!mark.stale){mark.stale=true;changed=true;}
 }
 if(changed)writeMeta();
}
async function cacheWrite(doc){
 reanchor(doc,mem.get(doc.id));mem.set(doc.id,doc);
 const custom=meta.custom.find(x=>x.id===doc.id);
 if(custom&&custom.name!==doc.name){custom.name=doc.name;writeMeta();}
 try{await storePut(doc);return true;}
 catch(error){note('本文を端末に保存できません。現在の閲覧中は利用できます。','bad');return false;}
}
function readerLoad(id){
 if(mem.has(id))return Promise.resolve(mem.get(id));
 if(readRequests.has(id))return readRequests.get(id);
 const loading=(async()=>{
  const cached=await storeGet(id).catch(()=>null);
  if(mem.has(id))return mem.get(id);
  if(cached&&(!EDITION?.has(id)||cached.imported||Date.parse(cached.fetchedAt)>=Date.parse(EDITION.snapshot))){
   mem.set(id,cached);return cached;
  }
  if(!EDITION?.has(id))return null;
  try{
   const xml=await EDITION.loadLaw(id);
   if(mem.has(id))return mem.get(id);
   const doc=readXml(xml,id);
   doc.bundled=true;doc.source='e-Gov法令API Version1（収録版）';doc.fetchedAt=EDITION.snapshot;
   if(cached)reanchor(doc,cached);
   mem.set(id,doc);return doc;
  }catch(error){
   if(!cached)throw error;
   if(!mem.has(id))mem.set(id,cached);
   return mem.get(id);
  }
 })().finally(()=>readRequests.delete(id));
 readRequests.set(id,loading);
 return loading;
}
async function ensureSelected(){
 const token=++lawReqToken,id=s.lawId;
 try{
  const doc=await readerLoad(id);
  if(token!==lawReqToken||!readerRoute())return;
  s.readingPack=false;
  if(doc&&requestedArticle){
   const target=requestedArticle;requestedArticle='';jumpTo(target);
  }else refresh({keepFocus:true});
 }catch(error){
  if(token!==lawReqToken||!readerRoute())return;
  s.readingPack=false;s.packError=error.message;refresh({keepFocus:true});
 }
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
 s.loading=true;s.error='';refresh();try{
  const doc=await fetchOne(id);
  if(s.lawId===id&&requestedArticle){const target=requestedArticle;requestedArticle='';jumpTo(target);}
  note(doc.name+'の条文を取得しました。');
 }
 catch(e){if(s.lawId===id)s.error='公式法令データを取得できませんでした。ネット接続・API提供状況をご確認ください。e-GovからXMLを保存して「XMLを取り込む」も利用できます。詳細：'+(e.name==='AbortError'?'通信がタイムアウトしました':e.message);}
 finally{s.loading=false;refresh();}
}
async function fetchSix(){if(s.fetchingAll||s.loading)return;s.fetchingAll=true;s.bulkStatus='六法の取得を開始しています';refresh();let success=0;
 for(let i=0;i<6;i++){const [id,name]=CATALOG[i];s.bulkStatus=`六法を保存中 ${i+1}/6：${name}`;refresh();try{await fetchOne(id);success++;}catch(e){s.bulkStatus=`${name} の取得に失敗。続行します。`;refresh();}}
 s.fetchingAll=false;s.bulkStatus='';refresh();note(`六法のうち${success}/6法令を取得・保存しました。${success<6?'通信に失敗した法令は個別に再取得できます。':''}`);
}

function setLaw(id){
 stopVoice();s.lawId=id;meta.lastLaw=id;writeMeta();
 s.page=1;s.articleScope='main';s.textFilter='';s.onlyMarked=false;s.onlyBookmarked=false;
 s.mobileCatalog=false;s.error='';s.packError='';s.noteIds.clear();clearSelection();
 s.readingPack=!mem.has(id)&&Boolean(EDITION?.has(id));++lawReqToken;
}
function onSelect(id,article=''){
 if(!allLaws().some(x=>x.id===id))return;
 setLaw(id);requestedArticle=article;
 handledHash=lawURL(id,article);
 if(location.hash!==handledHash)history.replaceState(null,'',handledHash);
 refresh();ensureSelected();
 if(!article)EL('rp-law-title')?.scrollIntoView({block:'nearest'});
}
function prepareRoute(){
 if(handledHash===location.hash)return;
 handledHash=location.hash;
 const params=new URLSearchParams(location.hash.split('?')[1]||'');
 const law=params.get('law'),article=params.get('article')||'';
 if(law&&allLaws().some(item=>item.id===law))setLaw(law);
 requestedArticle=articlePattern.test(article)?article:'';
}
function jumpTo(id){
 const doc=mem.get(s.lawId),target=doc?.articles.find(a=>a.id===id);
 if(!target){refresh();note('指定された条文が見つかりません。');return;}
 stopVoice();s.textFilter='';s.onlyMarked=false;s.onlyBookmarked=false;
 s.articleScope=target.zone==='main'?'main':target.zone==='appendix'?'appendix':'suppl';
 s.page=Math.floor(shownArticles(doc).findIndex(a=>a.id===id)/s.pageSize)+1;
 meta.positions[s.lawId]=id;writeMeta();
 refresh({scroll:false});
 const node=EL('rp-a-'+id);node?.focus({preventScroll:true});node?.scrollIntoView({block:'start'});
}
function shownArticles(doc){
 if(!doc)return [];
 const query=fold(s.textFilter),number=articleNumber(query),terms=query.split(/\s+/).filter(Boolean);
 const marks=s.onlyMarked?new Set(meta.marks.filter(m=>m.lawId===s.lawId).map(m=>m.articleId)):null;
 const books=s.onlyBookmarked?new Set(meta.bookmarks):null;
 return doc.articles.filter(a=>{
  if(s.articleScope==='main'&&a.zone!=='main')return false;
  if(s.articleScope==='suppl'&&!a.zone.startsWith('suppl-'))return false;
  if(s.articleScope==='appendix'&&a.zone!=='appendix')return false;
  if(number&&a.number!==number)return false;
  if(!number&&terms.length){
   a.normalizedSearch??=fold(a.search);
   if(terms.some(term=>!a.normalizedSearch.includes(term)))return false;
  }
  return (!marks||marks.has(a.id))&&(!books||books.has(bid(s.lawId,a.id)));
 });
}
function markedContent(a,i,txt){
 const marks=meta.marks.filter(m=>{
  if(m.lawId!==s.lawId||m.articleId!==a.id||m.block!==i||m.stale||m.end>txt.length)return false;
  const exact=txt.slice(m.start,m.end);
  return m.checksum?fingerprint(exact)===m.checksum:!m.excerpt||exact.startsWith(m.excerpt);
 });
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
 const key=bid(s.lawId,a.id),noteText=meta.notes[key]||'',noteOpen=s.noteIds.has(key);
 return `<article class="rp-article" id="rp-a-${ESC(a.id)}" data-article="${ESC(a.id)}" tabindex="-1"><div class="rp-article-top"><div class="rp-article-title"><div class="rp-topic">${ESC(a.heading|| (a.zone==='main'?'本則':'附則・別表'))}</div>${a.caption?`<div class="rp-caption">${ESC(a.caption)}</div>`:''}<h3>${ESC(a.title)}</h3></div><div class="rp-art-actions"><button class="rp-mini ${book?'is-active':''}" data-rp="bookmark" data-id="${ESC(a.id)}" aria-label="条文のしおり" aria-pressed="${book}" title="条文をブックマーク">${book?'★':'☆'}</button><button class="rp-mini" data-rp="speak-article" data-id="${ESC(a.id)}" title="条文を読み上げ" aria-label="${ESC(a.title)}を読み上げ">🔊</button><button class="rp-mini" data-rp="note-toggle" data-id="${ESC(a.id)}" title="条文メモ" aria-label="${ESC(a.title)}のメモ" aria-expanded="${noteOpen}">✎</button><button class="rp-mini" data-rp="copy-link" data-id="${ESC(a.id)}" aria-label="${ESC(a.title)}へのリンクをコピー" title="条文リンク">↗</button></div></div>
 <div class="rp-article-body">${a.blocks.map((b,i)=>`<p class="rp-paragraph ${b.indent?'rp-indent':''}" data-rpblock="${i}" data-artid="${ESC(a.id)}">${markedContent(a,i,b.t)}</p>`).join('')}</div>
 <div class="rp-article-foot" ${marked.length?'':'hidden'}><span>${marked.length?`<span class="rp-foot-count">マーカー ${marked.length}件</span>`:''}</span>${marked.length?`<button class="rp-link" data-rp="marks-manage" data-id="${ESC(a.id)}">マーカーを管理</button>`:''}</div>
 <div class="rp-notebox ${noteText?'has-note':''}" id="rp-note-${ESC(a.id)}" ${noteOpen?'':'hidden'}><label for="rp-note-input-${ESC(a.id)}">✎ ${ESC(a.title)}の学習メモ（自動保存）</label><textarea id="rp-note-input-${ESC(a.id)}" class="rp-textarea" data-rp="note-input" data-id="${ESC(a.id)}" maxlength="4000" placeholder="判例・関連問題・覚え方を記録">${ESC(noteText)}</textarea><small>このメモは学習バックアップに含まれます。</small></div></article>`;
}
function catalogHTML(){
 const needle=fold(s.lawFilter),list=allLaws().filter(x=>(s.group==='all'||x.group===s.group)&&(!needle||fold(x.name+' '+x.topic+' '+x.id).includes(needle)));
 return `<aside class="rp-catalog ${s.mobileCatalog?'rp-catalog-open':''}" aria-label="法令一覧" id="rp-catalog"><div class="rp-catalog-top"><div><strong>法令一覧</strong></div><span class="rp-count">${allLaws().length}法令</span></div><input class="rp-input rp-catalog-search" type="search" id="rp-lawfilter" placeholder="法令名を検索" value="${ESC(s.lawFilter)}" aria-label="法令名を検索"><div class="rp-tabs" role="group" aria-label="法令グループ">${[['all','すべて'],['六法','六法'],['行政法令','行政法令'],['追加法令','追加']].map(([x,t])=>`<button class="${s.group===x?'active':''}" data-rp="group" data-val="${x}">${t}</button>`).join('')}</div><div class="rp-lawlist">${list.length?list.map(x=>`<button class="rp-lawitem ${s.lawId===x.id?'selected':''}" data-rp="select" data-id="${x.id}"><span class="rp-lawitem-body"><strong>${ESC(x.name)}</strong><small>${ESC(x.topic||x.group)}</small></span><span class="rp-cache-status  ${EDITION?.has(x.id)||mem.has(x.id)?'cached':''}" title="法令本文の状態">${EDITION?.has(x.id)?'収録':mem.has(x.id)?'保存済':'要取得'}</span></button>`).join(''):'<div class="rp-mini-empty">該当する法令がありません。</div>'}</div><details id="rp-add-tools" class="rp-catalog-bottom rp-add-tools" ${s.addOpen?'open':''}><summary>法令を追加・更新</summary><button class="rp-button rp-secondary rp-full" data-rp="bulk" ${s.fetchingAll?'disabled':''}>${s.fetchingAll?'取得処理中…':'主要六法の公式本文を再取得'}</button>${s.bulkStatus?`<p class="rp-muted" role="status">${ESC(s.bulkStatus)}</p>`:''}<button class="rp-button rp-ghost rp-full" data-rp="choose-xml">＋ e-Gov法令XMLを取り込む</button><label class="rp-custom-label" for="rp-add-id">ほかの法令を追加（e-Gov法令ID）</label><div class="rp-custom-row"><input id="rp-add-id" class="rp-input" placeholder="例：321CONSTITUTION" maxlength="22" autocapitalize="characters" aria-label="追加する法令ID"><button class="rp-button rp-secondary" data-rp="add-law">追加</button></div><div class="rp-official-panel"><button class="rp-official-toggle" data-rp="toggle-index" aria-expanded="${s.indexOpen}">憲法・法律の公式目録から探す <span>${s.indexOpen?'−':'＋'}</span></button>${officialSearchHTML()}</div><small>追加法令の本文は、公式取得またはXML取込で開けます。</small></details></aside>`;
}
const volumeFields={'rp-voice-volume':'voiceVolume','rp-bgm-volume':'bgmVolume'};
function updateVolume(input){
 const key=volumeFields[input.id];
 if(!Object.hasOwn(volumeFields,input.id))return false;
 meta[key]=volumePercent(Number(input.value),meta[key]);
 const output=EL(input.id+'-value');
 if(output)output.value=meta[key]+'%';
 if(key==='bgmVolume')syncBgmSettings();
 return true;
}
function bgmLabel(){
 const playing=bgm.state==='playing'||bgm.state==='loading';
 const status={idle:'停止中',loading:'準備中',playing:'再生中',error:'BGMを再生できませんでした。もう一度お試しください。'};
 return {button:playing?'BGMを停止':'BGMを再生',status:status[bgm.state]};
}
function syncBgmControls(){
 const label=bgmLabel(),button=EL('rp-bgm-toggle'),status=EL('rp-bgm-status');
 if(button)button.textContent=label.button;
 if(status)status.textContent=label.status;
}
function bgmHTML(){
 const label=bgmLabel();
 return `<div class="rp-bgmbar" role="group" aria-label="BGMの操作">
  <div class="rp-bgm-track"><strong>Hear your voice</strong><span class="rp-muted" id="rp-bgm-status" role="status">${ESC(label.status)}</span></div>
  <button class="rp-button rp-ghost" id="rp-bgm-toggle" data-rp="toggle-bgm" type="button">${label.button}</button>
 </div>`;
}
function volumeHTML(id,key,label,description=''){
 const value=meta[key];
 return `<div class="rp-volume-field">
  <div class="rp-volume-caption"><label for="${id}">${label}</label><output id="${id}-value" for="${id}">${value}%</output></div>
  <input type="range" id="${id}" min="0" max="100" step="1" value="${value}" ${description?`aria-describedby="${id}-hint"`:''}>
  ${description?`<small id="${id}-hint">${description}</small>`:''}
 </div>`;
}
function readingsList(){
 if(!meta.readings.length)return '';
 return `<ul class="rp-readings-list">${meta.readings.map(({word,reading})=>`<li>
  <span><strong>${ESC(word)}</strong><span>${ESC(reading)}</span></span>
  <button class="rp-button rp-ghost" data-rp="remove-reading" data-id="${ESC(word)}" type="button" aria-label="${ESC(word)}の読みを削除">削除</button>
 </li>`).join('')}</ul>`;
}
function soundSettingsHTML(){
 return `<div class="rp-sound-settings">
  <div class="rp-sound-levels">
   ${volumeHTML('rp-voice-volume','voiceVolume','読み上げ音量','再生中の変更は次の区切りから反映')}
   ${volumeHTML('rp-bgm-volume','bgmVolume','BGM音量')}
  </div>
  <label class="rp-duck-setting"><input type="checkbox" id="rp-bgm-duck" ${meta.bgmDuck?'checked':''}>読み上げ中はBGMを小さくする</label>
  <div class="rp-field rp-voice-field"><label for="rp-voice">日本語音声</label><select id="rp-voice" class="rp-input rp-voice-select">${voicesHTML()}</select></div>
  <details class="rp-reading-rules" id="rp-reading-rules" ${s.readingsOpen?'open':''}>
   <summary>読み方を登録 <span id="rp-rule-count">${meta.readings.length}件</span></summary>
   <form class="rp-reading-form" id="rp-reading-form">
    <div class="rp-field"><label for="rp-reading-word">条文の表記</label><input id="rp-reading-word" class="rp-input" required maxlength="40" placeholder="例：相殺"></div>
    <div class="rp-field"><label for="rp-reading-kana">読み仮名</label><input id="rp-reading-kana" class="rp-input" required maxlength="80" placeholder="例：そうさい"></div>
    <button class="rp-button rp-secondary" type="submit">登録する</button>
   </form>
   <p class="rp-muted">同じ表記を登録すると読み方を更新します。</p>
   <div id="rp-readings-list">${readingsList()}</div>
  </details>
 </div>`;
}
function updateReadings(readings){
 const previous=meta.readings;
 meta.readings=readings;
 if(!writeMeta()){meta.readings=previous;return false;}
 const host=EL('rp-readings-list'),count=EL('rp-rule-count');
 if(host)host.innerHTML=readingsList();
 if(count)count.textContent=readings.length+'件';
 return true;
}
function saveReading(event){
 if(event.target.id!=='rp-reading-form')return;
 event.preventDefault();
 const input=EL('rp-reading-word'),kana=EL('rp-reading-kana');
 const [rule]=LAW_VOICE.cleanReadings([{word:input.value,reading:kana.value}]);
 if(!rule){note('条文の表記と、ひらがな・カタカナの読み仮名を入力してください。');return;}
 const existing=meta.readings.filter(entry=>entry.word!==rule.word);
 if(existing.length>=100){note('読み方は100件まで登録できます。');return;}
 if(updateReadings([...existing,rule])){
  event.target.reset();input.focus({preventScroll:true});
  note('読み方を保存しました。次に読み上げを始めると反映されます。');
 }
}
function removeReading(word){
 if(updateReadings(meta.readings.filter(entry=>entry.word!==word))){
  EL('rp-reading-word')?.focus({preventScroll:true});note('登録した読み方を削除しました。');
 }
}

function readerHTML(){
 const doc=mem.get(s.lawId),info=selectedInfo(),available=Boolean(doc);
 const official=`https://laws.e-gov.go.jp/law/${encodeURIComponent(s.lawId)}`;
 const counts=available?shownArticles(doc):[],pages=Math.max(1,Math.ceil(counts.length/s.pageSize)),pg=Math.min(Math.max(1,s.page),pages);s.page=pg;
 const shown=counts.slice((pg-1)*s.pageSize,pg*s.pageSize);
 const markCount=meta.marks.filter(x=>x.lawId===s.lawId).length;
 return `<section class="rp-reader" aria-label="六法条文閲覧"><div class="rp-reader-head"><div><div class="rp-eyebrow">${ESC(info.group==='行政法令'?'試験関連法令':info.group)}</div><h2 id="rp-law-title" tabindex="-1">${ESC(doc?.name||info.name)}</h2>${doc?.number?`<p class="rp-muted">${ESC(doc.number)}</p>`:''}</div><div class="rp-source-actions"><a class="rp-button rp-ghost" href="${official}" target="_blank" rel="noopener noreferrer">公式原文 ↗</a><button class="rp-button rp-secondary" data-rp="fetch" ${s.loading||s.fetchingAll?'disabled':''}>${s.loading?'取得中…':available?'公式本文を再取得':'↓ 条文を取得'}</button></div></div>
 <div class="rp-statusrow"><span class="rp-status-pill ${available?'ready':''}">${doc?(doc.bundled?'収録本文':doc.imported?'取込本文':'取得本文'):s.readingPack?'収録本文を準備中':'本文未取得'}</span>${available?`<span>${NF(doc.count)}件の表示項目</span><span>${doc.bundled?'収録':doc.imported?'取込':'取得'} ${timeText(doc.fetchedAt)}（日本時間）</span>`:''}<span>${markCount}マーカー</span></div>
 ${s.error||s.packError?`<div class="rp-alert error" role="alert">${ESC(s.error||s.packError)}<div class="rp-actions"><button class="rp-button rp-secondary" data-rp="choose-xml">XMLを取り込む</button><a href="${official}" target="_blank" rel="noopener noreferrer">e-Gov原文を開く ↗</a></div></div>`:''}
  ${!available?`<div class="rp-blank"><h3>${s.readingPack?'収録本文を読み込み中':ESC(info.name)+'の本文を開く'}</h3>
 ${s.readingPack?'':`<p>公式e-Govの本文を取得するか、法令XMLを取り込んで閲覧できます。</p><div class="rp-actions center"><button class="rp-button rp-primary" data-rp="fetch" ${s.loading||s.fetchingAll?'disabled':''}>公式本文を取得する</button><button class="rp-button rp-secondary" data-rp="choose-xml">XMLを取り込む</button></div>`}</div>`:
 `<div class="rp-readtools"><div class="rp-field"><label for="rp-textsearch">条番号・語句</label><input class="rp-input" type="search" id="rp-textsearch" value="${ESC(s.textFilter)}" placeholder="例：95、第一条、取消し"></div><div class="rp-field rp-scope"><label for="rp-scope">表示範囲</label><select class="rp-input" id="rp-scope" data-rp="scope"><option value="main" ${s.articleScope==='main'?'selected':''}>本則・前文</option><option value="suppl" ${s.articleScope==='suppl'?'selected':''}>附則</option><option value="appendix" ${s.articleScope==='appendix'?'selected':''}>別表・別記</option><option value="all" ${s.articleScope==='all'?'selected':''}>すべて</option></select></div></div>
 ${tocHTML(doc)}<div class="rp-filter-row"><button class="rp-filter ${s.onlyBookmarked?'active':''}" data-rp="only-book">しおり</button><button class="rp-filter ${s.onlyMarked?'active':''}" data-rp="only-mark">マーカー</button><span class="rp-results" role="status">${NF(counts.length)}件該当 · ${pg}/${pages}ページ</span></div>
 <div class="rp-voicebar" role="group" aria-label="日本語読み上げ"><span class="rp-voiceicon">🔊</span><label for="rp-rate">読み上げ速度</label><select class="rp-input rp-rate" id="rp-rate" data-rp="rate">${[[.7,'0.7倍'],[.85,'0.85倍'],[1,'標準'],[1.15,'1.15倍'],[1.3,'1.3倍'],[1.5,'1.5倍']].map(([n,t])=>`<option value="${n}" ${meta.rate===n?'selected':''}>${t}</option>`).join('')}</select><button class="rp-button rp-secondary" data-rp="speak-page" ${counts.length?'':'disabled'}>▷ 表示中の条文を読む</button><button class="rp-button rp-ghost" data-rp="pause" id="rp-voice-pause" ${speaking?'':'disabled'}>${paused?'再開':'一時停止'}</button><button class="rp-button rp-ghost" data-rp="stop" id="rp-voice-stop" ${speaking?'':'disabled'}>停止</button><span class="rp-muted rp-tts-state" id="rp-tts-state" role="status">${ESC(voiceStatus)}</span></div>
 ${bgmHTML()}
 <details class="rp-reader-controls" id="rp-reader-controls" ${s.controlsOpen?'open':''}><summary>音声・BGM設定とマーカー</summary>${soundSettingsHTML()}<div class="rp-annotation-tools"><div class="rp-annotation-label"><strong>マーカー線</strong><span>条文をドラッグ、または長押しして色を選びます。</span></div><div class="rp-color-row" aria-label="マーカー線の色">${[['yellow','黄'],['mint','緑'],['pink','桃'],['blue','青']].map(([c,t])=>`<button class="rp-paint rp-paint-${c}" data-rp="mark" data-color="${c}" title="選択範囲に${t}色のマーカー線" aria-label="${t}色のマーカー線"><span></span>${t}</button>`).join('')}</div><button class="rp-button rp-ghost rp-speak-selection" data-rp="speak-selection">🔊 選択文を読む</button></div></details>
 <div class="rp-read-meta"><p>本文：${ESC(doc.source)}。条文は学習用に整形して表示します。公式の脚注・図表等は原文で確認してください。</p></div>
 <div class="rp-articles" id="rp-articles">${shown.length?shown.map(articleHTML).join(''):'<div class="rp-empty">一致する条文がありません。検索条件・本則／附則の切替をご確認ください。</div>'}</div>
 ${pages>1?`<nav class="rp-pagination" aria-label="条文ページ"><button class="rp-button rp-secondary" data-rp="page" data-page="${pg-1}" ${pg===1?'disabled':''}>← 前へ</button><span>${pg} / ${pages} ページ</span><button class="rp-button rp-secondary" data-rp="page" data-page="${pg+1}" ${pg===pages?'disabled':''}>次へ →</button></nav>`:''}
 <div class="rp-reader-bottom">${doc.bundled?'':'<button class="rp-button rp-ghost" data-rp="delete-law">取得済み本文を削除</button>'}<a href="${official}" target="_blank" rel="noopener noreferrer">この法令の最新状況をe-Govで確認 ↗</a></div>`}
 <input id="rp-import" type="file" accept=".xml,text/xml,application/xml" hidden>
 </section>`;
}
function tocHTML(doc){
 const headings=new Map();
 for(const article of doc.articles)if(article.zone==='main'&&article.heading&&!headings.has(article.heading))headings.set(article.heading,article.id);
 const last=meta.positions[doc.id];
 if(headings.size<2&&!last)return '';
 return `<div class="rp-navigation-row">${headings.size>1?`<select class="rp-input" id="rp-toc" aria-label="目次から移動"><option value="">目次から移動</option>${[...headings].map(([title,id])=>`<option value="${ESC(id)}">${ESC(title)}</option>`).join('')}</select>`:''}${last?`<button class="rp-button rp-ghost" data-rp="jump" data-id="${ESC(last)}">読んだ位置へ</button>`:''}</div>`;
}
function savedHTML(){
 const items=new Map();
 const get=key=>{
  if(!items.has(key))items.set(key,{book:false,marks:0,note:''});
  return items.get(key);
 };
 meta.bookmarks.forEach(key=>{get(key).book=true;});
 meta.marks.forEach(mark=>{get(bid(mark.lawId,mark.articleId)).marks++;});
 for(const [key,text] of Object.entries(meta.notes))if(text.trim())get(key).note=text.trim();
 const laws=new Map(allLaws().map(info=>[info.id,info.name]));
 const entries=[...items].filter(([key])=>{const [law,article]=key.split('::');return laws.has(law)&&articlePattern.test(article);}).reverse();
 if(!entries.length)return '';
 const size=15,pages=Math.ceil(entries.length/size),page=Math.min(s.savedPage,pages);
 s.savedPage=page;
 return `<section class="rp-saved"><button data-rp="toggle-saved" aria-expanded="${s.savedOpen}" aria-controls="rp-saved-list">しおり・朱引き・メモ <small>${entries.length}条文</small></button><div class="rp-saved-list" id="rp-saved-list" ${s.savedOpen?'':'hidden'}>${s.savedOpen?entries.slice((page-1)*size,page*size).map(([key,item])=>{
  const [law,article]=key.split('::');
  const title=mem.get(law)?.articles.find(a=>a.id===article)?.title||articleLabel(article);
  const labels=[item.book?'しおり':'',item.marks?'マーカー'+item.marks+'件':'',item.note?'メモ '+item.note.slice(0,60):''].filter(Boolean).join(' ／ ');
  return `<button data-rp="open-saved" data-id="${law}" data-val="${article}"><strong>${ESC(laws.get(law))} ${ESC(title)}</strong><small>${ESC(labels)}</small></button>`;
 }).join(''):''}${s.savedOpen&&pages>1?`<div class="rp-pagination"><button data-rp="saved-page" data-page="${page-1}" ${page===1?'disabled':''}>前へ</button><span>${page}/${pages}</span><button data-rp="saved-page" data-page="${page+1}" ${page===pages?'disabled':''}>次へ</button></div>`:''}</div></section>`;
}
function selectionMenu(){
 return `<div class="rp-selection-tray" id="rp-selection-tray" role="group" aria-label="選択範囲のマーカーと読み上げ" hidden>
 <div class="rp-selection-tray-header"><strong>選択箇所にマーカー</strong><button class="rp-mini" data-rp="clear-selection" aria-label="選択を解除">×</button></div>
 <div class="rp-color-row">${[['yellow','黄'],['mint','緑'],['pink','桃'],['blue','青']].map(([color,label])=>`<button class="rp-paint rp-paint-${color}" data-rp="mark" data-color="${color}" aria-label="${label}色で選択範囲をマーク"><span aria-hidden="true"></span>${label}</button>`).join('')}</div>
 <button class="rp-button rp-ghost" data-rp="speak-selection">▷ 選んだ文章を読む</button></div>`;
}
function renderHTML(){
 return `<div class="rp-page"><div class="rp-page-banner"><div><h1>六法書架と朱引き</h1><p>主要六法と試験関連の15法令を収録。条文を読み、気になる箇所に色やメモを残せます。</p></div><div class="rp-banner-symbol" aria-hidden="true">六</div></div>
 <div class="rp-banner-bottom"><span>主要六法・試験関連法令 15本</span><a href="https://laws.e-gov.go.jp/" target="_blank" rel="noopener noreferrer">e-Gov法令検索 ↗</a></div>
 ${savedHTML()}
 <button class="rp-mobile-catalog-button" data-rp="toggle-catalog" aria-controls="rp-catalog" aria-expanded="${s.mobileCatalog}">${s.mobileCatalog?'法令一覧を閉じる':'法令を切り替える'} <span>${ESC(selectedInfo().name)}</span></button>
 <div class="rp-workspace">${catalogHTML()}${readerHTML()}</div>
 <div class="rp-disclaimer"><strong>法令データの出典</strong>　<a href="https://laws.e-gov.go.jp/docs/law-data-basic/8529371-law-api-v1/" target="_blank" rel="noopener noreferrer">e-Gov法令検索・法令API Version1 ↗</a><br>閲覧用に整形しています。改正の施行日、図表・様式・脚注や、試験基準日に適用される条文は、公式原文で確認してください。</div>
 ${selectionMenu()}</div>`;
}
function refresh({keepFocus=false,scroll=true}={}){
 const content=EL('content');if(!content||!readerRoute())return;
 const focus=keepFocus?document.activeElement:null,id=focus?.id;
 const caret=typeof focus?.selectionStart==='number'?[focus.selectionStart,focus.selectionEnd]:null;
 const y=window.scrollY,catalogScroll=EL('rp-catalog')?.scrollTop,listScroll=content.querySelector('.rp-lawlist')?.scrollTop;
 clearSelection();
 content.innerHTML=renderHTML();
 if(catalogScroll)EL('rp-catalog').scrollTop=catalogScroll;
 if(listScroll)content.querySelector('.rp-lawlist').scrollTop=listScroll;
 if(id&&EL(id)){
  const el=EL(id);el.focus({preventScroll:true});
  if(caret&&el.setSelectionRange)try{el.setSelectionRange(...caret);}catch{}
 }
 if(scroll)window.scrollTo(0,y);
 if(activeSpeechArticle)EL('rp-a-'+activeSpeechArticle)?.classList.add('rp-reading-now');
}
function display(){
 prepareRoute();s.readingPack=!mem.has(s.lawId)&&Boolean(EDITION?.has(s.lawId));
 requestAnimationFrame(ensureSelected);return renderHTML();
}
function clearSelection(removeRange=false){
 s.selection=[];
 const tray=EL('rp-selection-tray');if(tray)tray.hidden=true;
 if(removeRange)window.getSelection()?.removeAllRanges();
}
function selectionCapture(){
 const sel=window.getSelection?.();if(!sel||sel.isCollapsed||!sel.rangeCount)return;
 const r=sel.getRangeAt(0),root=EL('rp-articles');if(!root||!root.contains(r.commonAncestorContainer)){clearSelection();return;}
 const result=[];for(const node of root.querySelectorAll('.rp-paragraph')){
  if(!r.intersectsNode(node))continue;
  let begin=0,end=node.textContent.length;
  if(node.contains(r.startContainer)){const t=document.createRange();t.selectNodeContents(node);t.setEnd(r.startContainer,r.startOffset);begin=t.toString().length;}
  if(node.contains(r.endContainer)){const t=document.createRange();t.selectNodeContents(node);t.setEnd(r.endContainer,r.endOffset);end=t.toString().length;}
  if(end>begin)result.push({articleId:node.dataset.artid,block:Number(node.dataset.rpblock),start:begin,end,excerpt:node.textContent.slice(begin,end)});
  if(result.length>80)break;
 }
 if(result.length){
  s.selection=result;
  const tray=EL('rp-selection-tray');if(tray)tray.hidden=false;
 }else clearSelection();
}
function markSelected(color){selectionCapture();if(!s.selection.length){note('先に条文の文章をドラッグ・長押しして選択してください。');return;}
 if(!COLORS.includes(color))return;
 const source=mem.get(s.lawId);if(!source)return;let n=0;
 for(const k of s.selection){
  const block=source.articles.find(a=>a.id===k.articleId)?.blocks[k.block];
  if(!block||block.t.slice(k.start,k.end)!==k.excerpt)continue;
  for(let start=k.start;start<k.end;start+=10000){
   const end=Math.min(k.end,start+10000),exact=block.t.slice(start,end);
   meta.marks.push({id:'m'+Date.now()+'-'+Math.random().toString(36).slice(2,10),lawId:s.lawId,articleId:k.articleId,
    block:k.block,start,end,color,at:Date.now(),excerpt:exact.slice(0,160),checksum:fingerprint(exact)});
   n++;
  }
 }
 if(meta.marks.length>15000)meta.marks=meta.marks.slice(-15000);
 if(n){const saved=writeMeta();clearSelection(true);refresh();if(saved)note('マーカーを保存しました。');}
 else note('選択範囲を条文に結び付けられませんでした。');
}
function getArticle(id){return mem.get(s.lawId)?.articles.find(x=>x.id===id);}
function speaker(){return typeof window.speechSynthesis!=='undefined'&&typeof window.SpeechSynthesisUtterance!=='undefined';}
let speaking=false,paused=false,speakTokens=0,segments=[],segIndex=0,utterance=null,voiceStatus='停止中',activeSpeechArticle='';
function voicesHTML(){
 const voices=(window.speechSynthesis?.getVoices?.()||[]).filter(voice=>/^ja(?:-|_|$)/i.test(voice.lang));
 return '<option value="">端末の既定音声</option>'+voices.map(voice=>`<option value="${ESC(voice.voiceURI)}" ${voice.voiceURI===meta.voice?'selected':''}>${ESC(voice.name)}</option>`).join('');
}
function indicateSpeech(id){
 if(activeSpeechArticle)EL('rp-a-'+activeSpeechArticle)?.classList.remove('rp-reading-now');
 activeSpeechArticle=id;
 if(id)EL('rp-a-'+id)?.classList.add('rp-reading-now');
}
function voiceState(t){
 voiceStatus=t;
 bgm.setSpeaking(speaking&&!paused&&utterance?.volume>0);
 const label=EL('rp-tts-state'),pause=EL('rp-voice-pause'),stop=EL('rp-voice-stop');
 if(label)label.textContent=t;
 if(pause){pause.disabled=!speaking;pause.textContent=paused?'再開':'一時停止';}
 if(stop)stop.disabled=!speaking;
}
function stopVoice(){
 const active=speaking||utterance;
 ++speakTokens;segments=[];segIndex=0;utterance=null;speaking=false;paused=false;indicateSpeech('');
 if(active)try{window.speechSynthesis?.cancel();}catch{}
 voiceState('停止中');
}
function stopReaderAudio(){
 stopVoice();bgm.pause();EL('rp-mark-manager')?.remove();
}
function splitSpeech(str){const parts=String(str).replace(/\s+/g,' ').match(/[^。！？!？\n]+[。！？!？]?/g)||[str],chunks=[];
 for(const part of parts){let cur=part;while(cur.length>150){let cut=cur.lastIndexOf('、',150);if(cut<65)cut=150;else cut++;chunks.push(cur.slice(0,cut));cur=cur.slice(cut);}if(cur.trim())chunks.push(cur.trim());}
 return chunks.slice(0,1500);
}
function getVoice(){const voices=window.speechSynthesis?.getVoices?.()||[];return voices.find(x=>x.lang?.toLowerCase().startsWith('ja')&&(x.voiceURI===meta.voice))||voices.find(x=>x.lang?.toLowerCase().startsWith('ja'))||null;}
function speakNext(token){if(token!==speakTokens||paused||utterance)return;if(segIndex>=segments.length){speaking=false;paused=false;indicateSpeech('');voiceState('読み上げ完了');return;}
 const segment=segments[segIndex++],utter=new SpeechSynthesisUtterance(segment.text);utterance=utter;indicateSpeech(segment.id);utter.lang='ja-JP';utter.rate=meta.rate;utter.pitch=1;utter.volume=meta.voiceVolume/100;const voice=getVoice();if(voice)utter.voice=voice;
 utter.onend=()=>{if(token===speakTokens){utterance=null;requestAnimationFrame(()=>speakNext(token));}};utter.onerror=(event)=>{if(token!==speakTokens)return;stopVoice();voiceState('端末の日本語音声をご確認ください');};
 voiceState(`読み上げ中 ${segIndex}/${segments.length}`);try{window.speechSynthesis.speak(utter);}catch(e){stopVoice();note('この端末では読み上げを開始できません。','bad');}
}
function startSpeech(items){stopVoice();if(!speaker()){note('このブラウザは音声読み上げに対応していません。OSとブラウザの音声機能をご確認ください。','bad');return;}
 const pronounce=LAW_VOICE.reader(meta.readings);
 segments=items.flatMap(item=>{
  const text=item.parts.filter(part=>part.t).map(pronounce).join('。').replace(/。{2,}/g,'。');
  return splitSpeech(text).map(fragment=>({id:item.id,text:fragment}));
 });
 if(!segments.length){note('読み上げる文章を選択してください。');return;}speaking=true;paused=false;const token=speakTokens;speakNext(token);
}
function speechArticle(article){
 return {id:article.id,parts:[{t:article.title,ruby:article.titleRuby},{t:article.caption,ruby:article.captionRuby},...article.blocks]};
}
function speechPage(){
 const law=mem.get(s.lawId);if(!law)return;
 const visible=shownArticles(law).slice((s.page-1)*s.pageSize,s.page*s.pageSize);
 startSpeech(visible.map(speechArticle));
}
function speechSelection(){
 selectionCapture();
 const items=[];
 let remaining=12000;
 for(const selection of s.selection){
  if(!remaining)break;
  const block=getArticle(selection.articleId)?.blocks[selection.block];
  if(!block||block.t.slice(selection.start,selection.end)!==selection.excerpt)continue;
  const end=Math.min(selection.end,selection.start+remaining);
  const part=LAW_VOICE.sliceFragment(block,selection.start,end);
  remaining-=part.t.length;
  items.push({id:selection.articleId,parts:[part]});
 }
 startSpeech(items);
}
function togglePause(){if(!speaker()||!speaking){note('先に読み上げを開始してください。');return;}try{if(paused){window.speechSynthesis.resume();paused=false;if(!utterance)speakNext(speakTokens);}else{window.speechSynthesis.pause();paused=true;}voiceState(paused?'一時停止中':`読み上げ中 ${segIndex}/${segments.length}`);}catch(e){note('一時停止に失敗しました。');}}
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
 if(op==='jump'){jumpTo(id);return;}
 if(op==='clear-selection'){clearSelection(true);return;}
 if(op==='toggle-saved'){s.savedOpen=!s.savedOpen;refresh();return;}
 if(op==='saved-page'){s.savedPage=Number(el.dataset.page)||1;refresh();return;}
 if(op==='open-saved'){onSelect(id,v);return;}
 if(op==='copy-link'){
  const href=new URL(lawURL(s.lawId,id),location.href).href;
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(href).then(()=>note('条文リンクをコピーしました。')).catch(()=>window.prompt('条文のリンク',href));
  else window.prompt('条文のリンク',href);
  return;
 }
 if(op==='toggle-index'){s.indexOpen=!s.indexOpen;refresh();if(s.indexOpen&&officialIndex===null)loadOfficialIndex(false);return;}
 if(op==='load-index'){loadOfficialIndex(true);return;}
 if(op==='add-index'){if(!/^[0-9A-Z]{10,22}$/.test(id))return;if(!allLaws().some(x=>x.id===id)){meta.custom.push({id,name:(el.dataset.name||id).slice(0,80),group:'追加法令',topic:'公式法令一覧'});writeMeta();}s.group='all';onSelect(id);note('法令を追加しました。条文を取得すると閲覧できます。');return;}
 if(op==='add-law'){const raw=(EL('rp-add-id')?.value||'').trim().toUpperCase();if(!/^[0-9A-Z]{10,22}$/.test(raw)){note('e-Govで確認した10〜22文字の法令IDを入力してください。');return;}if(!allLaws().some(x=>x.id===raw)){meta.custom.push({id:raw,name:'追加法令 '+raw,group:'追加法令',topic:'公式API'});writeMeta();}s.group='all';onSelect(raw);note('法令を追加しました。公式条文を取得してください。');return;}
 if(op==='fetch'){fetchCurrent(true);return;}
 if(op==='bulk'){fetchSix();return;}
 if(op==='choose-xml'){EL('rp-import')?.click();return;}
 if(op==='page'){stopVoice();s.page=Number(el.dataset.page)||1;const first=shownArticles(mem.get(s.lawId))[(s.page-1)*s.pageSize];if(first){meta.positions[s.lawId]=first.id;writeMeta();}refresh({scroll:false});EL('rp-articles')?.scrollIntoView({behavior:'instant',block:'start'});return;}
 if(op==='only-mark'){s.onlyMarked=!s.onlyMarked;s.page=1;refresh();return;}
 if(op==='only-book'){s.onlyBookmarked=!s.onlyBookmarked;s.page=1;refresh();return;}
 if(op==='mark'){markSelected(el.dataset.color);return;}
 if(op==='bookmark'){const key=bid(s.lawId,id),at=meta.bookmarks.indexOf(key);if(at<0)meta.bookmarks.push(key);else meta.bookmarks.splice(at,1);writeMeta();refresh();note(at<0?'条文をブックマークしました。':'ブックマークを外しました。');return;}
 if(op==='note-toggle'){
  const box=EL('rp-note-'+id),key=bid(s.lawId,id);
  if(box){
   box.hidden=!box.hidden;el.setAttribute('aria-expanded',String(!box.hidden));
   if(box.hidden){s.noteIds.delete(key);refresh();}
   else{s.noteIds.add(key);box.querySelector('textarea')?.focus();}
  }
  return;
 }
 if(op==='marks-manage'){manageMarks(id);return;}
 if(op==='close-manager'){EL('rp-mark-manager')?.remove();return;}
 if(op==='delete-mark'){meta.marks=meta.marks.filter(x=>x.id!==id);writeMeta();EL('rp-mark-manager')?.remove();refresh();note('マーカーを削除しました。');return;}
 if(op==='speak-article'){const article=getArticle(id);if(article)startSpeech([speechArticle(article)]);return;}
 if(op==='speak-selection'){speechSelection();return;}
 if(op==='speak-page'){speechPage();return;}
 if(op==='toggle-bgm'){bgm.toggle();return;}
 if(op==='remove-reading'){removeReading(id);return;}
 if(op==='pause'){togglePause();return;}
 if(op==='stop'){stopVoice();return;}
 if(op==='delete-law'){if(!confirm(`${selectedInfo().name}の保存済み本文を端末から削除しますか？\nマーカー・メモ・ブックマークは残ります。`))return;const lawId=s.lawId;mem.delete(lawId);storeDelete(lawId).then(()=>{refresh();note('本文データを削除しました。');}).catch(()=>note('保存済み本文を削除できませんでした。','bad'));refresh();return;}
}
function handlerInput(ev){const el=ev.target;if(!readerRoute())return;
 if(updateVolume(el))return;
 if(!ev.isComposing&&el.id==='rp-textsearch'&&s.textFilter!==el.value.slice(0,150)){s.textFilter=el.value.slice(0,150);s.page=1;stopVoice();refresh({keepFocus:true});}
 if(!ev.isComposing&&el.id==='rp-lawfilter'&&s.lawFilter!==el.value.slice(0,150)){s.lawFilter=el.value.slice(0,150);refresh({keepFocus:true});}
 if(!ev.isComposing&&el.id==='rp-index-search'&&s.indexSearch!==el.value.slice(0,120)){s.indexSearch=el.value.slice(0,120);refresh({keepFocus:true});}
 if(el.dataset.rp==='note-input'){
  const key=bid(s.lawId,el.dataset.id);if(el.value.trim())meta.notes[key]=el.value.slice(0,4000);else delete meta.notes[key];writeMeta();
 }
}
function handlerChange(ev){const el=ev.target;if(!readerRoute())return;
 if(el.id==='rp-scope'){stopVoice();s.articleScope=el.value;s.page=1;refresh({keepFocus:true});}
 if(el.id==='rp-toc'&&el.value)jumpTo(el.value);
 if(el.id==='rp-voice'){meta.voice=el.value;writeMeta();}
 if(el.id==='rp-bgm-duck'){meta.bgmDuck=el.checked;syncBgmSettings();writeMeta();}
 if(updateVolume(el))writeMeta();
 if(el.id==='rp-rate'){meta.rate=Number(el.value)||1;writeMeta();note('次の読み上げから速度を変更します。');}
 if(el.id==='rp-import'){const f=el.files?.[0];if(f)importXml(f);el.value='';}
}
let bound=false;
function bind(){if(bound)return;bound=true;document.addEventListener('click',handlerClick);document.addEventListener('input',handlerInput);document.addEventListener('change',handlerChange);
 document.addEventListener('compositionend',handlerInput);
 document.addEventListener('submit',saveReading);
 document.addEventListener('toggle',event=>{
  if(event.target.id==='rp-reader-controls')s.controlsOpen=event.target.open;
  if(event.target.id==='rp-reading-rules')s.readingsOpen=event.target.open;
  if(event.target.id==='rp-add-tools')s.addOpen=event.target.open;
 },true);
 document.addEventListener('pointerdown',event=>{
  if(!readerRoute()||!s.selection.length)return;
  if(event.target.closest('[data-rp="mark"],[data-rp="speak-selection"],#rp-selection-tray')){
   if(event.pointerType==='mouse')event.preventDefault();
  }else if(!event.target.closest('.rp-paragraph'))clearSelection();
 });
 window.speechSynthesis?.addEventListener?.('voiceschanged',()=>{const select=EL('rp-voice');if(select)select.innerHTML=voicesHTML();});
 document.addEventListener('selectionchange',()=>{if(readerRoute())selectionCapture();});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){EL('rp-mark-manager')?.remove();if(s.selection.length)clearSelection(true);}
  if(e.key==='Enter'&&!e.isComposing&&e.target.id==='rp-textsearch'){
   const shown=shownArticles(mem.get(s.lawId));if(shown.length===1){e.preventDefault();jumpTo(shown[0].id);}
  }
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopReaderAudio();});
 window.addEventListener('pagehide',stopReaderAudio);
 window.addEventListener('hashchange',()=>{if(!readerRoute())stopReaderAudio();});
}
function exportMeta(){return JSON.parse(JSON.stringify(meta));}
function importMeta(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return false;
 const previous=meta;meta=cleanMeta(data);
 if(!writeMeta()){meta=previous;return false;}
 s.lawId=allLaws().some(item=>item.id===meta.lastLaw)?meta.lastLaw:CATALOG[0][0];
 handledHash=null;stopReaderAudio();syncBgmSettings();refresh();return true;
}
function resetMeta(){meta=fresh();s.lawId=meta.lastLaw;handledHash=null;writeMeta();stopReaderAudio();syncBgmSettings();refresh();}
window.GYOSHI_ROPPO={render:display,bind,stop:stopReaderAudio,references,exportMeta,importMeta,resetMeta,getCatalog:allLaws,__test:{readXml,splitSpeech,shownArticles,normalizeText,cleanMeta,meta:()=>meta,mem,s}};
bind();
})();
