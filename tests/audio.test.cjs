const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness({local = false} = {}) {
  const pending = [], timers = [], events = [], synthesis = [], players = [];
  const bgm = {configure(){},setSpeaking(){},beforeSpeech(){return true;},voiceOutput(){return {};},keepPlaying(){},resumeContext(){return Promise.resolve();},pause(){}};
  const document = {getElementById(){return null;},querySelectorAll(){return [];},addEventListener(){}};
  const window = {
    document, GYOSHI_LAW_VOICE: {cleanReadings(){return [];},reader(){return part => part.t;}},
    GYOSHI_READER_BGM: {createBgm(){return bgm;}},
    speechSynthesis: {
      getVoices(){return [{lang:'ja-JP',voiceURI:'test-ja',name:'Test',localService:true}];},
      speak(utterance){pending.push(utterance);},cancel(){},pause(){this.paused = true;},resume(){this.paused = false;},addEventListener(){}
    },
    SpeechSynthesisUtterance: class {constructor(text){this.text = text;}},
    addEventListener(){},dispatchEvent(event){events.push(event);}
  };
  if (local) window.GYOSHI_LOCAL_VOICE = {
    available:true,
    synthesize(text){return new Promise(resolve => synthesis.push({text,resolve}));},
    player(context,wave,volume,onEnd){
      const player = {plays:0,pauses:0,stops:0,play(){this.plays++;},pause(){this.pauses++;},stop(){this.stops++;},onEnd};
      players.push(player);return player;
    }
  };
  const context = vm.createContext({window,document,console,Intl,URLSearchParams,URL,Date,Map,Set,AbortController,
    navigator:{userAgent:'Test',platform:'Linux',maxTouchPoints:0},location:{hash:'#dashboard'},
    localStorage:{getItem(){return null;},setItem(){}},
    SpeechSynthesisUtterance:window.SpeechSynthesisUtterance,
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    setTimeout(callback){timers.push(callback);},clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../roppo.js'),'utf8'),context);
  const api = window.GYOSHI_ROPPO;
  if (local) api.__test.meta().voice = 'builtin-ja';
  function flush(){let limit=100;while(timers.length&&limit--)timers.shift()();assert.ok(limit>0,'timer loop');}
  function finish(){assert.ok(pending.length,'expected utterance');pending.shift().onend();flush();}
  return {api,pending,timers,events,synthesis,players,window,flush,finish};
}
const items = () => [1,2,3].map(n => ({id:'item-'+n,title:'項目'+n,parts:[{t:'文章'+n+'。'}]}));

test('continuous queue advances in order and finishes once, with previous/next still available', () => {
  const h=harness(), seen=[];
  h.api.speakItems(items(),{onItem:item=>seen.push(item.id)});
  assert.equal(h.pending[0].text,'文章1。');
  h.finish();h.finish();h.finish();
  assert.deepEqual(seen,['item-1','item-2','item-3']);
  assert.equal(h.api.__test.playback().speaking,false);
  assert.equal(h.api.__test.playback().queue.index,2);
  assert.equal(h.pending.length,0);
  h.api.__test.skipSpeech(-1);
  assert.equal(h.pending[0].text,'文章2。');
});

test('continuous preference is live and disabling it stops at current item', () => {
  const h=harness();
  h.api.speakItems(items());
  h.api.__test.meta().continuousPlayback=false;
  h.finish();
  assert.equal(h.pending.length,0);
  assert.equal(h.api.__test.playback().queue.index,0);
  h.api.__test.skipSpeech(1);
  assert.equal(h.pending[0].text,'文章2。');
  h.api.stop();
  assert.equal(h.api.__test.playback().queue,null);
});

test('pause between segments prevents queued continuation until resumed', () => {
  const h=harness();h.api.speakItems(items());
  h.pending.shift().onend();
  h.api.__test.togglePause();h.flush();
  assert.equal(h.pending.length,0);
  h.api.__test.togglePause();
  assert.equal(h.pending[0].text,'文章2。');
});

test('stop and skip invalidate late native callbacks', () => {
  const h=harness();h.api.speakItems(items());
  const first=h.pending.shift();
  h.api.__test.skipSpeech(1);
  first.onend();h.flush();
  assert.equal(h.pending.length,1);
  assert.equal(h.pending[0].text,'文章2。');
  const second=h.pending.shift();h.api.stop();second.onend();h.flush();
  assert.equal(h.pending.length,0);
  assert.equal(h.api.__test.playback().queue,null);
});

test('start index skips empty items without jumping back to the first item', () => {
  const h=harness(), list=items();list.splice(1,0,null,{parts:[{t:'  '}]});
  h.api.speakItems(list,{startIndex:1});
  assert.equal(h.pending[0].text,'文章2。');
});

test('stopping within a page/item callback cannot restart the cancelled queue', () => {
  const h=harness();h.api.speakItems(items(),{onItem:()=>h.api.stop()});
  assert.equal(h.pending.length,0);
  assert.equal(h.api.__test.playback().speaking,false);
});

test('one-off meaning reading replaces the previous queue and never auto advances', () => {
  const h=harness();h.api.speakItems(items());
  const previous=h.pending.shift();
  h.api.speakMeaning({name:'法律',reading:'ほうりつ',meaning:'社会の規則。'});
  previous.onend();h.flush();
  assert.equal(h.api.__test.playback().queue,null);
  while(h.pending.length)h.finish();
  assert.equal(h.api.__test.playback().speaking,false);
});

test('long readings retain sentences beyond the former 1500 chunk limit', () => {
  const h=harness();
  assert.equal(h.api.__test.splitSpeech('一文。'.repeat(1502)).length,1502);
});

test('local synthesis resolved after stop cannot create or play an audio source', async () => {
  const h=harness({local:true});h.api.speakItems(items());
  h.api.stop();h.synthesis[0].resolve({sampleRate:24000,pcm:[1]});
  await Promise.resolve();await Promise.resolve();
  assert.equal(h.players.length,0);
  assert.equal(h.api.__test.playback().queue,null);
});

test('local synthesis respects pause while loading, resumes, and advances only after end', async () => {
  const h=harness({local:true});h.api.speakItems(items());
  h.api.__test.togglePause();h.synthesis[0].resolve({sampleRate:24000,pcm:[1]});
  await Promise.resolve();await Promise.resolve();
  assert.equal(h.players[0].plays,0);
  h.api.__test.togglePause();assert.equal(h.players[0].plays,1);
  const first=h.players[0];first.onEnd();h.flush();
  assert.equal(h.synthesis[1].text,'文章2。');
  h.api.stop();first.onEnd();h.flush();
  assert.equal(h.synthesis.length,2);
});

async function microtasks(){for(let i=0;i<6;i++)await Promise.resolve();}

test('lazy queue loads only the current item, then loads the next after completion', async () => {
  const h=harness(), loads=[];
  h.api.speakItems([{id:'case-1'},{id:'case-2'}],{resolveItem:async item=>{
    loads.push(item.id);return {parts:[{t:item.id+'。'}]};
  }});
  await microtasks();
  assert.deepEqual(loads,['case-1']);assert.equal(h.pending[0].text,'case-1。');
  h.finish();await microtasks();
  assert.deepEqual(loads,['case-1','case-2']);assert.equal(h.pending[0].text,'case-2。');
});

test('stop aborts a lazy fetch and ignores its late result', async () => {
  const h=harness();let resolve,signal;
  h.api.speakItems([{id:'case-1'}],{resolveItem:(item,index,options)=>{
    signal=options.signal;return new Promise(done=>{resolve=done;});
  }});
  await microtasks();h.api.stop();assert.equal(signal.aborted,true);
  resolve({parts:[{t:'遅れて届いた本文。'}]});await microtasks();
  assert.equal(h.pending.length,0);assert.equal(h.api.__test.playback().queue,null);
});

test('skip aborts earlier lazy item and stale resolution cannot replace current item', async () => {
  const h=harness(), loads=[];
  h.api.speakItems([{id:'case-1'},{id:'case-2'}],{resolveItem:(item,index,{signal})=>
    new Promise(resolve=>loads.push({item,signal,resolve}))});
  await microtasks();h.api.__test.skipSpeech(1);await microtasks();
  assert.equal(loads[0].signal.aborted,true);
  loads[0].resolve({parts:[{t:'古い本文。'}]});
  loads[1].resolve({parts:[{t:'次の本文。'}]});await microtasks();
  assert.equal(h.pending.length,1);assert.equal(h.pending[0].text,'次の本文。');
});

test('pause while loading retains the pause after the body resolves', async () => {
  const h=harness();let resolve;
  h.api.speakItems([{id:'case-1'}],{resolveItem:()=>new Promise(done=>{resolve=done;})});
  await microtasks();h.api.__test.togglePause();
  resolve({parts:[{t:'本文。'}]});await microtasks();
  assert.equal(h.api.__test.playback().paused,true);assert.equal(h.pending.length,0);
  h.api.__test.togglePause();assert.equal(h.pending[0].text,'本文。');
});
