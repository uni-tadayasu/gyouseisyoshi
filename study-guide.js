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
// Specialist terms in the shared compound dictionary. Merely appearing in a statute
// does not make a word such as 必要 or 適切 a legal term.
const legalVocabulary=new Set(`
 三親等 上告状 上場 不信任 不再任 不利益取扱い 不存在 不履行 不法 不可抗力 主刑 主権 予納
 争訟 二親等 享有 人権 付合 付議 代位 代理商 令書 仮処分 仲立 仲立ち 仲裁 任免 任命 何人 何人も
 余罪 供託 供述 係争 係属 信書 信託 倉荷 倉荷証券 借主 偽計 偽証 偽造 傍聴 債券
 免責 免訴 入廷 入札 公判廷 公告 公報 公売 公文書 公法人 公法 公署 公証 公課 公選 公金
 共同海損 共犯 内閣 再審 再審査庁 再犯 再議 処断 処罰 出納員 刑事 刑事訴訟 刑務所 刑場 刑期
 判事 制定 制裁 前条 前款 前章 前節 労政 動議 勝訴 勾引 原審 双務
 収用 収賄 取り下げ 取り下げる 取り消し 取り消す 取り調べ 取り調べる 取消 取立 取立て 取締法 受任 受刑 受刑者 受託 受領
 召喚 召集 司法 可決 各項 合名 合意 合議 合議制 合資 同号 同意 同条 同項 否決 否認 告示 和議
 商事 商業登記 嘱託 国事 国会 国務 国務大臣 国政 国権 国税 国籍 地方自治 地方裁判所 執行 執行官
 大審院 大赦 太政官 奴隷 委任状 委託 嫡出 嫡母 守秘 官公庁 官制 官吏 官報 官庁 官憲 官署
 宣告 宣誓 寄託 審判 審問 審決 対審 対抗 尋問 専決 届け出 届け出る 差戻し 差し戻し 差し戻す
 差押 差押え 差し押える 差し押さえ 差し押さえる 差止め 差し止める 布告 廃置分合 廃除 弁償
 弁護士 弁論 弁護 引渡 引き渡し 強制執行 強姦 強盗 強要 強談 当事者間 後見人 復権 徴税 応訴 心神喪失 心神耗弱
 心証 恩赦 情状 意匠 憲法 懈怠 懲戒免職 懲役 懲罰 戒告 戸主 戸籍 所有 扶養 抗告 抗弁 抵当
 承認 拘束 拘留 拘禁 招集 挙証 捜査 捜索 提起 損壊 擬制 改廃 新株 新株予約権 新株予約権付社債
 新株予約権付社債券 新法 新法令 施行日前 施行日後 日米地位協定 旧法 旧法令 更改 暴行 書記官 書証
 有償 有罪 本則 本条 本案 本法 本章 本節 本訴 条文 条約 条規 条項 果実 根抵当 検事 検事正 検察 検案書 業法
 権原 権能 次条 次節 次項 正本 正犯 死刑 毀損 民事 民事訴訟 民訴 求釈明 決定 決議 法人 法人格 法制 法務
 法務大臣 法廷 法律 法規 清算 滌除 無償 無罪 無能力 特権 特約 特赦 犯則 犯罪 犯罪行為 現行犯 瑕疵担保
 申告 申立 申立て 申立人 申し立て 申し立てる 申請者 異議 留保 留置 発行済株式 発議 登記簿
 監禁 監護 破産 社債 社債権者 社債権者集会 禁治産 禁治産者 禁錮 私人 私文書 私権 私法 租税 税務 税法
 立入検査 立法 立証 第一審 管轄 管財 簡易裁判所 約定 約款 納税 累犯 終審 終期 縁組 罪名 罪証 罪跡
 罰則 罷免 職権 自然人 自由心証 自白 自首 船籍 荷受人 著作物 脅迫 行使 行政 行政書士法人 被用者 被疑
 被選挙権 裁判 裁判員 裁判官 裁判所 裁判長 裁定 裏書 補償金 補則 規則 規正 規程 規約 親告罪 親権 親等 親族
 解任 解散 解約 解職 計量法 訓令 設定 許認可 訴因 訴訟 訴訟法 訴追 訴願 証券 証憑 証書 証票 証紙 証言
 詐偽 詔勅 詔書 認諾 誣告 課税 調停 調書 調査官 請求 請求人 請託 請負人 請願 請願書 謄本
 談合 議会 議定書 議院 譲与 譲受 譲受人 譲渡 財物 賠償 賃借 賃料 賃貸 贈収賄 贓物 起債 起訴
 起算日 転貸借 過失傷害 過失致死 過怠 違反 違法行為 違約金 適格 適用除外 遺棄 酒税 開廷 陪席 離縁
 非訟事件 養親 養親子 高等裁判所
`.trim().split(/\s+/u));
const draftingTerms=new Set(`
 要件 特則 効力 適法 違法 不適法 不当 正当な理由 遅滞なく 相当の期間 起算 主観的起算点 客観的起算点
 みなす 推定 準用 努力義務 電磁的記録 ただし書 前項 各号 当該 又は 若しくは 及び 並びに 規定
 公布 施行 附則 政令 省令 前二項 遡及 改正 損害 法定 権限 権利 義務 第三者 期日 形式上の要件 剝奪
`.trim().split(/\s+/u));
function isEditorialLegal(term){
 if(term.group==='basic')return term.refs.length>0;
 return term.group!=='words'||draftingTerms.has(term.name);
}
const editorialTerms=editorialGlossary.terms.map(term=>({...term,legal:isEditorialLegal(term)}));
const compoundTerms=corpus.entries.map(([name,reading,definitions,origin,mask,refs])=>{
 const legal=origin==='law'||legalVocabulary.has(name);
 return {id:'word-'+name,name,reading,definitions,meaning:definitions[0],origin,refs,aliases:[],legal,
  group:origin==='law'?'statutory':legal?'legal':'compound',
  lawKeys:corpus.laws.filter((id,index)=>mask&(1<<index)).map(id=>lawKeysById.get(id))
 };
});
const glossary={
 groups:{...editorialGlossary.groups,compound:'熟語・一般語',legal:'法律用語',statutory:'法令上の定義'},
 terms:[...editorialTerms,...compoundTerms]
};
const termLine=legal=>`sg-term-line ${legal?'sg-term-legal':'sg-term-general'}`;
function underlineLegend(){
 return `<div class="sg-term-legend" role="group" aria-label="用語の下線">
  <span class="${termLine(true)}">法律用語<span class="sr-only">は二重線</span></span>
  <span class="${termLine(false)}">一般用語<span class="sr-only">は一重線</span></span>
 </div>`;
}
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
for(const term of editorialTerms){
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
 return terms.map(term=>`<button type="button" class="sg-term-chip" data-guide-term="${esc(term.id)}"><span class="${termLine(term.legal)}">${esc(term.name)}</span></button>`).join('');
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
  html+=`<span class="sg-inline-term ${termLine(term.legal)}" role="button" tabindex="0" aria-haspopup="dialog" data-guide-term="${esc(term.id)}">${render(start,end)}</span>`;
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
   <div><h1>これだけは覚える</h1><p>条文の原則・例外・期限を、まず自分の言葉で答えてから確認しましょう。下線のある用語は押すと意味が開きます。</p>${underlineLegend()}</div>
   <a class="sg-ref" href="#glossary">用語辞典 <span aria-hidden="true">→</span></a>
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
 const matchesGroup=term=>view.group==='all'||term.group===view.group||
  (view.group==='legal'&&term.legal)||(view.group==='compound'&&!term.legal);
 const results=indexTerms.filter(({term,search,laws})=>
  matchesGroup(term)&&(view.law==='all'||laws.has(view.law))&&search.includes(keyword)
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
   <span class="sg-index-word"><strong class="${termLine(term.legal)}">${esc(term.name)}</strong><small>${esc(term.reading)}</small></span>
   <span class="sg-index-open" aria-hidden="true">›</span>
  </button></li>`).join('')}</ul>${
   pages>1?`<nav class="sg-index-pagination" aria-label="用語辞典のページ">
    <button type="button" class="button secondary small" data-action="glossaryPage" data-value="${page-1}" ${page===1?'disabled':''}>前へ</button>
    <span>${page} / ${pages} ページ</span>
    <button type="button" class="button secondary small" data-action="glossaryPage" data-value="${page+1}" ${page===pages?'disabled':''}>次へ</button>
   </nav>`:''
  }`;
}
function glossaryHTML(view){
 return `<div class="sg-page">
  <header class="sg-header">
   <div><h1>用語辞典</h1><p>${glossary.terms.length.toLocaleString('ja-JP')}語を検索できます。用語を選ぶと、意味を表示して読み上げます。</p>${underlineLegend()}</div>
   <a class="sg-ref" href="#roppo">六法書架 <span aria-hidden="true">→</span></a>
  </header>
  <div class="sg-filters sg-index-filters">
   <label for="sg-search">用語・読み方・意味<input class="text-input" id="sg-search" data-action="glossarySearch" type="search" maxlength="100" placeholder="例：審査請求、そうたつ" value="${esc(view.search)}"></label>
   <label for="sg-index-group">分類<select class="select" id="sg-index-group" data-action="glossaryGroup">${options([['all','すべての分類'],...Object.entries(glossary.groups)],view.group)}</select></label>
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
   <div><p class="sg-dialog-topic">${esc(glossary.groups[term.group])}</p><h2 id="sg-term-title" class="${termLine(term.legal)}">${esc(term.name)}</h2></div>
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
 cleanProgress,essentialsHTML,glossaryHTML,glossaryResults,forArticle,inlineText,termsIn,underlineLegend,
 getTerm:id=>termById.get(id),
 getCard:id=>cardById.get(id),lawKey:id=>Object.keys(laws).find(key=>laws[key][0]===id)
};
})();
