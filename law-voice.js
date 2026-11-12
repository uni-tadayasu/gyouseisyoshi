/* 読み上げ用の変換。表示文字列とマーカーの位置には手を加えない。 */
(function(){
 'use strict';

 const terms={
  '遺言':'いごん','遺贈':'いぞう','相殺':'そうさい','瑕疵':'かし',
  '先取特権':'さきどりとっけん','根抵当権':'ねていとうけん',
  '留置権':'りゅうちけん','質権':'しちけん','質入れ':'しちいれ',
  '競売':'けいばい','競買':'けいばい','更改':'こうかい','付合':'ふごう',
  '代物弁済':'だいぶつべんさい','弁済':'べんさい','供託':'きょうたく',
  '追認':'ついにん','催告':'さいこく','時効の援用':'じこうのえんよう',
  '求償権':'きゅうしょうけん','債権譲渡':'さいけんじょうと',
  '譲渡担保':'じょうとたんぽ','物上代位':'ぶつじょうだいい',
  '詐害行為':'さがいこうい','公序良俗':'こうじょりょうぞく',
  '共有持分':'きょうゆうもちぶん','仮登記':'かりとうき',
  '代襲相続':'だいしゅうそうぞく','遺留分':'いりゅうぶん',
  '嫡出':'ちゃくしゅつ','姻族':'いんぞく','婚姻':'こんいん',
  '離縁':'りえん','扶養':'ふよう','後見':'こうけん',
  '居所':'きょしょ','立木':'りゅうぼく','問屋':'といや','図画':'とが',
  '任務懈怠':'にんむけたい','定款':'ていかん','約款':'やっかん',
  '発起人':'ほっきにん','清算人':'せいさんにん','艤装':'ぎそう',
  '取消訴訟':'とりけしそしょう','当事者訴訟':'とうじしゃそしょう',
  '原告適格':'げんこくてきかく','処分性':'しょぶんせい',
  '訴えの利益':'うったえのりえき','裁量':'さいりょう',
  '義務付け':'ぎむづけ','差止め':'さしとめ','申立て':'もうしたて',
  '訴状':'そじょう','送達':'そうたつ','陳述':'ちんじゅつ',
  '口頭弁論':'こうとうべんろん','既判力':'きはんりょく',
  '附帯控訴':'ふたいこうそ','上告':'じょうこく','抗告':'こうこく',
  '疎明':'そめい','仮差押え':'かりさしおさえ','差押え':'さしおさえ',
  '執行':'しっこう','係属':'けいぞく','勾留':'こうりゅう',
  '拘禁刑':'こうきんけい','禁錮':'きんこ','懲役':'ちょうえき',
  '科料':'かりょう','過料':'かりょう','免訴':'めんそ',
  '正犯':'せいはん','幇助':'ほうじょ','教唆':'きょうさ',
  '心神耗弱':'しんしんこうじゃく','賭博':'とばく','賭け':'かけ',
  '誹謗':'ひぼう','毀損':'きそん','悔悛':'かいしゅん',
  '行方不明':'ゆくえふめい','附則':'ふそく','但書':'ただしがき',
  '瑕疵かし':'かし','勾こう留':'こうりゅう','禁錮こ':'きんこ',
  '幇ほう助':'ほうじょ','誹謗ひぼう':'ひぼう','毀き損':'きそん',
  '失踪':'しっそう','失踪そう':'しっそう'
 };
 const legacyKana={'あつて':'あって','もつて':'もって','よつて':'よって','なつた':'なった','しなければならなかつた':'しなければならなかった'};
 const kana=/^[\u3041-\u3096\u309D\u309E\u30A1-\u30FA\u30FD\u30FEー]+$/u;
 const digits='〇一二三四五六七八九';
 const placeValues={十:10,百:100,千:1000};
 const pronunciations=['れい','いち','に','さん','よん','ご','ろく','なな','はち','きゅう'];
 const units={分款:'ぶんかん',編:'へん',部:'ぶ',章:'しょう',節:'せつ',款:'かん',目:'もく',条:'じょう',項:'こう',号:'ごう'};
 const numericCharacters='0-9０-９〇零一二三四五六七八九十百千';
 const legalNumber=new RegExp('第(['+numericCharacters+']+)('+Object.keys(units).join('|')+')((?:の['+numericCharacters+']+)*)','gu');

 function numberValue(source){
  const value=source.normalize('NFKC').replace(/零/g,'〇');
  if(/^\d+$/.test(value))return Number(value);
  const chars=[...value];
  if(chars.some(char=>!digits.includes(char)&&!placeValues[char]))return NaN;
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

 function spellNumber(source){
  let n=numberValue(source);
  if(!Number.isInteger(n)||n<0||n>9999)return '';
  if(n===0)return pronunciations[0];
  const thousands=['','せん','にせん','さんぜん','よんせん','ごせん','ろくせん','ななせん','はっせん','きゅうせん'];
  const hundreds=['','ひゃく','にひゃく','さんびゃく','よんひゃく','ごひゃく','ろっぴゃく','ななひゃく','はっぴゃく','きゅうひゃく'];
  let reading=thousands[Math.floor(n/1000)]+hundreds[Math.floor(n%1000/100)];
  n%=100;
  if(n>=10)reading+=(n>=20?pronunciations[Math.floor(n/10)]:'')+'じゅう';
  return reading+(n%10?pronunciations[n%10]:'');
 }

 function numberReading(match,base,unit,branches,offset,source){
  const main=spellNumber(base),sub=branches.split('の').filter(Boolean).map(spellNumber);
  if(!main||sub.some(reading=>!reading))return match;
  return 'だい'+main+units[unit]+sub.map(reading=>'の'+reading).join('')+(source[offset+match.length]==='第'?'、':'');
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

 function withReadings(plain,hints,words,pattern){
  let output='',from=0,hint=0;
  function plainUntil(end){
   while(hint<hints.length&&hints[hint].end<=end){
    const ruby=hints[hint++];
    if(ruby.start<from)continue;
    output+=plain.slice(from,ruby.start)+ruby.reading;
    from=ruby.end;
   }
   output+=plain.slice(from,end);
   from=end;
  }
  for(const match of plain.matchAll(pattern)){
   plainUntil(match.index);
   output+=words.get(match[0]);
   from=match.index+match[0].length;
  }
  plainUntil(plain.length);
  return output;
 }

 function reader(custom){
  const words=new Map([...Object.entries(terms),...Object.entries(legacyKana)]);
  for(const {word,reading} of cleanReadings(custom))words.set(word,reading);
  const literals=[...words.keys()].sort((a,b)=>b.length-a.length)
   .map(text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const pattern=new RegExp(literals.join('|'),'gu');
  return fragment=>{
   const {plain,hints}=stripRuby(fragment.t,fragment.ruby);
   return withReadings(plain,hints,words,pattern).replace(legalNumber,numberReading);
  };
 }

 window.GYOSHI_LAW_VOICE=Object.freeze({cleanReadings,reader,sliceFragment,numberValue});
})();
