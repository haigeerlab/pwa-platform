import { describe, expect, it } from "vitest";
import { buildHistoryExport, type PwaHistoryExportDeploymentInput } from "../history-export.ts";
import { HISTORY_FORMAT, validateHistoryFile } from "../history-file.ts";

const target = "react";
const slot = "main";
const project = "pwa-platform-react-demo";
const origin = "https://pwa-platform-react-demo.pages.dev";
const exportedAt = "2026-09-22T00:00:00.000Z";
const canonicalDeploymentId = "8589bf50-b6d2-493f-9551-ea4b7dd8adec";
const olderDeploymentId = "18824a5c-9103-41a5-953b-0efaedf4360a";
const digest = "a".repeat(64);

function validIndexBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    format: 1,
    target,
    slot,
    project,
    origin,
    deploymentId: canonicalDeploymentId,
    bundleSha256: digest,
    recordedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function baseArgs(deployments: readonly PwaHistoryExportDeploymentInput[]) {
  return { target, slot, project, origin, exportedAt, canonicalDeploymentId, deployments };
}

describe("buildHistoryExport", () => {
  it("round-trips through validateHistoryFile", () => {
    const result = buildHistoryExport(
      baseArgs([{ id: canonicalDeploymentId, createdOn: "2026-09-20T00:00:00.000Z", index: { status: 200, body: validIndexBody() } }]),
    );
    const validation = validateHistoryFile(result, { target, slot, project });
    expect(validation.ok).toBe(true);
  });

  it("resolves a 200 with a valid index body to the digest", () => {
    const result = buildHistoryExport(
      baseArgs([{ id: canonicalDeploymentId, createdOn: "2026-09-20T00:00:00.000Z", index: { status: 200, body: validIndexBody() } }]),
    );
    expect(result.deployments[0]?.bundleSha256).toBe(digest);
  });

  it("resolves a 404 to null", () => {
    const result = buildHistoryExport(
      baseArgs([{ id: canonicalDeploymentId, createdOn: "2026-09-20T00:00:00.000Z", index: { status: 404, body: undefined } }]),
    );
    expect(result.deployments[0]?.bundleSha256).toBeNull();
  });

  it("resolves a 200 with a deploymentId mismatch to null", () => {
    const result = buildHistoryExport(
      baseArgs([
        { id: canonicalDeploymentId, createdOn: "2026-09-20T00:00:00.000Z", index: { status: 200, body: validIndexBody({ deploymentId: olderDeploymentId }) } },
      ]),
    );
    expect(result.deployments[0]?.bundleSha256).toBeNull();
  });

  it("resolves a 200 with the wrong origin to null", () => {
    const result = buildHistoryExport(
      baseArgs([
        { id: canonicalDeploymentId, createdOn: "2026-09-20T00:00:00.000Z", index: { status: 200, body: validIndexBody({ origin: "https://someone-else.pages.dev" }) } },
      ]),
    );
    expect(result.deployments[0]?.bundleSha256).toBeNull();
  });

  it("resolves a 200 with a bad digest to null", () => {
    const result = buildHistoryExport(
      baseArgs([
        { id: canonicalDeploymentId, createdOn: "2026-09-20T00:00:00.000Z", index: { status: 200, body: validIndexBody({ bundleSha256: "not-hex" }) } },
      ]),
    );
    expect(result.deployments[0]?.bundleSha256).toBeNull();
  });

  it("resolves a 200 with a missing recordedAt to null", () => {
    const result = buildHistoryExport(
      baseArgs([
        { id: canonicalDeploymentId, createdOn: "2026-09-20T00:00:00.000Z", index: { status: 200, body: validIndexBody({ recordedAt: undefined }) } },
      ]),
    );
    expect(result.deployments[0]?.bundleSha256).toBeNull();
  });

  it("throws on a 500 (or any other non-200/404 status)", () => {
    expect(() =>
      buildHistoryExport(
        baseArgs([{ id: canonicalDeploymentId, createdOn: "2026-09-20T00:00:00.000Z", index: { status: 500, body: undefined } }]),
      ),
    ).toThrow(/HTTP 500/);
  });

  it("throws when the canonical deployment is absent from the exported deployments", () => {
    expect(() =>
      buildHistoryExport(
        baseArgs([{ id: olderDeploymentId, createdOn: "2026-08-01T00:00:00.000Z", index: { status: 404, body: undefined } }]),
      ),
    ).toThrow(/Canonical deployment is absent/);
  });

  it("produces exactly the format's fields, with no extra fields that could carry secrets", () => {
    const result = buildHistoryExport(
      baseArgs([
        { id: canonicalDeploymentId, createdOn: "2026-09-20T00:00:00.000Z", index: { status: 200, body: validIndexBody() } },
        { id: olderDeploymentId, createdOn: "2026-08-01T00:00:00.000Z", index: { status: 404, body: undefined } },
      ]),
    );
    expect(Object.keys(result).sort()).toEqual(
      ["canonicalDeploymentId", "deployments", "exportedAt", "format", "project", "slot", "target"].sort(),
    );
    expect(result.format).toBe(HISTORY_FORMAT);
    for (const deployment of result.deployments) {
      expect(Object.keys(deployment).sort()).toEqual(["bundleSha256", "createdOn", "id"].sort());
    }
  });
});
