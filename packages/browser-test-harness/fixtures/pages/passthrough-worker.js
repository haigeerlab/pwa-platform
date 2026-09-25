// Harness self-test fixture only; it does not represent platform worker behaviour.
// Every fetch goes through this worker, so Playwright reports fromServiceWorker() as true.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
