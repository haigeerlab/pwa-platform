// Manifest extension members in a real browser (spec/contracts-foundation.md "修订：安装元数据的扩展字段", task
// MX5): Chrome parses the plugin-built manifest without errors and recognizes the members it uses. Read through the
// DevTools protocol's Page.getAppManifest, which returns both Chrome's parse errors and its parsed manifest.
// `categories` is not asserted: Chrome passes it through without exposing it (it is for distribution platforms).
//
// Real Safari and Firefox (ADR-0047) have no DevTools protocol, so the parsed-manifest test is skipped there. The
// second test reads the manifest the page links, through the page's own fetch, and compares the members as served, so
// matrix row 2b (manifest shortcuts) still has real-browser evidence for the artifact the browser consumes. It does
// not show that Safari or Firefox parsed the members without errors: no automation surface exposes that.
import { expect, readRealBrowserKind, test } from "@pwa-platform/browser-test-harness";
import { MANIFEST_EXT_SITE, MANIFEST_URL, SHELL_URL } from "./fixture-site.js";

type ParsedManifest = {
  readonly description?: string;
  readonly orientation?: string;
  readonly displayOverrides?: readonly string[];
  readonly screenshots?: readonly { readonly image: { readonly url: string; readonly sizes: string }; readonly formFactor: string; readonly label?: string }[];
  readonly shortcuts?: readonly { readonly name: string; readonly url: string }[];
};

test.use({ fixtureSite: MANIFEST_EXT_SITE });

test("Chrome parses the extension members without errors", async ({ page, context, fixtureServer }) => {
  test.skip(readRealBrowserKind(process.env) !== undefined, "Page.getAppManifest is a DevTools protocol command; Safari and Firefox expose no parsed manifest over WebDriver");
  await page.goto(fixtureServer.url(SHELL_URL));
  const session = await context.newCDPSession(page);
  const result = (await session.send("Page.getAppManifest")) as unknown as {
    readonly errors: readonly { readonly message: string }[];
    readonly manifest?: ParsedManifest;
  };

  expect(result.errors.map((error) => error.message)).toEqual([]);
  const manifest = result.manifest;
  expect(manifest?.description).toBe("A fixture app with every manifest extension member");
  expect(manifest?.orientation).toBe("PORTRAIT");
  expect(manifest?.displayOverrides).toEqual(["kWindowControlsOverlay", "kStandalone"]);
  expect(manifest?.screenshots).toHaveLength(1);
  expect(manifest?.screenshots?.[0]).toMatchObject({
    image: { url: fixtureServer.url("/app/screenshots/wide.png"), sizes: "1280x800" },
    formFactor: "kWide",
    label: "Home",
  });
  expect(manifest?.shortcuts).toEqual([
    expect.objectContaining({ name: "New order", url: fixtureServer.url("/app/orders/new") }),
  ]);
});

test("the manifest the page links carries every extension member as the plugin wrote it", async ({ page, fixtureServer }) => {
  await page.goto(fixtureServer.url(SHELL_URL));
  const linked = await page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel~="manifest" i]')?.href ?? null);
  expect(linked).toBe(fixtureServer.url(MANIFEST_URL));

  // The browser's own fetch of the linked manifest, not a Node-side request.
  const manifest = await page.evaluate(async (href: string) => (await (await fetch(href)).json()) as Record<string, unknown>, linked as string);

  expect(manifest["description"]).toBe("A fixture app with every manifest extension member");
  expect(manifest["orientation"]).toBe("portrait");
  expect(manifest["display_override"]).toEqual(["window-controls-overlay", "standalone"]);
  expect(manifest["categories"]).toEqual(["productivity"]);
  expect(manifest["screenshots"]).toEqual([
    { src: "/app/screenshots/wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Home" },
  ]);
  expect(manifest["shortcuts"]).toEqual([
    {
      name: "New order",
      short_name: "New",
      url: "/app/orders/new",
      icons: [{ src: "/app/icons/new.png", sizes: "192x192", type: "image/png", purpose: "any" }],
    },
  ]);

  // What the shortcut and the screenshot point at is published, so the browser can fetch it.
  for (const path of ["/app/screenshots/wide.png", "/app/icons/new.png"]) {
    expect((await page.request.get(fixtureServer.url(path))).status()).toBe(200);
  }
});
