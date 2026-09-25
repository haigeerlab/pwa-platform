// tasks/push-module/plan.md XP5. Offline unit tests for push:keys's `main`, driven through injected `KeysDeps`,
// plus one test on the real filesystem (in a temporary directory) for the file modes a fake fs cannot prove.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultDeps, main, type KeysDeps } from "./keys.js";

const FAKE_KEYS = { publicKey: "fake-public-key", privateKey: "fake-private-key" };

function fakeDeps(overrides: Partial<KeysDeps> = {}): KeysDeps & { readonly out: string[]; readonly err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const files = new Map<string, string>();
  const modes = new Map<string, number>();
  return {
    vapidFile: "/demo/.push-demo/vapid.json",
    existsSync: (path) => files.has(path),
    mkdirSync: () => {},
    writeFileSync: (path, data) => files.set(path, data),
    chmodSync: (path, mode) => modes.set(path, mode),
    stdout: { write: (chunk) => void out.push(chunk) },
    stderr: { write: (chunk) => void err.push(chunk) },
    createVapidKeys: () => FAKE_KEYS,
    out,
    err,
    ...overrides,
  };
}

describe("push:keys main()", () => {
  it("writes the key file with mode 0600 and the directory with mode 0700", () => {
    const modes = new Map<string, number>();
    const deps = fakeDeps({ chmodSync: (path, mode) => modes.set(path, mode) });

    const code = main([], deps);

    expect(code).toBe(0);
    expect(modes.get("/demo/.push-demo/vapid.json")).toBe(0o600);
    expect(modes.get("/demo/.push-demo")).toBe(0o700);
  });

  it("refuses to overwrite an existing file without --force", () => {
    const deps = fakeDeps({ existsSync: () => true });
    const write = vi.fn();

    const code = main([], { ...deps, writeFileSync: write });

    expect(code).toBe(1);
    expect(write).not.toHaveBeenCalled();
    expect(deps.err.join("")).toContain("already exists");
    expect(deps.err.join("")).toContain("--force");
  });

  it("overwrites an existing file when --force is passed", () => {
    const deps = fakeDeps({ existsSync: () => true });

    const code = main(["--force"], deps);

    expect(code).toBe(0);
    expect(deps.out.join("")).toContain(FAKE_KEYS.publicKey);
  });

  it("rejects an unrecognized argument without writing anything", () => {
    const deps = fakeDeps();
    const write = vi.fn();

    const code = main(["--bogus"], { ...deps, writeFileSync: write });

    expect(code).toBe(1);
    expect(write).not.toHaveBeenCalled();
    expect(deps.err.join("")).toContain("--bogus");
  });

  it("prints only the public key, never the private key, on success", () => {
    const deps = fakeDeps();

    main([], deps);

    const stdout = deps.out.join("");
    expect(stdout).toContain(FAKE_KEYS.publicKey);
    expect(stdout).not.toContain(FAKE_KEYS.privateKey);
    expect(JSON.stringify(deps.err)).not.toContain(FAKE_KEYS.privateKey);
  });

  it("never leaks the private key even on the refuse-to-overwrite path", () => {
    const deps = fakeDeps({ existsSync: () => true });

    main([], deps);

    expect(JSON.stringify(deps.out) + JSON.stringify(deps.err)).not.toContain(FAKE_KEYS.privateKey);
  });
});

describe("push:keys defaultDeps()", () => {
  it("wires up a vapidFile under .push-demo and a real createVapidKeys", async () => {
    const deps = await defaultDeps();

    expect(deps.vapidFile.endsWith("/.push-demo/vapid.json")).toBe(true);
    const keys = deps.createVapidKeys();
    expect(typeof keys.publicKey).toBe("string");
    expect(typeof keys.privateKey).toBe("string");
  });
});

describe("keys main on the real filesystem", () => {
  it("leaves the directory 0700 and the key file 0600 even when the directory already existed as 0755", async () => {
    const root = mkdtempSync(join(tmpdir(), "push-keys-"));
    try {
      const dir = join(root, ".push-demo");
      mkdirSync(dir, { mode: 0o755 });
      chmodSync(dir, 0o755);
      const vapidFile = join(dir, "vapid.json");
      const out: string[] = [];
      const deps = { ...(await defaultDeps()), vapidFile, stdout: { write: (chunk: string) => out.push(chunk) } };

      expect(main([], deps)).toBe(0);
      expect(statSync(dir).mode & 0o777).toBe(0o700);
      expect(statSync(vapidFile).mode & 0o777).toBe(0o600);

      // --force rewrites an existing file; the mode must still be exact.
      chmodSync(vapidFile, 0o644);
      expect(main(["--force"], deps)).toBe(0);
      expect(statSync(vapidFile).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
