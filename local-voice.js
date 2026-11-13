/* Local Japanese synthesis. The engine and dictionary load only when needed. */
(function(){
 'use strict';
 const base=new URL('assets/voice/',document.currentScript.src);
 const available=/^https?:$/.test(location.protocol)&&typeof Worker==='function'&&typeof WebAssembly==='object'&&Boolean(window.AudioContext||window.webkitAudioContext);
 let engine;
 function load(){
  if(!engine)engine=import(new URL('browser.js',base).href).then(async api=>{
   await api.configure({dicUrl:new URL('dic/',base).href,voiceUrl:new URL('mei_normal.htsvoice',base).href});
   return api;
  }).catch(error=>{engine=null;throw error;});
  return engine;
 }
 async function synthesize(text,rate){
  const api=await load();
  const wave=await api.synthesizeAsync(text,{speed:rate});
  if(!wave.pcm?.length||!wave.sampleRate)throw Error('音声を生成できませんでした');
  return wave;
 }
 function player(context,wave,volume,onEnd){
  const buffer=context.createBuffer(1,wave.pcm.length,wave.sampleRate);
  const channel=buffer.getChannelData(0);
  for(let i=0;i<channel.length;i++)channel[i]=Math.max(-1,Math.min(1,wave.pcm[i]/32768));
  const gain=context.createGain();
  gain.gain.value=volume;
  gain.connect(context.destination);
  let source=null,offset=0,startedAt=0,closed=false;
  function pause(){
   if(!source)return;
   offset=Math.min(buffer.duration,offset+Math.max(0,context.currentTime-startedAt));
   const active=source;source=null;active.onended=null;active.stop();active.disconnect();
  }
  function stop(){
   if(closed)return;
   pause();closed=true;gain.disconnect();
  }
  function play(){
   if(closed||source)return;
   if(offset>=buffer.duration){stop();onEnd();return;}
   source=context.createBufferSource();
   source.buffer=buffer;source.connect(gain);
   const active=source;
   active.onended=()=>{
    if(source!==active)return;
    source=null;active.disconnect();stop();onEnd();
   };
   startedAt=context.currentTime;
   active.start(0,offset);
  }
  return {play,pause,stop,volume:value=>gain.gain.setTargetAtTime(value,context.currentTime,.035)};
 }
 window.GYOSHI_LOCAL_VOICE=Object.freeze({available,synthesize,player});
})();
