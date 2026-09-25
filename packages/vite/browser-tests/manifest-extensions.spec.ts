// Manifest extension members in a real browser (spec/contracts-foundation.md "修订：安装元数据的扩展字段", task
// MX5): Chrome parses the plugin-built manifest without errors and recognizes the members it uses. Read through the
// DevTools protocol's Page.getAppManifest, which returns both Chrome's parse errors and its parsed manifest.
// `categories` is not asserted: Chrome passes it through without exposing it (it is for distribution platforms).
import { expect, test } from "@pwa-platform/browser-test-harness";
import { MANIFEST_EXT_SITE, SHELL_URL } from "./fixture-site.js";

type ParsedManifest = {
  readonly description?: string;
  readonly orientation?: string;
  readonly displayOverrides?: readonly string[];
  readonly screenshots?: readonly { readonly image: { readonly url: string; readonly sizes: string }; readonly formFactor: string; readonly label?: string }[];
  readonly shortcuts?: readonly { readonly name: string; readonly url: string }[];
};

test.use({ fixtureSite: MANIFEST_EXT_SITE });

test("Chrome parses the extension members without errors", async ({ page, context, fixtureServer }) => {
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
