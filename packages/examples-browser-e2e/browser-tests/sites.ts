import { fileURLToPath } from "node:url";
import type { FixtureServerOptions, HeaderRule } from "@pwa-platform/browser-test-harness";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export type ExampleName = "vue" | "react";

export const EXAMPLES: readonly ExampleName[] = ["vue", "react"];

/** The site versions each example is built into. See the spec's "站点版本与部署模拟". */
export const VERSIONS = ["v1", "v2", "recovery"] as const;
export type VersionName = (typeof VERSIONS)[number];

/** Git-ignored output of global-setup.ts. */
export const BUILD_ROOT: string = here("../browser-build/");

export function exampleRoot(example: ExampleName): string {
  return here(`../apps/${example}/`);
}

/** Served as the site root while that version is deployed. */
export function siteRoot(example: ExampleName, version: VersionName): string {
  return here(`../browser-build/${example}/${version}/`);
}

/**
 * Where a version's build output lands: the site root plus the mount path. The fixture server serves the site root,
 * while the identity mounts the app at /app/, so the output must sit one level down or every /app/... URL 404s.
 */
export function buildOut(example: ExampleName, version: VersionName): string {
  return here(`../browser-build/${example}/${version}/app/`);
}

/**
 * The release runbook's header baseline (docs/architecture/lifecycle.md): the worker, the manifest and HTML
 * revalidate; fingerprinted assets are immutable and long-cached. Later rules override earlier ones.
 */
export const HEADER_RULES: readonly HeaderRule[] = [
  { pathPrefix: "/app/", headers: { "cache-control": "no-cache" } },
  { pathPrefix: "/app/assets/", headers: { "cache-control": "public, max-age=31536000, immutable" } },
];

export function fixtureSite(example: ExampleName): FixtureServerOptions {
  return {
    versions: {
      v1: siteRoot(example, "v1"),
      v2: siteRoot(example, "v2"),
      recovery: siteRoot(example, "recovery"),
    },
    initialVersion: "v1",
    headerRules: HEADER_RULES,
  };
}
