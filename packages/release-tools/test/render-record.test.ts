import { describe, expect, it } from "vitest";
import { renderRecord, type PwaGateRecordMeta, type PwaGateRecordRoundRow, type PwaGateRecordRow } from "../src/render-record.js";
import type { PwaGateVerdict } from "../src/gate-verdict.js";

const RESOLVED_COMMIT = "a".repeat(40);

const meta: PwaGateRecordMeta = {
  recordId: "2026-09-22-01",
  requestedCommit: "main",
  resolvedCommit: RESOLVED_COMMIT,
  requiredMajors: [22, 24],
  substituteReason: "GitHub 自 2026-09-18 起不可用",
  availabilityCheck: {
    command: "gh auth status",
    output: "error: not logged in\nplease run gh auth login",
    exitCode: 1,
    utc: "2026-09-22T00:00:00.000Z",
  },
  signer: "Alice",
  operatingSystem: "macOS 15.6",
  chrome: "130.0.6723.116",
  pnpm: "11.18.0",
  operator: "Bob",
  startUtc: "2026-09-22T00:01:00.000Z",
  endUtc: "2026-09-22T00:30:00.000Z",
  toolCommit: "b".repeat(40),
  toolDirty: false,
  toolBuild: { commit: "b".repeat(40), dirty: false },
};

const rows: readonly PwaGateRecordRow[] = [
  { nodeVersion: "22.14.0", command: "pnpm install --frozen-lockfile", exitCode: 0, logSha256: "a".repeat(64), logPath: "/tmp/out/22/install.log" },
  { nodeVersion: "24.6.0", command: "pnpm install --frozen-lockfile", exitCode: 0, logSha256: "b".repeat(64), logPath: "/tmp/out/24/install.log" },
];

const roundRows: readonly PwaGateRecordRoundRow[] = [
  { declaredMajor: 22, observedNodeVersion: "v22.14.0", observedCommit: RESOLVED_COMMIT, pnpmVersion: "11.18.0", chrome: "130.0.6723.116", pathHead: "/nodes/22/bin", pathNode: "/nodes/22/bin/node", pnpmRuntime: "/nodes/22/bin/node", worktreeRemoved: true },
  { declaredMajor: 24, observedNodeVersion: "v24.6.0", observedCommit: RESOLVED_COMMIT, pnpmVersion: "11.18.0", chrome: "130.0.6723.116", pathHead: "/nodes/24/bin", pathNode: "/nodes/24/bin/node", pnpmRuntime: "/nodes/24/bin/node", worktreeRemoved: true },
];

const passingVerdict: PwaGateVerdict = { pass: true, failures: [] };
const failingVerdict: PwaGateVerdict = {
  pass: false,
  failures: [{ kind: "command-failed", node: 22, command: "pnpm lint", exitCode: 1 }],
};

