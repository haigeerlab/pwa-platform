import { fileURLToPath } from "node:url";
import type { PwaIdentity, PwaOriginRegistry, PwaPolicy, PwaTopology } from "@pwa-platform/contracts";
import type { FixtureServerOptions } from "@pwa-platform/browser-test-harness";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** The two fixture applications the plugin builds; nothing here is a hand-placed artifact. */
export const ROOT_APP_ROOT: string = here("./shared-origin-root-app/");
export const CHILD_APP_ROOT: string = here("./shared-origin-child-app/");

/** Git-ignored output of shared-origin-global-setup.ts. */
export const BUILD_ROOT: string = here("../browser-build/shared-origin/");
/** Root at the site root, child under `/m/`: the merged origin every "normal" scenario serves. */
export const SHARED_ROOT: string = here("../browser-build/shared-origin/shared/");
/** Same root build; `/m/` is a plain page with no worker — the child app was never deployed. */
export const ROOT_ONLY_ROOT: string = here("../browser-build/shared-origin/root-only/");
/**
 * Mutation-only fixture: the root built with `topology: { kind: "standalone-origin" }`, so it carries no exclude
 * rule for `/m`. Built once here, alongside everything else, and swapped in only while a mutation is being run
 * (T7's scenarios 3 and 4) — the merged site itself is never asserted "correct" by any passing test.
 */
export const STANDALONE_ROOT: string = here("../browser-build/shared-origin/standalone-root-mutation/");
/** The `shared` build with the root's own recovery worker published at the root's service worker URL. */
export const ROOT_RECOVERY_ROOT: string = here("../browser-build/shared-origin/root-recovery/");
/** The `shared` build with the child's own recovery worker published at the child's service worker URL. */
export const CHILD_RECOVERY_ROOT: string = here("../browser-build/shared-origin/child-recovery/");
/**
 * Mutation-only fixture: the `shared` build with the *child's* recovery worker published at the *root's* service
 * worker URL, so the recovery that takes over the root page deletes the child's caches instead of the root's.
 */
export const ROOT_RECOVERY_MUTATED_ROOT: string = here("../browser-build/shared-origin/root-recovery-mutated/");

export const ORIGIN = "https://shared-origin-fixture.example.com";

export const ROOT_SHELL_URL = "/";
export const ROOT_WORKER_URL = "/sw.js";
export const ROOT_OFFLINE_URL = "/offline.html";
export const ROOT_RECOVERY_WORKER_URL = "/pwa-recovery-worker.js";

export const CHILD_SHELL_URL = "/m/";
export const CHILD_WORKER_URL = "/m/sw.js";
export const CHILD_OFFLINE_URL = "/m/offline.html";
export const CHILD_RECOVERY_WORKER_URL = "/m/pwa-recovery-worker.js";

/** A route under the child's scope that neither app precaches; the fixture server itself can answer it. */
export const CHILD_SERVER_JSON_URL = "/m/some.json";
/**
 * Built as part of the ROOT app's own output (`shared-origin-root-app/public/m/root-leftover.json`), yet it falls
 * under the child's scope — exactly the "host build output happens to contain a file inside a child scope" case
 * design §3 and T3/T6 test at compile time. Proves the same holds end to end: the root's precache never claims it
 * (T7 scenario 3), even though it is a real file the root app built.
 */
export const ROOT_LEFTOVER_URL = "/m/root-leftover.json";
/** A child route no version precaches, used to exercise the child's offline fallback. */
export const CHILD_UNKNOWN_ROUTE_URL = "/m/never-visited";

