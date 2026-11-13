/* 条文の表示用データから、原文に沿った学習用の要約を作る。 */
(function(){
 'use strict';

 const LIMIT=125, SUMMARY_LIMIT=165, MAX_POINTS=4;
 const numbered=/^([0-9０-９〇一二三四五六七八九十百千]+|[イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス])\u3000/u;
 const exception=/(?:ただし|但し|この限りで(?:は)?な[いく]|適用しない|(?:場合|もの|とき)を除[きく])/u;
 const timing=/(?:施行の日|公布の日|起算して|効力を生ずる日|経過した日|当分の間|[0-9０-９一二三四五六七八九十百千何]+(?:箇月|か月|月間|年間|日間|日以内|月以内|年以内)|以内に|までに|遅滞なく)/u;
 const reference=/(?:第[〇零一二三四五六七八九十百千0-9０-９]+[条條](?:の[〇零一二三四五六七八九十百千0-9０-９]+)?|(?:前|次|同)[条條項号]|準用する|他の法律|(?:政令|主務省令|条例)で(?:別に)?定め)/u;
 const definitions=/(?:定義|用語の意義|用語の意味|とは、)/u;
 const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ja',{granularity:'word'}):null;
 const cached=new WeakMap();
 const captionText=a=>String(a.caption||'').replace(/^[（(]|[）)]$/g,'').trim();
 const simple=text=>({t:text});

 function makeSentences(blocks){
  const sentences=[];
  let paragraph=0;
  for(const [block,fragment] of blocks.entries()){
   const text=fragment?.t;
   if(typeof text!=='string'||!text.trim())continue;
   const item=Number(fragment.indent)>0;
   if(!item)paragraph++;
   const marker=text.match(numbered);
   const start=marker?.[0].length||0;
   const order=marker?.[1].normalize('NFKC');
   // Keep the displayed item number for the point label, not for speech or summary.
   if(!item&&order&&/^\d+$/.test(order))paragraph=Number(order);
   const label=item?(order?(paragraph>1?paragraph+'項・':'')+order+(Number(fragment.indent)===1?'号':''):'各号・細目'):'第'+Math.max(paragraph,1)+'項';
   let parens=0,quotes=0,from=start;
   const push=end=>{
    const value=text.slice(from,end),content=value.trim();
    if(content){
     const left=from+value.indexOf(content);
     sentences.push({fragment,block,label,item,start:left,end:left+content.length,text:content});
    }
    from=end;
   };
   for(let offset=start;offset<text.length;offset++){
    const char=text[offset];
    if('（(【［〔'.includes(char))parens++;
    if('）)】］〕'.includes(char))parens=Math.max(0,parens-1);
    if('「『'.includes(char))quotes++;
    if('」』'.includes(char))quotes=Math.max(0,quotes-1);
    if(char==='。'&&!parens&&!quotes)push(offset+1);
   }
   if(from<text.length)push(text.length);
  }
  return sentences;
 }

 function hasFeature(sentences,pattern){return sentences.some(part=>pattern.test(part.text));}

 function extract(part,limit=LIMIT){
  const {fragment,start}=part;
  let end=part.end;
  const clip=end-start>limit;
  if(clip){
   const text=fragment.t.slice(start,end);
   const comma=Math.max(text.lastIndexOf('、',limit),text.lastIndexOf('；',limit));
   if(comma>limit*0.65)end=start+comma;
   else if(segmenter){
    for(const word of segmenter.segment(text)){
     if(word.index>limit)break;
     if(word.index>limit*0.65)end=start+word.index;
    }
   }
   if(end===part.end)end=start+limit;
   const touching=(fragment.ruby||[]).find(hint=>hint.start<end&&hint.end>end);
   if(touching)end=touching.start>start?touching.start:touching.end;
  }
  const sliced=window.GYOSHI_LAW_VOICE?.sliceFragment(fragment,start,end)||simple(fragment.t.slice(start,end));
  if(clip&&end<part.end)sliced.t=sliced.t.trimEnd()+'…';
  return sliced;
 }

 function plainLead(lead){
  const fragment=extract(lead,SUMMARY_LIMIT);
  if(fragment.t.endsWith('…'))return fragment;
  // Only simplify expressions with a stable meaning. No conditions or exceptions are removed.
  const substitutions=[
   [/をもって、成年とする。$/u,'で成年になります。'],
   [/をいう。$/u,'を指します。'],
   [/を適用しない。$/u,'は適用されません。'],
   [/を妨げない。$/u,'を妨げません。'],
   [/ないものとする。$/u,'ないこととします。'],
   [/なければならない。$/u,'なければなりません。'],
   [/ことができる。$/u,'ことができます。']
  ];
  for(const [pattern,replacement] of substitutions){
   const match=fragment.t.match(pattern);
   if(!match||fragment.ruby?.some(hint=>hint.end>match.index))continue;
   return {...fragment,t:fragment.t.slice(0,match.index)+replacement};
  }
  return fragment;
 }

 function readPoints(sentences,lead,showLead){
  const picked=new Map();
  function add(part,label){
   if(!part||picked.size>=MAX_POINTS||(!showLead&&part===lead)||picked.has(part))return;
   picked.set(part,label);
  }
  if(showLead)add(lead,'本文の冒頭');
  for(const [label,pattern] of [['例外・適用範囲',exception],['時期・期限',timing],['参照規定',reference]]){
   // Prefer a separate sentence if the lead already mentions this topic.
   const part=sentences.find(candidate=>candidate!==lead&&pattern.test(candidate.text))||
    (showLead&&pattern.test(lead.text)?lead:null);
   add(part,label);
  }
  const blocks=new Set([lead.block,...[...picked.keys()].map(part=>part.block)]);
  for(const part of sentences){
   if(picked.size>=MAX_POINTS)break;
   if(blocks.has(part.block))continue;
   blocks.add(part.block);
   add(part,part.item?'列挙':'本文');
  }
  const manyParts=sentences.some(part=>part.item||part.block!==lead.block);
  return [...picked].sort(([a],[b])=>a.block-b.block||a.start-b.start)
   .map(([part,label])=>({...extract(part),label:manyParts?part.label+'・'+label:label,block:part.block}));
 }

 function outline(article){
  const sentences=makeSentences(Array.isArray(article.blocks)?article.blocks:[]);
  const lead=sentences.find(part=>!part.item)||sentences[0];
  const caption=captionText(article);
  const zone=String(article.zone||'');
  const appendix=zone==='appendix';
  const supplement=zone.startsWith('suppl-');
  const preamble=article.id==='preamble';
  if(!lead)return {kind:'outline',summary:simple(caption||article.title||'本文の掲載なし'),explanation:appendix?'別表・別記です。図や様式は本文の公式資料で確認してください。':'読める本文が収録されていません。公式資料で確認してください。',points:[]};
  if(sentences.length===1&&/^削除[。.]?$/u.test(lead.text))return {
   kind:'outline',summary:simple('この条文は削除されています。'),
   explanation:'この収録版では条番号が残り、本文は「削除」と表示されています。',points:[]
  };

  const leadIsList=sentences.some(part=>part.item)&&/(?:次|左)の?(?:各|とおり|掲げる)|(?:各号|各項)に|左の/u.test(lead.text);
  const isDefinition=definitions.test(caption)||definitions.test(lead.text);
  const isLong=lead.text.length>SUMMARY_LIMIT;
  let summary=plainLead(lead);
  let explanation='主語・条件・結果を順に確認すると、条文の意味をつかみやすくなります。';
  if(appendix){
   summary=simple('別表・別記の「'+(article.title||'掲載資料')+'」です。');
   explanation='項目と対応する条件・区分を確認します。表の列や図・様式は公式本文で確認してください。';
  }else if(preamble){
   explanation='法律の考え方や背景を述べる前文です。全体の趣旨は原文を続けて確認してください。';
  }else if(supplement){
   explanation='附則の規定です。どの法令や改正に対応するかを見出しで確認し、適用の時期と条件を本文で確かめます。';
  }else if(isDefinition){
   explanation='この法令で使う言葉の範囲を定めています。定義を示す文や号を確かめ、対象に含まれるものと除かれるものを確認します。';
  }else if(caption&&/目的/u.test(caption)){
   explanation='法律や制度の目的を示す条文です。どんな手段で、何を実現しようとしているかを確認します。';
  }else if(leadIsList){
   explanation='本文に続く各号が対象や条件を具体的に示します。項目が選択肢なのか、すべて必要な条件なのかを、本文の言い回しで確認します。';
  }else if(hasFeature(sentences,exception)){
   explanation='原則と例外・適用範囲を分けて確認します。例外の対象や条件は、ただし書や後続の項に置かれることがあります。';
  }else if(hasFeature(sentences,timing)){
   explanation='時期や期限が出てくる条文です。何を起点に数えるか、何が期限の対象かを本文で確認します。';
  }else if(hasFeature(sentences,reference)){
   explanation='別の条文や規定が参照されています。参照先を合わせて読むと、条件や手続の範囲を確認できます。';
  }else if(/努め(?:なければならない|るものとする)[。.]?$/u.test(lead.text)){
   explanation='本文は、目的に向けて努力することを求めています。誰に、何について努力を求めているかを確認します。';
  }else if(/なければならない[。.]?$/u.test(lead.text)){
   explanation='誰に何をする義務があるのかを確認します。本文に条件があれば、その条件も併せて読みます。';
  }else if(/ことができる[。.]?$/u.test(lead.text)){
   explanation='何ができるかを示す規定です。その行為ができる人と、本文が挙げる条件を確認します。';
  }else if(/とみなす[。.]?$/u.test(lead.text)){
   explanation='法律上どのように扱うかを示す規定です。「みなす」の対象と、その扱いが生じる条件を確認します。';
  }
  const points=readPoints(sentences,lead,appendix);
  // A clipped first sentence is clearly marked as an excerpt rather than a complete legal rule.
  if(isLong&&!appendix&&summary.t.endsWith('…'))explanation='要約欄は冒頭の抜粋です。'+explanation;
  const listed=new Set(sentences.filter(part=>part.item).map(part=>part.block)).size;
  if(listed>points.length)explanation+=' 表示中の抜粋に続く項目は本文で確認してください。';
  else if(isLong||sentences.length>points.length+1)explanation+=' 抜粋の続きは本文で確認してください。';
  return {kind:'outline',summary,explanation,points};
 }

 function summarize(article,lawId,{bundled=false,reviewed=false}={}){
  if(!article||typeof article!=='object')return outline({});
  const authored=article.zone==='main'&&article.number&&(bundled||reviewed)?window.GYOSHI_ARTICLE_NOTES?.[lawId]?.[article.number]:null;
  if(Array.isArray(authored)&&typeof authored[0]==='string'&&typeof authored[1]==='string'){
   const original=summarize(article,lawId);
   return {kind:'reviewed',summary:simple(authored[0]),explanation:authored[1],points:original.points};
  }
  if(!cached.has(article))cached.set(article,outline(article));
  return cached.get(article);
 }

 window.GYOSHI_ARTICLE_SUMMARY=Object.freeze({summarize});
})();
