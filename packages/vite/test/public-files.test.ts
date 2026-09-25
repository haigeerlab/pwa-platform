import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPublicFiles } from "../src/public-files.js";

// Vite copies `publicDir` into the output directory verbatim, outside of any plugin hook. These files are
// published but invisible to `generateBundle`, which is why this module reads them from disk.

let created: string[] = [];

function publicDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-public-"));
  created.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

afterEach(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true });
  created = [];
});

const decode = (content: Uint8Array): string => new TextDecoder().decode(content);

describe("readPublicFiles", () => {
  it("reads every file, including nested ones", () => {
    const root = publicDir({
      "robots.txt": "User-agent: *\n",
      "icons/192.png": "not really a png",
      "icons/maskable/512.png": "also not a png",
    });
    const files = readPublicFiles(root, true);

    expect(files.map(({ path }) => path).sort()).toEqual(["icons/192.png", "icons/maskable/512.png", "robots.txt"]);
  });

  it("returns the file's bytes", () => {
    const root = publicDir({ "robots.txt": "User-agent: *\n" });
    const [file] = readPublicFiles(root, true);

    expect(file).toBeDefined();
    expect(decode(file?.content ?? new Uint8Array())).toBe("User-agent: *\n");
  });

  it("names nested paths with forward slashes, because they become URLs", () => {
    const root = publicDir({ "icons/maskable/512.png": "x" });
    const [file] = readPublicFiles(root, true);

    expect(file?.path).toBe("icons/maskable/512.png");
    expect(file?.path).not.toContain("\\");
  });

  it("reads nothing when the directory is disabled", () => {
    // Vite resolves `publicDir: false` and `publicDir: ""` both to an empty string. Nothing is copied, so nothing
    // may appear in the manifest either — a file listed but never published is a release check failure waiting.
    expect(readPublicFiles("", true)).toEqual([]);
  });

  it("reads nothing when copying is turned off", () => {
    const root = publicDir({ "robots.txt": "x" });
    expect(readPublicFiles(root, false)).toEqual([]);
  });

  it("reads nothing when the directory does not exist", () => {
    // The common case for an app without a public directory. Vite copies nothing and says nothing; turning that
    // into a build failure would reject a perfectly ordinary project.
    const root = publicDir({});
    expect(readPublicFiles(join(root, "absent"), true)).toEqual([]);
  });

  it("skips directories themselves, listing only files", () => {
    const root = publicDir({ "icons/192.png": "x" });
    const files = readPublicFiles(root, true);

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("icons/192.png");
  });
});
