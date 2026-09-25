// The fixture application's page script.
//
// It stands in for what a real app writes, and deliberately takes the path this module is meant to provide: the
// config arrives through the virtual module the plugin serves, not through a `define` replacement. If the virtual
// module were broken, this import would fail at build time and every browser test would go with it.
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
