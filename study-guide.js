/* Recall cards and the shared term explanations for the cards and law reader. */
(function(){
'use strict';

const study=window.GYOSHI_STUDY_CARDS;
const editorialGlossary=window.GYOSHI_GLOSSARY;
const corpus=window.GYOSHI_COMPOUND_DATA||{laws:[],entries:[]};
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
const lawKeysById=new Map(Object.entries(laws).map(([key,[id]])=>[id,key]));
const compoundTerms=corpus.entries.map(([name,reading,definitions,origin,mask,refs])=>({
 id:'word-'+name,name,reading,definitions,meaning:definitions[0],origin,refs,aliases:[],
 group:origin==='law'?'statutory':'compound',
 lawKeys:corpus.laws.filter((id,index)=>mask&(1<<index)).map(id=>lawKeysById.get(id))
}));
const glossary={
 groups:{...editorialGlossary.groups,compound:'熟語・一般語',statutory:'法令上の定義'},
 terms:[...editorialGlossary.terms,...compoundTerms]
};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const searchKey=value=>String(value??'').normalize('NFKC').toLowerCase()
 .replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-96)).trim();
const states={known:'覚えた',review:'要復習'};
// Search aliases can include incomplete phrases. In running text, mark words and complete terms.
const searchOnlyAliases=new Set([
 '理由を示','本人のためにすることを示','第三者に対抗','相殺に適した',
 '契約の内容に適合しない','代襲して','裁判所において当事者が自白した事実',
 '証拠とすることができない','第三者に提供','原状に復させる'
]);
const inlineKey=value=>value.replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0))
 .replace(/[A-Z]/g,c=>c.toLowerCase());
