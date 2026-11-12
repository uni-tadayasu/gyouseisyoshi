/* The music track has its own player, independent of the speech queue. */
(function(){
 'use strict';
 const scriptURL=new URL(document.currentScript.src);
 const trackURL=new URL('assets/hear-your-voice.mp3',scriptURL);
 trackURL.search=scriptURL.search;

 function createBgm(onChange){
  let audio=null,context=null,gain=null;
  let state='idle',generation=0,volume=0.22,duck=true,speaking=false;

  function setState(next){
   if(state===next)return;
   state=next;onChange();
  }

  function effectiveVolume(){return volume*(duck&&speaking?0.35:1);}

  function syncVolume(){
   if(!audio)return;
   const value=effectiveVolume();
   if(gain){
    const now=context.currentTime;
    gain.gain.cancelScheduledValues(now);
    if(audio.paused)gain.gain.setValueAtTime(value,now);
    else gain.gain.setTargetAtTime(value,now,0.06);
   }else{
    audio.volume=value;
    audio.muted=value===0;
   }
  }

  function makeAudio(){
   const element=new Audio(trackURL.href);
   element.id='rp-bgm-media';
   element.preload='none';
   element.loop=true;
   element.hidden=true;
   element.addEventListener('error',()=>{
    if(element===audio&&state!=='idle')fail(generation);
   });
   element.addEventListener('pause',()=>{
    if(element===audio&&element.paused&&state==='playing')setState('idle');
   });
   document.body.append(element);
   return element;
  }

  function prepareAudio(){
   if(audio)return;
   audio=makeAudio();
   const AudioEngine=window.AudioContext||window.webkitAudioContext;
   // A gain node also allows BGM volume adjustment on mobile WebKit.
   if(!AudioEngine||!/^https?:$/.test(location.protocol))return;
   try{
    context=new AudioEngine();
    const level=context.createGain();
    level.gain.value=effectiveVolume();
    level.connect(context.destination);
    context.createMediaElementSource(audio).connect(level);
    gain=level;
   }catch{
    if(context)void context.close().catch(()=>{});
    context=null;
    audio.remove();
    audio=makeAudio();
   }
  }

  function pause(){
   ++generation;
   setState('idle');
   audio?.pause();
  }

  function fail(token){
   if(token!==generation)return;
   ++generation;
   setState('error');
   audio?.pause();
  }

  function toggle(){
   if(state==='playing'||state==='loading'){pause();return;}
   const token=++generation;
   try{
    prepareAudio();
    syncVolume();
    setState('loading');
    // Both calls run directly in the click handler to retain user activation.
    const ready=context&&context.state!=='running'?context.resume():undefined;
    const started=audio.play();
    Promise.all([ready,started]).then(()=>{
     if(token===generation)setState('playing');
    },()=>fail(token));
   }catch{fail(token);}
  }

  return {
   get state(){return state;},
   toggle,pause,
   configure(percent,lowerWhileReading){volume=percent/100;duck=lowerWhileReading;syncVolume();},
   setSpeaking(active){
    if(speaking===active)return;
    speaking=active;
    syncVolume();
   }
  };
 }
 window.GYOSHI_READER_BGM=Object.freeze({createBgm});
})();
