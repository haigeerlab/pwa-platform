// Harness self-test fixture only; it does not represent platform worker behaviour.
// Version v1. Never calls skipWaiting, so a deployed v2 waits while v1 controls open pages.
const VERSION = "v1";

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  event.source?.postMessage({ version: VERSION });
});
