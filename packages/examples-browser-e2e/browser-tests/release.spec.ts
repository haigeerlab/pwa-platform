// The six build-verifier checks a standalone-origin app's release gate requires (spec/release-gate-contract.md),
// run against what the examples actually built and what the server actually serves.
import {
  readIdentityBaseline,
  verifyHtmlHeaders,
  verifyRelease,
  verifyReleaseRetention,
  verifyResponseHeaders,
  type PwaReleaseRetentionInput,
  type PwaVerificationReport,
} from "@pwa-platform/build-verifier";
import { expect, test } from "@pwa-platform/browser-test-harness";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build, type Plugin } from "vite";
import { IDENTITY } from "../apps/shared/identity.js";
import {
  BASELINE_DIRECTORY,
  BASELINE_SLOT,
  collectHeaders,
  expectedPrecacheCacheName,
  headerPaths,
  htmlHeaderPaths,
  publishedPaths,
  readShippedWorker,
  releaseInput,
} from "./release.js";
import { EXAMPLES, exampleRoot, fixtureSite, HEADER_RULES, type ExampleName } from "./sites.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const names = (report: PwaVerificationReport): string[] => report.checks.map(({ name }) => name);

for (const example of EXAMPLES) {
  test.describe(`${example} example · release checks`, () => {
    test.use({ fixtureSite: fixtureSite(example) });

    test("the release report covers all six checks and passes", async ({ page, fixtureServer }) => {
      // The plan is assembled from the shipped worker, so first confirm the worker really is this app's: if the
      // scope or the cache namespace did not match the identity, everything below would be verifying some other
      // build's artifacts against this identity's baseline.
      const shipped = await readShippedWorker(example, "v1");
      expect(shipped.scope).toBe(IDENTITY.scope);
      expect(shipped.precacheCacheName).toBe(expectedPrecacheCacheName());
      // The baseline compares the identity the build was given. Its manifest-facing fields are cross-checked against
      // the manifest actually served, so the comparison is not only "source constant against hand-written JSON".
      const manifest = (await (await page.request.get(fixtureServer.url(IDENTITY.manifestUrl))).json()) as {
        id?: unknown;
        scope?: unknown;
      };
      expect({ id: manifest.id, scope: manifest.scope }).toEqual({ id: IDENTITY.manifestId, scope: IDENTITY.scope });

      const plan = releaseInput(shipped);
      const paths = headerPaths(plan);
      // Without a fingerprinted entry the header check would only ever judge the worker and the manifest, and the
      // immutable half of the baseline would go untested while the report still said `ok`.
      expect(paths.length).toBeGreaterThan(2);
      const htmlPaths = htmlHeaderPaths(plan);
      // Without more than the mount path, html-headers would only ever judge one URL, and a plan that named more
      // public HTML would go untested while the report still said `ok`.
      expect(htmlPaths.length).toBeGreaterThan(1);

      // This is the first release the fixture server has ever "deployed", so the honest retention fact is just
      // that the candidate's own fingerprinted assets are served — `previous` is genuinely empty, not omitted to
      // dodge history validation. The multi-release retention window (R, R-1, R-2, the 7-day tail) is exercised
      // below, against v1 and v2's real build output, where there actually is a prior release to retain.
      const retention: PwaReleaseRetentionInput = { asOfMs: Date.now(), previous: [], available: await publishedPaths(example, "v1") };

      const observed = await collectHeaders(page, fixtureServer, paths);
      const report = verifyRelease({
        plan,
        published: await publishedPaths(example, "v1"),
        observed,
        baseline: readIdentityBaseline({ directory: BASELINE_DIRECTORY, slot: BASELINE_SLOT }),
        retention,
        htmlObserved: await collectHeaders(page, fixtureServer, htmlPaths),
        workerMimeObserved: observed,
      });

      // Asserted before `ok`, and deliberately: a check whose input is omitted does not appear in the report at
      // all, and `verifyRelease` of nothing is `ok: true`. `ok` says "nothing that ran failed", not "this was
      // verified" — so the first thing to establish is that all six actually ran.
      expect(names(report)).toEqual(["artifacts", "response-headers", "identity-baseline", "release-retention", "html-headers", "worker-mime"]);
      expect(report.diagnostics).toEqual([]);
      expect(report.ok).toBe(true);
    });

    test("a fingerprinted asset served with no-cache fails the header check", async ({ page, fixtureServer }) => {
      const plan = releaseInput(await readShippedWorker(example, "v1"));
      const fingerprinted = plan.precache.filter(({ revision }) => revision === null).map(({ url }) => url);
      expect(fingerprinted.length).toBeGreaterThan(0);

      // The deployment is changed, not the plan and not the check: the assets directory now revalidates like the
      // worker does. This is the header mutation kept as a test, so the check has to keep discriminating.
      fixtureServer.setHeaderRules([
        { pathPrefix: "/app/", headers: { "cache-control": "no-cache" } },
        { pathPrefix: "/app/assets/", headers: { "cache-control": "no-cache" } },
      ]);

      const observed = await collectHeaders(page, fixtureServer, headerPaths(plan));
      const result = verifyResponseHeaders(plan, observed);
      expect(result.ok).toBe(false);
      // Three findings per fingerprinted asset: `immutable` and a positive `max-age` are both missing, and `no-cache`
      // is forbidden.
      expect(result.diagnostics.map(({ code }) => code).sort()).toEqual(
        fingerprinted
          .flatMap(() => ["verify.header-forbidden-directive", "verify.header-missing-directive", "verify.header-missing-directive"])
          .sort(),
      );
    });

    test("a public HTML path served long-cached and immutable fails the html-headers check", async ({ page, fixtureServer }) => {
      const plan = releaseInput(await readShippedWorker(example, "v1"));
      expect(plan.offlineFallback.enabled).toBe(true);
      const offlinePath = plan.offlineFallback.enabled ? plan.offlineFallback.path : "";

      // Real CDN misconfiguration: the offline fallback page starts being served the way a fingerprinted asset is
      // (long `max-age`, `immutable`) instead of revalidating. A stale app shell would then never be replaced, which
      // is exactly what ADR-0032 exists to catch — `response-headers` never looks at this path at all.
      fixtureServer.setHeaderRules([...HEADER_RULES, { pathPrefix: offlinePath, headers: { "cache-control": "public, max-age=31536000, immutable" } }]);

      const observed = await collectHeaders(page, fixtureServer, htmlHeaderPaths(plan));
      const result = verifyHtmlHeaders(plan, observed);
      expect(result.ok).toBe(false);
      // `no-cache` is missing and `immutable` is forbidden: two findings, both against the offline fallback field,
      // since that is the first field that names this path (`plan.identity.mountPath` and `plan.install.startUrl`
      // both point elsewhere for this example).
      expect(result.diagnostics.map(({ code }) => code).sort()).toEqual(
        ["verify.header-forbidden-directive", "verify.header-missing-directive"].sort(),
      );
      expect(result.diagnostics.every(({ path }) => path === "/offlineFallback/path")).toBe(true);
    });

    test("release-retention passes when a recent prior release's fingerprinted assets are still served", async () => {
      // v1 and v2 are two genuinely different builds (global-setup.ts changes the version string between them, so
      // the chunks it touches get new fingerprinted filenames; unchanged chunks keep theirs, see the next test). A real CDN never deletes a prior release's immutable, hashed files
      // when it publishes a new one — only the worker and manifest move on to the new release — so the honest way
      // to test "the current release is deployed and a recent prior release's assets are still served" is to
      // union what each build actually produced on disk, not to invent paths that were never built.
      const current = releaseInput(await readShippedWorker(example, "v2"));
      const priorPlan = releaseInput(await readShippedWorker(example, "v1"));
      const available = [...new Set([...(await publishedPaths(example, "v1")), ...(await publishedPaths(example, "v2"))])];

      const retention: PwaReleaseRetentionInput = {
        asOfMs: Date.now(),
        previous: [{ releasedAtMs: Date.now() - ONE_DAY_MS, plan: priorPlan }],
        available,
      };

      const result = verifyReleaseRetention(current, retention);
      expect(result).toEqual({ name: "release-retention", ok: true, diagnostics: [] });
    });

    test("release-retention fails when a recent prior release's fingerprinted assets are no longer served", async () => {
      // Same candidate and the same prior release record as above, but `available` now reflects only what v2's own
      // build actually contains. Not every v1 fingerprinted filename changes in v2 — a chunk whose content did not
      // change keeps its hash and its filename, exactly like a real deployment — so which of v1's assets are
      // genuinely gone is determined from what v2 actually built, not assumed to be "all of them".
      const current = releaseInput(await readShippedWorker(example, "v2"));
      const priorShipped = await readShippedWorker(example, "v1");
      const priorPlan = releaseInput(priorShipped);
      const priorFingerprinted = priorPlan.precache.filter(({ revision }) => revision === null).map(({ url }) => url);
      expect(priorFingerprinted.length).toBeGreaterThan(0);

      const v2Available = await publishedPaths(example, "v2");
      const stillPresent = new Set(v2Available);
      const genuinelyMissing = priorFingerprinted.filter((url) => !stillPresent.has(url));
      // The mutation this test relies on has to be real: at least one v1 asset must actually be gone from v2's own
      // build, or this "negative" case would trivially pass with zero diagnostics.
      expect(genuinelyMissing.length).toBeGreaterThan(0);

      const retention: PwaReleaseRetentionInput = {
        asOfMs: Date.now(),
        previous: [{ releasedAtMs: Date.now() - ONE_DAY_MS, plan: priorPlan }],
        available: v2Available,
      };

      const result = verifyReleaseRetention(current, retention);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map(({ code }) => code)).toEqual(genuinelyMissing.map(() => "verify.retention-missing"));
      expect(result.diagnostics.every(({ path }) => path.startsWith("/retention/previous/0/precache/"))).toBe(true);
    });

    test("the build fails when an artifact the plan precaches is not published", async () => {
      // `verifyArtifacts` runs inside the plugin at the end of every build, so a passing build already carries the
      // artifact check. This is what proves that claim: drop one published asset and the build has to refuse.
      //
      // The control build runs first. Without it a rejection below would only say "this build failed", and a
      // configuration that never builds at all would read exactly like a working check.
      await runBuild(example, []);
      await expect(runBuild(example, [dropOnePublishedAsset()])).rejects.toThrow(
        /does not contain everything the plan requires: verify\.artifact-missing at \/precache\/\d+\/url/,
      );
    });
  });
}

