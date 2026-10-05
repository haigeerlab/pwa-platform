import type { PwaPlatformWorkerConfig } from "../shared/config.js";
import { createPathMatcher } from "../shared/path-match.js";

/** ADR-0052: derive the target from a controlled window, never from a page-supplied URL or a cache. */
export function createOfflineDocumentProbe(scope: ServiceWorkerGlobalScope, config: Pick<PwaPlatformWorkerConfig, "scope" | "pathRules" | "offlineFallback">): (clientId: string) => Promise<boolean> {
  const matcher = createPathMatcher(config.pathRules);
  const pending = new Set<string>();
  const cooling = new Map<string, number>();
  return async (clientId) => {
    const deadline = cooling.get(clientId);
    if (pending.has(clientId) || (deadline !== undefined && performance.now() < deadline) || !config.offlineFallback.enabled) return false;
    pending.add(clientId);
    try {
      const clients = await scope.clients.matchAll({ type: "window" });
      const client = clients.find((candidate) => candidate.id === clientId);
      if (client === undefined || !URL.canParse(client.url)) return false;
      const url = new URL(client.url);
      const action = matcher.match(url.pathname)?.action;
      if (url.origin !== scope.location.origin || !url.pathname.startsWith(config.scope) ||
        url.username !== "" || url.password !== "" || action === undefined || action === "deny" || action === "exclude" ||
        url.pathname === scope.location.pathname || url.pathname === config.offlineFallback.path) return false;
      url.hash = "";
      const expires = performance.now() + 10_000;
      cooling.set(clientId, expires);
      // Delayed cleanup is housekeeping, not the cooldown clock; an old task cannot clear a newer deadline.
      setTimeout(() => { if (cooling.get(clientId) === expires) cooling.delete(clientId); }, 10_000);
      const abort = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => { abort.abort(); resolve(false); }, 3000);
      });
      const network = (async () => {
        const response = await scope.fetch(url.href, {
          method: "GET", mode: "same-origin", credentials: "same-origin", redirect: "error", cache: "no-store",
          headers: { Accept: "text/html" }, signal: abort.signal,
        });
        if (response.type !== "basic" || response.status !== 200 || response.redirected || response.url !== url.href ||
          response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "text/html" || response.body === null) {
          await response.body?.cancel().catch(() => undefined);
          return false;
        }
        const reader = response.body.getReader();
        try {
          const chunk = await reader.read();
          return !chunk.done && chunk.value.byteLength > 0;
        } finally {
          void reader.cancel().catch(() => undefined);
        }
      })().catch(() => false);
      try {
        return await Promise.race([network, timeout]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        abort.abort();
      }
    } catch {
      return false;
    } finally {
      pending.delete(clientId);
    }
  };
}
