// Harness self-test fixture only; it does not represent platform worker behaviour.
// Version v2, deployed at the same URL as fixtures/pages/takeover-worker.js: it skips waiting and claims clients.
const VERSION = "v2";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  event.source?.postMessage({ version: VERSION });
});
