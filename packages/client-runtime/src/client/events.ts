// Lifecycle events the page can observe. The worker side of the platform sends no messages, so the three events
// whose trigger points live inside the service worker are out of scope for v1 (ADR-0013).
import type { JsonPrimitive, PwaEventEnvelope } from "@pwa-platform/contracts";

/** The subset of contracts' lifecycle event types this package emits, in declaration order. */
export const CLIENT_EVENT_TYPES = [
  "registered",
  "install-eligible",
  "installed",
  "update-waiting",
  "update-applied",
  "served-from-cache",
] as const;

export type PwaClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export type PwaClientEvent = PwaEventEnvelope<PwaClientEventType>;

/** Flat, non-sensitive metadata: never tokens, endpoints, user identifiers or response bodies. */
export type PwaClientEventMetadata = { readonly [key: string]: JsonPrimitive };

/** Builds an envelope contracts' `readLifecycleEvent` accepts. */
export function clientEvent(
  type: PwaClientEventType,
  appId: string,
  metadata: PwaClientEventMetadata,
): PwaClientEvent {
  return { version: 1, type, timestamp: new Date().toISOString(), appId, metadata };
}
