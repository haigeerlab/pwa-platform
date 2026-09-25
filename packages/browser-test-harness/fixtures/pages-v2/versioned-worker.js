// Harness self-test fixture only; it does not represent platform worker behaviour.
// Version v2, deployed over fixtures/pages. Never calls skipWaiting, so it waits behind v1.
const VERSION = "v2";

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  event.source?.postMessage({ version: VERSION });
});
