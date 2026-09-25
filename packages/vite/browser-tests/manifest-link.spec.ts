// Proves the injected manifest link end-to-end, in a real browser, against a fixture app that hand-writes none of
// it (browser-tests/app/index.html). The two example apps under examples-browser-e2e keep their hand-written links
// unchanged, so their passing tests are the compatibility half of this proof: injection only fires when a page has
// nothing of its own to keep.
import { expect, test } from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, IDENTITY, INSTALL, MANIFEST_URL, SHELL_URL } from "./fixture-site.js";

test.use({ fixtureSite: FIXTURE_SITE });

test.describe("the manifest link the plugin injects", () => {
  test("the served page carries exactly one manifest link, resolving to the identity's manifest URL", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url(SHELL_URL));

    // Case-insensitive and token-aware, the way the plugin itself decides what counts as a manifest link
    // (resolveManifestLinkAction) — `rel~="manifest" i` matches a link whose rel token list contains "manifest" in
    // any case, not just an exact `rel="manifest"`.
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel~="manifest" i]')].map((link) => (link as HTMLLinkElement).href),
    );

    expect(hrefs).toEqual([fixtureServer.url(MANIFEST_URL)]);
  });

  test("the linked manifest is fetchable and its id and start_url match the identity", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));

    const response = await page.request.get(fixtureServer.url(MANIFEST_URL));
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/manifest+json");

    const manifest = (await response.json()) as Record<string, unknown>;
    // `id` and `scope` come from the identity, not the install metadata (ADR-0004; see src/manifest.ts).
    expect(manifest["id"]).toBe(IDENTITY.manifestId);
    expect(manifest["scope"]).toBe(IDENTITY.scope);
    expect(manifest["start_url"]).toBe(INSTALL.startUrl);
  });

  test("Chrome itself resolves the linked manifest via CDP, with no parse errors", async ({ page, context, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));

    // Confirms Chrome's own manifest fetcher — not just this test's HTTP client — follows the injected link and
    // parses what it gets: the same signal the browser uses to decide installability.
    const client = await context.newCDPSession(page);
    const result = await client.send("Page.getAppManifest");

    expect(result.url).toBe(fixtureServer.url(MANIFEST_URL));
    expect(result.errors).toEqual([]);
  });
});