/**
 * Removes one fingerprinted asset from the bundle the plugin inspects.
 *
 * The pwa plugin is `enforce: "post"`, so this one — with no enforce — reaches `writeBundle` first and the plugin
 * sees a bundle that no longer lists the asset its plan precaches. That is the situation its error message
 * describes: the plan is compiled from this build, so a missing artifact means something removed it afterwards.
 */
function dropOnePublishedAsset(): Plugin {
  return {
    name: "drop-one-published-asset",
    apply: "build",
    writeBundle(_options, bundle) {
      const asset = Object.keys(bundle).find((fileName) => /^assets\/.*\.js$/.test(fileName));
      if (asset === undefined) throw new Error("No fingerprinted asset in the bundle; the mutation would be a no-op");
      Reflect.deleteProperty(bundle, asset);
    },
  };
}

/** Builds the example from its own config into a throwaway directory, with extra plugins if any. */
async function runBuild(example: ExampleName, plugins: readonly Plugin[]): Promise<void> {
  await build({
    configFile: join(exampleRoot(example), "vite.config.ts"),
    logLevel: "silent",
    plugins: [...plugins],
    build: {
      outDir: fileURLToPath(new URL(`../browser-build/${example}/artifact-check/app/`, import.meta.url)),
      emptyOutDir: true,
    },
  });
}
