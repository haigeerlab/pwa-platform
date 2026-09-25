// Harness self-test fixture only; it does not represent platform worker behaviour.
// On activation it deletes every cache whose name starts with the `prefix` query parameter, then claims
// clients, so a page controlled by this worker observes the finished cleanup.
const prefix = new URL(self.location.href).searchParams.get("prefix") ?? "";

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (prefix !== "") {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name.startsWith(prefix)).map((name) => caches.delete(name)));
      }
      await self.clients.claim();
    })(),
  );
});
