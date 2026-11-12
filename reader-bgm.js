/* An independent music channel for the text-to-speech player. */
(function(){
 'use strict';
 const scriptURL=new URL(document.currentScript.src);
 const trackURL=new URL('assets/hear-your-voice.mp3',scriptURL);
 trackURL.search=scriptURL.search;

 function allowMixing(){
  try{if(navigator.audioSession)navigator.audioSession.type='ambient';}catch{}
 }

 function createBgm(onChange){
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  let useBuffer=Boolean(AudioEngine&&/^https?:$/.test(location.protocol));
  let context, gain, buffer, source, loadTrack, audio;
  let state='idle', wanted=false, generation=0, offset=0, startedAt=0, resuming=false;
  let volume=0.22, duck=true, speaking=false;

  function setState(next){
   if(state===next)return;
   state=next;onChange();
  }
  function level(){return volume*(duck&&speaking?0.35:1);}
  function syncVolume(){
   const value=level();
   if(gain&&context.state!=='closed'){
    const now=context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(value,now,0.055);
   }
   if(audio){audio.volume=value;audio.muted=value===0;}
  }
  function disposeSource(){
   if(!source)return;
   offset=(offset+Math.max(0,context.currentTime-startedAt))%buffer.duration;
   const current=source;source=null;
   current.stop();current.disconnect();
  }
  function fail(token){
   if(token!==generation)return;
   wanted=false;++generation;disposeSource();audio?.pause();setState('error');
  }
  function createContext(){
   if(context&&context.state!=='closed')return;
   context=new AudioEngine();
   gain=context.createGain();
   gain.gain.value=level();
   gain.connect(context.destination);
   context.addEventListener('statechange',()=>{
    if(wanted&&source)setState(context.state==='running'?'playing':'interrupted');
   });
  }
  function decodeTrack(){
   if(!loadTrack){
    loadTrack=fetch(trackURL.href).then(response=>{
     if(!response.ok)throw Error('BGM '+response.status);
     return response.arrayBuffer();
    }).then(bytes=>context.decodeAudioData(bytes)).then(decoded=>{
     if(!decoded.duration)throw Error('BGM duration');
     buffer=decoded;return buffer;
    }).catch(error=>{loadTrack=null;throw error;});
   }
   return loadTrack;
  }
  function playBuffer(token){
   createContext();
   // Resume is requested inside the original user interaction, before decoding.
   const ready=context.state==='running'?Promise.resolve():context.resume();
   return Promise.all([ready,decodeTrack()]).then(([,track])=>{
    if(!wanted||token!==generation)return;
    source=context.createBufferSource();
    source.buffer=track;
    source.loop=true;
    source.connect(gain);
    startedAt=context.currentTime;
    source.start(0,offset%track.duration);
    syncVolume();
    setState(context.state==='running'?'playing':'interrupted');
   });
  }
  function media(){
   if(audio)return audio;
   audio=new Audio(trackURL.href);
   audio.id='rp-bgm-media';
   audio.preload='none';
   audio.loop=true;
   audio.hidden=true;
   audio.addEventListener('playing',()=>{if(wanted)setState('playing');});
   audio.addEventListener('pause',()=>{if(wanted&&audio.paused&&state==='playing')setState('interrupted');});
   audio.addEventListener('error',()=>{if(wanted)fail(generation);});
   document.body.append(audio);
   return audio;
  }
  function playMedia(token){
   const element=media();
   syncVolume();
   return Promise.resolve(element.play()).then(()=>{
    if(wanted&&token===generation)setState('playing');
   });
  }
  function pause(){
   wanted=false;++generation;
   disposeSource();audio?.pause();setState('idle');
  }
  function toggle(){
   if(wanted){pause();return;}
   wanted=true;
   const token=++generation;
   allowMixing();setState('loading');
   try{
    if(!useBuffer){playMedia(token).catch(()=>fail(token));return;}
    playBuffer(token).catch(()=>{
     if(!wanted||token!==generation)return;
     useBuffer=false;
     return playMedia(token).catch(()=>fail(token));
    });
   }catch{
    useBuffer=false;
    try{playMedia(token).catch(()=>fail(token));}catch{fail(token);}
   }
  }
  function keepPlaying(){
   if(!wanted||resuming||state==='loading')return;
   const token=generation;
   if(source&&context.state!=='running'){
    allowMixing();
    resuming=true;
    context.resume().catch(()=>{}).finally(()=>{resuming=false;});
   }else if(audio?.paused){
    resuming=true;
    playMedia(token).catch(()=>{}).finally(()=>{resuming=false;});
   }
  }

  function voiceOutput(){
   if(!AudioEngine)return null;
   try{
    allowMixing();createContext();
    if(context.state!=='running')context.resume().catch(()=>{});
    return context;
   }catch{return null;}
  }
  return {
   get state(){return state;},
   get requested(){return wanted;},
   voiceOutput,
   toggle,pause,keepPlaying,
   beforeSpeech(){allowMixing();keepPlaying();},
   configure(percent,lowerWhileReading){volume=percent/100;duck=lowerWhileReading;syncVolume();},
   setSpeaking(active){
    if(speaking===active)return;
    speaking=active;syncVolume();keepPlaying();
   }
  };
 }
 window.GYOSHI_READER_BGM=Object.freeze({createBgm});
})();
