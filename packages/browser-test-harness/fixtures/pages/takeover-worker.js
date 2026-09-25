// Harness self-test fixture only; it does not represent platform worker behaviour.
// Version v1 of a worker whose v2, deployed at the same URL from fixtures/pages-v2, takes control immediately.
const VERSION = "v1";

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  event.source?.postMessage({ version: VERSION });
});
