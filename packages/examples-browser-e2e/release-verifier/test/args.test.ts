import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../args.ts";

describe("parseCliArgs", () => {
  it("accepts the four known flags in --flag=value form", () => {
    const result = parseCliArgs(["--target=react", "--slot=main", "--history=/tmp/h.json", "--out=/tmp/out"]);
    expect(result).toEqual({
      ok: true,
      value: { target: "react", slot: "main", history: "/tmp/h.json", out: "/tmp/out" },
    });
  });

  it("ignores a single leading -- (pnpm forwards it literally; npm does not)", () => {
    const result = parseCliArgs(["--", "--target=react", "--slot=main", "--history=/tmp/h.json", "--out=/tmp/out"]);
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown flag", () => {
    const result = parseCliArgs(["--target=react", "--slot=main", "--history=/tmp/h.json", "--out=/tmp/out", "--origin=https://evil.example"]);
    expect(result).toEqual({ ok: false, reason: "Unsupported argument: --origin=https://evil.example" });
  });

  it("never accepts an origin flag even when every other flag is present", () => {
    const result = parseCliArgs(["--origin=https://evil.example"]);
    expect(result.ok).toBe(false);
  });

  it("rejects a missing required flag", () => {
    const result = parseCliArgs(["--target=react", "--slot=main"]);
    expect(result).toEqual({ ok: false, reason: "Missing required argument(s): --history, --out" });
  });

  it("rejects a flag with no value", () => {
    const result = parseCliArgs(["--target=", "--slot=main", "--history=/tmp/h.json", "--out=/tmp/out"]);
    expect(result.ok).toBe(false);
  });

  it("rejects a bare non-flag argument", () => {
    const result = parseCliArgs(["react"]);
    expect(result).toEqual({ ok: false, reason: "Unsupported argument: react" });
  });
});

// module spec, "修订：上线前核验": `verify:cloudflare:release` 增加参数 `--pre-deploy=<预览部署 ID>`. Whether it may
// combine with `--slot=drill` is a domain question (run.ts), not a parsing one — not covered here.
describe("parseCliArgs / --pre-deploy", () => {
  it("accepts --pre-deploy alongside the four required flags", () => {
    const result = parseCliArgs([
      "--target=react", "--slot=main", "--history=/tmp/h.json", "--out=/tmp/out",
      "--pre-deploy=8589bf50-b6d2-493f-9551-ea4b7dd8adec",
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        target: "react", slot: "main", history: "/tmp/h.json", out: "/tmp/out",
        preDeploy: "8589bf50-b6d2-493f-9551-ea4b7dd8adec",
      },
    });
  });

  it("omits preDeploy from the parsed value when --pre-deploy is absent", () => {
    const result = parseCliArgs(["--target=react", "--slot=main", "--history=/tmp/h.json", "--out=/tmp/out"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.hasOwn(result.value, "preDeploy")).toBe(false);
  });

  it("still never accepts an origin/URL flag even with --pre-deploy present", () => {
    const result = parseCliArgs([
      "--target=react", "--slot=main", "--history=/tmp/h.json", "--out=/tmp/out",
      "--pre-deploy=8589bf50-b6d2-493f-9551-ea4b7dd8adec", "--origin=https://evil.example",
    ]);
    expect(result).toEqual({ ok: false, reason: "Unsupported argument: --origin=https://evil.example" });
  });
});
