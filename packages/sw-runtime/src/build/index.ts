// Build-time entry (Node): creates the worker configs from a validated PwaPlan and injects them after bundling.
// Also re-exports the runtime path matcher (shared/path-match.ts) for hosts that need to classify a path against a
// plan's path rules outside of a worker — e.g. @pwa-platform/nuxt's build-time check for prerendered HTML that
// falls under a denied path rule (T6). path-match.ts itself imports nothing, so this entry still imports only
// @pwa-platform/contracts.
export { createPlatformWorkerConfig, createRecoveryWorkerConfig } from "./config.js";
export { injectWorkerConfig, WORKER_CONFIG_INJECTION_POINT } from "./inject.js";
export { createPathMatcher } from "../shared/path-match.js";
export type {
  PwaPlatformWorkerConfig,
  PwaRecoveryWorkerConfig,
  PwaWorkerBaselineDenial,
  PwaWorkerConfig,
  PwaWorkerPath,
  PwaWorkerPathRule,
  PwaWorkerPathRuleAction,
} from "../shared/config.js";
export type { PwaPathMatcher } from "../shared/path-match.js";
