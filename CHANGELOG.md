# Changelog

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