const inlineForms=new Map();
for(const term of glossary.terms){
 const name=inlineKey(term.name);
 const forms=new Set([name,...term.aliases.filter(alias=>!searchOnlyAliases.has(alias)).map(inlineKey)]);
 for(const form of forms){
  if(form.length<2)continue;
  if(!inlineForms.has(form))inlineForms.set(form,[]);
  const choices=inlineForms.get(form);
  if(form===name)choices.unshift(term);else choices.push(term);
 }
}
const wordTrie={children:new Map()};
for(const [form,terms] of inlineForms){
 let node=wordTrie;
 for(let i=0;i<form.length;i++){
  const char=form[i];
  if(!node.children.has(char))node.children.set(char,{children:new Map()});
  node=node.children.get(char);
 }
 node.terms=terms;
}
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ja',{granularity:'word'}):null;
const referenceEnding=/((?:第[0-9〇零一二三四五六七八九十百千]+(?:条|項|号)(?:の[0-9〇零一二三四五六七八九十百千]+)*|[前同次](?:条|項|号)))中/gu;
function wordBoundaries(input){
 const blocked=new Uint8Array(input.length+1);
 if(!segmenter)return blocked;
 // The 中 after a reference is a particle-like connector, not the first half of a headword.
 const split=input.replace(referenceEnding,'$1、');
 for(const {segment,index} of segmenter.segment(split)){
  if(inlineForms.has(segment))blocked.fill(1,index+1,index+segment.length);
 }
 return blocked;
}
const cardById=new Map(study.cards.map(card=>[card.id,card]));
const termById=new Map(glossary.terms.map(term=>[term.id,term]));
const sortedTerms=[...glossary.terms].sort((a,b)=>(a.reading||a.name).localeCompare(b.reading||b.name,'ja')||a.name.localeCompare(b.name,'ja'));
const indexTerms=sortedTerms.map(term=>({
 term,
 search:searchKey([term.name,term.reading,...term.aliases,...(term.definitions||[term.meaning]),glossary.groups[term.group]].join(' ')),
 laws:new Set([...term.refs.map(([key])=>key),...(term.lawKeys||[])])
}));
const termsByLaw=new Map(Object.values(laws).map(([id])=>[id,[]]));
for(const term of editorialGlossary.terms){
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
function rubyProjection(text,ruby){
 if(!Array.isArray(ruby)||!ruby.length)return {text,toSource:at=>at};
 let result='',sourceAt=0;
 const offsets=[];
 for(const hint of ruby){
  if(!hint.base||hint.start<sourceAt||hint.end>text.length||hint.end<=hint.start)continue;
  result+=text.slice(sourceAt,hint.start)+hint.base;
  sourceAt=hint.end;
  offsets.push({after:result.length,delta:sourceAt-result.length});
 }
 return {
  text:result+text.slice(sourceAt),
  toSource(at){
   let delta=0;
   for(const point of offsets){if(point.after>at)break;delta=point.delta;}
   return at+delta;
  }
 };
}
function* termMatches(text,lawId,ruby){
 const projected=rubyProjection(text,ruby);
 const input=inlineKey(projected.text);
 const blocked=wordBoundaries(input);
 for(let index=0;index<input.length;){
  let node=wordTrie,choices,end=index;
  if(!blocked[index]){
   for(let cursor=index;cursor<input.length;cursor++){
    node=node.children.get(input[cursor]);
    if(!node)break;
    if(node.terms&&!blocked[cursor+1]){choices=node.terms;end=cursor+1;}
   }
  }
  if(!choices){index++;continue;}
  const term=(lawId&&choices.find(entry=>entry.refs.some(([key])=>laws[key][0]===lawId)))||choices[0];
  yield {start:projected.toSource(index),end:projected.toSource(end),term};
  index=end;
 }
}
function inlineText(value,{lawId='',ruby,renderSlice}={}){
 const text=String(value??'');
 const render=renderSlice||((start,end)=>esc(text.slice(start,end)));
 let html='',cursor=0;
 for(const {start,end,term} of termMatches(text,lawId,ruby)){
  if(start<cursor)continue;
  if(start>cursor)html+=render(cursor,start);
  html+=`<span class="sg-inline-term" role="button" tabindex="0" aria-haspopup="dialog" data-guide-term="${esc(term.id)}">${render(start,end)}</span>`;
  cursor=end;
 }
 if(cursor<text.length)html+=render(cursor,text.length);
 return html;
}
function termsIn(fragment,lawId=''){
 return [...termMatches(fragment.t,lawId,fragment.ruby)].map(({term})=>term);
}
function fragmentText(text,ruby){return rubyProjection(text||'',ruby).text;}
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
 if(!terms.length)return '';
 const links=`<div class="sg-links">${termChips(terms)}</div>`;
 return terms.length>8
  ?`<details class="sg-article-terms sg-article-index"><summary>用語解説 <span>${terms.length}件</span></summary>${links}</details>`
  :`<div class="sg-article-terms"><strong>用語解説</strong>${links}</div>`;
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
 const lawId=laws[card.refs[0]?.[0]]?.[0]||'';
 const text=value=>inlineText(value,{lawId});
 return `<div class="sg-card">
  <div class="sg-card-prompt">
   <div class="sg-card-title-line"><h4 id="sg-card-title-${card.id}">${text(card.title)}</h4>
    <button type="button" class="sg-card-listen" data-audio="read-card" aria-label="${esc(card.title)}を読み上げ">読む</button>
   </div>
   <p>${text(card.prompt)}</p>
  </div>
  <details class="sg-card-details" data-guide-card="${card.id}" ${openCards.has(card.id)?'open':''}>
   <summary id="sg-card-${card.id}" aria-describedby="sg-card-title-${card.id}">
    <span class="sg-disclosure"><span class="sg-reveal">答えを見る</span><span class="sg-conceal">答えを閉じる</span></span>
    ${status?`<span class="sg-status sg-${status}">${states[status]}</span>`:''}
   </summary>
   <div class="sg-card-body">
    <div class="sg-answer"><h5>答え</h5><p>${text(card.answer)}</p></div>
    <div class="sg-point"><h5>確認ポイント</h5><p>${text(card.check)}</p></div>
   <div class="sg-card-terms"><h5>用語解説</h5><div class="sg-links">${termList}</div></div>
   ${refs?`<div class="sg-card-refs"><h5>参照条文</h5><div class="sg-links">${refs}</div></div>`:''}
   <div class="sg-card-actions">
    <div class="sg-actions" role="group" aria-label="暗記の記録">
     <button type="button" id="sg-known-${card.id}" class="button secondary small" data-action="guideMark" data-id="${card.id}" data-value="known" aria-pressed="${status==='known'}">覚えた</button>
     <button type="button" id="sg-review-${card.id}" class="button secondary small" data-action="guideMark" data-id="${card.id}" data-value="review" aria-pressed="${status==='review'}">要復習</button>
    </div>
    <button type="button" class="text-link sg-practice" data-action="guidePractice" data-id="${card.id}">問題索引で練習 <span aria-hidden="true">→</span></button>
   </div>
  </div>
  </details>
 </div>`;
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
   <div><h1>これだけは覚える</h1><p>条文の原則・例外・期限を、まず自分の言葉で答えてから確認しましょう。下線のある用語は押すと意味が開きます。</p></div>
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
 if(keyword){
  const rank=({term})=>searchKey(term.name)===keyword||searchKey(term.reading)===keyword?0:searchKey(term.name).startsWith(keyword)?1:2;
  results.sort((a,b)=>rank(a)-rank(b));
 }
 const pageSize=60, pages=Math.max(1,Math.ceil(results.length/pageSize));
 const page=Math.max(1,Math.min(pages,view.page||1));
 const visible=results.slice((page-1)*pageSize,page*pageSize);
 const count=`<p class="sg-result-count" role="status">${results.length.toLocaleString('ja-JP')}件</p>`;
 if(!visible.length)return count+'<p class="sg-empty">該当する用語がありません。表記や絞り込み条件を変えて検索できます。</p>';
 return count+`<ul class="sg-index-list">${visible.map(({term})=>`<li><button type="button" class="sg-index-item" data-guide-term="${esc(term.id)}">
   <span class="sg-index-word"><strong>${esc(term.name)}</strong><small>${esc(term.reading)}</small></span>
   <span class="sg-index-open" aria-hidden="true">›</span>
  </button></li>`).join('')}</ul>${
   pages>1?`<nav class="sg-index-pagination" aria-label="用語索引のページ">
    <button type="button" class="button secondary small" data-action="glossaryPage" data-value="${page-1}" ${page===1?'disabled':''}>前へ</button>
    <span>${page} / ${pages} ページ</span>
    <button type="button" class="button secondary small" data-action="glossaryPage" data-value="${page+1}" ${page===pages?'disabled':''}>次へ</button>
   </nav>`:''
  }`;
}
function glossaryHTML(view){
 return `<div class="sg-page">
  <header class="sg-header">
   <div><h1>用語索引</h1><p>${glossary.terms.length.toLocaleString('ja-JP')}語を検索できます。用語を選ぶと、意味を表示して読み上げます。</p></div>
   <a class="sg-ref" href="#roppo">六法書架 <span aria-hidden="true">→</span></a>
  </header>
  <div class="sg-filters sg-index-filters">
   <label for="sg-search">用語・読み方・意味<input class="text-input" id="sg-search" data-action="glossarySearch" type="search" maxlength="100" placeholder="例：審査請求、そうたつ" value="${esc(view.search)}"></label>
   <label for="sg-index-group">科目<select class="select" id="sg-index-group" data-action="glossaryGroup">${groupOptions(glossary.groups,view.group)}</select></label>
   <label for="sg-index-law">法令<select class="select" id="sg-index-law" data-action="glossaryLaw">${options([['all','すべての法令'],...Object.entries(laws).map(([key,[,name]])=>[key,name])],view.law)}</select></label>
  </div>
  <div id="sg-index-results">${glossaryResults(view)}</div>
 </div>`;
}
let dialog,trigger;
function shownExample(button){
 if(!button.classList.contains('sg-inline-term'))return '';
 const paragraph=button.closest('.rp-paragraph,.rp-caption,.rp-topic,h3,h4,p');
 if(!paragraph)return '';
 const before=document.createRange();
 before.selectNodeContents(paragraph);before.setEndBefore(button);
 const offset=before.toString().length;
 const source=paragraph.textContent,left=Math.max(0,offset-30),right=Math.min(source.length,offset+button.textContent.length+52);
 return (left?'…':'')+source.slice(left,right)+(right<source.length?'…':'');
}
function termSource(term){
 if(term.source)return term.source;
 if(term.origin==='wordnet')return ['日本語WordNet 1.1','https://bond-lab.github.io/wnja/jpn/downloads.html'];
 if(term.origin==='wiktionary')return ['ウィクショナリー日本語版の執筆者（CC BY-SA 4.0）','https://ja.wiktionary.org/wiki/'+encodeURIComponent(term.name)+'#日本語'];
 return null;
}
function openTerm(id,button){
 const term=termById.get(id);
 if(!term)return;
 const audio=window.GYOSHI_ROPPO;
 if(!dialog){
  dialog=document.createElement('dialog');
  dialog.className='sg-term-dialog';
  dialog.setAttribute('aria-labelledby','sg-term-title');
  dialog.addEventListener('click',event=>{
   if(event.target===dialog||event.target.closest('[data-guide-close],a[href^="#roppo?"]'))dialog.close();
  });
  dialog.addEventListener('close',()=>{
   window.GYOSHI_ROPPO?.stopMeaning();
   if(trigger?.isConnected)trigger.focus({preventScroll:true});
   trigger=null;
  });
  document.body.append(dialog);
 }
 trigger=button;
 const refs=sectionLinks(term.refs);
 const attribution=termSource(term);
 const source=attribution?`<a class="sg-ref" href="${esc(attribution[1])}" target="_blank" rel="noopener noreferrer">${esc(attribution[0])} ↗</a>`:'';
 const example=term.example||shownExample(button);
 const meanings=term.definitions||[term.meaning];
 dialog.innerHTML=`<div class="sg-dialog-panel" data-term-id="${esc(term.id)}">
  <header class="sg-dialog-head">
   <div><p class="sg-dialog-topic">${esc(glossary.groups[term.group])}</p><h2 id="sg-term-title">${esc(term.name)}</h2></div>
   <button type="button" class="button secondary small" data-guide-close autofocus>閉じる</button>
  </header>
  ${audio?.meaningAudioHTML()||''}
  <dl class="sg-term-description">
   ${term.reading?`<div><dt>読み方</dt><dd>${esc(term.reading)}</dd></div>`:''}
   <div><dt>${term.origin==='law'?'意味（条文の定義）':'意味'}</dt><dd>${
    meanings.length>1?`<ol class="sg-meanings">${meanings.map(meaning=>`<li>${esc(meaning)}</li>`).join('')}</ol>`:esc(meanings[0])
   }</dd></div>
   ${example?`<div><dt>${term.example?'具体例':'本文での用例'}</dt><dd>${esc(example)}</dd></div>`:''}
   ${refs?`<div><dt>参照条文</dt><dd class="sg-links">${refs}</dd></div>`:''}
   ${source?`<div><dt>出典</dt><dd>${source}</dd></div>`:''}
  </dl>
 </div>`;
 dialog.showModal();
 dialog.scrollTop=0;
 audio?.speakMeaning(term);
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-guide-term]');
 if(!button)return;
 if(button.classList.contains('sg-inline-term')){
  const selection=window.getSelection?.();
  if(event.detail&&selection?.rangeCount&&!selection.isCollapsed&&selection.getRangeAt(0).intersectsNode(button))return;
 }
 openTerm(button.dataset.guideTerm,button);
});
document.addEventListener('keydown',event=>{
 if(event.defaultPrevented||event.isComposing||event.repeat||(event.key!=='Enter'&&event.key!==' '))return;
 const button=event.target.closest('.sg-inline-term');
 if(!button)return;
 event.preventDefault();
 openTerm(button.dataset.guideTerm,button);
});
window.addEventListener('hashchange',()=>{if(dialog?.open)dialog.close();});

window.GYOSHI_GUIDE={
 cleanProgress,essentialsHTML,glossaryHTML,glossaryResults,forArticle,inlineText,termsIn,
 getTerm:id=>termById.get(id),
 getCard:id=>cardById.get(id),lawKey:id=>Object.keys(laws).find(key=>laws[key][0]===id)
};
})();
