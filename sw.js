const CACHE = 'biochem-v14';
const FILES = ["index.html", "app.css", "app.js", "manifest.json", "glava1.html", "glava2.html", "glava3.html", "glava4.html", "glava5.html", "glava6.html", "glava7.html", "glava8.html", "data-ch1.js", "data-ch2.js", "data-ch3.js", "data-ch4.js", "data-ch5.js", "data-ch6.js", "data-ch7.js", "data-ch8.js"];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting())); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('message', e=>{ if(e.data==='flush') caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k)))); });
/* сеть впереди кэша: обновления приходят сразу, офлайн работает из кэша */
self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET') return;
  let url; try { url = new URL(req.url); } catch(_) { return; }
  if(url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(resp=>{
    if(resp && resp.ok){ const copy = resp.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); }
    return resp;
  }).catch(()=> caches.match(req).then(r=> r || caches.match('index.html'))));
});
