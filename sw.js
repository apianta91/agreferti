const CACHE_NAME = "ag-referti-v4";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./manifest.webmanifest", "./logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) =>
      c.addAll(ASSETS).catch(()=> c.addAll(ASSETS.filter(x=>x!=="./logo.png")))
    )
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});