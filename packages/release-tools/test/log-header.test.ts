import { describe, expect, it } from "vitest";
import { logHeader } from "../src/log-header.js";

const fields = {
  commit: "abc123",
  node: "v22.14.0",
  pnpm: "11.18.0",
  utc: "2026-09-22T00:00:00.000Z",
  chrome: "130.0.6723.116",
  command: "pnpm lint",
};

describe("logHeader", () => {
  it("writes exactly six newline-terminated lines in order", () => {
    expect(logHeader(fields)).toBe(
      `# commit abc123\n` + `# node v22.14.0\n` + `# pnpm 11.18.0\n` + `# utc 2026-09-22T00:00:00.000Z\n` + `# chrome 130.0.6723.116\n` + `# command pnpm lint\n`,
    );
  });

  it("rejects a field value containing a newline", () => {
    expect(() => logHeader({ ...fields, command: "pnpm lint\npnpm build" })).toThrow();
  });
});