export const ROOT_IDENTITY: PwaIdentity = {
  appId: "sorigin-root",
  manifestId: "/",
  origin: ORIGIN,
  scope: ROOT_SHELL_URL,
  serviceWorkerUrl: ROOT_WORKER_URL,
  manifestUrl: "/manifest.webmanifest",
  mountPath: "/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

export const CHILD_IDENTITY: PwaIdentity = {
  appId: "sorigin-child",
  manifestId: "/m/",
  origin: ORIGIN,
  scope: CHILD_SHELL_URL,
  serviceWorkerUrl: CHILD_WORKER_URL,
  manifestUrl: "/m/manifest.webmanifest",
  mountPath: "/m",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

/** A different child, used only to build a root plan that does not list this fixture's real child (scenario 6). */
const OTHER_CHILD_IDENTITY: PwaIdentity = {
  ...CHILD_IDENTITY,
  appId: "sorigin-other-child",
  manifestId: "/other/",
  scope: "/other/",
  serviceWorkerUrl: "/other/sw.js",
  manifestUrl: "/other/manifest.webmanifest",
  mountPath: "/other",
};

function registryEntry(identity: PwaIdentity): PwaOriginRegistry["root"] {
  const { appId, scope, serviceWorkerUrl, manifestId, manifestUrl } = identity;
  return { appId, scope, serviceWorkerUrl, manifestId, manifestUrl };
}

/** The registry this fixture's two real apps are built against. */
export const REGISTRY: PwaOriginRegistry = {
  schemaVersion: 1,
  registryVersion: 1,
  origin: ORIGIN,
  environment: "production",
  root: registryEntry(ROOT_IDENTITY),
  children: [registryEntry(CHILD_IDENTITY)],
};

/**
 * A registry whose only child is a different scope (`/other/`, not `/m/`). A root built against this registry
 * excludes `/other`, not `/m` — so its plan is a legitimate `shared-origin` root plan that nonetheless fails the
 * release-order check for this fixture's child (scenario 6's negative case).
 */
export const REGISTRY_WITHOUT_CHILD: PwaOriginRegistry = {
  ...REGISTRY,
  children: [registryEntry(OTHER_CHILD_IDENTITY)],
};

export const ROOT_TOPOLOGY: PwaTopology = { kind: "shared-origin", registry: REGISTRY };
export const CHILD_TOPOLOGY: PwaTopology = { kind: "shared-origin", registry: REGISTRY };
/** Mutation-only: a root with no registry at all, so it generates no exclude rule for `/m`. */
export const STANDALONE_TOPOLOGY: PwaTopology = { kind: "standalone-origin" };
export const TOPOLOGY_WITHOUT_CHILD: PwaTopology = { kind: "shared-origin", registry: REGISTRY_WITHOUT_CHILD };

/**
 * Shared by both apps: paths are mount-relative, resolved by `compilePlan` against each identity's `mountPath`.
 * Install stays disabled so each app ships a hand-written manifest from its own public directory (no icons needed).
 *
 * The root's catch-all `/` rule is classified `asset`, not `navigation-public-static` (worker navigation handling
 * does not key off `resourceClass` at all — only whether the matched rule's action is `deny`/`exclude`, per
 * `sw-runtime`'s decision table), specifically so it is a broad-but-legitimate precache source that *would* also
 * pick up a file under the child's scope if the compiler's child-scope filter (design §3, T3/T6) did not exist —
 * design §3 explicitly allows a broader rule that merely contains a child scope, distinct from a rule that targets
 * one. That is what makes `root-leftover.json` (T7 scenario 3) a meaningful end-to-end proof rather than a file the
 * compiler would never have precached anyway. The child's own `/` rule is left as `navigation-public-static`,
 * unaffected: only the root needs this to test the filter that only the root exercises.
 */
function policy(rootCatchAllClass: "navigation-public-static" | "asset" = "navigation-public-static"): PwaPolicy {
  return {
    schemaVersion: 1,
    install: { enabled: false },
    offlineFallback: { enabled: true, path: "/offline.html" },
    updateMode: "prompt",
    resources: [
      { pathPrefix: "/", resourceClass: rootCatchAllClass, cache: "network-first" },
      { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
      { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
      { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
    ],
  };
}

export const ROOT_POLICY: PwaPolicy = policy("asset");
export const CHILD_POLICY: PwaPolicy = policy();

/** Every built variant, served by one fixture server; a test switches with `fixtureServer.deploy(name)`. */
export const SHARED_ORIGIN_SITE: FixtureServerOptions = {
  versions: {
    shared: SHARED_ROOT,
    "root-only": ROOT_ONLY_ROOT,
    "standalone-root": STANDALONE_ROOT,
    "root-recovery": ROOT_RECOVERY_ROOT,
    "child-recovery": CHILD_RECOVERY_ROOT,
    "root-recovery-mutated": ROOT_RECOVERY_MUTATED_ROOT,
  },
  initialVersion: "shared",
};

/** Created directly (not by either app) as the recovery scenario's "belongs to neither app" control cache. */
export const UNRELATED_CACHE_NAME = "shared-origin-fixture-unrelated-cache";

/** The `/m/` page served by the root-only site: a plain page, no worker, no manifest — the child was never shipped. */
export const PLAIN_CHILD_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>shared-origin fixture · child (unshipped)</title>
  </head>
  <body>
    <p id="child-marker">child content, served with no worker installed</p>
  </body>
</html>
`;
