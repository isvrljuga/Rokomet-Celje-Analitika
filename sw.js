const CACHE='celje-rokomet-v13-email';
const PREFIX='celje-rokomet-';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./app.js','./live.js','./firebase-config.js','./cloud.js','./icon.svg','./manifest.webmanifest'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}return r}).catch(()=>caches.match(e.request).then(r=>r||Response.error())))});
