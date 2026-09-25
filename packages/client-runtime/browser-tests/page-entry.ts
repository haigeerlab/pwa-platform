// Bundled into the fixture site as the page script. It stands in for what a real application (or a framework
// adapter) writes: create the facade from the build-time config, collect the events, expose both to the test.
import { createPwaClient, type PwaClient, type PwaClientEvent } from "../src/client/index.js";
import type { PwaClientConfig } from "../src/shared/config.js";

/** Replaced by global-setup through vite's `define`, the way vite-adapter will hand the config to the page. */
declare const __PWA_CLIENT_CONFIG__: PwaClientConfig;

const events: PwaClientEvent[] = [];

/**
 * `?updateCheck=<intervalMs>` turns on the automatic check for the U4 browser tests, so the same bundle serves
 * both the plain facade and the one under test for the automatic check, without a second entry for global-setup
 * to bundle.
 */
const updateCheckParam = new URLSearchParams(location.search).get("updateCheck");

const client: PwaClient = createPwaClient({
  config: __PWA_CLIENT_CONFIG__,
  ...(updateCheckParam === null ? {} : { updateCheck: { intervalMs: Number(updateCheckParam) } }),
});
client.subscribe((event) => events.push(event));

// Reflect.set keeps these off the Window type while staying reachable from page.evaluate.
Reflect.set(window, "__pwaClient", client);
Reflect.set(window, "__pwaEvents", events);
