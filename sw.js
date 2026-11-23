// Pocket AI service worker
// 1. Keeps the app available offline.
// 2. Adds the "cross-origin isolation" headers GitHub Pages can't set, so the
//    AI engine can use all of the phone's CPU cores (much faster replies).
// The AI model itself is stored separately by the engine (in the browser's
// private file storage).
const CACHE = "pocket-ai-v4";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pocket-ai-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isolate(res) {
  if (!res || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Model downloads are huge and the engine stores them itself: don't touch them.
  if (/huggingface\.co$|hf\.co$|xethub|cdn-lfs/.test(url.hostname)) return;

  // The app's own files: network first (to pick up updates), cache when offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return isolate(res);
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then((r) => r || caches.match("./index.html"))
            .then(isolate))
    );
    return;
  }

  // Engine code from the CDN: cache first, so it works with no internet.
  if (/jsdelivr\.net$/.test(url.hostname)) {
    e.respondWith(
      caches.match(req.url).then((hit) => hit || fetch(req.url, { mode: "cors" }).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.url, copy)); }
        return res;
      }))
    );
  }
});
