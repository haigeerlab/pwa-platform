# @pwa-platform/entry-resilience

Optional entry recovery for a PWA whose original address is moving or unavailable. Install it alongside
`@pwa-platform/vite`; use the same `PwaIdentity` object for both Vite plugins. The package supports Vite 5 and 8
on Node 22 or later.

The application obtains a manifest through its own request layer and hands the decoded object to the client API.
The platform checks its shape, increasing sequence and expiry, then stores it locally. A recovery page shows a
validated alternative address; navigation happens only after the user clicks it. Neither cookies nor login state
move between origins.

## Install and configure

```sh
npm install @pwa-platform/entry-resilience @pwa-platform/vite
```

```ts
// vite.config.ts — reuse the identity already passed to pwa()
import { pwa } from "@pwa-platform/vite";
import { pwaEntryResilience } from "@pwa-platform/entry-resilience/vite";

plugins: [
  pwa({ identity, policy, install, topology }),
  pwaEntryResilience({ identity, maxValidityDays: 30, locale: "zh-CN" }),
]
```

The PWA policy must classify the mount-relative `/pwa-entry.html` as a `cache-first` asset, and its fingerprinted
script under `/assets` as an asset too. The build rejects a recovery page that is not precached. `locale` accepts
`"zh-CN"` or `"en"`; `messages` overrides individual strings. The `css` option appends host CSS after the
default recovery-page style. To change the button, override `--pwa-entry-accent` and
`--pwa-entry-accent-fg` in `.pwa-entry`; see the [integration guide](https://github.com/haigeerlab/pwa-platform/blob/main/docs/guides/entry-recovery-integration.md)
for light/dark theme selectors and strict CSP hashes.

```ts
import { updateEntryManifest, checkEntryRecovery, setPwaTheme } from "@pwa-platform/entry-resilience/client";

const result = await updateEntryManifest(await api.getEntryManifest());
if (!result.accepted) reportDiagnostics(result.diagnostics);

const recovery = await checkEntryRecovery({ returnPath: location.pathname });
if (recovery.kind === "available") showRecoveryLink(recovery.recoveryPageUrl);

setPwaTheme("system"); // or "light" / "dark"
```

The application owns the request, authentication, decryption and polling. Keep the manifest endpoint protected:
the platform validates structure and timing, but does not authenticate its source or restrict destination origins.
An ordinary device-wide loss of connectivity with a `normal` manifest does not create a domain-outage suggestion.

## Validate a manifest before you publish it

Use the same validator in Node before publishing a manifest so an invalid manifest fails CI or the backend job
instead of being silently rejected only by a browser page.

```js
import { parseEntryManifest } from "@pwa-platform/entry-resilience";

const manifest = {
  sequence: 7,
  expiresAt: "2026-10-01T08:00:00Z",
  status: "migrating",
  reason: { code: "planned-migration", message: "Domain retires October 1." },
  entries: [{ origin: "https://new.example.com", startPath: "/app/" }],
};

const result = parseEntryManifest(manifest, {
  appId: "pwaexample",
  environment: "production",
  // Match the maxValidityDays in this app's Vite config.
  maxValidityDays: 30,
  // Inject the moment at which validity should be judged.
  now: Date.now(),
});

if (!result.ok) {
  for (const { code, path } of result.diagnostics) {
    console.error(`${path || "(manifest)"}: ${code}`);
  }
  process.exit(1);
}
```

`parseEntryManifest` never throws or reads ambient state. It is the same shape validator used by
`updateEntryManifest`; expiry and sequence are checked again when the browser accepts the manifest. Use an
`expiresAt` value in `YYYY-MM-DDTHH:mm:ssZ` format without milliseconds.
