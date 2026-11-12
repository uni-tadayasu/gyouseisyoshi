/* 読み上げ用の表記補正。画面に表示する文字や選択位置は変更しない。 */
(function(){
 'use strict';

 // 送り仮名で語の区切りが明確になる場合は、音声合成にも漢字を渡す。
 const spellings=new Map(Object.entries({
  '申立て':'申し立て','申立':'申し立て','申立人':'申し立てにん',
  '申立書':'申し立て書','取立て':'取り立て','差止め':'差し止め',
  '差止請求':'差し止め請求','取下げ':'取り下げ','差押え':'差し押さえ',
  '差押状':'差し押さえ状','引渡し':'引き渡し','引継ぎ':'引き継ぎ',
  '引受け':'引き受け','繰上償還':'繰り上げ償還','譲受人':'譲り受け人',
  '権付社債':'権付き社債','買戻し':'買い戻し','売渡し':'売り渡し',
  '書換え':'書き換え','言渡し':'言い渡し','ただし書':'ただし書き',
  '但書':'ただし書き','但し書':'ただし書き','前々':'前前',
  'もつて':'もって','あつて':'あって','よつて':'よって','なつた':'なった',
  'なかつた':'なかった','従つて':'従って','あつた':'あった',
  '至つた':'至った','つては':'っては','奪はれ':'奪われ','行はれ':'行われ',
  'といふ':'という','勅令ヲ以テ':'チョクレーをもって','之ヲ':'これを','掲グル':'掲げる',
  '当該各':'当該、各','当該議':'当該、議',
  '別表第一保健師助産師看護師法':'別表第一、保健師助産師看護師法'
 }));
 const exceptions=new Map(Object.entries({
  '令和':'れいわ','遺言':'いごん','競売':'けいばい','競買':'けいばい',
  '付合':'ふごう','留置権':'りゅうちけん','質権':'しちけん',
  '代物弁済':'だいぶつ弁済','先取特権':'さきどり特権','原処分':'げん処分',
  '相手方':'相手かた','図画':'とが','問屋':'といや','立木法':'りゅうぼく法',
  '立木ニ関スル法律':'りゅうぼくに関する法律',
  '労役場留置':'ろうえきじょうりゅうち','留置':'りゅうち','転付':'てんぷ','本節':'ほんせつ',
  '私文書':'しぶんしょ','第一審':'だいいっしん','備置き':'そなえおき',
  '備置開始日':'そなえおき開始日','求釈明':'きゅうしゃくめい',
  '禁治産':'きんちさん','統理':'とうり','端株券':'はかぶ券',
  '吸食':'きゅうしょく','運送取扱人':'運送とりあつかいにん',
  '請求人':'請求にん','被相続人':'被そうぞくにん','相続人':'そうぞくにん',
  '清算人':'清算にん','会計監査人':'会計監査にん','仲立人':'なかだちにん',
  '保有個人情報':'保有こじん情報','保有個人データ':'保有こじんデータ',
  '除斥':'じょせき','在廷':'ざいてい','隠避':'いんぴ','摘示':'てきじ',
  '招状':'しょうじょう','委付':'イフ','附合':'ふごう','長等':'チョートー','勅令':'チョクレー',
  '申述':'しんじゅつ','公署':'こうしょ','官公署':'かんこうしょ',
  '補助人':'ほじょにん','保佐人':'ほさにん','鑑定人':'鑑定にん',
  '通訳人':'通訳にん','身元引受人':'身元引き受けにん','選挙人':'選挙にん',
  '参加人':'参加にん','監督人':'監督にん','管理人':'管理にん','付郵便送達':'ふ郵便送達',
  '最大判':'さいだいはん','最判':'さいはん','盗取':'とうしゅ','水災':'すいさい'
 }));
 // 法令XMLの一部振り仮名を、同じ読みの熟語としてまとめて渡す。
 const rubyCompounds=new Map(Object.entries({
  '瑕疵':'かし','勾留':'こうりゅう','禁錮':'きんこ','幇助':'ほうじょ',
  '誹謗':'ひぼう','毀損':'きそん','失踪':'しっそう','懈怠':'けたい',
  '賭博':'とばく','斡旋':'あっせん'
 }));
 const kana=/^[\u3041-\u3096\u309D\u309E\u30A1-\u30FA\u30FD\u30FEー]+$/u;
 const digits='〇一二三四五六七八九';
 const placeValues={十:10,百:100,千:1000};
 const numeric='0-9０-９〇零一二三四五六七八九十百千';
 const legalNumber=new RegExp('第['+numeric+']+(?:分款|編|部|章|節|款|目|条|條|項|号|號)(?:(?:の|ノ)['+numeric+']+)*(?:中)?','gu');
 const age=new RegExp('(['+numeric+']+)(歳|才)','gu');
 const kanaForm=value=>value.normalize('NFKC').replace(/[ァ-ヶ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-96));
 const caseNames={甲:'こう',乙:'おつ',丙:'へい',丁:'てい'};
 const letterNames=['エー','ビー','シー','ディー','イー','エフ','ジー','エイチ','アイ','ジェー','ケー','エル','エム','エヌ','オー','ピー','キュー','アール','エス','ティー','ユー','ブイ','ダブリュー','エックス','ワイ','ゼット'];
 const regexLiteral=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

 function numberValue(source){
  const value=source.normalize('NFKC').replace(/零/g,'〇');
  if(/^\d+$/.test(value))return Number(value);
  const chars=[...value];
  if(!chars.length||chars.some(char=>!digits.includes(char)&&!placeValues[char]))return NaN;
  if(!chars.some(char=>placeValues[char]))return Number(chars.map(char=>digits.indexOf(char)).join(''));
  let total=0,digit=null,previous=10000;
  for(const char of chars){
   const place=placeValues[char];
   if(place){
    if(place>=previous)return NaN;
    total+=(digit??1)*place;digit=null;previous=place;
   }else{
    if(digit!==null)return NaN;
    digit=digits.indexOf(char);
   }
  }
  return total+(digit??0);
 }

 function cleanReadings(value){
  const result=new Map();
  if(!Array.isArray(value))return [];
  for(const rule of value){
   if(typeof rule?.word!=='string'||typeof rule.reading!=='string')continue;
   const word=rule.word.trim().normalize('NFC'),reading=rule.reading.trim().normalize('NFKC');
   if(!word||word.length>40||/[\u0000-\u001f\u007f]/u.test(word)||!reading||reading.length>80||!kana.test(reading))continue;
   result.set(word,reading);
  }
  return [...result].slice(0,100).map(([word,reading])=>({word,reading}));
 }

 function sliceFragment(fragment,start,end){
  const t=fragment.t.slice(start,end);
  const ruby=[];
  for(const part of fragment.ruby||[]){
   if(part.start<start||part.start+part.base.length>end)continue;
   ruby.push({...part,start:part.start-start,end:Math.min(part.end,end)-start});
  }
  return {t,ruby};
 }

 function stripRuby(t,ruby){
  let plain='',from=0;
  const hints=[];
  for(const part of ruby||[]){
   if(part.start<from||part.end>t.length||part.end<=part.start)continue;
   plain+=t.slice(from,part.start);
   const start=plain.length;
   plain+=part.base;
   hints.push({start,end:plain.length,reading:part.reading});
   from=part.end;
  }
  return {plain:plain+t.slice(from),hints};
 }

 function legalPhrasing(text,context){
  const isLegal=Boolean(context?.lawId)||context?.kind==='law';
  return text.replace(legalNumber,(citation,offset,source)=>{
   const rendered=citation.replace(/條/g,'条').replace(/號/g,'号').replace(/ノ/g,'の');
   const next=source[offset+citation.length]||'';
   // 連続する条・項・号と、引用を導く「中」をそれぞれ一息で読む。
   const suffix=source.slice(offset+citation.length);
   return rendered+((next==='第'||/^改正[前後]/u.test(suffix)||(citation.endsWith('中')&&/^[^、。\s「『」』]/u.test(next)))?'、':'');
  }).replace(/(?:同条中|同項中|前条中|前項中|前号中)(?=[\p{Script=Han}])/gu,'$&、')
   .replace(/何人(?=[ではもにのた]|$)/gu,(word,offset,source)=>{
    const next=source.slice(offset+word.length);
    if(/^(?:ですか|か[？?]|も[、\s]*(?:いる|いた|来|集ま|参加した)|の人数)/u.test(next))return word;
    const legalQuote=/^(?:たりとも|であっても|にも[、。]|に対しても|も[、\s]*(?:法令|法律|法の下|この法律|これを|権利|いかなる|正当な|公務員|行政|裁判|国民|身体|信教|特別|理由)|も[」』])/u.test(next);
    return isLegal||legalQuote?'なんぴと':word;
   }).replace(/行([っつ][たて])/gu,(word,ending,offset,source)=>{
    const object=source.slice(Math.max(0,offset-16),offset);
    return isLegal||/(?:処分|手続|審査|審理|調査|登記|審判|契約|申請|執行|行政指導|届出|審議|通知|選挙|採決|裁決|行為|試験|訴訟)を$/u.test(object)?'おこな'+ending.replace('つ','っ'):word;
   }).replace(/(?<![\p{Script=Han}])([甲乙丙丁])(?=[はがにのをとでへも、。）」]|から|まで|株式会社|土地|建物|県|市|町|村)/gu,letter=>caseNames[letter])
   .replace(/((?:機関|団体|委員会|組合)の)長(?=[はがにのをとでへも、。）」]|から|まで|$)/gu,'$1ちょう')
   .replace(age,(written,count)=>numberValue(count)===20?'はたち':written)
   .replace(/(?<![A-Za-zＡ-Ｚａ-ｚ])[A-ZＡ-Ｚ]{1,6}(?![A-Za-zＡ-Ｚａ-ｚ])/gu,word=>[...word.normalize('NFKC')].map(letter=>letterNames[letter.charCodeAt(0)-65]).join(''));
 }

 function reader(custom){
  const words=new Map([...spellings,...exceptions,...rubyCompounds]);
  const customWords=cleanReadings(custom);
  for(const {word,reading} of customWords)words.set(word,reading);
  const pattern=new RegExp([...words.keys()].sort((a,b)=>b.length-a.length).map(regexLiteral).join('|'),'gu');
  return (fragment,context)=>{
   const {plain,hints}=stripRuby(fragment.t,fragment.ruby);
   let output='',from=0,hintIndex=0;
   function writeUntil(end){
    while(hintIndex<hints.length&&hints[hintIndex].end<=end){
     const hint=hints[hintIndex++];
     output+=legalPhrasing(plain.slice(from,hint.start),context)+hint.reading;
     from=hint.end;
    }
    output+=legalPhrasing(plain.slice(from,end),context);
    from=end;
   }
   for(const match of plain.matchAll(pattern)){
    const word=match[0],start=match.index,end=start+word.length;
    const touching=hints.filter(hint=>hint.start<end&&hint.end>start);
    const withRuby=rubyCompounds.get(word);
    if(touching.length&&(!withRuby||touching.some(hint=>hint.start<start||hint.end>end||!kanaForm(withRuby).includes(kanaForm(hint.reading)))))continue;
    writeUntil(start);
    output+=touching.length?withRuby:words.get(word);
    hintIndex+=touching.length;
    from=end;
   }
   writeUntil(plain.length);
   return output;
  };
 }

 window.GYOSHI_LAW_VOICE=Object.freeze({cleanReadings,reader,sliceFragment,numberValue});
})();
