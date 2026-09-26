---
name: pwa-vite5-vue-integration
description: 将现有 Vite 5 + Vue 3.4、vite-plugin-pwa 业务应用接入 PWA Platform。准备或执行宿主迁移、核对构建 CSS、worker 和更新流程时使用；不用于开发平台包。
---

# Vite 5 + Vue 3.4 host integration

This skill is for an AI working **inside the business application's repository**. It does not certify that application from the PWA Platform repository. If the platform repository is available, read `docs/guides/vite5-vue34-host-integration.md` before editing; this skill remains usable when copied alone.

## Version gate

- Read the installed `@pwa-platform/vite` and `@pwa-platform/vue` package metadata. Use the fixed, published `0.1.0-beta.2` for both: it declares Vite 5 support and includes `./ui` and `./update-notice.css`. The npm `latest` tag still points to beta.1, so specify beta.2 explicitly. Do not mix platform package versions.
- Keep the host's Vite 5, Vue 3.4, Vue Router and Vuex versions unless a concrete incompatibility is reproduced. Confirm the exact Node, pnpm, TypeScript, and `tsconfig` settings in the real repo. Do not infer compatibility from a peer range alone.

## Inspect before changing

1. Read the host's `AGENTS.md`/project rules, package manifest, lock, `vite.config.ts`, `tsconfig`, app entry and deployment settings.
2. Search for `VitePWA`, `virtual:pwa-register`, `registerSW`, `navigator.serviceWorker`, `sw.ts`, manifest links and existing update UI. Read the old worker for behavior the business still needs. Confirm whether any environment ever registered it; a claim that a project is not live is not proof about an arbitrary copy.
3. Determine the final HTTPS origin, `base`, worker scope, public app shell, icons, same-origin private API prefixes and build asset directory. Set identity from those facts before first production registration. If origin or scope is still unknown, prepare the change but do not claim deployment readiness.

## Implement in the host

- Remove the old PWA plugin and registration path so there is one worker and one manifest. Remove old `sw.ts` and direct Workbox dependencies only after confirming they have no other users. Preserve unrelated Vue Router, Vuex and business configuration.
- Add `@pwa-platform/vite`, `@pwa-platform/vue`, and contract types at one fixed supported release. Configure `pwa({ identity, install, policy, topology, offlinePage: {} })` with `base`, `scope`, `mountPath` and generated URLs aligned. Derive the asset rule from the host's actual `base` and `assetsDir`; also account for `index.html` and the generated offline page. If another app shares the origin under a child path, use the shared-origin registry in both builds. Declare private or mutation API prefixes as non-cacheable. Never cache personalized data by a broad public rule.
- Keep the host's build plugins. If bundle obfuscation runs at `enforce: "post"`, put `pwa()` after it in that group and use a stable obfuscation seed. If the host generates a version code from the current clock, hold that input constant for reproducibility checks or replace it with a deliberate release ID. Never solve same-URL/different-byte output by disabling file fingerprints.
- If PurgeCSS scans only the host's `.vue` files, retain `/^pwa-update-notice/` in its safelist. If emitted CSS is invalid, compare builds with and without PurgeCSS to isolate the host plugin; do not suppress the failure or assert that PWA Platform caused it without evidence.
- Install Vue's `createPwa({ config, updateCheck: { intervalMs: ... } })` from `virtual:pwa-config`; add the `@pwa-platform/vite/virtual` type reference without replacing other TS types. Register only in the production app, after mount. Long-lived pages should explicitly enable update checking.
- Mount `PwaUpdateNotice` only if the app wants the default UI, and import its CSS. Its `colors` prop accepts `primaryButtonBackground`, `primaryButtonText`, `surface`, `text`, `mutedText` and `border`; `position` and `messages` are also configurable. Use `reloadPage` when business state needs an unsaved-work guard. Applying a worker update and refreshing the current page are separate user actions. Do not reintroduce automatic skip-waiting or reload.

## Verify and report

1. Run the host's install, typecheck and production build with its actual Node/pnpm versions. `vite dev` should show the ordinary app without a registered platform worker; use `vite build` plus `vite preview` or target HTTPS for PWA checks.
2. With source and release inputs held constant, build twice and compare SHA-256 for every same-named JS/CSS output. Then change application code that enters the precache and confirm the worker changes. Inspect emitted CSS for the update notice and make sure the final manifest, worker and precache paths match the served site.
3. In a real browser, verify first registration, offline reopening after clearing HTTP cache, waiting update, “稍后”, confirmed takeover, explicit reload and two tabs. Inspect Cache Storage for private responses. In the real deployment, verify worker/manifest response headers, old asset retention, first identity baseline and recovery path.
4. Report exact files changed, commands and browser observations. Separate passed checks from unrun checks. If package release, private repository access, a valid CSS build, deterministic assets or deployment facts are missing, state the specific blocker; never substitute the platform's isolated fixture results for host acceptance.
