/* 裁判所公開裁判例の書架。本文は必要な分だけ読み込み、学習記録は既存バックアップへ保存。 */
(function(){
'use strict';
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
function readableDate(value){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value||'');return match?`${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`:value;}
function eraDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
 const [name,base]=value>='2019-05-01'?['令和',2018]:value>='1989-01-08'?['平成',1988]:['昭和',1925];
 const [y,m,d]=value.split('-').map(Number),year=y-base;
 return `${name}${year}年${m}月${d}日`+(year===1?` ${name}元年${m}月${d}日`:'');
}
const colors=['yellow','mint','pink','blue'];
const states={unread:'未学習',learning:'復習中',mastered:'確認済み'};
const distinctHolding=r=>r.holding&&!fold(r.summary).includes(fold(r.holding))?r.holding:'';
const pageSize=20;
const bodyPageSize=20000;
const releaseQuery=document.currentScript?new URL(document.currentScript.src).search:'';
let host,manifest,records=[],byId=new Map(),loadTask,error='',bodyError='',bodyLoading='',lastHash='';
const bodies=new Map(),shards=new Map();
const view={q:'',category:'all',status:'all',page:1,bodyPage:1,id:'',listOpen:true};
let selection=null,activeId='',searchTimer;
function cleanProgress(value){
 const out=Object.create(null);
 if(!value||typeof value!=='object'||Array.isArray(value))return out;
 for(const [id,p] of Object.entries(value)){
  if(['__proto__','constructor','prototype'].includes(id)||!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||!p||typeof p!=='object')continue;
  out[id]={bookmarked:p.bookmarked===true,status:Object.hasOwn(states,p.status)?p.status:'unread',note:typeof p.note==='string'?p.note.slice(0,4000):'',marks:[]};
  if(Array.isArray(p.marks))out[id].marks=p.marks.filter(m=>m&&Number.isInteger(m.start)&&Number.isInteger(m.end)&&m.start>=0&&m.end>m.start&&colors.includes(m.color)&&typeof m.quote==='string'&&m.quote.length===m.end-m.start&&m.quote.length<=10000).slice(0,200).map(m=>({start:m.start,end:m.end,color:m.color,quote:m.quote}));
 }
 return out;
}
const progress=()=>host?.getProgress()||{};
const recordState=id=>progress()[id]||{bookmarked:false,status:'unread',note:'',marks:[]};
function update(id,patch){
 if(!byId.has(id))return;
 const all=progress(),old=all[id];all[id]={...recordState(id),...patch};
 if(!host.save()){
  if(old)all[id]=old;else delete all[id];
  host.notify('保存できませんでした。端末の空き容量を確認し、学習データをバックアップしてください。');
 }
}
function routeActive(){return location.hash.split('?')[0]==='#cases';}
function syncRoute(){
 if(lastHash===location.hash)return;
 if(lastHash)window.GYOSHI_ROPPO?.stop();
 lastHash=location.hash;
 const params=new URLSearchParams(location.hash.split('?')[1]||'');
 if(view.id!==(params.get('id')||'')){bodyError='';selection=null;}
 view.id=params.get('id')||'';view.q=(params.get('q')||'').slice(0,150);
 view.page=1;view.bodyPage=1;view.category='all';view.status='all';view.listOpen=!view.id||window.innerWidth>1000;
}
function setRoute(){
 const p=new URLSearchParams();if(view.id)p.set('id',view.id);if(view.q)p.set('q',view.q);
 lastHash='#cases'+(p.size?'?'+p:'');history.replaceState(null,'',lastHash);
}
async function readJSON(path){
 const url=new URL(path,new URL('cases/',location.href));
 if(url.origin!==location.origin||!url.pathname.startsWith(new URL('cases/',location.href).pathname))throw Error('収録ファイルのパスが不正です');
 url.search=releaseQuery;
 const response=await fetch(url);
 if(!response.ok)throw Error('収録ファイルを読み込めません（'+response.status+'）');
 if(!path.endsWith('.gz'))return response.json();
 const bytes=new Uint8Array(await response.arrayBuffer());
 return JSON.parse(bytes[0]===31&&bytes[1]===139?window.pako.ungzip(bytes,{to:'string'}):new TextDecoder().decode(bytes));
}
async function load(){
 if(loadTask)return loadTask;
 error='';
 loadTask=(async()=>{
  manifest=await readJSON('manifest.json');
  records=await readJSON(manifest.index||'index.json.gz');
  if(!Array.isArray(records)||records.length!==manifest.total)throw Error('裁判例の収録件数が一致しません');
  byId=new Map(records.map(r=>[String(r.id),r]));
  if(byId.size!==records.length)throw Error('裁判例の識別番号が重複しています');
  for(const r of records){r.id=String(r.id);const note=window.GYOSHI_CASE_NOTES?.[r.id];r.displayTitle=note?.title||r.title;r._search=fold([r.title,r.caseNumber,r.court,r.date,readableDate(r.date),eraDate(r.date),r.summary,r.holding,r.lawReferences,note?.title,...(note?.keywords||[])].join(' '));}
  if(routeActive())host.refresh();
 })().catch(e=>{error=e.message;loadTask=null;if(routeActive())host.refresh();});
 return loadTask;
}
async function bodyFor(record){
 if(!record?.bodyShard)return '';
 if(bodies.has(record.id))return bodies.get(record.id);
 let task=shards.get(record.bodyShard);
 if(!task){
  task=readJSON(record.bodyShard).then(data=>{
   for(const [id,text] of Object.entries(data))if(typeof text==='string')bodies.set(id,text);
   while(bodies.size>700)bodies.delete(bodies.keys().next().value);
   return data;
  }).catch(e=>{shards.delete(record.bodyShard);throw e;});
  shards.set(record.bodyShard,task);
  while(shards.size>4)shards.delete(shards.keys().next().value);
 }
 const data=await task;const text=data[record.id]||'';bodies.set(record.id,text);return text;
}
function requestBody(record){
 if(!record?.bodyShard||bodies.has(record.id)||bodyLoading===record.id)return;
 bodyLoading=record.id;bodyError='';
 bodyFor(record).then(text=>{
  if(bodyLoading===record.id)bodyLoading='';
  if(view.id===record.id){if(!text)bodyError='本文データが見つかりません。公式原文をご確認ください。';refreshReader();}
 }).catch(()=>{
  if(bodyLoading===record.id)bodyLoading='';
  if(view.id===record.id){bodyError='本文を読み込めませんでした。通信状態を確認して再試行してください。';refreshReader();}
 });
}
function filtered(){
 const words=fold(view.q).split(' ').filter(Boolean),saved=progress();
 return records.filter(r=>{
  const p=saved[r.id];
  return (view.category==='all'||r.category===view.category||(r.classifications||r.categories||[]).includes(view.category))&&
   (view.status==='all'||(view.status==='bookmarked'?p?.bookmarked:(p?.status||'unread')===view.status))&&words.every(w=>r._search.includes(w));
 });
}
function resultsHTML(){
 const matches=filtered(),pages=Math.max(1,Math.ceil(matches.length/pageSize));view.page=Math.max(1,Math.min(view.page,pages));
 const slice=matches.slice((view.page-1)*pageSize,view.page*pageSize);
 return `<details class="cl-list" ${view.listOpen?'open':''} id="cl-list"><summary>検索結果 <strong id="cl-count" role="status" aria-live="polite">${matches.length.toLocaleString('ja-JP')}</strong>件 <span>一覧を開閉</span></summary>
 <div class="cl-result-items">${slice.map(r=>`<button class="cl-result ${view.id===r.id?'is-selected':''}" data-cl="open" data-id="${E(r.id)}" aria-current="${view.id===r.id?'true':'false'}"><span class="cl-result-meta">${E(r.date||'年月日不明')} · ${E(r.category||'裁判例')}${recordState(r.id).bookmarked?' · ★':''}</span><strong>${E(r.displayTitle||r.title||r.caseNumber||'裁判例')}</strong><span>${E(r.caseNumber)} / ${E(r.court)}</span></button>`).join('')||'<p class="empty-msg">条件に一致する裁判例がありません。検索語や絞り込みを変えてください。</p>'}</div>
 <nav class="cl-pages" aria-label="裁判例のページ"><button class="button secondary small" data-cl="page" data-page="${view.page-1}" ${view.page===1?'disabled':''}>前へ</button><span>${view.page} / ${pages}</span><button class="button secondary small" data-cl="page" data-page="${view.page+1}" ${view.page===pages?'disabled':''}>次へ</button></nav></details>`;
}
function textHTML(text,id,offset=0,limit=text.length){
 const marks=recordState(id).marks.filter(m=>text.slice(m.start,m.end)===m.quote);
 const endAt=Math.min(text.length,offset+limit);
 const boundaries=new Set([offset,endAt]);for(const m of marks){if(m.start>offset&&m.start<endAt)boundaries.add(m.start);if(m.end>offset&&m.end<endAt)boundaries.add(m.end);}
 const positions=[...boundaries].sort((a,b)=>a-b),html=[];
 for(let i=0;i<positions.length-1;i++){
  const start=positions[i],end=positions[i+1],mark=marks.findLast(m=>m.start<=start&&m.end>=end);
  const part=text.slice(start,end),formatted=window.GYOSHI_GUIDE?.inlineText(part)||E(part);
  html.push(mark?`<mark class="cl-mark cl-${mark.color}">${formatted}</mark>`:formatted);
 }
 return html.join('');
}
function external(url,label){
 try{const u=new URL(url);if(u.protocol!=='https:'||!/(^|\.)courts\.go\.jp$/.test(u.hostname))return '';return `<a class="button secondary small" href="${E(u.href)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;}catch{return '';}
}
function readerHTML(){
 const r=byId.get(view.id);
 if(!r)return `<section class="cl-reader cl-empty"><span class="cl-seal" aria-hidden="true">判</span><h2>${view.id?'指定された裁判例が見つかりません':'裁判例を選んで読む'}</h2><p>事件名・事件番号・裁判所・裁判要旨から検索できます。<br>本文を開くと、用語解説、音声、しおり、メモ、4色マーカーを使えます。</p></section>`;
 const p=recordState(r.id),body=bodies.get(r.id)||'',emptyBody=bodies.has(r.id)&&!body;
 const bodyPages=Math.max(1,Math.ceil(body.length/bodyPageSize));view.bodyPage=Math.max(1,Math.min(view.bodyPage,bodyPages));
 const bodyOffset=(view.bodyPage-1)*bodyPageSize,studyNote=window.GYOSHI_CASE_NOTES?.[r.id];
 if(r.bodyShard&&!body&&!bodyError)requestBody(r);
 return `<article class="cl-reader ${activeId===r.id?'cl-reading':''}" id="cl-reader" tabindex="-1" data-case-id="${E(r.id)}">
 <header class="cl-reader-head"><p class="overline">${E(r.category||'裁判例')} · ${E(r.date)}</p><h2>${E(r.displayTitle||r.title||r.caseNumber||'裁判例')}</h2><p class="cl-case-meta">${r.displayTitle!==r.title?E(r.title)+'<br>':''}${E(r.court)}<br>${E(r.caseNumber)}</p><div class="cl-actions">
 <button class="button secondary small" data-cl="bookmark" aria-pressed="${p.bookmarked}">${p.bookmarked?'★ しおり済み':'☆ しおり'}</button><button class="button small" data-cl="speak">ここから読む</button><button class="button ghost small" data-cl="copy">リンクをコピー</button></div></header>
 <div class="cl-study"><label for="cl-status">学習状態</label><select id="cl-status" class="select" data-cl="status">${Object.entries(states).map(([k,v])=>`<option value="${k}" ${p.status===k?'selected':''}>${v}</option>`).join('')}</select><span class="small muted">記録は学習バックアップに含まれます</span></div>
 ${r.summary?`<section class="cl-summary"><h3>判示事項・要旨</h3><p>${window.GYOSHI_GUIDE?.inlineText(r.summary)||E(r.summary)}</p></section>`:''}
 ${distinctHolding(r)?`<section class="cl-summary cl-holding"><h3>裁判要旨</h3><p>${window.GYOSHI_GUIDE?.inlineText(r.holding)||E(r.holding)}</p></section>`:''}
 ${r.lawReferences?`<section class="cl-references"><h3>参照法条</h3><p>${window.GYOSHI_GUIDE?.inlineText(r.lawReferences)||E(r.lawReferences)}</p><div class="law-links">${(/旧|廃止|改正前/.test(r.lawReferences)?[]:window.GYOSHI_ROPPO?.references(r.lawReferences)||[]).map(link=>`<a class="button secondary small" href="${E(link.href)}">${E(link.label)}</a>`).join('')}</div><p class="small muted">条文リンクは収録中の法令版です。判決当時の条文とは異なる場合があります。</p></section>`:''}
 ${studyNote?`<details class="cl-notes cl-study-note"><summary>試験学習の要点 · ${E(studyNote.title)}</summary><p class="small muted">${E(studyNote.editorialNote)}</p><button class="button secondary small" data-cl="speak-note">学習の要点を読む</button><h3>事案</h3><p>${E(studyNote.facts)}</p><h3>判断のポイント</h3><p>${E(studyNote.holding)}</p><ul>${studyNote.examPoints.map(x=>`<li>${E(x)}</li>`).join('')}</ul><div class="law-links">${studyNote.lawRefs.map(x=>`<a class="button secondary small" href="#roppo?law=${encodeURIComponent(x.lawId)}&amp;article=${encodeURIComponent(/^\d/.test(x.article)?'main-'+x.article:x.article)}">${E(x.label)}</a>`).join('')}</div></details>`:''}
 <div class="cl-source">${external(r.sourceUrl,'裁判所の詳細')}${external(r.pdfUrl,'公式原文（PDF）')}</div>
 <details class="cl-notes"><summary>学習メモ${p.note?' · 記入あり':''}</summary><label for="cl-note">この裁判例のメモ（自動保存）</label><textarea id="cl-note" class="text-area" data-cl="note" maxlength="4000" rows="4" placeholder="争点・判断の理由・関連条文を記録">${E(p.note)}</textarea></details>
 <section class="cl-text-section"><h3>判決・決定の本文</h3>${r.textStatus==='ocr-partial'?'<p class="notice info">一部のページは文字認識できませんでした。本文中の未認識ページの案内と、公式PDFを併せて確認してください。</p>':''}<p class="small muted">${['ocr','ocr-partial'].includes(r.textStatus)?'画像PDFから文字認識（OCR）した本文です。誤認識の可能性があるため、引用・正確な表記は公式PDFで確認してください。':'公開原文からの抽出テキストです。改行・文字の欠落は公式PDFで確認できます。'}下線の用語を押すと解説が開きます。</p>
 <div class="cl-mark-tools" role="group" aria-label="裁判例のマーカー"><span>本文を選択して色を選ぶ</span>${colors.map((c,i)=>`<button class="cl-color cl-${c}" data-cl="mark" data-color="${c}" aria-label="${['黄色','緑色','桃色','青色'][i]}のマーカー">${['黄','緑','桃','青'][i]}</button>`).join('')}${p.marks.length?'<button class="button ghost small" data-cl="clear-marks">マーカーを消す</button>':''}</div>
 ${body?`${bodyPages>1?`<nav class="cl-pages" aria-label="裁判例本文のページ"><button class="button secondary small" data-cl="body-page" data-page="${view.bodyPage-1}" ${view.bodyPage===1?'disabled':''}>本文の前へ</button><span>本文 ${view.bodyPage} / ${bodyPages}</span><button class="button secondary small" data-cl="body-page" data-page="${view.bodyPage+1}" ${view.bodyPage===bodyPages?'disabled':''}>本文の次へ</button></nav><p class="small muted">長い本文は分割して表示します。読み上げは全文を対象に続きます。</p>`:''}<div class="cl-body" id="cl-body" data-offset="${bodyOffset}">${textHTML(body,r.id,bodyOffset,bodyPageSize)}</div>`:bodyError?`<div class="notice" role="alert">${E(bodyError)} <button class="button secondary small" data-cl="retry-body">再試行</button></div>`:r.bodyShard&&!emptyBody?'<p role="status">本文を読み込んでいます…</p>':`<p class="notice info">${E(r.textUnavailableReason||'この裁判例は抽出本文が未収録です。')}取得済みの事件情報・要旨は読み上げられます。原文は上の裁判所の詳細ページから確認できます。</p>`}
 ${p.marks.length?`<details class="cl-notes"><summary>保存したマーカー ${p.marks.length}件</summary><ul class="cl-mark-list">${p.marks.map((m,i)=>`<li><span class="cl-mark cl-${m.color}">${E(m.quote.slice(0,70))}${m.quote.length>70?'…':''}</span><button class="button ghost small" data-cl="delete-mark" data-index="${i}" aria-label="${i+1}番目のマーカーを削除">削除</button></li>`).join('')}</ul></details>`:''}</section></article>`;
}
function coverageHTML(){
 if(!manifest)return '';
 const count=manifest.total.toLocaleString('ja-JP'),bodyCount=Number(manifest.bodyCount||0).toLocaleString('ja-JP');
 return `<p class="cl-coverage">収録 ${count}件 · 本文 ${bodyCount}件${manifest.partialBodyCount?`（うち一部のみ文字認識 ${Number(manifest.partialBodyCount).toLocaleString('ja-JP')}件）`:''} · 取得日 ${E(manifest.updatedAt||'')}<br>${manifest.coverageComplete?'公式検索の対象範囲と収録件数を照合済み。':'全公開裁判例の収録を目指して取得中です。全件との照合は未完了です。'} <a href="cases/manifest.json" target="_blank" rel="noopener">収録状況</a></p>`;
}
function sourcesHTML(){
 const link=(url,label)=>{try{const u=new URL(url);return u.protocol==='https:'?`<a href="${E(u.href)}" target="_blank" rel="noopener noreferrer">${E(label)}</a>`:E(label);}catch{return E(label);}};
 return `<details class="cl-notes cl-sources"><summary>収録範囲と出典</summary><p>対象は裁判所の公開裁判例データベース掲載分です。国内で言い渡されたすべての裁判を意味するものではありません。事件情報と取得済み本文を収録し、原文へのリンクを付けています。</p><ul>${(manifest.attribution||[]).map(s=>`<li>${link(s.url,s.name)} · ${s.licenseUrl?link(s.licenseUrl,s.license):E(s.license)}${s.changes?`<p>${E(s.changes)}</p>`:''}</li>`).join('')}</ul><p>抽出本文のない裁判例も、検索・しおり・メモ・学習記録に対応します。読み上げは取得済みの本文・裁判要旨を対象とします。</p></details>`;
}
function render(){
 syncRoute();
 if(!loadTask&&!manifest&&!error)queueMicrotask(load);
 const categories=[...new Set(records.flatMap(r=>r.classifications||r.categories||[r.category]).filter(Boolean))].sort();
 return `<div class="cl-page"><header class="page-banner cl-banner"><p class="overline">裁判例を、日々の学習に</p><h1>判例書架</h1><p>裁判所が公開する裁判例を検索し、読んで、聞いて、書き込む。</p>${coverageHTML()}</header>
 ${error?`<div class="notice" role="alert">${E(error)} <button class="button secondary" data-cl="retry">再試行</button></div>`:!manifest||!records.length?'<div class="card" role="status">裁判例の検索索引を読み込んでいます…</div>':`
 <div class="cl-filters card"><label for="cl-search">事件名・事件番号・裁判所・裁判要旨<input id="cl-search" type="search" class="text-input" value="${E(view.q)}" maxlength="150" placeholder="例：原告適格　最高裁" data-cl="search"></label><label for="cl-category">裁判例の区分<select class="select" id="cl-category" data-cl="category"><option value="all">すべての区分</option>${categories.map(c=>`<option ${view.category===c?'selected':''}>${E(c)}</option>`).join('')}</select></label><label for="cl-filter">学習記録<select class="select" id="cl-filter" data-cl="filter">${Object.entries({all:'すべて',bookmarked:'しおり',...states}).map(([k,v])=>`<option value="${k}" ${view.status===k?'selected':''}>${v}</option>`).join('')}</select></label></div>
 <div class="cl-audio"><button class="button secondary small" data-cl="speak-results">検索結果を順に読む</button>${window.GYOSHI_ROPPO?.playbackControlsHTML('cl')||''}<span data-voice-state role="status"></span></div>
 <div class="cl-workspace"><div id="cl-results">${resultsHTML()}</div><div id="cl-detail">${readerHTML()}</div></div>${sourcesHTML()}`}</div>`;
}
function refreshReader(){const el=document.getElementById('cl-detail');if(el)el.innerHTML=readerHTML();}
function refreshResults(){const el=document.getElementById('cl-results');if(el)el.innerHTML=resultsHTML();}
function open(id,{audio=false}={}){
 if(!byId.has(id))return;
 if(!audio)window.GYOSHI_ROPPO?.stop();
 selection=null;view.id=id;view.bodyPage=1;bodyError='';view.listOpen=window.innerWidth>1000;setRoute();refreshResults();refreshReader();
 document.getElementById('cl-reader')?.scrollIntoView({block:'start',behavior:'instant'});
 if(!audio)document.getElementById('cl-reader')?.focus({preventScroll:true});
}
function speak(id){
 let list=filtered();
 const requested=id||view.id;
 let start=list.findIndex(r=>r.id===requested);
 if(requested&&start<0&&byId.has(requested)){list=[byId.get(requested)];start=0;}
 if(!list.length)return false;
 start=Math.max(0,start);
 const items=list.map(r=>({id:r.id,title:r.displayTitle||r.title||r.caseNumber}));
 window.GYOSHI_ROPPO?.speakItems(items,{kind:'case',startIndex:start,withMeanings:false,
  resolveItem:async(item)=>{const r=byId.get(item.id),text=await bodyFor(r),holding=distinctHolding(r);return {...item,parts:[{t:[r.displayTitle||r.title,readableDate(r.date),r.court,r.caseNumber,r.summary?'判示事項・要旨。'+r.summary:'',holding?'裁判要旨。'+holding:'',r.lawReferences?'参照法条。'+r.lawReferences:''].filter(Boolean).join('。')},{t:text?'判決・決定の本文。'+text:(r.textUnavailableReason||'抽出本文は未収録です。公式原文をご確認ください。')}]};},
  onItem:(item,index)=>{view.page=Math.floor(index/pageSize)+1;activeId=item.id;open(item.id,{audio:true});}
 });return true;
}
function captureSelection(){
 if(!routeActive())return;
 const sel=window.getSelection?.(),body=document.getElementById('cl-body');
 if(!sel?.rangeCount||sel.isCollapsed||!body)return;
 const range=sel.getRangeAt(0);selection=null;if(!body.contains(range.startContainer)||!body.contains(range.endContainer))return;
 const before=document.createRange();before.selectNodeContents(body);before.setEnd(range.startContainer,range.startOffset);
 const start=before.toString().length+Number(body.dataset.offset||0),end=start+range.toString().length;
 if(end>start&&end-start<=10000)selection={id:view.id,start,end,quote:range.toString()};
}
document.addEventListener('selectionchange',captureSelection);
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-cl]');if(!b||!routeActive())return;
 const op=b.dataset.cl;
 if(op==='open')open(b.dataset.id);
 if(op==='page'){window.GYOSHI_ROPPO?.stop();view.page=Number(b.dataset.page);view.listOpen=true;refreshResults();document.getElementById('cl-results')?.scrollIntoView({block:'start'});}
 if(op==='body-page'){selection=null;view.bodyPage=Number(b.dataset.page);refreshReader();document.getElementById('cl-body')?.scrollIntoView({block:'start'});}
 if(op==='retry'){manifest=null;loadTask=null;load();host.refresh();}
 if(op==='retry-body'){bodyError='';requestBody(byId.get(view.id));refreshReader();}
 if(op==='bookmark'){const p=recordState(view.id);update(view.id,{bookmarked:!p.bookmarked});refreshReader();refreshResults();}
 if(op==='speak')speak(view.id);
 if(op==='speak-note'){const note=window.GYOSHI_CASE_NOTES?.[view.id];if(note)window.GYOSHI_ROPPO?.speakItems([{id:view.id,title:note.title,parts:[note.title,note.facts,note.holding,...note.examPoints].map(t=>({t}))}],{kind:'case-note',continuous:false});}
 if(op==='speak-results'){const first=filtered()[0];if(first)speak(first.id);else host.notify('読み上げる検索結果がありません。');}
 if(op==='copy'){try{await navigator.clipboard.writeText(new URL(lastHash,location.href).href);host.notify('裁判例へのリンクをコピーしました。');}catch{host.notify('コピーできませんでした。ブラウザのアドレス欄からリンクをコピーできます。');}}
 if(op==='mark'){
  if(!selection||selection.id!==view.id){host.notify('先に本文の文字を選択してください。');return;}
  const {start,end,quote}=selection,p=recordState(view.id),text=bodies.get(view.id)||'';
  if(text.slice(start,end)!==quote)return;
  if(p.marks.length>=200){host.notify('1件につきマーカーは200個まで保存できます。');return;}
  update(view.id,{marks:[...p.marks,{start,end,quote,color:b.dataset.color}]});selection=null;window.getSelection()?.removeAllRanges();refreshReader();
 }
 if(op==='clear-marks'&&confirm('この裁判例のマーカーをすべて消しますか？')){update(view.id,{marks:[]});refreshReader();}
 if(op==='delete-mark'){update(view.id,{marks:recordState(view.id).marks.filter((_,i)=>i!==Number(b.dataset.index))});refreshReader();}
});
function input(event){
 const el=event.target;if(!routeActive()||event.isComposing)return;
 if(el.dataset.cl==='note')update(view.id,{note:el.value.slice(0,4000)});
 if(el.dataset.cl==='search'){
  clearTimeout(searchTimer);window.GYOSHI_ROPPO?.stop();
  view.q=el.value.slice(0,150);view.page=1;view.listOpen=true;
  searchTimer=setTimeout(()=>{if(!routeActive()||!el.isConnected)return;setRoute();refreshResults();},180);
 }
}
document.addEventListener('input',input);document.addEventListener('compositionend',input);
document.addEventListener('change',event=>{
 const el=event.target;if(!routeActive())return;
 if(el.dataset.cl==='status'){update(view.id,{status:el.value});refreshResults();}
 if(['category','filter'].includes(el.dataset.cl)){
  window.GYOSHI_ROPPO?.stop();view[el.dataset.cl==='category'?'category':'status']=el.value;view.page=1;view.listOpen=true;refreshResults();
 }
});
document.addEventListener('toggle',event=>{if(event.target.id==='cl-list')view.listOpen=event.target.open;},true);
window.addEventListener('gyoshi:playbackchange',event=>{
 activeId=event.detail.kind==='case'?event.detail.id:'';
 const reader=document.getElementById('cl-reader');reader?.classList.toggle('cl-reading',reader.dataset.caseId===activeId);
});
window.GYOSHI_CASES={init:options=>{host=options;},render,cleanProgress,speak,stop:()=>window.GYOSHI_ROPPO?.stop(),__test:{fold,cleanProgress,textHTML,filtered,view,bodyFor}};
})();
