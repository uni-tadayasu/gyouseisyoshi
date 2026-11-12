/* オフライン動作。キャッシュはこの版のアプリに限定します。 */
const CACHE='gyosei-master-shubiki-20261112-design-r1';
const APP=['./','./index.html','./style.css','./roppo.css','./atelier.css','./roppo.js','./app.js','./questions.js','./advanced_questions.js','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gyosei-master-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith(caches.match(event.request).then(cached=>{
  const update=fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});}
    return response;
  }).catch(()=>cached||Response.error());
  return cached||update;
 }));
});
