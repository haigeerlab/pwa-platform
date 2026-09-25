// A second, unrelated classic worker registered at scope /other/ (tasks/push-module/plan.md T7 part B, "a
// registration at a different scope"). Its only job is to exist at a sibling scope so a test can prove
// getPushState({ scope: "/app/" }) does not mistake it for a registration at /app/ (exact-scope comparison,
// spec/push-module.md "设计 / 3"). Same minimal shape as ../app/sw.js.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
