// Minimal classic worker for @pwa-platform/push's browser tests (tasks/push-module/plan.md T7 part B). This suite
// tests the PAGE entry (getPushState/subscribePush/unsubscribePush) against a real registration; it does not need a
// push or notificationclick listener (that is the platform worker's job, covered by sw-runtime's push.spec.ts). It
// only needs to install, activate and control clients promptly so tests do not wait on the update lifecycle.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
