// The shared-origin fixture's child app page script (T7). Registers the child worker at the child's own scope
// through the platform client. Mirrors browser-tests/app/src/main.ts and the root app's main.ts.
import "./shell.css";
import config from "virtual:pwa-config";
import { createPwaClient, type PwaClient, type PwaClientEvent } from "@pwa-platform/client-runtime";

const events: PwaClientEvent[] = [];
const client: PwaClient = createPwaClient({ config });
client.subscribe((event) => events.push(event));

// Reflect.set keeps these off the Window type while staying reachable from page.evaluate.
Reflect.set(window, "__pwaClient", client);
Reflect.set(window, "__pwaEvents", events);
Reflect.set(window, "__pwaConfig", config);
