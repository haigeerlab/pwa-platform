import { describe, expect, it } from "vitest";
import { findManifestLinks, resolveManifestLinkAction } from "../src/manifest-link.js";

const ORIGIN = "https://shop.example.com";
const MANIFEST_URL = "/app/manifest.webmanifest";
const ENTRY = "/admin/index.html";

describe("findManifestLinks", () => {
  it("finds manifest links independently of attribute order and rel casing", () => {
    const html = '<link href="/app/manifest.webmanifest" rel="Manifest foo">';
    expect(findManifestLinks(html)).toHaveLength(1);
  });

  it("recognizes an unquoted manifest href", () => {
    const html = "<link rel=manifest href=/app/manifest.webmanifest>";
    expect(resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toBe("keep");
  });

  it("ignores non-manifest rel tokens", () => {
    const html = '<link rel="manifest-legacy" href="/app/manifest.webmanifest">';
    expect(resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toBe("inject");
  });

  it("does not truncate a link when a quoted attribute contains >", () => {
    const html = '<link rel="manifest" data-label="a > b" href="/app/manifest.webmanifest">';
    expect(() => resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).not.toThrow();
  });

  it("uses the first duplicate attribute, as browsers do", () => {
    const html = '<link rel="manifest" href="/app/manifest.webmanifest" href="/legacy.webmanifest">';
    expect(resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toBe("keep");
  });

  it("does not mistake link-shaped text in inert elements for a real link", () => {
    const html = [
      '<script>const value = "<!-- <link rel=manifest href=/legacy.webmanifest>";</script>',
      '<style>.x::before { content: "<link rel=manifest href=/legacy.webmanifest>"; }</style>',
      '<template><link rel=manifest href=/legacy.webmanifest></template>',
      '<noscript><link rel=manifest href=/legacy.webmanifest></noscript>',
      '<textarea><link rel=manifest href=/legacy.webmanifest></textarea>',
      '<link rel="manifest" href="/app/manifest.webmanifest">',
    ].join("");
    expect(resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toBe("keep");
  });

  it("ignores a manifest link in an HTML comment", () => {
    const html = '<!-- <link rel="manifest" href="/legacy.webmanifest"> -->';
    expect(resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toBe("inject");
  });
});

describe("resolveManifestLinkAction", () => {
  it("injects when no manifest link exists", () => {
    expect(resolveManifestLinkAction("<html><head></head></html>", ORIGIN, MANIFEST_URL, ENTRY)).toBe("inject");
  });

  it("keeps an exact root-path link", () => {
    const html = '<link rel="manifest" href="/app/manifest.webmanifest">';
    expect(resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toBe("keep");
  });

  it("keeps a complete URL on the identity origin", () => {
    const html = '<link rel="manifest" href="https://shop.example.com/app/manifest.webmanifest">';
    expect(resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toBe("keep");
  });

  it("rejects a relative URL even when config.base would have made it match", () => {
    const html = '<link rel="manifest" href="manifest.webmanifest">';
    expect(() => resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toThrow(/pwa-platform:/);
  });

  it("rejects a page that declares base", () => {
    const html = '<base href="/app/"><link rel="manifest" href="/app/manifest.webmanifest">';
    expect(() => resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toThrow(/base/i);
  });

  it("rejects a manifest URL with a query or fragment", () => {
    for (const suffix of ["?version=2", "#section"]) {
      const html = `<link rel="manifest" href="https://shop.example.com/app/manifest.webmanifest${suffix}">`;
      expect(() => resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toThrow(/pwa-platform:/);
    }
  });

  it("rejects another origin and invalid URL text without echoing either value", () => {
    for (const href of ["https://elsewhere.example/app/manifest.webmanifest", "//elsewhere.example/app/manifest.webmanifest", "http://[broken"]) {
      try {
        resolveManifestLinkAction(`<link rel="manifest" href="${href}">`, ORIGIN, MANIFEST_URL, ENTRY);
        throw new Error("expected manifest link rejection");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toMatch(/^pwa-platform:/);
        expect(message).not.toContain(href);
        expect(message).not.toContain(ORIGIN);
        expect(message).not.toContain(MANIFEST_URL);
      }
    }
  });

  it("rejects multiple manifest links and identifies the Vite HTML path", () => {
    const html = '<link rel="manifest" href="/app/manifest.webmanifest"><link rel="manifest" href="/other.webmanifest">';
    expect(() => resolveManifestLinkAction(html, ORIGIN, MANIFEST_URL, ENTRY)).toThrow(/\/admin\/index\.html/);
  });
});
