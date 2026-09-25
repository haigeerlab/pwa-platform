import { describe, expect, it } from "vitest";
import { uniqueDeploymentOrigin } from "../unique-origin.ts";

const VALID_UUID = "4e5f259f-c985-4c2d-9c76-853c5b33a107";

describe("uniqueDeploymentOrigin", () => {
  it("builds the unique address for a valid lowercase canonical UUID and a registered project", () => {
    const result = uniqueDeploymentOrigin("pwa-platform-react-demo", VALID_UUID);
    expect(result).toEqual({ ok: true, origin: "https://4e5f259f.pwa-platform-react-demo.pages.dev" });
  });

  it("builds the address for the other registered project too", () => {
    const result = uniqueDeploymentOrigin("pwa-platform-vue-demo", VALID_UUID);
    expect(result).toEqual({ ok: true, origin: "https://4e5f259f.pwa-platform-vue-demo.pages.dev" });
  });

  it("rejects an uppercase UUID", () => {
    const result = uniqueDeploymentOrigin("pwa-platform-react-demo", VALID_UUID.toUpperCase());
    expect(result.ok).toBe(false);
  });

  it("rejects a short deployment id", () => {
    const result = uniqueDeploymentOrigin("pwa-platform-react-demo", "4e5f259f");
    expect(result.ok).toBe(false);
  });

  it("rejects a UUID with an extra suffix", () => {
    const result = uniqueDeploymentOrigin("pwa-platform-react-demo", `${VALID_UUID}-extra`);
    expect(result.ok).toBe(false);
  });

  it("rejects a deployment id containing a path", () => {
    const result = uniqueDeploymentOrigin("pwa-platform-react-demo", `${VALID_UUID}/preview`);
    expect(result.ok).toBe(false);
  });

  it("rejects an unregistered project even with a valid UUID", () => {
    const result = uniqueDeploymentOrigin("some-other-project", VALID_UUID);
    expect(result.ok).toBe(false);
  });

  it("rejects a target key (not a project name) passed in place of the project", () => {
    const result = uniqueDeploymentOrigin("react", VALID_UUID);
    expect(result.ok).toBe(false);
  });
});
