/* 行政書士 MASTER — すべてブラウザ内で動作。学習結果は端末に保存。 */
(function(){
'use strict';
const D=window.GYOSHI_DATA;
if(!D){document.getElementById('app').textContent='問題データを読み込めません。questions.js と advanced_questions.js を index.html と同じフォルダーに配置してください。';return;}
const KB=Object.assign(Object.create(null),Object.fromEntries(D.questions.map(q=>[q.id,q])));
const CAT=Object.fromEntries(D.categories.map(c=>[c.id,c]));
const KEY='gyosei_master_state_v2';
const GUIDE=window.GYOSHI_GUIDE;
const TABS=[['dashboard','今日の書斎','◈'],['study','問題演習帖','▤'],['weak','復習と弱点','◎'],['library','問題索引','⌕'],['roppo','六法書架','⚖'],['mock','本試験模試','◷'],['written','記述式対策','✎'],['planner','学習暦','▦'],['records','学習記録','▥'],['settings','設定','⚙'],['essentials','これだけは覚える','覚'],['glossary','用語索引','索']];
const TODAY=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const nextDay=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateStr=x=>{const d=new Date(x);return isNaN(d.getTime())?'—':`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;};
const E=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const cap=(n,min,max)=>Math.max(min,Math.min(max,n));
const PC=(n,d)=>d?Math.round(n/d*100):0;
const shuffle=a=>{let x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;};
const fold=value=>String(value??'').normalize('NFKC').toLowerCase().trim();
const routeFromURL=()=>location.hash.slice(1).split('?')[0];
const glossaryViewFromURL=()=>{
 const id=new URLSearchParams(location.hash.split('?')[1]||'').get('law');
 return {search:'',group:'all',law:GUIDE?.lawKey(id)||'all'};
};
const questionSearchText=q=>fold([q.q,q.t,q.x,q.r,q.ref,q.s,...(q.type==='mc'?q.o:[])].filter(Boolean).join(' '));
const validOrder=(order,n)=>Array.isArray(order)&&order.length===n&&new Set(order).size===n&&order.every(i=>Number.isInteger(i)&&i>=0&&i<n);
function cleanAnswer(id,value){
 const type=KB[id].type;
 if(type==='written')return typeof value==='string'?value:null;
 if(type==='mc')return Number.isInteger(value)&&value>=0&&value<5?value:null;
 return Array.isArray(value)?Array.from({length:4},(_,i)=>Number.isInteger(value[i])&&value[i]>=0&&value[i]<20?value[i]:null):null;
}
const blank=()=>({settings:{goal:20,target:'2027-11-14',theme:'light',instant:true,dailyMinutes:45,readable:false},progress:{},bookmarks:[],notes:{},flags:[],logs:[],history:[],exam:null,archivedExams:[],practice:null,essentials:{}});
let storageOK=true;
function normalized(source){
  const b=blank();if(!source||typeof source!=='object'||Array.isArray(source))return b;
  const s=source.settings||{};
  b.settings.goal=[5,10,15,20,30,50,100].includes(Number(s.goal))?Number(s.goal):20;
  b.settings.target=/^20\d\d-\d\d-\d\d$/.test(s.target||'')?s.target:'2027-11-14';
  b.settings.theme=s.theme==='dark'?'dark':'light';b.settings.instant=s.instant!==false;b.settings.dailyMinutes=cap(Number(s.dailyMinutes)||45,10,240);b.settings.readable=s.readable===true;
  if(source.progress&&typeof source.progress==='object')for(const [id,p] of Object.entries(source.progress)){
    if(!KB[id]||!p||typeof p!=='object')continue;
    b.progress[id]={seen:cap(Number(p.seen)||0,0,100000),correct:cap(Number(p.correct)||0,0,100000),wrong:cap(Number(p.wrong)||0,0,100000),streak:cap(Number(p.streak)||0,0,100),due:typeof p.due==='string'?p.due:TODAY(),last:typeof p.last==='string'?p.last:'',lastOk:p.lastOk===true,ease:cap(Number(p.ease)||2.5,1.3,3.2),interval:cap(Number(p.interval)||0,0,3650),lapses:cap(Number(p.lapses)||0,0,100000),lastRatio:cap(Number(p.lastRatio)||0,0,1),lastConfidence:cap(Number(p.lastConfidence)||2,1,3),lastMs:cap(Number(p.lastMs)||0,0,86400000)};
  }
  b.essentials=GUIDE?.cleanProgress(source.essentials)||{};
  b.bookmarks=Array.isArray(source.bookmarks)?[...new Set(source.bookmarks.filter(id=>KB[id]))].slice(0,2000):[];
  b.notes=source.notes&&typeof source.notes==='object'&&!Array.isArray(source.notes)?Object.fromEntries(Object.entries(source.notes).filter(([id,v])=>KB[id]&&typeof v==='string').slice(0,2000).map(([id,v])=>[id,v.slice(0,4000)])):{};
  b.flags=Array.isArray(source.flags)?[...new Set(source.flags.filter(id=>KB[id]))].slice(0,2000):[];
  b.logs=Array.isArray(source.logs)?source.logs.filter(l=>l&&KB[l.id]&&typeof l.date==='string').slice(-25000).map(l=>({id:l.id,date:String(l.date).slice(0,10),ratio:cap(Number(l.ratio)||0,0,1),mode:String(l.mode||'study').slice(0,30)})):[];
  b.history=Array.isArray(source.history)?source.history.filter(h=>h&&['practice','exam'].includes(h.type)).slice(-500).map(h=>({id:String(h.id||''),type:h.type,at:Number(h.at)||0,count:cap(Number(h.count)||0,0,1000),answered:cap(Number(h.answered)||0,0,1000),accuracy:cap(Number(h.accuracy)||0,0,100),score:cap(Number(h.score)||0,0,300),law:cap(Number(h.law)||0,0,244),basic:cap(Number(h.basic)||0,0,56),graded:h.graded===true,mode:String(h.mode||'').slice(0,30),subject:String(h.subject||'').slice(0,30),duration:Math.max(0,Number(h.duration)||0),timed:h.timed===true})):[];
  const ex=source.exam;
  if(ex&&typeof ex==='object'&&Array.isArray(ex.items)&&ex.items.length===60&&ex.items.every(i=>i&&KB[i.id])){
    b.exam={id:String(ex.id||Date.now()),startedAt:Number(ex.startedAt)||Date.now(),deadline:Number(ex.deadline)||Date.now(),index:cap(Math.trunc(Number(ex.index)||0),0,59),finished:ex.finished===true,finishedAt:Number(ex.finishedAt)||0,items:ex.items.map(i=>({id:i.id,order:validOrder(i.order,5)?i.order:[0,1,2,3,4],wordOrder:validOrder(i.wordOrder,20)?i.wordOrder:null,answer:cleanAnswer(i.id,i.answer),flag:i.flag===true})),grades:ex.grades&&typeof ex.grades==='object'?Object.fromEntries(Object.entries(ex.grades).filter(([id,v])=>KB[id]&&KB[id].type==='written'&&v!==null&&Number.isFinite(Number(v))).map(([id,v])=>[id,cap(Number(v),0,20)])): {},recordedWritten:ex.recordedWritten&&typeof ex.recordedWritten==='object'?{...ex.recordedWritten}:{}};
  }
  const pr=source.practice;
  if(pr&&typeof pr==='object'&&Array.isArray(pr.items)&&pr.items.length>=1&&pr.items.length<=1000&&pr.items.every(it=>it&&KB[it.id])){
    const items=pr.items.map(it=>({id:it.id,order:validOrder(it.order,5)?it.order:[0,1,2,3,4],wordOrder:validOrder(it.wordOrder,20)?it.wordOrder:null,answer:cleanAnswer(it.id,it.answer),checked:it.checked===true,grade:it.grade===null||it.grade===undefined?null:cap(Number(it.grade)||0,0,20),confidence:cap(Number(it.confidence)||2,1,3)}));
    b.practice={mode:String(pr.mode||'adaptive').slice(0,20),type:String(pr.type||'mc').slice(0,20),subject:String(pr.subject||'all').slice(0,20),startedAt:Number(pr.startedAt)||Date.now(),deadline:Number(pr.deadline)||0,index:cap(Math.trunc(Number(pr.index)||0),0,items.length-1),items,results:Array.isArray(pr.results)?pr.results.filter(z=>z&&KB[z.id]).slice(0,items.length).map(z=>({id:z.id,ratio:cap(Number(z.ratio)||0,0,1)})):[],finished:pr.finished===true,timed:pr.timed===true};
  }
  b.archivedExams=Array.isArray(source.archivedExams)?source.archivedExams.filter(ex=>ex&&ex.finished===true&&Array.isArray(ex.items)&&ex.items.length===60&&ex.items.every(it=>it&&KB[it.id])).slice(-12).map(ex=>({id:String(ex.id||''),startedAt:Number(ex.startedAt)||0,finishedAt:Number(ex.finishedAt)||0,deadline:Number(ex.deadline)||0,finished:true,index:0,items:ex.items.map(it=>({id:it.id,answer:cleanAnswer(it.id,it.answer),order:validOrder(it.order,5)?it.order:[0,1,2,3,4],wordOrder:validOrder(it.wordOrder,20)?it.wordOrder:null,flag:it.flag===true})),grades:ex.grades&&typeof ex.grades==='object'?Object.fromEntries(Object.entries(ex.grades).filter(([id])=>KB[id]&&KB[id].type==='written').map(([id,v])=>[id,cap(Number(v)||0,0,20)])): {},recordedWritten:{}})):[];
  return b;
}
function load(){try{const s=localStorage.getItem(KEY);return s?normalized(JSON.parse(s)):blank();}catch(err){storageOK=false;return blank();}}
let state=load();
function save(data=state){
 try{localStorage.setItem(KEY,JSON.stringify(data));storageOK=true;return true;}
 catch(err){storageOK=false;return false;}
}
let route=routeFromURL();if(!TABS.some(t=>t[0]===route))route='dashboard';
let ui={sidebar:false,modal:null,practice:state.practice,results:null,study:{c:'all',type:'mc',mode:'adaptive',count:10,difficulty:'all',search:'',timer:0},weakTab:'wrong',weakSearch:'',recordTab:'overview',examReview:false,library:{search:'',c:'all',type:'all',filter:'all',page:1,sort:'subject'},archiveViewing:null,guide:{group:'all',status:'all',openCards:new Set()},glossary:glossaryViewFromURL()};
const app=document.getElementById('app');
const catChip=(id)=>{const c=CAT[id];return `<span class="pill" style="color:${c.color};border-color:${c.color}45">${E(c.name)}</span>`;};
function categoryStats(){return D.categories.map(c=>{const qids=D.questions.filter(q=>q.c===c.id).map(q=>q.id);const ls=state.logs.filter(l=>qids.includes(l.id));return {...c,total:qids.length,seen:qids.filter(id=>state.progress[id]?.seen>0).length,attempts:ls.length,ratio:PC(ls.reduce((x,l)=>x+l.ratio,0),ls.length),due:qids.filter(id=>state.progress[id]?.due<=TODAY()).length};});}
function daysStreak(){const days=new Set(state.logs.map(x=>x.date));let current=TODAY();if(!days.has(current))current=nextDay(current,-1);let n=0;for(let i=0;i<3650&&days.has(current);i++){n++;current=nextDay(current,-1);}return n;}
const dueQuestions=()=>D.questions.filter(q=>state.progress[q.id]?.seen>0&&state.progress[q.id]?.due<=TODAY());
const wrongQuestions=()=>D.questions.filter(q=>state.progress[q.id]?.seen>0&&state.progress[q.id]?.lastOk===false);
const doneToday=()=>state.logs.filter(x=>x.date===TODAY()).length;
function toast(message){let region=document.getElementById('toasts');if(!region)return;const n=document.createElement('div');n.className='toast';n.setAttribute('role','status');n.textContent=message;region.appendChild(n);setTimeout(()=>n.remove(),3600);}
function recordAttempt(q,ratio,confidence=2,mode='study',elapsedMs=0){
  ratio=cap(Number(ratio)||0,0,1);confidence=cap(Number(confidence)||2,1,3);
  const p=state.progress[q.id]||{seen:0,correct:0,wrong:0,streak:0,due:TODAY(),last:'',lastOk:false,ease:2.5,interval:0,lapses:0};
  const quality=ratio>=.999?(confidence===3?5:confidence===2?4:3):(ratio>=.75?2:ratio>=.5?1:0);
  const perfect=ratio>=.999;
  p.seen++;if(perfect)p.correct++;else p.wrong++;
  p.last=TODAY();p.lastOk=perfect;p.lastRatio=ratio;p.lastConfidence=confidence;
  p.lastMs=cap(Number(elapsedMs)||0,0,86400000);
  let ease=cap(Number(p.ease)||2.5,1.3,3.2),interval=cap(Number(p.interval)||0,0,3650);
  if(quality<3){p.streak=0;p.lapses=(p.lapses||0)+1;interval=1;}
  else {
    p.streak=(p.streak||0)+1;
    if(p.streak===1)interval=1;
    else if(p.streak===2)interval=3;
    else interval=Math.max(interval+1,Math.round(interval*ease));
    if(confidence===1)interval=Math.min(interval,3);
    ease=cap(ease+(0.1-(5-quality)*(0.08+(5-quality)*0.02)),1.3,3.2);
  }
  p.ease=ease;p.interval=cap(interval,1,3650);p.due=nextDay(TODAY(),p.interval);
  state.progress[q.id]=p;
  state.logs.push({id:q.id,date:TODAY(),ratio,mode});if(state.logs.length>25000)state.logs.splice(0,state.logs.length-25000);
}
function persistPractice(){state.practice=ui.practice;save();}
function finishTimedPractice(){const p=ui.practice;if(!p||p.finished)return;
 p.finished=true;state.history.push({id:String(Date.now()),type:'practice',at:Date.now(),count:p.items.length,answered:p.results.length,accuracy:PC(p.results.reduce((a,x)=>a+x.ratio,0),p.results.length),mode:p.mode,subject:p.subject,duration:Date.now()-p.startedAt,timed:true});state.history=state.history.slice(-500);persistPractice();render();toast('制限時間に達したため、演習を終了しました。');}
function replaceHash(next){if(routeFromURL()!==next)history.pushState(null,'','#'+next);}
function go(next){
 if(route==='roppo'&&next!=='roppo')window.GYOSHI_ROPPO?.stop();
  if(!TABS.some(t=>t[0]===next))return;
  route=next;replaceHash(next);
 if(next==='glossary')ui.glossary=glossaryViewFromURL();
 ui.sidebar=false;ui.modal=null;render();window.scrollTo(0,0);
 document.getElementById('content').focus({preventScroll:true});
}
function activeTab(x){return route===x?'active':'';}
function navButton(t){return `<button class="nav-btn ${activeTab(t[0])}" data-action="nav" data-value="${t[0]}" aria-current="${route===t[0]?'page':'false'}"><span class="ico">${t[2]}</span><span>${t[1]}</span></button>`;}
function mount(){
 app.innerHTML=`<div class="layout"><a class="skip-content" href="#content" data-action="skipContent">本文へ移動</a><div class="side-scrim" id="scrim" data-action="closeSide"></div><aside class="sidebar" id="sidebar" aria-label="メインナビゲーション"><div class="brand"><div class="brand-mark">朱</div><div><div class="brand-title">朱引文庫</div><div class="brand-sub">SHUBIKI BUNKO <span>／ 2027</span></div><div class="brand-caption">行政書士試験のための書斎</div></div></div><div class="side-section">学習</div><nav class="side-nav">${[TABS[0],TABS[10],...TABS.slice(1,5),TABS[11]].map(navButton).join('')}</nav><div class="side-section">試験対策</div><nav class="side-nav">${TABS.slice(5,8).map(navButton).join('')}</nav><div class="side-section">学習記録</div><nav class="side-nav">${TABS.slice(8,10).map(navButton).join('')}</nav><div class="side-bottom"><div class="side-daily"><div class="side-daily-label">今日の学習目標</div><div class="side-daily-value" id="side-daily-count">0 <span>/ ${state.settings.goal}問</span></div><div class="progress-track"><div class="progress-fill" id="side-daily-bar" style="width:0%"></div></div><p class="tiny" id="side-daily-desc" style="margin:11px 0 0;color:#9cb0be">今日も少しずつ積み重ねましょう</p></div><div class="side-note"><span class="side-note-mark">朱</span><span>一問一葉、知を綴る。<small>OFFLINE STUDY · PRIVATE ARCHIVE</small></span></div></div></aside><div class="shell"><header class="topbar"><div style="display:flex;align-items:center;gap:12px"><button class="icon-btn menu-btn" data-action="menu" aria-label="メニューを開く" aria-controls="sidebar" aria-expanded="false">☰</button><div><div class="topbar-kicker">朱引文庫</div><div id="top-title" class="topbar-title">ダッシュボード</div></div></div><div class="top-actions"><span class="network-chip" id="network-state" aria-label="接続状況">●</span><span class="date-chip" id="header-date">${dateStr(Date.now())}</span><button class="icon-btn" data-action="theme" title="テーマ変更" aria-label="ダークモード切替">◐</button><button class="icon-btn" data-action="nav" data-value="settings" title="設定" aria-label="設定を開く">⚙</button></div></header><main class="content" id="content" tabindex="-1"></main><footer class="main-footer"><span class="footer-brand">朱引文庫 <small>— SHUBIKI BUNKO —</small></span> · 自作学習問題 ${D.questions.length}問 · <a href="https://www.gyosei-shiken.or.jp/doc/guide/guide.html" target="_blank" rel="noopener noreferrer">公式試験案内</a> · 令和8年度試験の情報を基礎にしています。法令改正・判例の最新情報は必ず一次資料を確認してください。<br>問題は独自作成の学習用で、公式過去問の転載ではありません。試験の合否を保証するものではありません。</footer></div><nav class="mobile-nav" aria-label="モバイルナビゲーション">${[TABS[0],TABS[10],TABS[1],TABS[2],TABS[4],TABS[5]].map(t=>`<button class="mobile-tab ${activeTab(t[0])}" data-action="nav" data-value="${t[0]}"><span class="ico">${t[2]}</span>${({dashboard:'書斎',essentials:'これだけ',study:'演習',weak:'復習',roppo:'六法',mock:'模試'})[t[0]]||t[1]}</button>`).join('')}</nav><div id="toasts" class="toast-region" aria-live="polite"></div><div id="modal-host"></div><input type="file" accept=".json,application/json" id="import-file" hidden></div>`;
}
function render(options={}){
 const y=options.keepScroll?window.scrollY:0;
 const focused=options.keepScroll?document.activeElement:null,focusId=focused?.id;
 const caret=typeof focused?.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null;
 if(!document.getElementById('content'))mount();
 for(const button of app.querySelectorAll('.nav-btn,.mobile-tab')){
  const active=button.dataset.value===route;
  button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');
 }
 app.querySelector('.menu-btn').setAttribute('aria-expanded',String(ui.sidebar));document.documentElement.dataset.theme=state.settings.theme;document.documentElement.dataset.readable=state.settings.readable?'large':'normal';const net=document.getElementById('network-state');if(net){net.textContent=navigator.onLine?'● 接続中':'○ オフライン';net.dataset.offline=navigator.onLine?'false':'true';}
 const title=TABS.find(t=>t[0]===route)?.[1]||'ダッシュボード';document.getElementById('top-title').textContent=title;document.title=title+'｜朱引文庫 — 行政書士試験の書斎';
 document.getElementById('sidebar').classList.toggle('open',ui.sidebar);document.getElementById('scrim').classList.toggle('show',ui.sidebar);
 const content=document.getElementById('content');
 switch(route){case'dashboard':content.innerHTML=homeHTML()+dashboardEnhancementsHTML();break;case'study':content.innerHTML=ui.practice?practiceHTML():studyHTML();break;case'weak':content.innerHTML=weakHTML();break;case'library':content.innerHTML=libraryHTML();break;case'roppo':content.innerHTML=window.GYOSHI_ROPPO?.render()||'<p>六法ライブラリを読み込めません。</p>';break;case'essentials':content.innerHTML=GUIDE?.essentialsHTML(state.essentials,ui.guide)||'<p>必修カードを読み込めません。</p>';break;case'glossary':content.innerHTML=GUIDE?.glossaryHTML(ui.glossary)||'<p>用語索引を読み込めません。</p>';break;case'planner':content.innerHTML=plannerHTML();break;case'mock':content.innerHTML=mockHTML()+(state.exam&&!state.exam.finished?'':mockArchiveShortcutHTML());break;case'written':content.innerHTML=writtenHTML();break;case'records':content.innerHTML=ui.archiveViewing?archivedMockHTML():recordsHTML()+recordsEnhancementsHTML();break;case'settings':content.innerHTML=settingsHTML()+advancedSettingsHTML();break;}
 document.getElementById('side-daily-count').innerHTML=`${doneToday()} <span>/ ${state.settings.goal}問</span>`;
 document.getElementById('side-daily-bar').style.width=cap(PC(doneToday(),state.settings.goal),0,100)+'%';
 document.getElementById('side-daily-desc').textContent=doneToday()>=state.settings.goal?'今日の目標達成！':'残り '+Math.max(0,state.settings.goal-doneToday())+' 問で目標達成';
 showModal();
 if(focusId&&document.getElementById(focusId)){
  const field=document.getElementById(focusId);field.focus({preventScroll:true});
  if(caret&&field.setSelectionRange)try{field.setSelectionRange(...caret);}catch{}
 }
 if(options.keepScroll)window.scrollTo(0,y);
}
function sectionHead(title,subtitle='',action=''){return `<div class="section-head"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${action}</div>`;}
function statCard(label,value,unit,foot,icon){return `<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-number">${value}<span class="stat-unit">${unit}</span></div><div class="stat-foot">${foot}</div></div>`;}
function subjectRow(s){return `<div class="subject-row"><div class="subject-badge" style="color:${s.color};background:${s.color}1e">${s.name.slice(0,1)}</div><div class="subject-info"><div class="subject-line"><strong>${E(s.name)}</strong><span class="muted tiny">${s.seen} / ${s.total}問学習</span></div><div class="subject-track"><div style="background:${s.color};width:${PC(s.seen,s.total)}%"></div></div></div><span class="subject-pct">${s.attempts?s.ratio+'%':'未学習'}</span></div>`;}
function homeHTML(){
 const s=categoryStats(),ls=state.logs,ans=ls.length,accuracy=PC(ls.reduce((a,l)=>a+l.ratio,0),ans);
 const due=dueQuestions().length,wr=wrongQuestions().length,seen=Object.keys(state.progress).filter(id=>state.progress[id].seen>0).length;
 const date=new Date(state.settings.target+'T12:00:00');const left=Math.max(0,Math.ceil((date-new Date())/86400000));
 const byDay=Array.from({length:7},(_,i)=>{const d=nextDay(TODAY(),i-6);return {day:d,count:ls.filter(l=>l.date===d).length,label:new Date(d+'T12:00:00').toLocaleDateString('ja-JP',{weekday:'short'})};});
 const max=Math.max(state.settings.goal,...byDay.map(d=>d.count),1);
 const chart=`<div class="activity-chart" aria-label="直近7日の学習問題数">${byDay.map(d=>`<div class="activity-day"><div class="activity-count">${d.count||''}</div><div class="activity-bar-bg"><div class="activity-bar" style="height:${Math.max(3,d.count/max*100)}%"></div></div><div class="activity-name">${d.label}</div></div>`).join('')}</div>`;
  return `<section class="hero" aria-label="今日の学びへの案内">
  <div class="hero-mast"><span>SHUBIKI BUNKO / THE STUDY FOLIOS</span><span>二〇二七 受験の書斎</span></div>
  <div class="hero-inner">
    
    <h1>学んだ一行が、<br><em>明日の確信</em>になる。</h1>
    <p>300問の演習と180分の模試。六法書架では、主要六法と試験関連法令の条文にマーカーやメモを残せます。</p>
    <div class="hero-ctas"> ${ui.practice&&!ui.practice.finished?'<button class="button gold" data-action="nav" data-value="study">前回の演習を再開する →</button>':'<button class="button gold" data-action="quickStart">今日の10問を解く →</button>'}<button class="button dark-ghost" data-action="nav" data-value="roppo">六法書架をひらく</button><button class="button dark-ghost" data-action="nav" data-value="mock">模試へ進む</button></div>
  </div>
  <div class="hero-art" aria-hidden="true"><div class="art-disc"></div><div class="art-leaf-back"><span>行政書士試験</span><b>積學</b><i>法のことばを、一葉ずつ。</i></div><div class="art-leaf-front"><span>壱・条文</span><strong>六法</strong><small>書架と朱引き</small></div><div class="art-seal">朱引<br>文庫</div><div class="art-rubric">覚えるよりも、理解する。</div></div>
  <div class="hero-bottom"><span>目標試験日まで ${left}日</span><span>法令本文15本収録</span></div>
</section>
 <a class="sg-home-link" href="#essentials"><span><strong>これだけは覚える</strong><span>必修カードで条文・期限・記述式の要点を確認</span></span><span aria-hidden="true">→</span></a>
 <div class="stats-grid">${statCard('累計解答数',ans.toLocaleString('ja-JP'),'問',`全${D.questions.length}問のオリジナル問題`,'▤')}${statCard('平均得点率',accuracy,'%','多肢・記述は配点比率を反映','◉')}${statCard('連続学習日数',daysStreak(),'日','学習した日を連続カウント','♨')}${statCard('復習対象',due,'問',`${wr}問が直近の誤答`,'↻')}</div>
 <div class="two-col"><div class="card"><div class="card-head"><h2>科目別の習熟状況</h2><button class="text-link" data-action="nav" data-value="records">詳しく見る →</button></div>${s.map(subjectRow).join('')}</div><div style="display:grid;gap:18px"><div class="card"><div class="card-head"><h2>直近7日間の学習</h2><span class="pill">${byDay.reduce((a,d)=>a+d.count,0)}問</span></div>${chart}</div><div class="card"><div class="card-head"><h2>合格に向けた学習指標</h2></div><div class="tip-list"><div class="tip"><div class="tip-circle">◷</div><div><strong>目標試験日まで ${left}日</strong><span>${E(state.settings.target.replaceAll('-','/'))}（変更可能な仮設定）</span></div></div><div class="tip"><div class="tip-circle">◎</div><div><strong>学習済み ${seen} / ${D.questions.length}問</strong><span>初回学習の広さと復習の深さを両方重視</span></div></div><div class="tip"><div class="tip-circle">↻</div><div><strong>復習予定 ${due}問</strong><span>誤答と自信が低い問題を優先して取り組みましょう</span></div></div></div></div></div></div>
 ${ui.practice&&!ui.practice.finished?`<div class="resume-alert"><div><strong>前回の演習が残っています</strong><div class="small muted">問題 ${ui.practice.index+1}/${ui.practice.items.length} · 解答済み ${ui.practice.results.length}問${ui.practice.deadline?' · 時間制限あり':''}</div></div><button class="button secondary small" data-action="nav" data-value="study">続きから再開 →</button></div>`:''}${sectionHead('科目から学習する','科目を選択すると、指定科目の演習を開始できます。')}<div class="category-grid">${s.map(c=>`<button class="category-tile" data-action="studyCategory" data-value="${c.id}"><span class="subject-badge" style="width:42px;height:42px;color:${c.color};background:${c.color}1e">${c.name.charAt(0)}</span><span style="min-width:0"><strong>${E(c.name)}</strong><div class="small">${c.total}問収録 · ${c.seen}問学習済み</div></span><span style="margin-left:auto;color:var(--muted)">›</span></button>`).join('')}</div>
 <div class="notice info" style="margin-top:22px">令和8（2026）年度の公表された試験案内を参考にした学習設計です。2026年11月8日の試験は終了済みのため、次の試験に向けた目標日は仮設定です。施行法令・判例・試験要項の変更は公式情報で確認してください。</div>`;
}
function getPool(conf=ui.study){
 let xs=D.questions.filter(q=>(conf.type==='mixed'||q.type===conf.type)&&(conf.c==='all'||q.c===conf.c));
 if(conf.difficulty!=='all')xs=xs.filter(q=>q.l===Number(conf.difficulty));
 if(conf.mode==='wrong')xs=xs.filter(q=>state.progress[q.id]?.lastOk===false);
 if(conf.mode==='due')xs=xs.filter(q=>state.progress[q.id]?.seen>0&&state.progress[q.id]?.due<=TODAY());
 if(conf.mode==='bookmark')xs=xs.filter(q=>state.bookmarks.includes(q.id));
 if(conf.search)xs=xs.filter(q=>(q.q+' '+q.t+' '+(q.x||'')+' '+(q.r||q.ref||'')).toLowerCase().includes(String(conf.search).toLowerCase()));
 return xs;
}
function sortedPool(xs,mode){
 if(mode!=='adaptive')return shuffle(xs);
 return xs.map(q=>{const p=state.progress[q.id];const score=(!p?46:0)+(p?.due<=TODAY()?36:0)+(p&&!p.lastOk?30:0)+(p?Math.max(0,25-p.streak*5):0)+Math.random()*25;return {q,score};}).sort((a,b)=>b.score-a.score).map(r=>r.q);
}
function studyHTML(){const c=ui.study,pool=getPool(),total=D.questions.filter(q=>c.type==='mixed'||q.type===c.type).length;
 return `<div class="page-banner"><h1>問題演習</h1><p>自動で弱点を優先する適応演習から、科目別の集中トレーニングまで。解答履歴に応じて復習タイミングも提案します。</p></div><div class="two-col practice-cols"><div class="card"><div class="card-head"><h2>演習をカスタマイズ</h2><span class="pill">収録 ${D.questions.length} 問</span></div><div class="form-grid"><div class="field"><label for="studytype">出題形式</label><select id="studytype" class="select" data-action="studyField" data-field="type"><option value="mc" ${c.type==='mc'?'selected':''}>五肢択一式（4点）</option><option value="multi" ${c.type==='multi'?'selected':''}>多肢選択式（8点）</option><option value="written" ${c.type==='written'?'selected':''}>記述式（40字程度）</option><option value="mixed" ${c.type==='mixed'?'selected':''}>全形式ミックス</option></select></div><div class="field"><label for="studycount">問題数</label><select id="studycount" class="select" data-action="studyField" data-field="count">${[5,10,20,30,50,999].map(n=>`<option value="${n}" ${c.count===n?'selected':''}>${n===999?'対象の全問題':n+'問'}</option>`).join('')}</select></div></div><div class="form-grid" style="margin-top:13px"><div class="field"><label for="studytimer">演習タイマー</label><select id="studytimer" class="select" data-action="studyField" data-field="timer">${[[0,'制限なし'],[5,'5分'],[10,'10分'],[20,'20分'],[30,'30分'],[60,'60分']].map(([n,t])=>`<option value="${n}" ${c.timer===n?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label for="studysearch">キーワードで絞り込み</label><input id="studysearch" class="text-input" data-action="studyField" data-field="search" placeholder="例：取消訴訟" value="${E(c.search)}" maxlength="100"></div></div><div class="setup-section">学習科目</div><div class="chip-grid"><button class="filter-chip ${c.c==='all'?'active':''}" data-action="setCat" data-value="all">すべての科目</button>${D.categories.filter(k=>c.type==='mc'||c.type==='mixed'||(c.type==='multi'?['const','admin','civil'].includes(k.id):['admin','civil'].includes(k.id))).map(k=>`<button class="filter-chip ${c.c===k.id?'active':''}" data-action="setCat" data-value="${k.id}">${E(k.name)}</button>`).join('')}</div><div class="setup-section">出題モード</div><div class="chip-grid">${[['adaptive','おすすめ'],['random','ランダム'],['wrong','間違えた問題'],['due','復習期日'],['bookmark','ブックマーク']].map(([id,t])=>`<button class="filter-chip ${c.mode===id?'active':''}" data-action="setMode" data-value="${id}">${t}</button>`).join('')}</div><div class="setup-section">難易度</div><div class="chip-grid">${[['all','すべて'],['1','基礎'],['2','標準'],['3','応用']].map(([id,t])=>`<button class="filter-chip ${String(c.difficulty)===id?'active':''}" data-action="setDifficulty" data-value="${id}">${t}</button>`).join('')}</div><div class="setup-foot"><div class="small muted">条件に一致する問題：<strong style="color:var(--ink)">${pool.length}</strong>問 / ${total}問</div><button class="button" data-action="startPractice" ${pool.length===0?'disabled':''}>演習を開始する　→</button></div>${!pool.length?'<div class="notice" style="margin-top:13px">対象問題がありません。科目・難易度・出題モードを変更してください。</div>':''}</div><div style="display:grid;gap:17px;align-content:start"><div class="card"><h2>学習の進め方</h2><div class="tip-list"><div class="tip"><div class="tip-circle">01</div><div><strong>考えて答える</strong><span>五肢択一・多肢選択・記述の各形式で演習。</span></div></div><div class="tip"><div class="tip-circle">02</div><div><strong>根拠まで確認する</strong><span>全問題に解説と条文・テーマの手がかりを掲載。</span></div></div><div class="tip"><div class="tip-circle">03</div><div><strong>忘れる前に復習する</strong><span>誤答・自信度・経過日数に応じて再出題。</span></div></div></div></div><div class="notice info">学習アルゴリズムは履歴と復習間隔に基づくルール方式です。外部AIへの送信や自動課金は行いません。</div></div></div>`;
}
function startPractice(custom=null){
 const conf=custom||ui.study;const pool=getPool(conf);
 if(!pool.length){toast('対象問題がありません。出題条件を変更してください。');return;}
 if(ui.practice&&!ui.practice.finished&&!confirm('進行中の演習があります。破棄して新しい演習を開始しますか？'))return;
 let selected=sortedPool(pool,conf.mode).slice(0,conf.count===999?pool.length:conf.count);
 const now=Date.now(),timer=Math.max(0,Number(conf.timer)||0);
 ui.practice={mode:conf.mode,type:conf.type,subject:conf.c,startedAt:now,deadline:timer?now+timer*60000:0,timed:timer>0,index:0,items:selected.map(q=>({id:q.id,order:shuffle([0,1,2,3,4]),wordOrder:q.type==='multi'?shuffle(Array.from({length:20},(_,i)=>i)):null,answer:null,checked:false,grade:null,confidence:2})),results:[],finished:false};
 persistPractice();ui.results=null;go('study');
}
function practiceItem(){return ui.practice?.items[ui.practice.index];}
function practiceHTML(){
 const p=ui.practice;if(p.finished)return practiceResultHTML();if(p.deadline&&p.deadline<=Date.now()){setTimeout(finishTimedPractice,0);}
 const item=practiceItem(),q=KB[item.id],isMC=q.type==='mc';
 const answered=p.items.filter(x=>x.checked).length;
 const top=`<div class="quiz-top"><div class="quiz-meta"><strong>問題 ${p.index+1} / ${p.items.length}</strong>　 ·　${E(q.t)}${p.deadline?` <span class="pill warn" id="practice-clock">残り ${clockText(Math.max(0,Math.ceil((p.deadline-Date.now())/1000)))}</span>`:''}</div><div class="quiz-tools"><button class="button ghost small" data-action="nav" data-value="dashboard">中断・自動保存</button><button class="button ghost small" data-action="quitPractice">× 終了</button></div></div><div class="quiz-progress"><div style="width:${PC(p.index,p.items.length)}%"></div></div>`;
 const answerHTML=q.type==='mc'?mcChoices(q,item,false):q.type==='multi'?multiChoices(q,item,false):writtenQuestion(q,item,false);
 const feedback=item.checked?practiceFeedback(q,item):'';
 return `<div class="question-wrap">${top}<div class="card question-card"><div class="q-eyebrow"><span class="q-number">QUESTION ${String(p.index+1).padStart(2,'0')}</span>${catChip(q.c)}<span class="pill">${['','基礎','標準','応用'][q.l]}</span>${q.advanced?'<span class="pill good">事例・応用</span>':''}${q.type==='written'?'<span class="pill warn">自己採点式</span>':''}</div><div class="q-prompt">${E(q.q)}</div>${answerHTML}${!item.checked&&q.type!=='written'?`<div class="confidence"><span class="small muted" style="margin-right:5px">解答への自信</span>${[[1,'自信なし'],[2,'ふつう'],[3,'確信あり']].map(([n,t])=>`<button class="filter-chip ${item.confidence===n?'active':''}" data-action="confidence" data-value="${n}">${t}</button>`).join('')}</div>`:''}${feedback}<div class="quiz-actions"><div class="quiz-tools"><button class="button ghost small" data-action="bookmark" data-id="${q.id}">${state.bookmarks.includes(q.id)?'★ 保存済み':'☆ 保存する'}</button>${item.checked?`<button class="button ghost small" data-action="viewQ" data-id="${q.id}">✎ ノート・解説</button>`:''}${!item.checked?'<button class="button secondary small" data-action="skipPractice">この問題をスキップ</button>':''}</div><div>${item.checked?`<button class="button" data-action="nextPractice" ${q.type==='written'&&item.grade===null?'disabled title="自己採点を保存してください"':''}>${p.index===p.items.length-1?'結果を表示':'次の問題'}　→</button>`:`<button class="button" data-action="checkPractice" ${q.type==='mc'&&item.answer===null?'disabled':''}>${q.type==='written'?'模範解答を見る':'解答を確定する'}　→</button>`}</div></div></div><div class="keyboard-hint">PC：1～5で選択 ／ Enterで解答・次へ （入力欄では無効）</div></div>`;
}
function mcChoices(q,item,isExam){return `<div class="choices" role="group" aria-label="選択肢">${item.order.map((orig,screen)=>{const selected=item.answer===orig;const checked=!isExam&&item.checked;const cls=checked?(orig===0?'correct':selected?'wrong':''):selected?'selected':'';return `<button class="choice ${cls}" data-action="${isExam?'examMC':'practiceMC'}" data-value="${orig}" ${checked?'disabled':''} ${selected?'aria-pressed="true"':'aria-pressed="false"'}><span class="choice-num">${screen+1}</span><span>${E(q.o[orig])}</span></button>`;}).join('')}</div>`;}
function multiChoices(q,item,isExam){
 const value=Array.isArray(item.answer)?item.answer:[null,null,null,null];
 const labels=['ア','イ','ウ','エ'];
 const order=Array.isArray(item.wordOrder)?item.wordOrder:Array.from({length:20},(_,i)=>i);
 return `<div class="multi-inputs">${labels.map((label,i)=>`<div class="field"><label>${label} に入る語句</label><select class="select" data-action="${isExam?'examMulti':'practiceMulti'}" data-slot="${i}" ${!isExam&&item.checked?'disabled':''}><option value="">選択してください</option>${order.map((orig,screen)=>`<option value="${orig}" ${value[i]===orig?'selected':''}>${screen+1}. ${E(q.o[orig])}</option>`).join('')}</select></div>`).join('')}</div><div class="small muted" style="font-weight:800;margin-bottom:8px">語群（20語・出題ごとに順序変更）</div><div class="wordbank">${order.map((orig,screen)=>`<div><strong>${screen+1}</strong>${E(q.o[orig])}</div>`).join('')}</div>`;
}
function writtenQuestion(q,item,isExam){const txt=typeof item.answer==='string'?item.answer:'';return `<div class="field"><label>${isExam?'答案を入力する':'40字程度で記述してください'}</label><textarea class="text-area" data-action="${isExam?'examWritten':'practiceWritten'}" placeholder="ここに解答を入力してください。" ${!isExam&&item.checked?'disabled':''}>${E(txt)}</textarea></div><div class="char-count" id="char-count">${txt.length}文字 / 目安40文字</div>`;}
function lawLinks(q){
 const links=window.GYOSHI_ROPPO?.references(q.r||q.ref)||[];
 return links.length?`<div class="law-links">${links.map(({href,label})=>`<a class="button secondary small" href="${E(href)}">${E(label)}を読む →</a>`).join('')}</div>`:'';
}
function practiceFeedback(q,item){
 const score=q.type==='mc'?(item.answer===0?1:0):q.type==='multi'?item.answer.reduce((a,x,i)=>a+(x===q.a[i]?1:0),0):0;
 const ok=q.type==='mc'?score===1:q.type==='multi'?score===4:true;
 let content='';
 if(q.type==='mc')content=`<h3>${ok?'✓ 正解です':'× 不正解です'}</h3><p><strong>正解：</strong>${E(q.o[0])}</p>`;
 if(q.type==='multi')content=`<h3>${ok?'✓ 全問正解です':'解答結果：'+score+'/4空欄正解'}</h3><p><strong>正解：</strong>${q.a.map((v,i)=>`${'アイウエ'[i]}＝${E(q.o[v])}`).join('　')}</p>`;
 if(q.type==='written'){content=`<h3>記述式：模範解答・採点ポイント</h3><p><strong>模範解答例：</strong>${E(q.s)}</p>${rubricHTML(q)}${item.grade===null?`<div class="grade-controls"><label class="small strong">自己採点（0〜20点）</label><strong id="practice-grade-value">10点</strong></div><input class="grade-slider" data-action="practiceGrade" type="range" min="0" max="20" step="1" value="10" aria-label="記述式の自己採点点数"><div class="quiz-actions"><span class="small muted">模範解答・採点ポイントを確認して点数を入力してください。</span><button class="button small" data-action="savePracticeGrade">採点結果を保存</button></div>`:`<div class="notice info" style="margin-top:12px">自己採点：<strong>${item.grade} / 20点</strong>。次の問題に進んでください。</div>`}`;
 return `<div class="answer-panel">${content}<div class="reference">参考：${E(q.ref)}</div>${lawLinks(q)}</div>`;
 }
 content+=`<p>${E(q.x)}</p><div class="reference">根拠・復習テーマ：${E(q.r)}</div>`;
 return `<div class="answer-panel ${ok?'':'bad'}">${content}${lawLinks(q)}</div>`;
}
function rubricHTML(q){return `<ul class="rubric-list">${q.rubric.map(([title,pts])=>`<li><span>${E(title)}</span><span>${pts}点</span></li>`).join('')}</ul>`;}
function checkPractice(){const p=ui.practice,item=practiceItem();if(!p||p.finished||!item||item.checked)return;
 if(p.deadline&&Date.now()>=p.deadline){finishTimedPractice();return;}
 const q=KB[item.id];
 if(q.type==='mc'&&item.answer===null){toast('選択肢を選んでください。');return;}
 if(q.type==='multi'&&(!Array.isArray(item.answer)||item.answer.some(x=>x===null))){toast('ア〜エの4か所を選択してください。');return;}
 item.checked=true;
 if(q.type==='mc'||q.type==='multi'){
   const ratio=q.type==='mc'?(item.answer===0?1:0):q.a.reduce((s,v,i)=>s+(item.answer[i]===v?1:0),0)/4;
   recordAttempt(q,ratio,item.confidence,'practice');p.results.push({id:q.id,ratio});
 }
 persistPractice();render({keepScroll:true});
}
function nextPractice(skip=false){const p=ui.practice,item=practiceItem();if(!p||p.finished||!item)return;
 if(p.deadline&&Date.now()>=p.deadline){finishTimedPractice();return;}
 const q=KB[item.id];
 if(!skip&&!item.checked){checkPractice();return;}
 if(!skip&&q.type==='written'&&item.grade===null){toast('記述式の自己採点を保存してください。');return;}
 if(p.index>=p.items.length-1){p.finished=true;state.history.push({id:String(Date.now()),type:'practice',at:Date.now(),count:p.items.length,answered:p.results.length,accuracy:PC(p.results.reduce((a,x)=>a+x.ratio,0),p.results.length),mode:p.mode,subject:p.subject,duration:Date.now()-p.startedAt});state.history=state.history.slice(-500);persistPractice();render();window.scrollTo(0,0);}else{p.index++;persistPractice();render();window.scrollTo(0,0);}
}
function practiceResultHTML(){const p=ui.practice,done=p.results.length,ratio=PC(p.results.reduce((a,x)=>a+x.ratio,0),done),wrong=p.results.filter(x=>x.ratio<1).length;
 return `<div class="results-hero"><div class="overline" style="color:#a5ebd7">SESSION COMPLETE</div><h1>演習、お疲れさまでした。</h1><p>解けた問題だけでなく、根拠を説明できるかも次の復習で確認しましょう。</p><div class="result-numbers"><div class="result-number"><strong>${done}</strong><span>採点済み問題</span></div><div class="result-number"><strong>${ratio}%</strong><span>得点率（解答分）</span></div><div class="result-number"><strong>${wrong}</strong><span>復習候補</span></div></div></div><div class="card"><div class="card-head"><h2>今回の復習リスト</h2></div>${p.results.filter(x=>x.ratio<1).length?p.results.filter(x=>x.ratio<1).map(x=>{const q=KB[x.id];return `<div class="question-mini"><span class="subject-badge" style="background:${CAT[q.c].color}22;color:${CAT[q.c].color}">${CAT[q.c].name[0]}</span><div class="question-mini-main"><strong>${E(q.t)}</strong><span class="small">${E(q.q).slice(0,70)}…</span></div><button class="button secondary small" data-action="viewQ" data-id="${q.id}">解説</button></div>`;}).join(''):'<div class="empty-msg">今回の誤答はありません。自信が低かった問題も復習すると定着しやすくなります。</div>'}<div class="quiz-actions"><button class="button secondary" data-action="nav" data-value="dashboard">ホームに戻る</button><button class="button" data-action="resetPractice">もう一度演習する　→</button></div></div>`;
}
function pickGroup(cat,type,n){const xs=D.questions.filter(q=>q.c===cat&&q.type===type);if(xs.length<n)throw Error('問題数が不足: '+cat+' '+type);return shuffle(xs).slice(0,n);}
function newMock(){
 if(state.exam&&!state.exam.finished&&!confirm('進行中の模擬試験があります。破棄して新しく始めますか？'))return;
 if(state.exam&&state.exam.finished&&!state.archivedExams.some(e=>e.id===state.exam.id)){state.archivedExams.push(JSON.parse(JSON.stringify(state.exam)));state.archivedExams=state.archivedExams.slice(-12);}
 const B=D.mockBlueprint;
 try{
  const law=['fund','const','admin','civil','commercial'].flatMap(c=>pickGroup(c,'mc',B[c]));
  const multi=[...pickGroup('const','multi',B.multiConst),...pickGroup('admin','multi',B.multiAdmin)];
  const writing=[...pickGroup('admin','written',B.writtenAdmin),...pickGroup('civil','written',B.writtenCivil)];
  const basic=['general','business','it','reading'].flatMap(c=>pickGroup(c,'mc',B[c]));
  const all=[...law,...multi,...writing,...basic];
  if(all.length!==60)throw Error('模擬試験の構成が60問ではありません');
  const now=Date.now();state.exam={id:String(now),startedAt:now,deadline:now+180*60000,finished:false,finishedAt:0,index:0,grades:{},recordedWritten:{},items:all.map(q=>({id:q.id,order:shuffle([0,1,2,3,4]),wordOrder:q.type==='multi'?shuffle(Array.from({length:20},(_,i)=>i)):null,answer:null,flag:false}))};save();render();window.scrollTo(0,0);
 }catch(err){toast('模擬試験を作成できません: '+err.message);}
}
function secondsLeft(ex){return Math.max(0,Math.ceil((ex.deadline-Date.now())/1000));}
function clockText(seconds){let h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
function anyAnswer(q,answer){if(q.type==='mc')return Number.isInteger(answer)&&answer>=0&&answer<5;if(q.type==='multi')return Array.isArray(answer)&&answer.some(a=>a!==null&&Number.isInteger(a));return typeof answer==='string'&&answer.trim().length>0;}
function answeredCount(ex){return ex.items.filter(i=>anyAnswer(KB[i.id],i.answer)).length;}
function mockHTML(){const ex=state.exam;
 if(!ex)return `<div class="page-banner gold-banner"><h1>本試験形式の180分模試</h1><p>法令等46問＋基礎知識14問、計60問・300点。科目別足切りを含む合格基準を再現した採点で、現在地を把握します。</p></div><div class="stats-grid">${statCard('問題数','60','問','本試験の出題数に対応','▤')}${statCard('試験時間','180','分','時間切れで自動提出','◷')}${statCard('最高点','300','点','法令244点＋基礎56点','★')}${statCard('合格基準','180','点','足切り基準も満たす必要あり','◎')}</div><div class="two-col"><div class="card"><h2>本試験の出題構成</h2><div class="subject-row"><strong>法令等・五肢択一</strong><span class="muted">40問 × 4点＝160点</span></div><div class="subject-row"><strong>多肢選択式</strong><span class="muted">3問 × 8点＝24点</span></div><div class="subject-row"><strong>記述式</strong><span class="muted">3問 × 20点＝60点</span></div><div class="subject-row"><strong>基礎知識・五肢択一</strong><span class="muted">14問 × 4点＝56点</span></div><div class="notice info" style="margin-top:15px">合格判定（通常の基準）：法令等122点以上、基礎知識24点以上、全体180点以上。記述式は模範解答と採点ポイントに基づく自己採点のため、判定は参考値です。</div></div><div class="card"><h2>本番と同じ緊張感で</h2><div class="tip-list" style="margin-bottom:22px"><div class="tip"><div class="tip-circle">◷</div><div><strong>180分のカウントダウン</strong><span>途中で画面を閉じても、残り時間は進みます。</span></div></div><div class="tip"><div class="tip-circle">⚑</div><div><strong>見直しフラグ・設問ナビ</strong><span>未回答や見直し対象を一覧で把握できます。</span></div></div><div class="tip"><div class="tip-circle">▥</div><div><strong>採点・解説・足切り判定</strong><span>結果を学習履歴に保存して弱点分析に反映します。</span></div></div></div><button class="button block gold" data-action="startMock">180分模試を始める　→</button><p class="tiny muted" style="text-align:center;margin:11px 0 0">収録問題からランダム抽出 · 解答は自動保存</p></div></div>`;
 if(ex.finished)return mockResultHTML(ex);
 if(secondsLeft(ex)===0){setTimeout(()=>{if(state.exam&&!state.exam.finished)finishMock(true);},0);}
 return mockRunHTML(ex);
}
function mockRunHTML(ex){
 const i=ex.index,item=ex.items[i],q=KB[item.id],left=secondsLeft(ex),answered=answeredCount(ex),flagged=ex.items.filter(x=>x.flag).length;
 const input=q.type==='mc'?mcChoices(q,item,true):q.type==='multi'?multiChoices(q,item,true):writtenQuestion(q,item,true);
 const grid=ex.items.map((v,j)=>{const qq=KB[v.id],ans=anyAnswer(qq,v.answer);return `<button class="exam-jump ${ans?'answered':''} ${v.flag?'flagged':''} ${i===j?'current':''}" title="問題${j+1}${ans?' 回答済み':''}${v.flag?' 要確認':''}" data-action="examJump" data-value="${j}">${j+1}</button>`;}).join('');
 return `<div class="exam-layout"><div class="exam-question"><div class="quiz-top"><div class="quiz-meta"><strong>模擬試験　問題${i+1} / 60</strong>　·　${i<40?'法令等・五肢択一':i<43?'法令等・多肢選択':i<46?'法令等・記述式':'基礎知識・五肢択一'}</div><span class="pill">${i<40||i>=46?'4点':i<43?'8点':'20点'}</span></div><div class="quiz-progress"><div style="width:${PC(answered,60)}%"></div></div><div class="card question-card"><div class="q-eyebrow"><span class="q-number">EXAM QUESTION ${i+1}</span>${catChip(q.c)}<span class="pill">${E(q.t)}</span>${item.flag?'<span class="pill warn">⚑ 要見直し</span>':''}</div><div class="q-prompt">${E(q.q)}</div>${input}<div class="quiz-actions"><div class="quiz-tools"><button class="button secondary small" data-action="examFlag">${item.flag?'⚑ フラグ解除':'⚐ 見直しを付ける'}</button><button class="button ghost small" data-action="bookmark" data-id="${q.id}">${state.bookmarks.includes(q.id)?'★ 保存済み':'☆ 保存'}</button></div><div class="quiz-tools"><button class="button secondary" data-action="examPrev" ${i===0?'disabled':''}>← 前へ</button><button class="button" data-action="examNext" ${i===59?'disabled':''}>次へ →</button></div></div></div><div class="keyboard-hint">本試験モードでは採点・正解は提出まで表示しません。</div></div><aside class="exam-side"><div class="exam-clock ${left<600?'urgent':''}"><div class="small">残り時間</div><div class="time" id="live-clock">${clockText(left)}</div><div class="tiny">全180分 · 時間切れで自動提出</div></div><div class="card"><div class="card-head" style="margin-bottom:4px"><h3>設問一覧</h3><span class="pill">${answered}/60</span></div><div class="exam-status"><span>● 回答 ${answered}問</span><span>⚑ 見直し ${flagged}問</span></div><div class="exam-grid">${grid}</div><div class="mini-line"></div><div class="exam-bottom-actions"><button class="button danger block" data-action="finishMock">提出して採点する</button></div><p class="tiny muted" style="margin:10px 0 0">未回答もそのまま提出可能です。途中の解答は自動保存されます。</p></div></aside></div>`;
}
function scoreMock(ex){
 let law=0,basic=0,obj=0,graded=0,ungraded=0,answered=0,correct=0;
 const parts=[];
 ex.items.forEach((it,index)=>{
  const q=KB[it.id];let pts=0,max=q.type==='written'?20:q.type==='multi'?8:4;
  const given=anyAnswer(q,it.answer);if(given)answered++;
  if(q.type==='mc'){pts=it.answer===0?4:0;correct+=it.answer===0?1:0;obj+=pts;}
  if(q.type==='multi'){pts=Array.isArray(it.answer)?q.a.reduce((a,x,j)=>a+(it.answer[j]===x?2:0),0):0;correct+=pts===8?1:0;obj+=pts;}
  if(q.type==='written'){if(Object.hasOwn(ex.grades,q.id)){pts=Number(ex.grades[q.id]);graded++;}else ungraded++;}
  if(index<46)law+=pts;else basic+=pts;
  parts.push({q,it,index,pts,max,given});
 });
 const total=law+basic;const complete=ungraded===0;
 return {law,basic,total,complete,ungraded,graded,answered,correct,parts,pass:complete&&law>=122&&basic>=24&&total>=180,possibleMax:total+ungraded*20};
}
function finishMock(force=false){const ex=state.exam;if(!ex||ex.finished)return;
 if(!force){const left=60-answeredCount(ex);if(!confirm(`模擬試験を提出しますか？${left?'\n未回答の問題が'+left+'問あります。':''}\n提出すると解答を変更できなくなります。`))return;}
 ex.finished=true;ex.finishedAt=Date.now();
 const s=scoreMock(ex);
 for(const part of s.parts){if(part.q.type==='written'||!part.given)continue;recordAttempt(part.q,part.max?part.pts/part.max:0,2,'exam');}
 state.history.push({id:ex.id,type:'exam',at:Date.now(),count:60,answered:s.answered,accuracy:PC(s.correct,57),score:s.total,law:s.law,basic:s.basic,graded:false,duration:Date.now()-ex.startedAt});
 state.history=state.history.slice(-500);if(!state.archivedExams.some(e=>e.id===ex.id))state.archivedExams.push(JSON.parse(JSON.stringify(ex)));state.archivedExams=state.archivedExams.slice(-12);save();render();window.scrollTo(0,0);
 if(force)toast('試験時間が終了しました。解答を提出しました。');
}
function mockResultHTML(ex){const s=scoreMock(ex);const caution=s.complete?'記述式を自己採点した参考判定です。':'記述式は未採点です。下の3題を採点すると参考判定を表示できます。';
 const passText=s.complete?(s.pass?'合格基準を満たしました（参考）':'合格基準には届きませんでした（参考）'):'記述式の採点を完了してください';
 return `<div class="results-hero"><div class="overline" style="color:#b9e7d7">EXAM RESULTS · ${dateStr(ex.finishedAt)}</div><h1>${passText}</h1><p>${caution}</p><div class="result-numbers"><div class="result-number"><strong>${s.total}${s.complete?'':'〜'+s.possibleMax}</strong><span>総得点 / 300点${s.complete?'':'（未採点を含む幅）'}</span></div><div class="result-number"><strong>${s.law}${s.complete?'':'〜'+(s.law+s.ungraded*20)}</strong><span>法令等 / 244点</span></div><div class="result-number"><strong>${s.basic}</strong><span>基礎知識 / 56点</span></div></div></div>
 <div class="card" style="margin-bottom:18px"><div class="card-head"><h2>合格基準の確認</h2><span class="pill ${s.complete?(s.pass?'good':'bad'):'warn'}">${s.complete?(s.pass?'参考：基準達成':'参考：基準未達'):'記述式採点待ち'}</span></div><div class="score-strip"><span class="pill ${s.law>=122?'good':'bad'}">法令等：${s.law}/122点以上${s.complete?'':'（暫定）'}</span><span class="pill ${s.basic>=24?'good':'bad'}">基礎知識：${s.basic}/24点以上</span><span class="pill ${s.total>=180?'good':'bad'}">総合：${s.total}/180点以上${s.complete?'':'（暫定）'}</span></div><div class="notice info">現行の公開済み基準で用いられている通常の配点・基準を参考にしています。公式の判定とは異なり、記述式は自己採点です。実際の合格基準には試験問題の難易度による補正措置が行われる場合があります。</div></div>
 <div class="card" style="margin-bottom:18px"><div class="card-head"><h2>記述式の自己採点</h2><span class="pill">${s.graded}/3題採点済み</span></div><p class="small muted">模範解答の文言と完全一致する必要はありません。採点ポイントを参考に、0〜20点で評価してください。</p>${s.parts.filter(p=>p.q.type==='written').map(p=>`<div class="written-review"><div class="q-eyebrow"><span class="q-number">問題${p.index+1}</span>${catChip(p.q.c)}<span class="pill">${E(p.q.t)}</span></div><h3>${E(p.q.q)}</h3><div class="field"><label>提出した答案</label><div class="notice info">${E(p.it.answer||'（未回答）')}</div></div><div class="answer-panel"><p><strong>模範解答例：</strong>${E(p.q.s)}</p>${rubricHTML(p.q)}<div class="reference">${E(p.q.ref)}</div></div><div class="grade-controls"><strong>自己採点</strong><strong><span id="grade-label-${p.q.id}">${Object.hasOwn(ex.grades,p.q.id)?ex.grades[p.q.id]:'未採点'}</span> / 20点</strong></div><input type="range" class="grade-slider" min="0" max="20" step="1" value="${Object.hasOwn(ex.grades,p.q.id)?ex.grades[p.q.id]:10}" data-action="examGradeRange" data-id="${p.q.id}" aria-label="問題${p.index+1}の自己採点"><div style="display:flex;justify-content:flex-end;margin-top:9px"><button class="button small" data-action="saveExamGrade" data-id="${p.q.id}">この点数を反映する</button></div></div>`).join('')}</div>
 <div class="card"><div class="card-head"><h2>全60問の解答・解説</h2><button class="button secondary small" data-action="toggleReview">${ui.examReview?'折りたたむ':'すべて開く'}</button></div>${s.parts.map(part=>reviewItemHTML(part,ui.examReview)).join('')}<div class="quiz-actions"><button class="button secondary" data-action="nav" data-value="records">学習記録を見る</button><button class="button" data-action="startMock">新しい模試に挑戦する →</button></div></div>`;
}
function reviewItemHTML(part,open=false){const {q,it,index,pts,max}=part;
 const tag=q.type==='written'?'自己採点':q.type==='multi'?`${pts}/8点`:`${pts}/4点`;
 const isGood=pts===max;
 const detail=q.type==='mc'?`<p><strong>正解：</strong>${E(q.o[0])}</p><p><strong>あなたの回答：</strong>${it.answer===null?'未回答':E(q.o[it.answer]||'未回答')}</p><p>${E(q.x)}</p><div class="reference">${E(q.r)}</div>`:q.type==='multi'?`<p><strong>正解：</strong>${q.a.map((x,i)=>`${'アイウエ'[i]}:${E(q.o[x])}`).join(' / ')}</p><p><strong>あなたの回答：</strong>${Array.isArray(it.answer)?it.answer.map((x,i)=>`${'アイウエ'[i]}:${x===null?'未回答':E(q.o[x])}`).join(' / '):'未回答'}</p><p>${E(q.x)}</p><div class="reference">${E(q.r)}</div>`:`<p><strong>模範解答：</strong>${E(q.s)}</p><div class="reference">${E(q.ref)}</div>`;
 return `<details class="review-line" ${open?'open':''}><summary><span style="color:var(--muted);min-width:42px">${String(index+1).padStart(2,'0')}問</span><span style="flex:1;min-width:0">${E(q.t)}</span><span class="pill ${q.type==='written'?'warn':isGood?'good':'bad'}">${tag}</span></summary><div class="review-prompt">${E(q.q)}</div><div class="answer-panel">${detail}</div></details>`;
}
function weakHTML(){
 const wrong=wrongQuestions(),due=dueQuestions(),book=D.questions.filter(q=>state.bookmarks.includes(q.id));
 const kinds={wrong,due,bookmark:book};let list=kinds[ui.weakTab]||wrong;
 if(ui.weakSearch)list=list.filter(q=>(q.t+' '+q.q+' '+q.r).includes(ui.weakSearch));
 const tags=[['wrong','間違いノート',wrong.length],['due','復習期日の問題',due.length],['bookmark','ブックマーク',book.length]];
 return `<div class="page-banner"><h1>弱点分析と忘却対策</h1><p>間違えた問題、今日復習すべき問題、気になる問題を一か所に整理。正解するまで繰り返すのではなく、解説の根拠を理解する学習へ。</p></div><div class="stats-grid">${statCard('現在の間違い',wrong.length,'問','最後の解答が誤りの問題','×')}${statCard('今日の復習期日',due.length,'問','復習間隔から算出','◷')}${statCard('ブックマーク',book.length,'問','あとで見直したい問題','☆')}${statCard('復習済み',D.questions.filter(q=>state.progress[q.id]?.streak>=2).length,'問','連続2回以上正解した問題','✓')}</div><div class="card"><div class="card-head"><h2>復習リスト</h2><button class="button small" data-action="startWeakSession" ${!list.length?'disabled':''}>このリストから10問演習 →</button></div><div class="chip-grid" style="margin-bottom:16px">${tags.map(([id,name,n])=>`<button class="filter-chip ${ui.weakTab===id?'active':''}" data-action="weakTab" data-value="${id}">${name}　${n}</button>`).join('')}</div><div class="field" style="margin-bottom:14px"><label for="weak-search">問題を検索</label><input class="text-input" id="weak-search" placeholder="例：行政手続法、錯誤、原告適格" value="${E(ui.weakSearch)}" data-action="weakSearch"></div>${list.length?`<div class="question-list">${list.slice(0,200).map(q=>{const p=state.progress[q.id];return `<div class="question-mini"><span class="subject-badge" style="background:${CAT[q.c].color}22;color:${CAT[q.c].color}">${CAT[q.c].name[0]}</span><div class="question-mini-main"><strong>${E(q.t)}</strong><div class="small">${E(q.q).slice(0,70)}${q.q.length>70?'…':''}</div><div class="small">${p?`学習${p.seen}回 · ${p.lastOk?'直近正解':'直近誤答'} · 復習${E(p.due)}`:'未学習'}</div></div><div class="question-mini-actions"><button data-action="viewQ" data-id="${q.id}">解説</button><button data-action="bookmark" data-id="${q.id}" aria-label="ブックマーク切替">${state.bookmarks.includes(q.id)?'★':'☆'}</button></div></div>`;}).join('')}</div>${list.length>200?`<p class="small muted">先頭200問を表示しています。</p>`:''}`:`<div class="empty-msg">${ui.weakSearch?'検索条件に一致する問題がありません。':'まだ対象の問題はありません。演習を進めるとここに表示されます。'}</div>`}</div><div class="notice info" style="margin-top:17px">復習間隔は、初回正解→1日後、連続正解→3日・7日・14日…と延ばす方式です。誤答や「自信なし」は優先的に再出題します。高度なAIモデルを使っているわけではありません。</div>`;
}
function writtenHTML(){const qs=D.questions.filter(q=>q.type==='written');const done=qs.filter(q=>state.progress[q.id]?.seen>0).length;
 return `<div class="page-banner gold-banner"><h1>記述式対策</h1><p>採点ポイントを意識しながら40字程度で簡潔に答案を作成。模範解答を確認し、自分で点数を付けて改善できます。</p></div><div class="stats-grid">${statCard('記述問題数',qs.length,'問','行政法・民法を収録','✎')}${statCard('対策済み問題',done,'問','自己採点した問題','✓')}${statCard('模試での配点','60','点','20点×3問','▤')}${statCard('答案の目安','40','字','設問条件に応じて調整','◎')}</div><div class="card" style="margin-bottom:17px"><div class="card-head"><h2>記述式の演習に進む</h2></div><p class="small muted">解答→模範解答確認→採点ポイントに沿った自己採点、の順番で取り組めます。</p><div class="settings-actions"><button class="button" data-action="startWriting" data-value="all">記述式をまとめて演習する →</button><button class="button secondary" data-action="startWriting" data-value="admin">行政法だけ演習</button><button class="button secondary" data-action="startWriting" data-value="civil">民法だけ演習</button></div></div><div class="card"><div class="card-head"><h2>収録テーマ</h2><span class="pill">${qs.length}題</span></div><div class="question-list">${qs.map(q=>`<div class="question-mini"><span class="subject-badge" style="background:${CAT[q.c].color}22;color:${CAT[q.c].color}">${CAT[q.c].name[0]}</span><div class="question-mini-main"><strong>${E(q.t)}</strong><div class="small">${E(q.q).slice(0,93)}…</div></div><button class="button secondary small" data-action="viewQ" data-id="${q.id}">確認</button></div>`).join('')}</div></div><div class="notice info" style="margin-top:16px">記述式に自動の完全採点は搭載していません。法律答案の表現は多様で、単純な文字列一致では正しい評価ができないため、模範解答・ポイントによる自己採点を採用しています。</div>`;
}
function recordsHTML(){const s=categoryStats(),total=state.logs.length,accuracy=PC(state.logs.reduce((a,l)=>a+l.ratio,0),total),seen=Object.values(state.progress).filter(p=>p.seen>0).length;
 const history=[...state.history].sort((a,b)=>b.at-a.at);
 const recordTable=history.length?`<div style="overflow:auto"><table class="records-table"><thead><tr><th>実施日</th><th>学習内容</th><th>解答数</th><th>結果</th></tr></thead><tbody>${history.slice(0,100).map(h=>`<tr><td>${dateStr(h.at)}</td><td>${h.type==='exam'?'180分模擬試験':'問題演習'}</td><td>${h.answered??h.count}問</td><td class="num">${h.type==='exam'?(h.graded?`${h.score}/300点`:`${h.score??0}点＋記述未採点`):`${h.accuracy??0}%`}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-msg">学習履歴はまだありません。演習や模試を完了すると表示されます。</div>';
 const best=s.filter(c=>c.attempts).sort((a,b)=>a.ratio-b.ratio).slice(0,3);
 return `<div class="page-banner"><h1>学習記録・実力分析</h1><p>学習済みの範囲、科目別正答率、演習履歴、復習の必要度をまとめて確認できます。データはこの端末に保存されています。</p></div><div class="stats-grid">${statCard('総解答数',total,'問','累計の解答回数','▤')}${statCard('平均得点率',accuracy,'%','採点済み解答の平均','◉')}${statCard('学習済み問題',seen,'問',`全${D.questions.length}問中`,'✓')}${statCard('連続学習',daysStreak(),'日','学習した日を集計','♨')}</div><div class="two-col"><div class="card"><div class="card-head"><h2>科目別レポート</h2></div><div style="overflow:auto"><table class="records-table"><thead><tr><th>科目</th><th>演習数</th><th>得点率</th><th>学習済み</th></tr></thead><tbody>${s.map(c=>`<tr><td><strong>${E(c.name)}</strong></td><td>${c.attempts}</td><td><span class="pill ${c.attempts?(c.ratio>=70?'good':c.ratio<50?'bad':'warn'):''}">${c.attempts?c.ratio+'%':'—'}</span></td><td>${c.seen}/${c.total}</td></tr>`).join('')}</tbody></table></div></div><div class="card"><div class="card-head"><h2>優先的に見直す科目</h2></div>${best.length?`<div class="tip-list">${best.map((c,i)=>`<div class="tip"><div class="tip-circle">${i+1}</div><div style="flex:1"><strong>${E(c.name)}　${c.ratio}%</strong><span>${c.attempts}回解答 · 復習期日${c.due}問</span><button class="text-link" data-action="studyCategory" data-value="${c.id}">この科目を演習 →</button></div></div>`).join('')}</div>`:'<div class="empty-msg">科目別の弱点は、演習を進めると表示されます。</div>'}<div class="mini-line"></div><h3>学習目標の達成状況</h3><p class="small muted">今日 ${doneToday()} / ${state.settings.goal}問</p><div class="progress-track"><div class="progress-fill" style="width:${cap(PC(doneToday(),state.settings.goal),0,100)}%"></div></div><div class="settings-actions" style="margin-top:17px"><button class="button secondary small" data-action="nav" data-value="settings">目標数を変更</button><button class="button secondary small" data-action="export">記録をバックアップ</button></div></div></div>${sectionHead('セッション履歴','演習と模擬試験の完了履歴。')}<div class="card">${recordTable}</div>`;
}
function settingsHTML(){const s=state.settings;
 return `<div class="page-banner"><h1>設定・バックアップ</h1><p>学習目標、表示方法、受験日、学習データのバックアップを管理できます。アカウント登録やサーバーへの通信は不要です。</p></div><div class="card" style="margin-bottom:18px"><div class="card-head"><h2>学習環境</h2></div><div class="settings-row"><div><strong>一日の目標問題数</strong><p>ダッシュボードの達成率に反映します。</p></div><select class="select" style="max-width:150px" data-action="settingGoal">${[5,10,15,20,30,50,100].map(n=>`<option value="${n}" ${s.goal===n?'selected':''}>${n}問 / 日</option>`).join('')}</select></div><div class="settings-row"><div><strong>目標試験日</strong><p>現在は次年度を想定した仮設定です。公式発表後に変更できます。</p></div><input class="text-input" style="max-width:190px" data-action="settingTarget" type="date" value="${s.target}"></div><div class="settings-row"><div><strong>表示テーマ</strong><p>明るいテーマとダークテーマを切り替えます。</p></div><select class="select" style="max-width:140px" data-action="settingTheme"><option value="light" ${s.theme==='light'?'selected':''}>ライト</option><option value="dark" ${s.theme==='dark'?'selected':''}>ダーク</option></select></div></div>
 <div class="card" style="margin-bottom:18px"><div class="card-head"><h2>学習データの管理</h2><span class="pill ${storageOK?'good':'bad'}">${storageOK?'この端末に保存中':'保存機能に制限あり'}</span></div><p class="small muted">正答履歴・復習期日・模試結果・問題メモに加え、六法のマーカー線・ブックマーク・条文メモをJSONファイルに保存できます（大量の法令本文キャッシュは含みません）。別端末への移行にも利用できます。</p><div class="settings-actions"><button class="button" data-action="export">↓ バックアップを保存</button><button class="button secondary" data-action="import">↑ バックアップを復元</button><button class="button ghost" data-action="resetData">学習データを初期化</button></div><div class="notice" style="margin-top:17px">ブラウザの閲覧データを削除すると学習履歴が失われる場合があります。定期的に「バックアップを保存」を利用してください。復元時は現在のデータが置き換えられます。</div></div>
 <div class="card"><div class="card-head"><h2>アプリ・法令について</h2></div><div class="settings-row"><div><strong>問題データ版</strong><p>オリジナル問題。公式過去問そのものではありません。</p></div><span class="pill">${E(D.version)} · ${D.questions.length}問</span></div><div class="settings-row"><div><strong>法令基準日</strong><p>2026年度試験では2026年4月1日時点で施行されている法令が対象です。</p></div><span class="pill">2026/04/01</span></div><div class="settings-row"><div><strong>令和8年度の公式案内</strong><p>試験の科目、形式、基準などは最新の公式発表を優先してください。</p></div><a href="https://www.gyosei-shiken.or.jp/doc/guide/guide.html" target="_blank" rel="noopener noreferrer" class="small strong">公式サイト ↗</a></div><div class="settings-row"><div><strong>六法・法令ライブラリ</strong><p>音声読み上げと色別マーカー線で条文を学習。主要六法と重要法令の本文15本を収録しています。</p></div><button class="button small secondary" data-action="nav" data-value="roppo">六法を開く</button></div><div class="settings-row"><div><strong>条文の確認</strong><p>法改正や解釈の詳細はe-Govの最新条文をご覧ください。</p></div><a href="https://laws.e-gov.go.jp/" target="_blank" rel="noopener noreferrer" class="small strong">e-Gov法令検索 ↗</a></div><div class="settings-row"><div><strong>オフライン利用</strong><p>インストール対応ブラウザでは、HTTPS配信後にホーム画面へ追加するとオフライン利用できます。</p></div><span class="pill good">PWA対応</span></div></div>`;
}
function modalContent(q){
 const p=state.progress[q.id];
 const qa=q.type==='mc'?`<div class="answer-panel"><p><strong>正解：</strong>${E(q.o[0])}</p><p>${E(q.x)}</p><div class="reference">根拠・復習テーマ：${E(q.r)}</div></div>`:q.type==='multi'?`<div class="answer-panel"><p><strong>正解：</strong>${q.a.map((v,i)=>`${'アイウエ'[i]}＝${E(q.o[v])}`).join('　')}</p><p>${E(q.x)}</p><div class="reference">${E(q.r)}</div></div>`:`<div class="answer-panel"><p><strong>模範解答例：</strong>${E(q.s)}</p>${rubricHTML(q)}<div class="reference">${E(q.ref)}</div></div>`;
 return `<div class="q-eyebrow">${catChip(q.c)}<span class="pill">${E(q.t)}</span><span class="pill">${q.type==='mc'?'五肢択一':q.type==='multi'?'多肢選択':'記述式'}</span></div><div class="q-prompt">${E(q.q)}</div>${qa}${lawLinks(q)}<div class="small muted" style="margin-top:13px">${p?`過去${p.seen}回演習 · ${p.lastOk?'最後の解答：正解':'最後の解答：不正解'} · 次の復習${E(p.due)}`:'まだ演習していません'}</div><div class="note-editor"><label for="question-note">✎ この問題の学習メモ（端末内に自動保存）</label><textarea id="question-note" class="text-area" data-action="noteInput" data-id="${q.id}" maxlength="4000" placeholder="間違えた原因・条文・覚え方を入力">${E(state.notes[q.id]||'')}</textarea><div class="tiny muted">記録はバックアップの対象になります。個人情報の記入にはご注意ください。</div></div><div class="quiz-actions"><div class="quiz-tools"><button class="button secondary small" data-action="bookmark" data-id="${q.id}">${state.bookmarks.includes(q.id)?'★ 保存済み':'☆ 保存する'}</button><button class="button secondary small" data-action="flagQuestion" data-id="${q.id}">${state.flags.includes(q.id)?'⚑ 要確認を解除':'⚐ 要確認に追加'}</button></div><button class="button" data-action="singlePractice" data-id="${q.id}">この問題に挑戦</button></div><div class="reference-links"><a href="https://laws.e-gov.go.jp/" target="_blank" rel="noopener noreferrer">e-Gov法令検索で確認 ↗</a><span class="small muted">参照条文：${E(q.r||q.ref)}</span></div>`;
}
function showModal(){const host=document.getElementById('modal-host');if(!host)return;
 if(!ui.modal){host.innerHTML='';return;}
 const q=KB[ui.modal];if(!q){ui.modal=null;host.innerHTML='';return;}
 host.innerHTML=`<div class="modal-backdrop" id="modal-overlay" data-action="modalOverlay"><div class="modal" role="dialog" aria-modal="true" aria-label="問題の詳細"><div class="modal-head"><h2>問題の解説</h2><button class="icon-btn" data-action="closeModal" aria-label="閉じる">×</button></div>${modalContent(q)}</div></div>`;
}
function saveExamGrade(id,pts){const ex=state.exam;if(!ex||!ex.finished||!KB[id]||KB[id].type!=='written')return;
 pts=cap(Math.round(Number(pts)),0,20);
 const isFirst=!Object.hasOwn(ex.grades,id);ex.grades[id]=pts;const archived=state.archivedExams.find(e=>e.id===ex.id);if(archived)archived.grades[id]=pts;
 if(isFirst&&!ex.recordedWritten[id]){recordAttempt(KB[id],pts/20,2,'exam');ex.recordedWritten[id]=true;}
 const s=scoreMock(ex);const h=state.history.find(h=>h.type==='exam'&&h.id===ex.id);
 if(h){h.score=s.total;h.law=s.law;h.basic=s.basic;h.graded=s.complete;}
 save();render({keepScroll:true});toast('自己採点の結果を反映しました。');
}
function exportData(){
 const str=JSON.stringify({app:'GYOSHI_MASTER',version:3,exportedAt:new Date().toISOString(),data:state,roppo:window.GYOSHI_ROPPO?.exportMeta()||null},null,2);
 const blob=new Blob([str],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=`行政書士MASTER_学習バックアップ_${TODAY()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('学習データのバックアップを作成しました。');
}
function importData(file){
 if(!file)return;
 if(file.size>10*1024*1024){toast('バックアップは10MB以内のファイルを選んでください。');return;}
 const r=new FileReader();r.onload=()=>{
  try{
   const payload=JSON.parse(String(r.result));if(payload?.app!=='GYOSHI_MASTER'||!payload.data||typeof payload.data!=='object'||Array.isArray(payload.data))throw Error('このアプリのバックアップではありません。');
   if(!confirm('現在の学習データをバックアップの内容で上書きしますか？\n先に現在のデータを保存しておくことを推奨します。'))return;
   const restored=normalized(payload.data);
   if(!save(restored))throw Error('ブラウザに学習データを保存できませんでした。');
   if(payload.roppo&&window.GYOSHI_ROPPO?.importMeta(payload.roppo)===false){
    save();throw Error('条文メモやマーカーを復元できませんでした。');
   }
   state=restored;ui.practice=state.practice;ui.modal=null;ui.archiveViewing=null;go('dashboard');toast('学習データを復元しました。');
  }catch(err){toast('読み込みできませんでした: '+err.message);}
 };r.onerror=()=>toast('ファイルを読み込めませんでした。');r.readAsText(file,'utf-8');
}
function onePractice(q){if(ui.practice&&!ui.practice.finished&&!confirm('進行中の演習を破棄して、この問題だけを演習しますか？'))return;ui.practice={mode:'single',type:q.type,subject:q.c,startedAt:Date.now(),deadline:0,timed:false,index:0,items:[{id:q.id,order:shuffle([0,1,2,3,4]),wordOrder:q.type==='multi'?shuffle(Array.from({length:20},(_,i)=>i)):null,answer:null,checked:false,grade:null,confidence:2}],results:[],finished:false};ui.modal=null;persistPractice();go('study');}
function weakSession(){if(ui.practice&&!ui.practice.finished&&!confirm('進行中の演習を破棄して、復習に切り替えますか？'))return;let xs=ui.weakTab==='wrong'?wrongQuestions():ui.weakTab==='due'?dueQuestions():D.questions.filter(q=>state.bookmarks.includes(q.id));if(ui.weakSearch)xs=xs.filter(q=>(q.t+' '+q.q+' '+q.r).includes(ui.weakSearch));if(!xs.length){toast('復習対象がありません。');return;}
 const picked=sortedPool(xs,'adaptive').slice(0,10);ui.practice={mode:'review',type:'mixed',subject:'all',startedAt:Date.now(),deadline:0,timed:false,index:0,items:picked.map(q=>({id:q.id,order:shuffle([0,1,2,3,4]),wordOrder:q.type==='multi'?shuffle(Array.from({length:20},(_,i)=>i)):null,answer:null,checked:false,grade:null,confidence:2})),results:[],finished:false};persistPractice();go('study');}
/* ULTRA: 問題データベース、学習プラン、模試アーカイブ、分析の補助ビュー。 */
function libraryHTML(){
 const L=ui.library;let xs=D.questions.filter(q=>(L.c==='all'||q.c===L.c)&&(L.type==='all'||q.type===L.type));
 if(L.filter==='unseen')xs=xs.filter(q=>!state.progress[q.id]?.seen);
 if(L.filter==='wrong')xs=xs.filter(q=>state.progress[q.id]?.seen&&state.progress[q.id]?.lastOk===false);
 if(L.filter==='due')xs=xs.filter(q=>state.progress[q.id]?.seen&&state.progress[q.id]?.due<=TODAY());
 if(L.filter==='book')xs=xs.filter(q=>state.bookmarks.includes(q.id));
 if(L.filter==='flag')xs=xs.filter(q=>state.flags.includes(q.id));
 if(L.filter==='note')xs=xs.filter(q=>Boolean(state.notes[q.id]?.trim()));
 if(L.filter==='advanced')xs=xs.filter(q=>q.advanced);
 if(L.search){const term=fold(L.search);xs=xs.filter(q=>questionSearchText(q).includes(term));}
 if(L.sort==='difficult')xs.sort((a,b)=>b.l-a.l||a.id.localeCompare(b.id));
 else if(L.sort==='due')xs.sort((a,b)=>(state.progress[a.id]?.due||'9999').localeCompare(state.progress[b.id]?.due||'9999'));
 else if(L.sort==='recent')xs.sort((a,b)=>a.id.localeCompare(b.id)*-1);
 else xs.sort((a,b)=>D.categories.findIndex(c=>c.id===a.c)-D.categories.findIndex(c=>c.id===b.c)||a.t.localeCompare(b.t,'ja'));
 const pageSize=20,totalPages=Math.max(1,Math.ceil(xs.length/pageSize)),page=cap(L.page,1,totalPages);ui.library.page=page;
 const shown=xs.slice((page-1)*pageSize,page*pageSize);
 const options=(list,value)=>list.map(([v,label])=>`<option value="${v}" ${value===v?'selected':''}>${E(label)}</option>`).join('');
 const filters=[['all','すべて'],['unseen','未学習'],['wrong','誤答'],['due','復習期日'],['book','保存済み'],['note','メモあり'],['flag','要確認'],['advanced','事例・応用']];
 return `<div class="page-banner"><h1>問題データベース</h1><p>300問を科目・形式・学習状態・キーワードから検索。解説、条文の手がかり、専用メモを一か所に集約します。</p></div>
 <div class="card" style="margin-bottom:17px"><div class="form-grid library-form"><div class="field"><label for="libsearch">キーワード・条文・論点</label><input id="libsearch" class="text-input" data-action="librarySearch" type="search" placeholder="例：取消し、民法95条" maxlength="120" value="${E(L.search)}"></div><div class="field"><label for="libcat">科目</label><select id="libcat" class="select" data-action="libraryCat">${options([['all','すべての科目'],...D.categories.map(c=>[c.id,c.name])],L.c)}</select></div><div class="field"><label for="libtype">問題形式</label><select id="libtype" class="select" data-action="libraryType">${options([['all','すべての形式'],['mc','五肢択一'],['multi','多肢選択'],['written','記述式']],L.type)}</select></div></div><div class="setup-section">学習状態で絞り込み</div><div class="chip-grid">${filters.map(([v,label])=>`<button class="filter-chip ${L.filter===v?'active':''}" data-action="libraryFilter" data-value="${v}">${E(label)}</button>`).join('')}</div><div class="library-toolbar"><span class="small muted">該当 <strong>${xs.length}</strong>問 ・ ${page}/${totalPages}ページ</span><div class="chip-grid">${[['subject','科目順'],['difficult','難しい順'],['due','復習順'],['recent','新着順']].map(([v,label])=>`<button class="filter-chip ${L.sort===v?'active':''}" data-action="librarySort" data-value="${v}">${label}</button>`).join('')}</div></div></div>
 <div class="card"><div class="question-list">${shown.length?shown.map(q=>{const p=state.progress[q.id],hasNote=Boolean(state.notes[q.id]?.trim());return `<div class="question-mini library-q"><span class="subject-badge" style="background:${CAT[q.c].color}20;color:${CAT[q.c].color}">${E(CAT[q.c].name.charAt(0))}</span><div class="question-mini-main"><div class="library-tags">${E(CAT[q.c].name)} · ${q.type==='mc'?'五肢択一':q.type==='multi'?'多肢選択':'記述'} · 難易度${q.l}${q.advanced?' · 事例問題':''}${state.flags.includes(q.id)?' · ⚑ 要確認':''}</div><strong title="${E(q.t)}">${E(q.t)}</strong><p class="library-prompt">${E(q.q)}</p><div class="small muted">${p?`${p.seen}回学習 · ${p.lastOk?'前回正解':'前回要復習'} · 次回${E(p.due)}`:'未学習'}${hasNote?' · ✎ メモあり':''}</div></div><div class="question-mini-actions"><button data-action="bookmark" data-id="${q.id}" aria-label="ブックマークを切り替え">${state.bookmarks.includes(q.id)?'★':'☆'}</button><button data-action="viewQ" data-id="${q.id}">詳細</button><button data-action="singlePractice" data-id="${q.id}">演習</button></div></div>`;}).join(''):'<div class="empty-msg">条件に合う問題がありません。絞り込み条件を変更してください。</div>'}</div>${totalPages>1?`<div class="pagination"><button class="button secondary small" data-action="libraryPage" data-value="${page-1}" ${page<=1?'disabled':''}>← 前の20問</button><span class="small muted">${(page-1)*pageSize+1}–${Math.min(page*pageSize,xs.length)} / ${xs.length}</span><button class="button secondary small" data-action="libraryPage" data-value="${page+1}" ${page>=totalPages?'disabled':''}>次の20問 →</button></div>`:''}</div>`;
}
function plannerHTML(){
 const s=categoryStats();const target=new Date(state.settings.target+'T00:00:00').getTime();const days=Math.max(0,Math.ceil((target-Date.now())/86400000));const due=dueQuestions().length;const unseen=D.questions.filter(q=>!state.progress[q.id]?.seen).length;const goal=state.settings.goal;const todayDone=doneToday();
 const byDay=Array.from({length:35},(_,i)=>{const day=nextDay(TODAY(),i-34);return {day,n:state.logs.filter(l=>l.date===day).length};});
 const weekCount=byDay.slice(-7).reduce((x,a)=>x+a.n,0);const projected=days?Math.ceil((unseen+due)/days):unseen+due;
 const weak=s.filter(c=>c.attempts>=1).sort((a,b)=>a.ratio-b.ratio||b.due-a.due).slice(0,4);
 const studyPlan=[{title:'① 期限が来た復習',desc:`復習期日 ${due}問からスタート`,action:'nextDue',label:'復習へ'},{title:'② 最重要の弱点を補強',desc:weak.length?`${weak[0].name}：得点率 ${weak[0].ratio}%`:'科目別の得点率を演習で測定',action:'learnWeakest',label:'弱点に挑戦'},{title:'③ 新規問題で範囲拡大',desc:`未学習 ${unseen}問・目標 ${goal}問/日`,action:'quickStart',label:'おすすめ演習'},{title:'④ 時間を計って実戦確認',desc:'本試験60問・180分、復習用の採点付き',action:'nav',value:'mock',label:'模試へ'}];
 return `<div class="page-banner"><h1>合格への学習計画</h1><p>目標日までの日数、既習・未習問題、期限が来た復習から「今日やること」を提案します。実力や合格可能性を断定する予測ではありません。</p></div>
 <div class="stats-grid">${statCard('目標日まで',days,'日',E(state.settings.target)+'（仮設定）','◷')}${statCard('本日の進捗',todayDone+'/'+goal,'問',todayDone>=goal?'今日の目標を達成':'目標まで '+Math.max(0,goal-todayDone)+'問','✓')}${statCard('復習の期限',due,'問','忘却曲線に合わせて再演習','↻')}${statCard('未学習の範囲',unseen,'問',D.questions.length+'問中','▤')}</div>
 <div class="two-col"><div class="card"><div class="card-head"><h2>今日のおすすめ4ステップ</h2><span class="pill good">個別学習ルート</span></div><div class="study-steps">${studyPlan.map((it,i)=>`<div class="study-step"><div class="step-index">${i+1}</div><div><strong>${it.title}</strong><p class="small muted">${it.desc}</p></div><button class="button small secondary" data-action="${it.action}" ${it.value?`data-value="${it.value}"`:''}>${it.label}</button></div>`).join('')}</div><div class="notice info" style="margin-top:17px">目安：毎日${state.settings.dailyMinutes}分の学習時間を確保。${days?`未学習・復習の単純按分は約${projected}問/日ですが、理解と反復を優先してください。`:'目標日が過ぎている場合は設定から更新してください。'}</div></div>
 <div class="card"><div class="card-head"><h2>過去35日の学習カレンダー</h2><span class="pill">直近7日 ${weekCount}問</span></div><div class="heatmap" role="img" aria-label="過去35日間の解答数ヒートマップ">${byDay.map(d=>`<div class="heat-cell l${d.n===0?0:d.n<5?1:d.n<15?2:d.n<30?3:4}" title="${d.day}：${d.n}問"><span class="sr-only">${d.day} ${d.n}問</span></div>`).join('')}</div><div class="heat-legend"><span>少ない</span><span class="heat-cell l0"></span><span class="heat-cell l1"></span><span class="heat-cell l2"></span><span class="heat-cell l3"></span><span class="heat-cell l4"></span><span>多い</span></div><div class="mini-line"></div><h3>科目別の重点戦略</h3>${weak.length?weak.map(c=>`<div class="weak-plan"><div><strong>${E(c.name)}</strong><span class="small muted">${c.ratio}% · ${c.attempts}回解答</span></div><button class="text-link" data-action="studyCategory" data-value="${c.id}">強化する →</button></div>`).join(''):'<div class="empty-msg">まだ解答履歴がありません。最初の10問から始めてください。</div>'}<div class="settings-actions"><button class="button secondary small" data-action="nav" data-value="settings">目標日・学習時間を変更</button></div></div></div>`;
}
function archivedMockHTML(){
 const ex=state.archivedExams.find(x=>x.id===ui.archiveViewing);if(!ex){ui.archiveViewing=null;return recordsEnhancementsHTML()+recordsHTML();}
 const sc=scoreMock(ex);
 return `<div class="page-banner"><div class="overline">EXAM ARCHIVE / SAVED FOLIOS</div><h1>過去の模擬試験を再確認</h1><p>${dateStr(ex.finishedAt)}に受験した模試の解答・解説です。採点済みの記述式得点は保存時の内容です。</p></div>
 <div class="quiz-actions" style="margin-bottom:14px"><button class="button secondary" data-action="closeArchive">← 学習記録へ戻る</button><button class="button ghost" data-action="print">印刷する</button></div>
 <div class="stats-grid">${statCard('総得点',sc.total,'/300',sc.complete?'記述式自己採点を含む':'記述式未採点分あり','★')}${statCard('法令等',sc.law,'/244','参考基準122点','▤')}${statCard('基礎知識',sc.basic,'/56','参考基準24点','◉')}${statCard('参考判定',sc.complete?(sc.pass?'基準達成':'未達成'):'未採点','','公式判定ではありません','◎')}</div>
 <div class="card"><div class="card-head"><h2>全60問の解答・解説</h2><span class="pill">再閲覧専用</span></div><div class="notice info">このアーカイブの問題文と解答は保存した内容に基づいています。現行の法令や採点基準との一致を保証しません。</div>${sc.parts.map(part=>reviewItemHTML(part,false)).join('')}</div>`;
}
function recordsEnhancementsHTML(){
 const exams=state.history.filter(h=>h.type==='exam').slice(-8).reverse(),arch=state.archivedExams;
 const recent=Array.from({length:14},(_,i)=>{const d=nextDay(TODAY(),i-13);const ls=state.logs.filter(l=>l.date===d);return {d,n:ls.length,avg:PC(ls.reduce((a,v)=>a+v.ratio,0),ls.length)};});
 const max=Math.max(10,...recent.map(x=>x.n));
 return `<div class="two-col"><div class="card"><div class="card-head"><h2>直近14日の学習量</h2></div><div class="activity-chart" aria-label="過去14日間の解答数">${recent.map(x=>`<div class="activity-day" title="${x.d}：${x.n}問"><div class="activity-count">${x.n||''}</div><div class="activity-bar-bg"><div class="activity-bar" style="height:${Math.max(3,x.n/max*100)}%"></div></div><div class="activity-name">${x.d.slice(-2)}</div></div>`).join('')}</div></div><div class="card"><div class="card-head"><h2>模試の得点推移</h2><span class="pill">直近${exams.length}回</span></div>${exams.length?`<div class="exam-history-mini">${exams.map(h=>`<div class="exam-history-row"><div><strong>${dateStr(h.at)}</strong><span class="small muted">${h.graded?'記述式採点済み':'記述式未採点'}</span></div><strong>${h.score}/300</strong>${arch.some(x=>x.id===h.id)?`<button class="button secondary small" data-action="viewArchive" data-id="${E(h.id)}">全問再閲覧</button>`:'<span class="small muted">結果のみ</span>'}</div>`).join('')}</div>`:'<div class="empty-msg">模試の受験履歴はまだありません。</div>'}<div class="notice info" style="margin-top:12px">以前のバージョンで受けた模試は点数履歴のみの場合があります。この版で完了した模試は、次回の模試開始時に全60問の解答を保存します。</div></div></div>`;
}
function dashboardEnhancementsHTML(){
 const strong=D.questions.filter(q=>state.progress[q.id]?.streak>=3).length;const notes=Object.values(state.notes).filter(x=>x.trim()).length, flagged=state.flags.length;
 const topicMap=new Map();for(const l of state.logs){const q=KB[l.id];if(!q)continue;const k=q.c+'|'+q.t;const v=topicMap.get(k)||{c:q.c,t:q.t,n:0,p:0};v.n++;v.p+=l.ratio;topicMap.set(k,v);}
 const weak=[...topicMap.values()].filter(t=>t.n>=2).sort((a,b)=>a.p/a.n-b.p/b.n).slice(0,5);
 return `<div class="two-col"><div class="card"><div class="card-head"><h2>記憶のしおり</h2><span class="pill good">間隔反復</span></div><div class="ultra-stats"><div><strong>${strong}</strong><span>3回以上連続正解</span></div><div><strong>${notes}</strong><span>学習メモ</span></div><div><strong>${flagged}</strong><span>要確認の問題</span></div></div><div class="settings-actions"><button class="button small secondary" data-action="nextDue">期日の来た問題を復習</button><button class="button small ghost" data-action="nav" data-value="library">全300問を検索</button></div></div><div class="card"><div class="card-head"><h2>つまずきやすい論点</h2><button class="text-link" data-action="nav" data-value="planner">計画を見る →</button></div>${weak.length?weak.map(v=>`<div class="weak-plan"><div><strong>${E(v.t)}</strong><span class="small muted">${E(CAT[v.c].name)} · ${v.n}回解答</span></div><span class="pill ${v.p/v.n<.5?'bad':'warn'}">${PC(v.p,v.n)}%</span></div>`).join(''):'<div class="empty-msg">同じ論点を2回以上解くと、重点復習テーマを表示します。</div>'}</div></div>`;
}
function advancedSettingsHTML(){return `<div class="card" style="margin:18px 0"><div class="card-head"><h2>学び方の調整</h2></div><div class="settings-row"><div><strong>1日の学習予定時間</strong><p>学習計画画面の参考スケジュールに使います。</p></div><select class="select" style="max-width:155px" data-action="settingDailyMinutes">${[15,30,45,60,90,120,180,240].map(n=>`<option value="${n}" ${state.settings.dailyMinutes===n?'selected':''}>${n}分/日</option>`).join('')}</select></div><div class="settings-row"><div><strong>問題文を大きく表示</strong><p>小さな文字が読みづらい場合に切り替えます。</p></div><select class="select" style="max-width:155px" data-action="settingReadable"><option value="normal" ${!state.settings.readable?'selected':''}>標準</option><option value="large" ${state.settings.readable?'selected':''}>大きめ</option></select></div><div class="settings-row"><div><strong>学習ノート</strong><p>各問題の解説ページで書いたメモを確認できます。</p></div><button class="button small secondary" data-action="nav" data-value="library">問題検索を開く</button></div><div class="settings-row"><div><strong>アプリの更新・法改正</strong><p>問題データは自動で法改正に追随しません。公式の最新法令と照合してください。記述式の配点は自己採点です。</p></div><span class="pill warn">要・最新法令確認</span></div><div class="settings-actions"><button class="button secondary small" data-action="print">現在の画面を印刷する</button><button class="button secondary small" data-action="export">すぐにバックアップ</button></div></div>`;}
function mockArchiveShortcutHTML(){const n=state.archivedExams.length;if(!n)return '';return `<div class="card" style="margin-top:14px"><div class="card-head"><h2>過去の模試アーカイブ</h2><span class="pill">${n}回分保存</span></div><p class="small muted">過去12回までの全60問の解答・自己採点を再確認できます。</p><div class="settings-actions">${state.archivedExams.slice(-4).reverse().map(ex=>`<button class="button secondary small" data-action="viewArchive" data-id="${E(ex.id)}">${dateStr(ex.finishedAt)} の模試</button>`).join('')}</div></div>`;}

function clickAction(ev){const b=ev.target.closest('[data-action]');if(!b)return;
 if(b.tagName==='INPUT'||b.tagName==='SELECT'||b.tagName==='TEXTAREA')return;
 const a=b.dataset.action,v=b.dataset.value,id=b.dataset.id;
 switch(a){
  case 'skipContent':ev.preventDefault();document.getElementById('content').focus();break;
  case 'nav':ui.archiveViewing=null;go(v);break;
  case 'guideMark':{
   if(!GUIDE?.getCard(id)||!['known','review'].includes(v))break;
   const progress={...state.essentials};
   if(progress[id]===v)delete progress[id];else progress[id]=v;
   if(!save({...state,essentials:progress})){toast('学習状態を端末に保存できませんでした。');break;}
   state.essentials=progress;
   ui.guide.openCards.add(id);
   render({keepScroll:true});
   if(!document.getElementById(b.id))document.getElementById('sg-progress')?.focus();
   break;
  }
  case 'guidePractice':{
   const card=GUIDE?.getCard(id);
   if(!card)break;
   const [c,keyword,type='all']=card.practice;
   const matches=keyword&&D.questions.some(q=>q.c===c&&(type==='all'||q.type===type)&&questionSearchText(q).includes(fold(keyword)));
   ui.library={search:matches?keyword:'',c,type,filter:'all',page:1,sort:'subject'};
   go('library');break;
  }
  case 'libraryFilter':ui.library.filter=v;ui.library.page=1;render({keepScroll:true});break;
  case 'librarySort':ui.library.sort=v;ui.library.page=1;render({keepScroll:true});break;
  case 'libraryPage':ui.library.page=Math.max(1,Number(v)||1);render();window.scrollTo(0,0);break;
  case 'flagQuestion':{const i=state.flags.indexOf(id);if(i<0){state.flags.push(id);toast('要確認に追加しました。');}else{state.flags.splice(i,1);toast('要確認を解除しました。');}save();render({keepScroll:true});break;}
  case 'viewArchive':ui.archiveViewing=id;go('records');break;
  case 'closeArchive':ui.archiveViewing=null;render();break;
  case 'print':window.print();break;
  case 'nextDue':ui.weakTab='due';go('weak');break;
  case 'learnWeakest':{if(ui.practice&&!ui.practice.finished&&!confirm('進行中の演習を破棄して、苦手分野の対策に切り替えますか？'))break;const sorted=categoryStats().filter(c=>c.attempts).sort((a,b)=>a.ratio-b.ratio);if(sorted.length){ui.study.c=sorted[0].id;ui.study.type='mc';ui.practice=null;state.practice=null;save();go('study');}else{go('study');}break;}
  case 'librarySelect':ui.library.c=v;ui.library.page=1;render({keepScroll:true});break;
  case 'menu':ui.sidebar=!ui.sidebar;render({keepScroll:true});break;
  case 'closeSide':ui.sidebar=false;render({keepScroll:true});break;
  case 'theme':state.settings.theme=state.settings.theme==='dark'?'light':'dark';save();render({keepScroll:true});break;
  case 'quickStart':{const conf={c:'all',type:'mc',mode:'adaptive',count:10,difficulty:'all',search:''};ui.study={...conf};startPractice(conf);break;}
  case 'studyCategory':ui.study.c=v;ui.study.type='mc';ui.study.mode='adaptive';go('study');break;
  case 'setCat':ui.study.c=v;render({keepScroll:true});break;
  case 'setMode':ui.study.mode=v;render({keepScroll:true});break;
  case 'setDifficulty':ui.study.difficulty=v;render({keepScroll:true});break;
  case 'startPractice':startPractice();break;
  case 'practiceMC':{const it=practiceItem();if(it&&!it.checked){it.answer=Number(v);persistPractice();render({keepScroll:true});}break;}
  case 'confidence':{const it=practiceItem();if(it&&!it.checked){it.confidence=Number(v);persistPractice();render({keepScroll:true});}break;}
  case 'checkPractice':checkPractice();break;
  case 'skipPractice':nextPractice(true);break;
  case 'nextPractice':nextPractice(false);break;
  case 'quitPractice':if(confirm('演習を終了しますか？ 完了前のセッション結果は記録されませんが、採点済みの問題は学習履歴に保存されています。')){ui.practice=null;persistPractice();render();window.scrollTo(0,0);}break;
  case 'resetPractice':ui.practice=null;persistPractice();render();window.scrollTo(0,0);break;
  case 'savePracticeGrade':{
   const it=practiceItem(),q=it&&KB[it.id];if(!it||q.type!=='written'||it.grade!==null)break;
   const slider=document.querySelector('[data-action="practiceGrade"]');if(!slider)break;
   it.grade=cap(Number(slider.value),0,20);recordAttempt(q,it.grade/20,2,'practice');ui.practice.results.push({id:q.id,ratio:it.grade/20});persistPractice();render({keepScroll:true});toast('自己採点を保存しました。');break;
  }
  case 'bookmark':{const pos=state.bookmarks.indexOf(id);if(pos<0){state.bookmarks.push(id);toast('ブックマークに追加しました。');}else{state.bookmarks.splice(pos,1);toast('ブックマークを解除しました。');}save();render({keepScroll:true});break;}
  case 'viewQ':if(KB[id]){ui.modal=id;render({keepScroll:true});}break;
  case 'closeModal':ui.modal=null;render({keepScroll:true});break;
  case 'modalOverlay':if(ev.target===b){ui.modal=null;render({keepScroll:true});}break;
  case 'singlePractice':if(KB[id])onePractice(KB[id]);break;
  case 'weakTab':ui.weakTab=v;render({keepScroll:true});break;
  case 'startWeakSession':weakSession();break;
  case 'startWriting':ui.study={...ui.study,c:v,type:'written',mode:'adaptive',count:999,difficulty:'all',search:''};startPractice();break;
  case 'startMock':ui.archiveViewing=null;newMock();break;
  case 'examMC':{const ex=state.exam;if(!ex||ex.finished)break;if(secondsLeft(ex)<=0){finishMock(true);break;}ex.items[ex.index].answer=Number(v);save();render({keepScroll:true});break;}
  case 'examFlag':{const ex=state.exam;if(!ex||ex.finished)break;if(secondsLeft(ex)<=0){finishMock(true);break;}ex.items[ex.index].flag=!ex.items[ex.index].flag;save();render({keepScroll:true});break;}
  case 'examJump':{const ex=state.exam;if(!ex||ex.finished)break;if(secondsLeft(ex)<=0){finishMock(true);break;}ex.index=cap(Number(v),0,59);save();render();window.scrollTo(0,0);break;}
  case 'examPrev':{const ex=state.exam;if(!ex||ex.finished)break;if(secondsLeft(ex)<=0){finishMock(true);break;}ex.index=Math.max(0,ex.index-1);save();render();window.scrollTo(0,0);break;}
  case 'examNext':{const ex=state.exam;if(!ex||ex.finished)break;if(secondsLeft(ex)<=0){finishMock(true);break;}ex.index=Math.min(59,ex.index+1);save();render();window.scrollTo(0,0);break;}
  case 'finishMock':finishMock();break;
  case 'toggleReview':ui.examReview=!ui.examReview;render({keepScroll:true});break;
  case 'saveExamGrade':{const el=document.querySelector(`[data-action="examGradeRange"][data-id="${id}"]`);if(el)saveExamGrade(id,el.value);break;}
  case 'export':exportData();break;
  case 'import':document.getElementById('import-file')?.click();break;
  case 'resetData':if(confirm('すべての学習履歴、ノート、ブックマーク、模擬試験、設定を削除します。\nこの操作は元に戻せません。実行しますか？')&&confirm('最終確認：学習データを初期化してもよろしいですか？')){state=blank();ui.practice=null;ui.modal=null;window.GYOSHI_ROPPO?.resetMeta();save();go('dashboard');toast('学習履歴とマーカー・メモを初期化しました。保存済み法令本文はそのままです。');}break;
 }
}
function changeAction(ev){const el=ev.target,a=el.dataset.action,field=el.dataset.field;
 switch(a){
 case 'studyField':{
  if(field==='count')ui.study.count=Number(el.value);if(field==='timer')ui.study.timer=Number(el.value);if(field==='search')ui.study.search=el.value.slice(0,100);
  if(field==='type'){ui.study.type=el.value;if(ui.study.c!=='all'&&!D.questions.some(q=>q.c===ui.study.c&&(el.value==='mixed'||q.type===el.value)))ui.study.c='all';}
  render({keepScroll:true});break;
 }
 case 'practiceMulti':{const it=practiceItem();if(!it||it.checked)break;if(!Array.isArray(it.answer))it.answer=[null,null,null,null];it.answer[Number(el.dataset.slot)]=el.value===''?null:Number(el.value);persistPractice();break;}
 case 'examMulti':{const ex=state.exam;if(!ex||ex.finished)return;if(secondsLeft(ex)<=0){finishMock(true);return;}const it=ex.items[ex.index];if(!Array.isArray(it.answer))it.answer=[null,null,null,null];it.answer[Number(el.dataset.slot)]=el.value===''?null:Number(el.value);save();break;}
 case 'weakSearch':ui.weakSearch=el.value.trim().slice(0,200);render({keepScroll:true});break;
 case 'guideGroup':ui.guide.group=el.value;render({keepScroll:true});break;
 case 'guideStatus':ui.guide.status=el.value;render({keepScroll:true});break;
 case 'glossaryGroup':ui.glossary.group=el.value;updateGlossaryResults();break;
 case 'glossaryLaw':ui.glossary.law=el.value;updateGlossaryResults();break;
 case 'libraryType':ui.library.type=el.value;ui.library.page=1;render({keepScroll:true});break;
 case 'libraryCat':ui.library.c=el.value;ui.library.page=1;render({keepScroll:true});break;
 case 'settingDailyMinutes':state.settings.dailyMinutes=cap(Number(el.value)||45,10,240);save();render({keepScroll:true});break;
 case 'settingReadable':state.settings.readable=el.value==='large';save();render({keepScroll:true});break;
 case 'settingGoal':state.settings.goal=Number(el.value);save();render({keepScroll:true});toast('1日の目標を更新しました。');break;
 case 'settingTarget':if(/^20\d\d-\d\d-\d\d$/.test(el.value)){state.settings.target=el.value;save();render({keepScroll:true});toast('目標試験日を更新しました。');}break;
 case 'settingTheme':state.settings.theme=el.value==='dark'?'dark':'light';save();render({keepScroll:true});break;
 }
 if(el.id==='import-file'){const f=el.files?.[0];if(f)importData(f);el.value='';}
}
function updateGlossaryResults(){
 const container=document.getElementById('sg-index-results');
 if(container)container.innerHTML=GUIDE.glossaryResults(ui.glossary);
}
function inputAction(ev){const el=ev.target,a=el.dataset.action;
 if(!ev.isComposing&&a==='glossarySearch'&&ui.glossary.search!==el.value.slice(0,100)){
  ui.glossary.search=el.value.slice(0,100);updateGlossaryResults();
 }
 if(!ev.isComposing&&a==='librarySearch'&&ui.library.search!==el.value.slice(0,120)){
  ui.library.search=el.value.slice(0,120);ui.library.page=1;render({keepScroll:true});
 }
 if(a==='practiceWritten'){const it=practiceItem();if(!it||it.checked)return;it.answer=el.value;persistPractice();const target=document.getElementById('char-count');if(target)target.textContent=el.value.length+'文字 / 目安40文字';}
 if(a==='examWritten'){const ex=state.exam;if(!ex||ex.finished)return;if(secondsLeft(ex)<=0){finishMock(true);return;}ex.items[ex.index].answer=el.value;save();const target=document.getElementById('char-count');if(target)target.textContent=el.value.length+'文字 / 目安40文字';}
 if(a==='practiceGrade'){const n=document.getElementById('practice-grade-value');if(n)n.textContent=el.value+'点';}
 if(a==='noteInput'&&KB[el.dataset.id]){state.notes[el.dataset.id]=el.value.slice(0,4000);save();}
 if(a==='examGradeRange'){const n=document.getElementById('grade-label-'+el.dataset.id);if(n)n.textContent=el.value;}
}
function keyboard(ev){if(ev.key==='Escape'&&ui.modal){ui.modal=null;render({keepScroll:true});return;}
 if(ev.isComposing||ev.defaultPrevented||ev.ctrlKey||ev.metaKey||ev.altKey||ev.target?.closest('textarea,input,select,[contenteditable="true"]'))return;
 if(ui.modal)return;
 if(route==='study'&&ui.practice&&!ui.practice.finished){const item=practiceItem();if(!item)return;const q=KB[item.id];
  if(!item.checked&&q.type==='mc'&&/^[1-5]$/.test(ev.key)){item.answer=item.order[Number(ev.key)-1];persistPractice();render({keepScroll:true});ev.preventDefault();}
  if(ev.key==='Enter'&&!ev.target?.closest('a,button,summary')){if(item.checked)nextPractice(false);else checkPractice();ev.preventDefault();}
 }
 if(route==='mock'&&state.exam&&!state.exam.finished){const ex=state.exam,it=ex.items[ex.index],q=KB[it.id];
  if(q.type==='mc'&&/^[1-5]$/.test(ev.key)){it.answer=it.order[Number(ev.key)-1];save();render({keepScroll:true});ev.preventDefault();}
  if(ev.key==='ArrowRight'){ex.index=Math.min(59,ex.index+1);save();render();window.scrollTo(0,0);ev.preventDefault();}
  if(ev.key==='ArrowLeft'){ex.index=Math.max(0,ex.index-1);save();render();window.scrollTo(0,0);ev.preventDefault();}
 }
}
app.addEventListener('toggle',event=>{
 const id=event.target.dataset?.guideCard;
 if(!id||!app.contains(event.target))return;
 if(event.target.open)ui.guide.openCards.add(id);else ui.guide.openCards.delete(id);
},true);
app.addEventListener('click',clickAction);
app.addEventListener('change',changeAction);
app.addEventListener('input',inputAction);
app.addEventListener('compositionend',inputAction);
document.addEventListener('keydown',keyboard);
window.addEventListener('hashchange',()=>{
 const next=routeFromURL()||'dashboard';
 if(!TABS.some(tab=>tab[0]===next))return;
 if(route==='roppo'&&next!=='roppo')window.GYOSHI_ROPPO?.stop();
 route=next;ui.modal=null;ui.sidebar=false;
 if(next==='glossary')ui.glossary=glossaryViewFromURL();
 render();window.scrollTo(0,0);
});
window.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(route==='mock'&&state.exam&&!state.exam.finished&&secondsLeft(state.exam)<=0)finishMock(true);if(route==='study'&&ui.practice&&!ui.practice.finished&&ui.practice.deadline&&Date.now()>=ui.practice.deadline)finishTimedPractice();});window.addEventListener('online',()=>{const e=document.getElementById('network-state');if(e){e.textContent='● 接続中';e.dataset.offline='false';}});window.addEventListener('offline',()=>{const e=document.getElementById('network-state');if(e){e.textContent='○ オフライン';e.dataset.offline='true';}});
setInterval(()=>{if(route==='study'&&ui.practice&&!ui.practice.finished&&ui.practice.deadline){const sec=Math.max(0,Math.ceil((ui.practice.deadline-Date.now())/1000));const t=document.getElementById('practice-clock');if(t)t.textContent='残り '+clockText(sec);if(sec<=0)finishTimedPractice();}if(route!=='mock'||!state.exam||state.exam.finished)return;const sec=secondsLeft(state.exam);const el=document.getElementById('live-clock');if(el)el.textContent=clockText(sec);if(sec<=0)finishMock(true);},1000);
if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol)){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{}));}
render();
})();
