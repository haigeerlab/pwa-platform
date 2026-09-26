# Changelog

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
