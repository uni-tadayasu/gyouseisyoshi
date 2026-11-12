/* Recall cards and the shared term explanations for the cards and law reader. */
(function(){
'use strict';

const study=window.GYOSHI_STUDY_CARDS;
const glossary=window.GYOSHI_GLOSSARY;
const laws={
 const:['321CONSTITUTION','日本国憲法'],
 civil:['129AC0000000089','民法'],
 criminal:['140AC0000000045','刑法'],
 commerce:['132AC0000000048','商法'],
 civproc:['408AC0000000109','民事訴訟法'],
 crimproc:['323AC0000000131','刑事訴訟法'],
 apa:['405AC0000000088','行政手続法'],
 ara:['426AC0000000068','行政不服審査法'],
 ala:['337AC0000000139','行政事件訴訟法'],
 state:['322AC0000000125','国家賠償法'],
 local:['322AC0000000067','地方自治法'],
 scrivener:['326AC1000000004','行政書士法'],
 company:['417AC0000000086','会社法'],
 privacy:['415AC0000000057','個人情報保護法'],
 disclosure:['411AC0000000042','情報公開法']
};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const searchKey=value=>String(value??'').normalize('NFKC').toLowerCase()
 .replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-96)).trim();
const states={known:'覚えた',review:'要復習'};
const cardById=new Map(study.cards.map(card=>[card.id,card]));
const termById=new Map(glossary.terms.map(term=>[term.id,term]));
const sortedTerms=[...glossary.terms].sort((a,b)=>a.reading.localeCompare(b.reading,'ja'));
const indexTerms=sortedTerms.map(term=>({
 term,
 search:searchKey([term.name,term.reading,...term.aliases,term.meaning,glossary.groups[term.group]].join(' ')),
 laws:new Set(term.refs.map(([key])=>key))
}));
const termsByLaw=new Map(Object.values(laws).map(([id])=>[id,[]]));
for(const term of glossary.terms){
 const forms=[term.name,...term.aliases].map(searchKey);
 const refs=new Map();
 for(const [key,number] of term.refs){
  if(!refs.has(key))refs.set(key,new Set());
  refs.get(key).add('main-'+number);
 }
 for(const [key,articles] of refs)termsByLaw.get(laws[key][0]).push({term,forms,articles});
}

function cleanProgress(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 return Object.fromEntries(Object.entries(value).filter(
  ([id,status])=>cardById.has(id)&&(status==='known'||status==='review')
 ));
}
function sectionLinks(refs){
 return refs.map(([key,number])=>{
  const [id,name]=laws[key];
  const [first,...rest]=number.split('_');
  const label=name+' 第'+first+'条'+rest.map(n=>'の'+n).join('');
  return `<a class="sg-ref" href="#roppo?law=${id}&amp;article=main-${number}">${esc(label)}<span aria-hidden="true"> ↗</span></a>`;
 }).join('');
}
function termChips(terms){
 return terms.map(term=>`<button type="button" class="sg-term-chip" data-guide-term="${esc(term.id)}">${esc(term.name)}</button>`).join('');
}
function fragmentText(text,ruby){
 if(!Array.isArray(ruby)||!ruby.length)return text||'';
 let result='',start=0;
 for(const hint of ruby){
  result+=text.slice(start,hint.start)+hint.base;
  start=hint.end;
 }
 return result+text.slice(start);
}
function forArticle(lawId,article){
 const available=termsByLaw.get(lawId);
 if(!available?.length)return '';
 const text=searchKey([
  fragmentText(article.caption,article.captionRuby),
  ...article.blocks.map(block=>fragmentText(block.t,block.ruby))
 ].join(' '));
 const matches=[],related=[];
 for(const item of available){
  if(item.articles.has(article.id))matches.push(item.term);
  else if(item.forms.some(form=>text.includes(form)))related.push(item.term);
 }
 const terms=[...matches,...related];
 return terms.length?`<div class="sg-article-terms"><strong>用語解説</strong><div class="sg-links">${termChips(terms)}</div></div>`:'';
}

