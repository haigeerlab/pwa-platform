# Changelog

## Unreleased

## 0.2.2 (2026-09-28)

Patch release: upgrade all ten `@pwa-platform/*` packages together. No public API or configuration change; only `@pwa-platform/client-runtime`'s registration and update announcement behave differently on return visits. Check the second entry below if your code relied on `register()` rejecting when a return visit's background script fetch fails.

- **An update already installing on a return visit is announced (review follow-up N1, ADR-0043):** since the R9 change the facade can adopt an existing registration while a navigation-triggered update is still installing, after that update's `updatefound` has fired. The facade now also watches the registration's `installing` worker when it starts observing, and emits `update-waiting` once it is installed, so the prompt is no longer lost for that page's lifetime. Uncontrolled pages are still not told.
- **Return visits report `registered` without waiting behind a stalled update (review risk R9, ADR-0043):** `@pwa-platform/client-runtime`'s `register()` now looks up the browser's existing registration first; when it has exactly this scope and an activated worker running `serviceWorkerUrl`, the facade emits `registered` and resolves at once, leaving the browser's `register()` running in the background. Previously `register()` waited for the browser's `register()`, which the Service Worker job queue holds behind any in-flight update, so a page whose update check was stuck on a stalled `sw.js` request (iPhone right after the network returns) showed "not registered" although a worker was active and controlling it. First visits are unchanged. A background `register()` failure on a return visit is no longer reported by `register()`; use `checkForUpdate()` to detect an unavailable worker script.

## 0.2.1 (2026-09-28)

Patch release: upgrade all ten `@pwa-platform/*` packages together. No public API or configuration change; only `@pwa-platform/sw-runtime`'s recovery worker behaves differently.