describe("renderRecord", () => {
  it("titles the record with the record id", () => {
    const markdown = renderRecord(meta, rows, roundRows, passingVerdict);
    expect(markdown).toContain("# 本地门禁记录：2026-09-22-01");
  });

  it("includes every header field from the record template", () => {
    const markdown = renderRecord(meta, rows, roundRows, passingVerdict);
    expect(markdown).toContain(meta.resolvedCommit);
    expect(markdown).toContain(meta.requestedCommit);
    expect(markdown).toContain(meta.substituteReason);
    expect(markdown).toContain(meta.availabilityCheck.command);
    expect(markdown).toContain(meta.availabilityCheck.output);
    expect(markdown).toContain(meta.availabilityCheck.utc);
    expect(markdown).toContain(String(meta.availabilityCheck.exitCode));
    expect(markdown).toContain(meta.signer);
    expect(markdown).toContain(meta.operatingSystem);
    expect(markdown).toContain(meta.chrome);
    expect(markdown).toContain(meta.pnpm);
    expect(markdown).toContain(meta.operator);
    expect(markdown).toContain(meta.startUtc);
    expect(markdown).toContain(meta.endUtc);
    expect(markdown).toContain(meta.toolCommit);
    for (const major of meta.requiredMajors) expect(markdown).toContain(String(major));
  });

  it("renders one execution-result row per command with node, exit code, hash and log path", () => {
    const markdown = renderRecord(meta, rows, roundRows, passingVerdict);
    for (const row of rows) {
      expect(markdown).toContain(row.nodeVersion);
      expect(markdown).toContain(row.command);
      expect(markdown).toContain(String(row.exitCode));
      expect(markdown).toContain(row.logSha256);
      expect(markdown).toContain(row.logPath);
    }
  });

  it("renders one per-round row with declared/observed Node, observed commit, pnpm, Chrome, PATH head, the node on PATH and pnpm's own runtime", () => {
    const markdown = renderRecord(meta, rows, roundRows, passingVerdict);
    for (const round of roundRows) {
      expect(markdown).toContain(String(round.declaredMajor));
      expect(markdown).toContain(round.observedNodeVersion);
      expect(markdown).toContain(round.pathHead);
      expect(markdown).toContain(round.pathNode);
      expect(markdown).toContain(round.pnpmRuntime);
    }
  });

  it("writes the conclusion table with the fixed ADR-0031 evidence line and reflects a passing verdict", () => {
    const markdown = renderRecord(meta, rows, roundRows, passingVerdict);
    expect(markdown).toContain("本地替代（ADR-0031），不是 CI 运行");
    expect(markdown).toContain("通过");
  });

  it("reflects a failing verdict as 未通过 and lists it under 失败项", () => {
    const markdown = renderRecord(meta, rows, roundRows, failingVerdict);
    expect(markdown).toContain("未通过");
    expect(markdown).toContain("## 失败项");
    expect(markdown).toContain("pnpm lint");
  });

  it("says 无 under 失败项 when the verdict passed", () => {
    const markdown = renderRecord(meta, rows, roundRows, passingVerdict);
    const section = markdown.split("## 失败项")[1]?.split("## 结论")[0] ?? "";
    expect(section).toContain("无");
  });

  it("marks a dirty tool working tree in the header", () => {
    const markdown = renderRecord({ ...meta, toolDirty: true }, rows, roundRows, passingVerdict);
    expect(markdown).toContain("未提交改动");
  });

  // N1: a missing build-info.json must be visible in the record itself, not just in the verdict's failure list.
  it("marks a missing tool build-info snapshot in the header", () => {
    const markdown = renderRecord({ ...meta, toolBuild: null }, rows, roundRows, failingVerdict);
    expect(markdown).toContain("缺失");
  });

  it("shows the tool's build-time commit in the header when build-info is present", () => {
    const markdown = renderRecord(meta, rows, roundRows, passingVerdict);
    expect(markdown).toContain(meta.toolBuild!.commit);
  });

  it("escapes a pipe character inside a table cell value", () => {
    const withPipe: PwaGateRecordMeta = { ...meta, substituteReason: "GitHub | Actions 不可用" };
    const markdown = renderRecord(withPipe, rows, roundRows, passingVerdict);
    expect(markdown).toContain("GitHub \\| Actions 不可用");
  });

  it("turns a newline inside a table cell value into <br> instead of breaking the row", () => {
    const withNewline: PwaGateRecordMeta = { ...meta, substituteReason: "line one\nline two" };
    const markdown = renderRecord(withNewline, rows, roundRows, passingVerdict);
    expect(markdown).toContain("line one<br>line two");
    expect(markdown).not.toContain("line one\nline two");
  });

  it("fences the availability check output with a fence longer than any backtick run it contains", () => {
    const withFence: PwaGateRecordMeta = { ...meta, availabilityCheck: { ...meta.availabilityCheck, output: "before\n```\nnested fence\n```\nafter" } };
    const markdown = renderRecord(withFence, rows, roundRows, passingVerdict);
    expect(markdown).toContain("````\nbefore\n```\nnested fence\n```\nafter\n````");
  });
});
