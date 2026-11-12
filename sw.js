/* Offline files for this release, scoped to its GitHub Pages directory. */
const release='20261112-r7a';
const scope=new URL(self.registration.scope);
const prefix='shubiki-bunko:'+scope.pathname+':';
const cacheName=prefix+release;
const index=new URL('index.html',scope).href;
const voiceDirectory=new URL('assets/voice/',scope).pathname;
const music=new URL('assets/hear-your-voice.mp3?v='+release,scope).href;
const ids=[
 '321CONSTITUTION','129AC0000000089','140AC0000000045','132AC0000000048','408AC0000000109',
 '323AC0000000131','405AC0000000088','426AC0000000068','337AC0000000139','322AC0000000125',
 '322AC0000000067','326AC1000000004','417AC0000000086','415AC0000000057','411AC0000000042','index'
];
const files=new Set([
 ...['style.css','roppo.css','atelier.css','reading.css','study-guide.css','public.css','edition.css','questions.js','advanced_questions.js',
     'app.js','roppo.js','study-cards.js','glossary-data.js','compound-data.js','study-guide.js','law-edition.js','law-voice.js','reader-bgm.js','local-voice.js','assets/pako_inflate.min.js',...ids.map(id=>'laws/'+id+'.js')]
     .map(path=>new URL(path+'?v='+release,scope).href),
 music,
 ...['manifest.webmanifest','assets/icon-192.png','assets/icon-512.png','assets/library-hero.webp','learn.html','laws.html','dictionary.html'].map(path=>new URL(path,scope).href)
]);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(cacheName);
 await cache.addAll([index,...files].map(url=>new Request(url,{cache:'reload'})));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(key=>key.startsWith(prefix)&&key!==cacheName).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));

async function musicRange(response,range){
 const match=/^bytes=(\d*)-(\d*)$/i.exec(range.trim());
 if(!match||(!match[1]&&!match[2]))return response;
 const file=await response.blob();
 const size=file.size;
 const suffix=match[1]==='';
 const start=suffix?Math.max(0,size-Number(match[2])):Number(match[1]);
 const end=suffix||!match[2]?size-1:Math.min(size-1,Number(match[2]));
 const headers={'Accept-Ranges':'bytes','Content-Type':'audio/mpeg'};
 if(start>=size||end<start){
  headers['Content-Range']='bytes */'+size;
  return new Response(null,{status:416,headers});
 }
 headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 headers['Content-Length']=String(end-start+1);
 return new Response(file.slice(start,end+1),{status:206,headers});
}
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==scope.origin)return;
 if(request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===new URL(index).pathname)){
  event.respondWith((async()=>{
   try{
    const online=await fetch(request);
    if(online.ok)return online;
   }catch{}
   return await (await caches.open(cacheName)).match(index)||Response.error();
  })());
 }else if(url.pathname.startsWith(voiceDirectory)){
  event.respondWith((async()=>{
   const cache=await caches.open(cacheName);
   const cached=await cache.match(request);
   if(cached)return cached;
   const response=await fetch(request);
   if(response.ok)try{await cache.put(request,response.clone());}catch{}
   return response;
  })());
 }else if(files.has(url.href)){
  event.respondWith((async()=>{
   const cache=await caches.open(cacheName);
   const cached=await cache.match(request);
   if(!cached)return fetch(request);
   const range=request.headers.get('Range');
   return url.href===music&&range?musicRange(cached,range):cached;
  })());
 }
});
