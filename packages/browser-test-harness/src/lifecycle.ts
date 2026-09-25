import { readLifecycleEvent, type PwaLifecycleEventType } from "@pwa-platform/contracts";

/**
 * Validates lifecycle event values collected by a test with contracts' `readLifecycleEvent` and asserts the
 * order of the known event types. Invalid events fail; unknown event types are ignored, as consumers must.
 * Failure messages carry diagnostic codes and paths only, never the collected values.
 */
export function expectLifecycleSequence(values: readonly unknown[], types: readonly PwaLifecycleEventType[]): void {
  const received: PwaLifecycleEventType[] = [];
  const invalid: string[] = [];
  values.forEach((value, index) => {
    const result = readLifecycleEvent(value);
    if (result.kind === "invalid") {
      const findings = result.diagnostics.map(({ code, path }) => `${code} at ${path === "" ? "(root)" : path}`);
      invalid.push(`event ${index}: ${findings.join(", ")}`);
    } else if (result.kind === "known") {
      received.push(result.event.type);
    }
  });
  if (invalid.length > 0) throw new Error(`Invalid lifecycle events: ${invalid.join("; ")}`);
  if (received.length !== types.length || received.some((type, index) => type !== types[index])) {
    throw new Error(`Expected lifecycle events [${types.join(", ")}] but received [${received.join(", ")}]`);
  }
}
