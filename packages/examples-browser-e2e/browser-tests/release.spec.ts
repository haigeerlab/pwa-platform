// The three build-verifier checks, run against what the examples actually built and what the server actually serves.
import {
  readIdentityBaseline,
  verifyRelease,
  verifyResponseHeaders,
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
  publishedPaths,
  readShippedWorker,
  releaseInput,
} from "./release.js";
import { EXAMPLES, exampleRoot, fixtureSite, type ExampleName } from "./sites.js";

const names = (report: PwaVerificationReport): string[] => report.checks.map(({ name }) => name);

for (const example of EXAMPLES) {
  test.describe(`${example} example · release checks`, () => {
    test.use({ fixtureSite: fixtureSite(example) });

    test("the release report covers all three checks and passes", async ({ page, fixtureServer }) => {
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

      const report = verifyRelease({
        plan,
        published: await publishedPaths(example, "v1"),
        observed: await collectHeaders(page, fixtureServer, paths),
        baseline: readIdentityBaseline({ directory: BASELINE_DIRECTORY, slot: BASELINE_SLOT }),
      });

      // Asserted before `ok`, and deliberately: a check whose input is omitted does not appear in the report at
      // all, and `verifyRelease` of nothing is `ok: true`. `ok` says "nothing that ran failed", not "this was
      // verified" — so the first thing to establish is that all three actually ran.
      expect(names(report)).toEqual(["artifacts", "response-headers", "identity-baseline"]);
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
