// Captures the PwaPlan the platform plugin (`@pwa-platform/vite`) compiled for a Cloudflare test-deployment build,
// so `scripts/build-cloudflare-site.mjs` can merge it into the build receipt's `plan` field — see
// spec/cloudflare-test-deployment.md's "修订：线上发布事实采集与机器发布门禁" → "契约增量 → 构建时保存计划".
//
// Shared between apps/react/vite.config.ts and apps/vue/vite.config.ts, and a strict no-op unless
// PWA_PLATFORM_CF_PLAN_OUT is set, so local E2E builds (which never set it) are unaffected.
import { writeFileSync } from "node:fs";
import { PWA_PLUGIN_NAME, type PwaPluginApi } from "@pwa-platform/vite";
import type { Plugin, ResolvedConfig } from "vite";

/**
 * Creates the plan-capture plugin.
 *
 * Follows the same lookup pattern as `@pwa-platform/entry-resilience`'s Vite plugin (`packages/entry-resilience/
 * src/vite/index.ts`): find the platform plugin by `PWA_PLUGIN_NAME` off the resolved config in `configResolved`,
 * then read its plan in `writeBundle` — by then every plugin's `generateBundle` has already run, regardless of
 * plugin order, so the plan is always ready to read there (see `packages/vite/test/plan-api.test.ts`).
 */
export function cloudflarePlanCapture(): Plugin {
  const planOutPath = process.env.PWA_PLATFORM_CF_PLAN_OUT;
  // No env var: do nothing at all, not even register hooks that could observe the build.
  if (planOutPath === undefined) return { name: "cloudflare-plan-capture", apply: "build" };

  let resolvedConfig: ResolvedConfig | undefined;

  return {
    name: "cloudflare-plan-capture",
    apply: "build",

    configResolved(config) {
      resolvedConfig = config;
    },

    writeBundle() {
      const platformPlugin = resolvedConfig?.plugins.find((plugin) => plugin.name === PWA_PLUGIN_NAME);
      if (platformPlugin === undefined) {
        throw new Error(
          "cloudflare-plan-capture: PWA_PLATFORM_CF_PLAN_OUT is set but no @pwa-platform/vite pwa() plugin was found in this config",
        );
      }
      const api = platformPlugin.api as PwaPluginApi | undefined;
      const plan = api?.getPlan() ?? null;
      if (plan === null) {
        throw new Error(
          "cloudflare-plan-capture: the platform plugin produced no plan for this build (compilation likely failed before generateBundle)",
        );
      }
      writeFileSync(planOutPath, JSON.stringify(plan, null, 2) + "\n");
    },
  };
}
