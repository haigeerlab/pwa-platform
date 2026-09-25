import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readIdentityBaseline } from "../src/baseline-file.js";

let directory = "";

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "pwa-baselines-"));
  writeFileSync(join(directory, "storefront-prod.json"), JSON.stringify({ appId: "storefront" }), "utf8");
  writeFileSync(join(directory, "broken.json"), "{ not json", "utf8");
  writeFileSync(join(directory, "scalar.json"), '"just a string"', "utf8");
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("readIdentityBaseline", () => {
  it("reads a slot's file as unchecked JSON", () => {
    expect(readIdentityBaseline({ directory, slot: "storefront-prod" })).toEqual({ appId: "storefront" });
  });

  it("returns whatever the file holds, leaving validation to the comparison", () => {
    // A file that parses but is not an identity must reach compareIdentityBaseline, which reports it as a
    // diagnostic. Throwing here would turn a release finding into a crash.
    expect(readIdentityBaseline({ directory, slot: "scalar" })).toBe("just a string");
  });

  it("throws when the slot has no stored baseline", () => {
    expect(() => readIdentityBaseline({ directory, slot: "never-released" })).toThrow(/no release baseline/i);
  });

  it("throws when the stored baseline is not JSON", () => {
    expect(() => readIdentityBaseline({ directory, slot: "broken" })).toThrow(/not valid json/i);
  });

  it("separates a baseline it cannot read from one that is not there", () => {
    // "Never released" is an answer the release process acts on: it opens the first-production-release review
    // (ADR-0004). An unreadable file is not that answer, and collapsing the two would let a broken mount or a
    // directory in the file's place be approved as a new deployment slot.
    mkdirSync(join(directory, "occupied.json"), { recursive: true });
    expect(() => readIdentityBaseline({ directory, slot: "occupied" })).toThrow(/could not be read/i);
    expect(() => readIdentityBaseline({ directory, slot: "occupied" })).not.toThrow(/no release baseline/i);
  });

  it("attaches no cause, which would carry the path the messages withhold", () => {
    // Every message here is a constant so that directory layout stays out of logs and reports. A caught error
    // attached as `cause` would undo that on its own: its message names the file, and console.error prints it.
    // Asserting only on `message` would leave that door open, so the absence of a cause is asserted directly.
    for (const slot of ["never-released", "broken"]) {
      try {
        readIdentityBaseline({ directory, slot });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as Error).cause, slot).toBeUndefined();
      }
    }
  });

  it("never echoes the path when the baseline cannot be read", () => {
    // A third throw site, so a third leak test: the two below cover the absent and malformed cases.
    const secretDirectory = mkdtempSync(join(tmpdir(), "pwa-secret-"));
    mkdirSync(join(secretDirectory, "occupied.json"), { recursive: true });
    try {
      readIdentityBaseline({ directory: secretDirectory, slot: "occupied" });
      expect.unreachable("should have thrown");
    } catch (error) {
      const { message } = error as Error;
      expect(message).not.toContain(secretDirectory);
      expect(message).not.toContain("occupied");
      expect(message).not.toContain(".json");
    } finally {
      rmSync(secretDirectory, { recursive: true, force: true });
    }
  });

  it("throws when the directory does not exist", () => {
    expect(() => readIdentityBaseline({ directory: join(directory, "absent"), slot: "storefront-prod" })).toThrow(
      /no release baseline/i,
    );
  });

  it("rejects a slot name that is not kebab-case", () => {
    for (const slot of ["Storefront", "store_front", "store front", "", "-store", "store-", "store--front", "s.json"]) {
      expect(() => readIdentityBaseline({ directory, slot }), JSON.stringify(slot)).toThrow(TypeError);
    }
  });

  it("rejects a slot name that would escape the directory", () => {
    // Path traversal is impossible by construction, but a rejected name says so far more clearly than a
    // confusing "file not found" would.
    for (const slot of ["../secrets", "..", "a/b", "/etc/passwd"]) {
      expect(() => readIdentityBaseline({ directory, slot }), slot).toThrow(TypeError);
    }
  });

  it("never echoes the path when the baseline is absent", () => {
    // A separate case from the malformed-JSON one below: these are two different throw sites, and a test that
    // only exercised one would leave the other free to start leaking the directory layout.
    const secretDirectory = mkdtempSync(join(tmpdir(), "pwa-secret-"));
    try {
      readIdentityBaseline({ directory: secretDirectory, slot: "never-released" });
      expect.unreachable("should have thrown");
    } catch (error) {
      const { message } = error as Error;
      expect(message).not.toContain(secretDirectory);
      expect(message).not.toContain("never-released");
      expect(message).not.toContain(".json");
    } finally {
      rmSync(secretDirectory, { recursive: true, force: true });
    }
  });

  it("never echoes the path or the file contents when the baseline is malformed", () => {
    const secretDirectory = mkdtempSync(join(tmpdir(), "pwa-secret-"));
    mkdirSync(join(secretDirectory, "nested"), { recursive: true });
    writeFileSync(join(secretDirectory, "leaky.json"), "{ tenant: super-secret-value", "utf8");
    try {
      readIdentityBaseline({ directory: secretDirectory, slot: "leaky" });
      expect.unreachable("should have thrown");
    } catch (error) {
      const { message } = error as Error;
      expect(message).not.toContain(secretDirectory);
      expect(message).not.toContain("super-secret-value");
      expect(message).not.toContain("leaky");
    } finally {
      rmSync(secretDirectory, { recursive: true, force: true });
    }
  });
});
