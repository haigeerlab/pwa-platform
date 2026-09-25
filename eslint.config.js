import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

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
      },
    },
  },
);
