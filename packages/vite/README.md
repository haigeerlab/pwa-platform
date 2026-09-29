# @pwa-platform/vite

Production build integration for PWA Platform. The `pwa()` plugin validates the application identity and policy,
compiles the cache plan, injects the manifest link, exposes `virtual:pwa-config`, and emits the web app manifest,
platform worker, recovery worker and optional offline page. It supports Vite 5 and Vite 8 on Node.js 22 or later.

## Install

```sh
npm install @pwa-platform/vite @pwa-platform/contracts
```

## Onboarding skill

The package ships a short AI-assistant checklist, `skills/pwa-onboarding/SKILL.md` (one Markdown file; no runtime code). It does not restate the docs; it tells an assistant the few rules that are easy to get wrong: check feasibility first, never delete anything without your explicit yes, read the identity fields out before writing them, confirm public-cache rules per interface, and leave deploying and switching the worker to you.

It is not in the published 0.2.3. Check that `node_modules/@pwa-platform/vite/skills/pwa-onboarding` exists, then copy it to the directory your assistant reads:

```sh
# Claude Code (invoke with /pwa-onboarding)
mkdir -p .claude/skills && cp -R node_modules/@pwa-platform/vite/skills/pwa-onboarding .claude/skills/pwa-onboarding
# Codex (invoke with $pwa-onboarding)
mkdir -p .agents/skills && cp -R node_modules/@pwa-platform/vite/skills/pwa-onboarding .agents/skills/pwa-onboarding
```

Never copy it into `public/`, `src/` or `dist/`. Its `metadata.version` matches the package version, so copy it again after upgrading. The documentation site is Chinese only.

## Configure Vite

```ts
// vite.config.ts
import type { PwaIdentity, PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";

const identity: PwaIdentity = {
  appId: "exampleapp",
  manifestId: "/app/",
  origin: "https://app.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  networkTimeoutSeconds: 5,
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
  ],
};

const install: PwaInstallMetadata = {
  startUrl: "/app/",
  display: "standalone",
  name: "Example App",
  shortName: "Example",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export default defineConfig({
  base: "/app/",
  plugins: [
    pwa({
      identity,
      policy,
      install,
      topology: { kind: "standalone-origin" },
      offlinePage: { locale: "zh-CN" },
    }),
  ],
});
```

Paths inside `policy.resources` and `offlineFallback.path` are mount-relative: with `mountPath: "/app/"`,
`"/offline.html"` is published as `/app/offline.html`. Identity and install URLs are origin paths and already
include the mount path. `offlinePage` accepts `locale: "zh-CN" | "en"`, partial `messages` and appended `css`; it
requires `policy.offlineFallback.enabled` and is omitted entirely when the option is absent.

`networkTimeoutSeconds` is optional for backward compatibility, but production applications using
`network-first` navigation should choose it explicitly. Without it, the worker waits for the browser's own network
failure signal before using a cached shell or offline page; one iPhone offline cold-launch test took about 60 seconds,
while `5` reduced the same path to about 5 seconds. Start at 5 seconds, then tune and retest on the devices you support.

Add the virtual-module declaration to the application TypeScript configuration:

```json
{
  "compilerOptions": {
    "types": ["@pwa-platform/vite/virtual"]
  }
}
```

Then pass the generated config to a framework binding or the client facade:

```ts
import config from "virtual:pwa-config";
import { createPwaClient } from "@pwa-platform/client-runtime";

const client = createPwaClient({ config });
if (import.meta.env.PROD) await client.register();
```

Install `@pwa-platform/client-runtime` explicitly when using that direct example. Vue and React applications should
instead install their framework binding, which owns the client facade for the application lifetime.

## Options and outputs

| Option | Meaning |
| --- | --- |
| `identity` | Immutable app id, origin, mount, scope, manifest URL, worker URL, environment and cache namespace seed. |
| `policy` | Install flag, update mode, offline fallback, timeout, precache rules and optional explicit runtime-cache/offline-write rules. |
| `install` | Manifest metadata. Pass `null` for an application that must not be installable; no manifest is emitted. |
| `topology` | `{ kind: "standalone-origin" }` or a validated shared-origin registry. |
| `offlinePage` | Opt-in platform offline page with build-time locale, copy and CSS overrides. |

Production builds emit only artifacts justified by these options. Development mode provides the virtual config
for application startup but does not provide a production-equivalent worker or precache; validate offline behavior
from a served production build.

The root entry also exports `buildPwaArtifacts()` and `assertPwaArtifacts()` for nonstandard build orchestration,
plus `PWA_PLUGIN_NAME` and option/artifact types. `@pwa-platform/vite/virtual` is type-only.

## Build and deployment rules

- Keep `pwa()` after plugins that change final JavaScript or CSS bytes. The plugin runs as `enforce: "post"` and
  fails if a later mutation makes the compiled hashes stale.
- Put every `install.icons` file under the configured Vite `base`. Production builds fail with an actionable
  `vite.manifest-icon-*` error when a primary icon is missing, its PNG/JPEG/WebP signature disagrees with `type`,
  or its intrinsic dimensions disagree with `sizes`. Other image types emit `vite.manifest-icon-unverified` and
  still require manual verification; maskable safe-area design always requires visual review.
- Use deterministic minification/obfuscation. Identical inputs must produce identical bytes and hashed URLs.
- Publish the application files, worker, manifest and plan from one build as a unit. Do not mix releases.
- Changing identity, scope, worker URL or cache namespace is a migration, not a routine configuration edit.
- `install: null` disables manifest emission; it does not by itself disable the worker or caching policy.

See [configuration](https://github.com/haigeerlab/pwa-platform/blob/main/website/guide/configuration.md),
[offline integration](https://github.com/haigeerlab/pwa-platform/blob/main/website/guide/offline.md),
[manifest fields](https://github.com/haigeerlab/pwa-platform/blob/main/docs/guides/manifest-fields.md) and the
[security model](https://github.com/haigeerlab/pwa-platform/blob/main/docs/architecture/security-model.md).