- **Recovery worker keeps deleting after a failure (review #15):** a cache or offline-write database deletion that fails no longer stops the rest of recovery's cleanup. Every deletion is attempted; if any failed, activation still rejects before cancelling the push subscription and claiming clients, as before. Previously the first failure left every later cache and the queued-write database in place until the next deployment, because `activate` runs only once. Note that pages the broken worker already controlled are taken over at activation either way; only uncontrolled pages stay unclaimed.

## 0.2.0 (2026-09-28)

Upgrade all ten `@pwa-platform/*` packages together. `^0.1.0` ranges do not pick this version up automatically: two checks below can fail a build that passed on 0.1.0.

**Before upgrading, check:**
- **Manifest icons.** Every primary install icon must exist, carry a PNG/JPEG/WebP signature matching its `type`, and have intrinsic dimensions matching its `sizes` (`vite.manifest-icon-*` diagnostics).
- **Identity scope.** `scope` must equal the directory of `serviceWorkerUrl` (`identity.scope-outside-worker-directory`). Browsers refuse a wider scope unless the worker script is served with a `Service-Worker-Allowed` header, which the platform never sets. *Corrected 2026-09-28:* this entry first said only never-working configurations were affected; a deployment that added that header itself did register, and now fails the build. Its identity cannot simply be edited (identities are immutable once registered in production), so move it to a new identity with a migration plan, as for any identity change.

- **Quota-error cleanup covers every runtime cache (review risk R12):** a `QuotaExceededError` now clears both the pages and current-digest data runtime caches even when this worker's lifetime lazily built an engine for only one of them. Previously the cleanup relied entirely on each `ExpirationPlugin` instance's own `purgeOnQuotaError`, which Workbox only registers once that instance's engine is actually constructed; `@pwa-platform/sw-runtime` builds its runtime-cache engines on demand, per matching rule, so a cache whose rule was never hit in this worker's lifetime kept its stale entries after a quota error. `@pwa-platform/engine-workbox` now exports `registerRuntimeCacheQuotaCleanup`, registered once at worker startup independently of which engines get built, no public API change to `PwaRuntimeCacheEngineOptions`.
- **Built-in update notice locale:** Vue and React's `PwaUpdateNotice` accept an optional `locale?: "zh-CN" | "en"` (default `"zh-CN"`), matching the built-in Chinese and English tables the offline and entry recovery pages already offer. `messages` still overrides individual keys on top of the selected locale's built-in copy. Not passing `locale` keeps prior behavior unchanged.
- **Release gate:** `@pwa-platform/build-verifier` exports `requiredReleaseChecks(plan)`, returning the release orchestration protocol's machine-required checks for the plan's topology, so callers pass it to `verifyReleaseGateCoverage` instead of hand-writing the list.
- **Runtime cache diagnostics:** when a response is not admitted to the public-read runtime cache, the platform worker now reports the reason and path once per cache and reason with `console.warn`, so silent rejections (for example `Vary: Origin` added by `vite preview`) can be diagnosed.
- **Identity scope check:** `@pwa-platform/contracts` rejects an identity whose `scope` is wider than the directory of its `serviceWorkerUrl` (`identity.scope-outside-worker-directory`). Browsers refuse such a registration; the build now fails instead.
- **Runtime cache:** a navigation carrying an `Authorization` header is no longer written to the pages runtime cache, matching the public-read cache contract.
- **Install icon validation:** `@pwa-platform/vite` now fails production builds when a primary manifest icon is missing, has a PNG/JPEG/WebP signature that disagrees with `type`, has an unreadable header, or has intrinsic dimensions that disagree with `sizes`. Unsupported image types emit an explicit warning instead of being reported as validated.
- **Android install fixture:** the Vite browser fixture now ships real 192×192 and 512×512 `any`/`maskable` icons and a mobile viewport, fixing Android Chrome's “unable to install” result.
- **Offline-write flush single-flight (review risk R5):** `@pwa-platform/sw-runtime` now single-flights concurrent `pwa:offline-write:flush` messages for the same session binding inside the worker, so two tabs (or a double click) flushing at once can no longer POST the same idempotency key twice. `@pwa-platform/offline-write` is not yet published to npm; this is an internal worker fix with no public API change.

## 0.1.0 (2026-09-26)

First stable npm package set for Vite applications using Vue 3.4+ or React 19.2+. The ten published packages include the new `@pwa-platform/entry-resilience`. Upgrade all `@pwa-platform/*` packages together.

- **Vite 5 and 8:** Node 22+ consumers can build the platform worker, manifest and optional offline and entry recovery pages. `vite dev` resolves page configuration; install and offline behavior still require a production build and HTTPS deployment.
- **User controlled updates:** Vue and React provide optional update notices with four positions, message and color overrides, and a host reload callback. Updating the worker leaves the current page in place until the user chooses to reload.
- **Offline fallback:** The optional Chinese or English default page stays readable on narrow screens. Its retry button reloads on request, and a same origin network probe also reloads after connectivity returns, including on iPhone when `online` events are absent or premature.
- **Entry recovery:** The public optional package accepts bounded, validated manifests for alternative entries. The recovery page never redirects until the user selects an entry.

Package publication does not certify any adopting application's deployment. The `desktop` release channel requires Chrome desktop N and N-1 evidence for that application; Android is outside that channel until its separate release gate passes.

## 0.1.0-beta.2 (2026-09-26)

Third npm prerelease of the same nine packages. This release supports existing Vite 5 + Vue 3.4 applications while retaining the Vite 8 path. Upgrade all `@pwa-platform/*` packages together. The published `next` tag points to this version; `latest` remains on beta.1.

- **Vite 5 compatibility:** `@pwa-platform/vite` declares `vite: ^5.0.0 || ^8.0.0` and `node: >=22.0.0`. Independent Vite 5 and Vite 8 consumers cover development, production builds and generated PWA assets. The virtual configuration module is available during `vite dev`; its type-only export is available at `@pwa-platform/vite/virtual`.
- **Optional update notice:** Vue and React expose `PwaUpdateNotice` from their separate `./ui` entry and styles from `./update-notice.css`. Mounting it opts in to a small update card with four positions, message overrides and configurable colors, including the primary button background and text. The host can supply a `reloadPage` callback; the component does not refresh automatically. Brief waiting signals are ignored to avoid a false completion prompt during worker recovery. Existing root imports do not load the UI or its CSS.
- **Build output check:** the Vite adapter rechecks the recorded bundle entries in `writeBundle` and fails if a later plugin changed their bytes after the PWA plan was compiled.

This release does not include the private Nuxt, Push, offline-write or entry-resilience packages. It does not establish production readiness for an adopting application; that application's deployment, cache headers, update flow and recovery still need validation.

## 0.1.0-beta.1 (2026-09-24)

Second npm prerelease of the same nine `@pwa-platform/*` packages. Everything below is opt-in: an application that changes nothing gets the same policy, compiled plan and injected worker configuration as with `0.1.0-beta.0`, although the platform worker and page scripts themselves change with the platform code.

- **Public read runtime cache** (`PwaPolicy` v3, ADR-0035): same-origin public `GET` data and dynamic pages can use `network-first` or `stale-while-revalidate` runtime caching, with admission rules, quotas, expiry, cleanup on activation, logout and recovery, and a `served-from-cache` page event.
- **Default offline page** (`pwa({ offlinePage })`, ADR-0036): the Vite plugin can emit a styled offline fallback page at `offlineFallback.path`, localized at build time (`zh-CN`, `en`), themeable through CSS variables, with logged CSP hashes.
- **Manifest extension fields** (ADR-0037): install metadata accepts `description`, `categories`, `orientation`, `displayOverride`, `screenshots` and `shortcuts`; referenced screenshot and shortcut icon files must be in the build, and Chrome's screenshot preferences are reported as warnings.
- **Network timeout** (`networkTimeoutSeconds`, ADR-0038): a navigation that gets no response in time uses the existing offline fallbacks, and network-first runtime caching serves the cache with a new `network-timeout` reason.
- Navigation fallback ignores the query string (ADR-0034); `build-verifier` adds an `html-headers` check for public HTML responses (ADR-0032).

Contract changes are additive (optional fields, new diagnostic codes, a new `served-from-cache` reason). Upgrade all `@pwa-platform/*` packages together: a plan that uses new fields cannot be validated by older packages. `latest` is moved to this version, so an unversioned install gets this beta; it still does not indicate production readiness.

## 0.1.0-beta.0 (2026-09-20)

First npm prerelease candidate for Vite applications using Vue 3 or React 19. Includes manifest generation, static precaching, an offline fallback page, controlled service worker updates, and build verification. Business API runtime caching, private data caching, Push, and offline writes are outside this release. Native installation and Android production evidence are still required before a stable release.

Published nine `@pwa-platform/*` packages to npm. Both `next` and the registry-created `latest` currently point to this beta; `latest` does not indicate production readiness.
