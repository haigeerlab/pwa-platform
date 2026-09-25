// Harness self-test fixture only; it does not represent platform worker behaviour.
// No fetch listener: requests from controlled pages go straight to the network.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
