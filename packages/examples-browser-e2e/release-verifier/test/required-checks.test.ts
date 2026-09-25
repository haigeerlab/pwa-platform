// requiredChecksFor never calls validatePlan itself (it only reads plan.topology and plan.identity.appId), so the
// shared-origin fixtures here are built by hand rather than through the real compiler or a fully valid registry —
// they are structurally enough to exercise this one pure function, not claims about a valid plan.
import { readFileSync } from "node:fs";
import type { PwaIdentity, PwaOriginRegistry, PwaPlan } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { requiredChecksFor } from "../required-checks.ts";

const storefront = JSON.parse(readFileSync(new URL("./fixtures/storefront.plan.json", import.meta.url), "utf8")) as PwaPlan;

function registryEntry(identity: PwaIdentity): PwaOriginRegistry["root"] {
  const { appId, scope, serviceWorkerUrl, manifestId, manifestUrl } = identity;
  return { appId, scope, serviceWorkerUrl, manifestId, manifestUrl };
}

const childIdentity: PwaIdentity = { ...storefront.identity, appId: "storefront-m" };

function sharedOriginPlan(identity: PwaIdentity, children: readonly PwaIdentity[]): PwaPlan {
  const registry: PwaOriginRegistry = {
    schemaVersion: 1,
    registryVersion: 1,
    origin: storefront.identity.origin,
    environment: storefront.identity.environment,
    root: registryEntry(storefront.identity),
    children: children.map(registryEntry),
  };
  return { ...storefront, identity, topology: { kind: "shared-origin", registry } };
}

describe("requiredChecksFor", () => {
  it("requires the five checks for a standalone-origin plan", () => {
    expect(requiredChecksFor(storefront)).toEqual([
      "artifacts",
      "response-headers",
      "identity-baseline",
      "release-retention",
      "html-headers",
    ]);
  });

  it("requires the same five checks for a shared-origin root plan", () => {
    const root = sharedOriginPlan(storefront.identity, [childIdentity]);
    expect(requiredChecksFor(root)).toEqual([
      "artifacts",
      "response-headers",
      "identity-baseline",
      "release-retention",
      "html-headers",
    ]);
  });

  it("rejects a shared-origin child plan as unsupported", () => {
    const child = sharedOriginPlan(childIdentity, [childIdentity]);
    expect(() => requiredChecksFor(child)).toThrow(/shared-origin child/);
  });
});
