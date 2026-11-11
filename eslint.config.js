import eslint from "@eslint/js";
import compat from "eslint-plugin-compat";
import tseslint from "typescript-eslint";
import { BROWSER_SOURCE, BUILD_TIME_SOURCE, RESTRICTED_PROPERTIES } from "./scripts/browser-baseline.mjs";

// Browser floor lint layer (ADR-0053): code that runs in a page or worker is checked against .browserslistrc.
const browserSource = Object.entries(BROWSER_SOURCE).flatMap(([name, dirs]) => dirs.map((dir) => `packages/${name}/${dir}/**/*.ts`));
const buildTimeSource = Object.entries(BUILD_TIME_SOURCE).flatMap(([name, dirs]) => dirs.map((dir) => `packages/${name}/${dir}/**`));

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "**/browser-build/**", "build/cloudflare/**", "**/.nuxt/**", "**/.output/**", "website/.vitepress/cache/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Browser-side fixtures served by the browser test harness (service worker scripts), plus @pwa-platform/push's
    // own minimal classic-worker fixture site (T7, tasks/push-module/plan.md) which is not bundled and so needs the
    // same worker globals declared directly.
    files: ["packages/browser-test-harness/fixtures/**/*.js", "packages/push/browser-tests/site/**/*.js"],
    languageOptions: {
      globals: {
        self: "readonly",
        clients: "readonly",
        caches: "readonly",
        fetch: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        AbortSignal: "readonly",
      },
    },
  },
  {
    files: ["packages/sw-runtime/browser-tests/phone-probe/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    ...compat.configs["flat/recommended"],
    files: browserSource,
    ignores: buildTimeSource,
    // The plugin's own browser globals would hide undefined-variable mistakes in worker code; TypeScript already
    // checks names, so only the compat rule is taken from the preset.
    languageOptions: {},
  },
  {
    files: browserSource,
    ignores: buildTimeSource,
    rules: {
      "no-restricted-properties": ["error", ...RESTRICTED_PROPERTIES],
    },
  },
);
