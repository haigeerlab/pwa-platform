import { describe, expect, it } from "vitest";
import { resolveManifestUrl, validatePrecacheEngineOptions } from "../../src/worker/options.js";

const CACHE_NAME = "pwa:storefront:production:r3:precache";
const entries = [
  { url: "/app/assets/app.3f9a2c7d.js", revision: null },
  { url: "/app/offline.html", revision: "7d793037a0760186" },
];

function message(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("validatePrecacheEngineOptions", () => {
  it("returns a copy of valid options", () => {
    const options = { cacheName: CACHE_NAME, entries };
    const validated = validatePrecacheEngineOptions(options);
    expect(validated).toEqual(options);
    expect(validated.entries).not.toBe(entries);
    expect(validated.entries[0]).not.toBe(entries[0]);
  });

  it("requires a contracts precache cache name", () => {
    for (const cacheName of [undefined, 42, "", "workbox-precache-v2", "pwa:storefront:production:r3:runtime", "storefront:precache", "pwa::precache", "pwa:precache"]) {
      expect(() => validatePrecacheEngineOptions({ cacheName, entries }), String(cacheName)).toThrow(/cacheName must be/);
    }
  });

  it("requires options and entries of the right shape", () => {
    expect(() => validatePrecacheEngineOptions(null)).toThrow(TypeError);
    expect(() => validatePrecacheEngineOptions([])).toThrow(TypeError);
    expect(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: "all" })).toThrow(/entries must be an array/);
    expect(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: [null] })).toThrow(/entries\[0\] must be an object/);
  });

  it("accepts only url and revision in each entry", () => {
    const withIntegrity = [{ url: "/a.js", revision: "1", integrity: "sha384-x" }];
    expect(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: withIntegrity })).toThrow(/exactly the fields url and revision/);
    expect(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: [{ url: "/a.js" }] })).toThrow(/exactly the fields/);
  });

  it("accepts canonical absolute paths, including percent-encoded ones", () => {
    for (const url of ["/", "/app/offline.html", "/app/assets/caf%C3%A9%20menu.js"]) {
      expect(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: [{ url, revision: null }] }), url).not.toThrow();
    }
  });

  it("rejects paths that are not canonical, including spellings the URL parser resolves to another origin", () => {
    for (const url of [
      "a.js",
      "https://cdn.example/a.js",
      "//cdn.example/a.js",
      "/\\evil.example/a.js",
      "/\t/evil.example/a.js",
      "/\n/evil.example/a.js",
      "/a.js#top",
      "/a.js?v=1",
      "/app/./a.js",
      "/app/../a.js",
      "/app//a.js",
      "/café.js",
      7,
    ]) {
      expect(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: [{ url, revision: null }] }), JSON.stringify(url)).toThrow(
        /entries\[0\]\.url must be a canonical same-origin absolute path/,
      );
    }
  });

  it("requires revisions to be non-empty strings or null", () => {
    for (const revision of ["", 1, undefined, false]) {
      expect(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: [{ url: "/a.js", revision }] }), String(revision)).toThrow(
        /entries\[0\]\.revision must be/,
      );
    }
  });

  it("rejects duplicate URLs", () => {
    const duplicate = [...entries, { url: "/app/offline.html", revision: "other" }];
    expect(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: duplicate })).toThrow(/entries\[2\]\.url duplicates/);
  });

  it("never echoes input values in messages", () => {
    const secret = "tok_do_not_echo";
    expect(message(() => validatePrecacheEngineOptions({ cacheName: `${secret}:precache`, entries }))).not.toContain(secret);
    expect(message(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: [{ url: `https://${secret}/a`, revision: null }] }))).not.toContain(secret);
    expect(message(() => validatePrecacheEngineOptions({ cacheName: CACHE_NAME, entries: [{ url: "/a", revision: 7, [secret]: 1 }] }))).not.toContain(secret);
  });
});

describe("resolveManifestUrl", () => {
  it("resolves against the base, drops the fragment and keeps the query", () => {
    const base = "https://shop.example.com/app/sw.js";
    expect(resolveManifestUrl("/app/offline.html#section", base)).toBe("https://shop.example.com/app/offline.html");
    expect(resolveManifestUrl("offline.html", base)).toBe("https://shop.example.com/app/offline.html");
    expect(resolveManifestUrl("/app/offline.html?v=1", base)).toBe("https://shop.example.com/app/offline.html?v=1");
  });
});
