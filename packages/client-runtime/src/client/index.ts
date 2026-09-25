// The page-side entry: the facade, its options and the lifecycle events, plus the config contract it shares with
// the build-time entry so both ends validate a config by the same rules.
export { CLIENT_EVENT_TYPES } from "./events.js";
export type { PwaClientEvent, PwaClientEventMetadata, PwaClientEventType } from "./events.js";
export { createPwaClient } from "./facade.js";
export type { PwaClient, PwaClientOptions, PwaUpdateCheckResult } from "./facade.js";
export { validateClientConfig } from "../shared/config.js";
export type { PwaClientConfig, PwaClientPath } from "../shared/config.js";
