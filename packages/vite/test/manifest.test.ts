import type { PwaIdentity, PwaInstallMetadata, PwaPlan, PwaPolicy } from "@pwa-platform/contracts";
import { compilePlan, type PwaCompileHostOutput } from "@pwa-platform/core";
import { describe, expect, it } from "vitest";
import { createWebManifest, serializeWebManifest } from "../src/manifest.js";

const identity: PwaIdentity = {
  appId: "storefront",
  // Every field the manifest reads is given a distinct value. Where two of them coincide, swapping their sources
  // is invisible: a fixture with scope === mountPath cannot tell the two apart, and the assertion below would
  // pass while the manifest named the wrong path.
  manifestId: "/app/#storefront",
  origin: "https://shop.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/ui/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const install: PwaInstallMetadata = {
  // Inside the scope but not equal to it: the point is that `start_url` and `scope` come from different sources,
  // so a fixture where they coincide would hide a swap. It carries no query string — contracts requires a
  // canonical path, and `new URL("/app/?x=1").pathname` is `/app/`, which is not the value itself.
  startUrl: "/app/home",
  display: "standalone",
  name: "Storefront",
  shortName: "Shop",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

const hostBuildOutput: PwaCompileHostOutput = {
  publicPath: "/app/",
  serviceWorkerFile: "sw.js",
  manifestFile: "manifest.webmanifest",
  // The app is mounted at /app/ui/, so its build output lives there too. Policy prefixes resolve against
  // mountPath, so files outside it would match no rule and the fixture would quietly compile to an empty
  // precache — a plan that no longer represents a working app.
  files: [
    { path: "ui/assets/index-BGTT0tj4.js", fingerprinted: true, contentHash: "ZGVhZGJlZWZkZWFkYmVlZmRlYWRiZWVmZGVhZGJlZWY" },
    { path: "ui/index.html", fingerprinted: false, contentHash: "aW5kZXhodG1sYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnc" },
  ],
};

function policy(installEnabled: boolean): PwaPolicy {
  return {
    schemaVersion: 1,
    install: { enabled: installEnabled },
    offlineFallback: { enabled: false },
    updateMode: "prompt",
    resources: [{ pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" }],
  };
}

/** A real compiled plan, so the manifest is built from what the platform actually produces. */
function plan(installEnabled: boolean): PwaPlan {
  const result = compilePlan({
    identity,
    install: installEnabled ? install : null,
    policy: policy(installEnabled),
    topology: { kind: "standalone-origin" },
    hostBuildOutput,
  });
  if (!result.ok) throw new Error(`fixture plan did not compile: ${result.diagnostics.map((d) => d.code).join(", ")}`);
  return result.value;
}

describe("createWebManifest", () => {
  it("maps every install field into its manifest spelling", () => {
    expect(createWebManifest(plan(true))).toEqual({
      id: "/app/#storefront",
      scope: "/app/",
      start_url: "/app/home",
      display: "standalone",
      name: "Storefront",
      short_name: "Shop",
      theme_color: "#0b5fff",
      background_color: "#ffffff",
      icons: [
        { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    });
  });

  it("takes id and scope from the identity, not from the install metadata", () => {
    // The browser decides whether this is the same installed app from `id` and `scope`. They belong to the
    // identity the platform owns (ADR-0004); reading them from anywhere else would let a policy change look like
    // a different app to an already-installed user.
    const manifest = createWebManifest(plan(true));
    expect(manifest?.id).toBe(identity.manifestId);
    expect(manifest?.scope).toBe(identity.scope);
    expect(manifest?.id).not.toBe(identity.appId);
    expect(manifest?.scope).not.toBe(install.startUrl);
    // scope and mountPath are different fields with different jobs — the browser's control boundary against the
    // app's route prefix. The fixture keeps them distinct so that reading one for the other fails here.
    expect(manifest?.scope).not.toBe(identity.mountPath);
  });

  it("keeps start_url distinct from scope", () => {
    // They are equal in many apps, which is exactly why a fixture that differs is worth having: swapping the two
    // sources would otherwise pass unnoticed.
    const manifest = createWebManifest(plan(true));
    expect(manifest?.start_url).toBe(install.startUrl);
    expect(manifest?.start_url).not.toBe(manifest?.scope);
  });

  it("returns null when the plan offers no installation", () => {
    expect(createWebManifest(plan(false))).toBeNull();
  });

  it("copies icons rather than aliasing the plan's array", () => {
    const compiled = plan(true);
    const manifest = createWebManifest(compiled);
    expect(manifest?.icons).not.toBe(compiled.install?.icons);
    expect(manifest?.icons).toHaveLength(4);
  });

  it("carries no member beyond the ones the platform emits", () => {
    const manifest = createWebManifest(plan(true));
    expect(Object.keys(manifest ?? {}).sort()).toEqual([
      "background_color",
      "display",
      "icons",
      "id",
      "name",
      "scope",
      "short_name",
      "start_url",
      "theme_color",
    ]);
  });
});

describe("createWebManifest with the manifest extension fields (contracts-foundation's 安装元数据的扩展字段)", () => {
  const extendedInstall: PwaInstallMetadata = {
    ...install,
    description: "A storefront for local goods.",
    categories: ["shopping", "business"],
    orientation: "portrait",
    displayOverride: ["window-controls-overlay", "standalone"],
    screenshots: [
      { src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", formFactor: "wide", label: "Home" },
      { src: "/app/screenshots/narrow.png", sizes: "540x720", type: "image/png" },
    ],
    shortcuts: [
      {
        name: "Cart",
        url: "/app/cart",
        shortName: "Cart",
        description: "Open the cart",
        icons: [{ src: "/app/icons/cart.png", sizes: "96x96", type: "image/png", purpose: "any" }],
      },
      { name: "Wishlist", url: "/app/wishlist" },
    ],
  };

  /** A real compiled plan carrying the extension fields, mirroring this file's own `plan()` helper. */
  function extendedPlan(): PwaPlan {
    const result = compilePlan({
      identity,
      install: extendedInstall,
      policy: policy(true),
      topology: { kind: "standalone-origin" },
      hostBuildOutput,
    });
    if (!result.ok) throw new Error(`fixture plan did not compile: ${result.diagnostics.map((d) => d.code).join(", ")}`);
    return result.value;
  }

  it("maps every extension field into its manifest spelling, key order fixed after the existing nine keys", () => {
    const manifest = createWebManifest(extendedPlan());
    expect(Object.keys(manifest ?? {})).toEqual([
      "id",
      "scope",
      "start_url",
      "display",
      "name",
      "short_name",
      "theme_color",
      "background_color",
      "icons",
      "description",
      "categories",
      "orientation",
      "display_override",
      "screenshots",
      "shortcuts",
    ]);
    expect(manifest).toMatchObject({
      description: "A storefront for local goods.",
      categories: ["shopping", "business"],
      orientation: "portrait",
      display_override: ["window-controls-overlay", "standalone"],
      screenshots: [
        { src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Home" },
        { src: "/app/screenshots/narrow.png", sizes: "540x720", type: "image/png" },
      ],
      shortcuts: [
        {
          name: "Cart",
          short_name: "Cart",
          description: "Open the cart",
          url: "/app/cart",
          icons: [{ src: "/app/icons/cart.png", sizes: "96x96", type: "image/png", purpose: "any" }],
        },
        { name: "Wishlist", url: "/app/wishlist" },
      ],
    });
  });

  it("uses form_factor, short_name and display_override, never the camelCase install spelling", () => {
    const manifest = createWebManifest(extendedPlan());
    const json = serializeWebManifest(manifest as NonNullable<typeof manifest>);
    expect(json).toContain("form_factor");
    expect(json).toContain("short_name");
    expect(json).toContain("display_override");
    expect(json).not.toContain("formFactor");
    expect(json).not.toContain("shortName");
    expect(json).not.toContain("displayOverride");
  });

  it("omits a screenshot's optional form_factor and label when the app did not write them", () => {
    const manifest = createWebManifest(extendedPlan());
    const narrow = manifest?.screenshots?.[1];
    expect(narrow).toEqual({ src: "/app/screenshots/narrow.png", sizes: "540x720", type: "image/png" });
    expect(narrow).not.toHaveProperty("form_factor");
    expect(narrow).not.toHaveProperty("label");
  });

  it("omits a shortcut's optional short_name, description and icons when the app did not write them", () => {
    const manifest = createWebManifest(extendedPlan());
    const wishlist = manifest?.shortcuts?.[1];
    expect(wishlist).toEqual({ name: "Wishlist", url: "/app/wishlist" });
    expect(wishlist).not.toHaveProperty("short_name");
    expect(wishlist).not.toHaveProperty("description");
    expect(wishlist).not.toHaveProperty("icons");
  });

  it("writes only the fields the app actually set, when only some extension fields are present", () => {
    const result = compilePlan({
      identity,
      install: { ...install, description: "Only a description." },
      policy: policy(true),
      topology: { kind: "standalone-origin" },
      hostBuildOutput,
    });
    if (!result.ok) throw new Error(`fixture plan did not compile: ${result.diagnostics.map((d) => d.code).join(", ")}`);
    const manifest = createWebManifest(result.value);
    expect(Object.keys(manifest ?? {})).toEqual([
      "id",
      "scope",
      "start_url",
      "display",
      "name",
      "short_name",
      "theme_color",
      "background_color",
      "icons",
      "description",
    ]);
    expect(manifest?.description).toBe("Only a description.");
  });
});

describe("createWebManifest without any extension field: unchanged from before the revision", () => {
  // Captured from the unmodified manifest.ts (before contracts-foundation's "修订：安装元数据的扩展字段" landed), on
  // exactly this file's `plan(true)` fixture — the deterministic check that an app writing none of the six new
  // install fields gets a byte-identical manifest. The other tests in this file already assert the same key set via
  // `Object.keys`; this one additionally pins the serialized bytes an app's build would actually emit.
  const BASELINE_SERIALIZED = `{
  "id": "/app/#storefront",
  "scope": "/app/",
  "start_url": "/app/home",
  "display": "standalone",
  "name": "Storefront",
  "short_name": "Shop",
  "theme_color": "#0b5fff",
  "background_color": "#ffffff",
  "icons": [
    {
      "src": "/app/icons/192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/app/icons/192-maskable.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/app/icons/512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/app/icons/512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
`;

  it("serializes to exactly the pre-revision bytes when no extension field is written", () => {
    const manifest = createWebManifest(plan(true));
    if (manifest === null) throw new Error("expected a manifest");
    expect(serializeWebManifest(manifest)).toBe(BASELINE_SERIALIZED);
  });

  it("adds no new key to the manifest object itself", () => {
    const manifest = createWebManifest(plan(true));
    expect(manifest).not.toHaveProperty("description");
    expect(manifest).not.toHaveProperty("categories");
    expect(manifest).not.toHaveProperty("orientation");
    expect(manifest).not.toHaveProperty("display_override");
    expect(manifest).not.toHaveProperty("screenshots");
    expect(manifest).not.toHaveProperty("shortcuts");
  });
});

describe("serializeWebManifest", () => {
  it("round-trips through JSON.parse", () => {
    const manifest = createWebManifest(plan(true));
    if (manifest === null) throw new Error("expected a manifest");
    expect(JSON.parse(serializeWebManifest(manifest))).toEqual(manifest);
  });

  it("ends with a newline, as text files do", () => {
    const manifest = createWebManifest(plan(true));
    if (manifest === null) throw new Error("expected a manifest");
    expect(serializeWebManifest(manifest).endsWith("\n")).toBe(true);
  });
});