function options(items,selected){
 return items.map(([value,label])=>`<option value="${esc(value)}"${value===selected?' selected':''}>${esc(label)}</option>`).join('');
}
function groupOptions(groups,selected){
 return options([['all','すべての科目'],...Object.entries(groups)],selected);
}
function cardHTML(card,progress,openCards){
 const status=progress[card.id];
 const termList=termChips(card.terms.map(id=>termById.get(id)));
 const refs=sectionLinks(card.refs);
 return `<details class="sg-card" data-guide-card="${card.id}" ${openCards.has(card.id)?'open':''}>
  <summary id="sg-card-${card.id}">
   <span class="sg-card-prompt"><strong>${esc(card.title)}</strong><span>${esc(card.prompt)}</span></span>
   <span class="sg-card-side">${status?`<span class="sg-status sg-${status}">${states[status]}</span>`:''}<span class="sg-disclosure" aria-hidden="true"><span class="sg-reveal">答えを見る</span><span class="sg-conceal">答えを閉じる</span></span></span>
  </summary>
  <div class="sg-card-body">
   <div class="sg-answer"><h4>答え</h4><p>${esc(card.answer)}</p></div>
   <div class="sg-point"><h4>確認ポイント</h4><p>${esc(card.check)}</p></div>
   <div class="sg-card-terms"><h4>用語解説</h4><div class="sg-links">${termList}</div></div>
   ${refs?`<div class="sg-card-refs"><h4>参照条文</h4><div class="sg-links">${refs}</div></div>`:''}
   <div class="sg-card-actions">
    <div class="sg-actions" role="group" aria-label="暗記の記録">
     <button type="button" id="sg-known-${card.id}" class="button secondary small" data-action="guideMark" data-id="${card.id}" data-value="known" aria-pressed="${status==='known'}">覚えた</button>
     <button type="button" id="sg-review-${card.id}" class="button secondary small" data-action="guideMark" data-id="${card.id}" data-value="review" aria-pressed="${status==='review'}">要復習</button>
    </div>
    <button type="button" class="text-link sg-practice" data-action="guidePractice" data-id="${card.id}">問題索引で練習 <span aria-hidden="true">→</span></button>
   </div>
  </div>
 </details>`;
}
function essentialsHTML(progress,view){
 const known=study.cards.filter(card=>progress[card.id]==='known').length;
 const review=study.cards.filter(card=>progress[card.id]==='review').length;
 const matches=study.cards.filter(card=>(view.group==='all'||card.group===view.group)&&
  (view.status==='all'||view.status===(progress[card.id]||'new')));
 const statusOptions=[['all','すべてのカード'],['new','未記録'],...Object.entries(states)];
 const sections=Object.entries(study.groups).map(([group,label])=>{
  const cards=matches.filter(card=>card.group===group);
  return cards.length?`<section class="sg-subject" aria-labelledby="sg-${group}">
   <h3 id="sg-${group}">${esc(label)}<span>${cards.length}枚</span></h3>
   <div class="sg-cards">${cards.map(card=>cardHTML(card,progress,view.openCards)).join('')}</div>
  </section>`:'';
 }).join('');
 return `<div class="sg-page">
  <header class="sg-header">
   <div><h1>これだけは覚える</h1><p>条文の原則・例外・期限を、まず自分の言葉で答えてから確認しましょう。</p></div>
   <a class="sg-ref" href="#glossary">用語索引 <span aria-hidden="true">→</span></a>
  </header>
  <section class="sg-score" aria-labelledby="sg-score-heading">
   <h2 id="sg-score-heading">合格基準点 <small>令和7年度の公表値</small></h2>
   <dl class="sg-score-grid">
    <div><dt>法令等</dt><dd><strong>122</strong><span> / 244点</span></dd></div>
    <div><dt>基礎知識</dt><dd><strong>24</strong><span> / 56点</span></dd></div>
    <div><dt>総合</dt><dd><strong>180</strong><span> / 300点</span></dd></div>
   </dl>
   <p>3つの基準をすべて満たす必要があります。受験年度の基準は公式試験案内で確認できます。</p>
   <div class="sg-score-links">
    <button type="button" class="text-link" data-action="nav" data-value="mock">本試験模試へ <span aria-hidden="true">→</span></button>
    <a class="sg-ref" href="https://www.gyosei-shiken.or.jp/pdf/basis.pdf" target="_blank" rel="noopener noreferrer">合否判定基準 ↗</a>
    <a class="sg-ref" href="https://www.gyosei-shiken.or.jp/doc/guide/guide.html" target="_blank" rel="noopener noreferrer">公式試験案内 ↗</a>
   </div>
  </section>
  <section aria-labelledby="sg-cards-heading">
   <div class="sg-overview">
    <h2 id="sg-cards-heading">必修カード</h2>
    <p role="status"><strong>覚えた ${known} / ${study.cards.length}枚</strong><span>要復習 ${review}枚</span></p>
   </div>
   <div class="sg-filters">
    <label for="sg-subject">科目<select id="sg-subject" class="select" data-action="guideGroup">${groupOptions(study.groups,view.group)}</select></label>
    <label for="sg-progress">学習状態<select id="sg-progress" class="select" data-action="guideStatus">${options(statusOptions,view.status)}</select></label>
   </div>
   ${sections||'<p class="sg-empty">この条件のカードはありません。</p>'}
  </section>
 </div>`;
}
function glossaryResults(view){
 const keyword=searchKey(view.search);
 const results=indexTerms.filter(({term,search,laws})=>
  (view.group==='all'||term.group===view.group)&&(view.law==='all'||laws.has(view.law))&&search.includes(keyword)
 );
 return `<p class="sg-result-count" role="status">${results.length}件</p>${
  results.length?`<ul class="sg-index-list">${results.map(({term})=>`<li><button type="button" class="sg-index-item" data-guide-term="${esc(term.id)}">
   <span class="sg-index-word"><strong>${esc(term.name)}</strong><small>${esc(term.reading)}</small></span>
   <span class="sg-index-open" aria-hidden="true">›</span>
  </button></li>`).join('')}</ul>`:'<p class="sg-empty">該当する用語がありません。表記や絞り込み条件を変えて検索できます。</p>'
 }`;
}
function glossaryHTML(view){
 return `<div class="sg-page">
  <header class="sg-header">
   <div><h1>用語索引</h1><p>用語を選ぶと、読み方、意味、具体例と参照条文を確認できます。</p></div>
   <a class="sg-ref" href="#roppo">六法書架 <span aria-hidden="true">→</span></a>
  </header>
  <div class="sg-filters sg-index-filters">
   <label for="sg-search">用語・読み方<input class="text-input" id="sg-search" data-action="glossarySearch" type="search" maxlength="100" placeholder="例：審査請求、そうたつ" value="${esc(view.search)}"></label>
   <label for="sg-index-group">科目<select class="select" id="sg-index-group" data-action="glossaryGroup">${groupOptions(glossary.groups,view.group)}</select></label>
   <label for="sg-index-law">法令<select class="select" id="sg-index-law" data-action="glossaryLaw">${options([['all','すべての法令'],...Object.entries(laws).map(([key,[,name]])=>[key,name])],view.law)}</select></label>
  </div>
  <div id="sg-index-results">${glossaryResults(view)}</div>
 </div>`;
}
let dialog,trigger;
function openTerm(id,button){
 const term=termById.get(id);
 if(!term)return;
 if(!dialog){
  dialog=document.createElement('dialog');
  dialog.className='sg-term-dialog';
  dialog.setAttribute('aria-labelledby','sg-term-title');
  dialog.addEventListener('click',event=>{
   if(event.target===dialog||event.target.closest('[data-guide-close],a[href^="#roppo?"]'))dialog.close();
  });
  dialog.addEventListener('close',()=>{
   if(trigger?.isConnected)trigger.focus({preventScroll:true});
   trigger=null;
  });
  document.body.append(dialog);
 }
 trigger=button;
 const refs=sectionLinks(term.refs);
 const source=term.source?`<a class="sg-ref" href="${esc(term.source[1])}" target="_blank" rel="noopener noreferrer">${esc(term.source[0])} ↗</a>`:'';
 dialog.innerHTML=`<div class="sg-dialog-panel">
  <header class="sg-dialog-head">
   <div><p class="sg-dialog-topic">${esc(glossary.groups[term.group])}</p><h2 id="sg-term-title">${esc(term.name)}</h2></div>
   <button type="button" class="button secondary small" data-guide-close autofocus>閉じる</button>
  </header>
  <dl class="sg-term-description">
   <div><dt>読み方</dt><dd>${esc(term.reading)}</dd></div>
   <div><dt>意味</dt><dd>${esc(term.meaning)}</dd></div>
   <div><dt>具体例</dt><dd>${esc(term.example)}</dd></div>
   ${refs?`<div><dt>参照条文</dt><dd class="sg-links">${refs}</dd></div>`:''}
   ${source?`<div><dt>参考資料</dt><dd>${source}</dd></div>`:''}
  </dl>
 </div>`;
 dialog.showModal();
 dialog.scrollTop=0;
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-guide-term]');
 if(button)openTerm(button.dataset.guideTerm,button);
});
window.addEventListener('hashchange',()=>{if(dialog?.open)dialog.close();});

window.GYOSHI_GUIDE={
 cleanProgress,essentialsHTML,glossaryHTML,glossaryResults,forArticle,
 getCard:id=>cardById.get(id),lawKey:id=>Object.keys(laws).find(key=>laws[key][0]===id)
};
})();
