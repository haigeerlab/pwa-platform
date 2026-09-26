# @pwa-platform/entry-resilience

Optional entry recovery for an installed PWA whose original address is moving or unavailable. The package emits a
precache-protected recovery page, validates application-supplied entry manifests, stores the newest accepted
manifest locally and shows a validated alternative URL only when recovery conditions are met. It supports Vite 5
and Vite 8 on Node.js 22 or later.

This is not an automatic redirect, cross-origin session transfer or trust service. Navigation happens only after
the user clicks the recovery link, and cookies or login state never move between origins.

## Install and build integration

```sh
npm install @pwa-platform/entry-resilience @pwa-platform/vite
```

```ts
// vite.config.ts — reuse the exact identity object passed to pwa()
import { pwa } from "@pwa-platform/vite";
import { pwaEntryResilience } from "@pwa-platform/entry-resilience/vite";

plugins: [
  pwa({ identity, policy, install, topology }),
  pwaEntryResilience({
    identity,
    maxValidityDays: 30,
    locale: "zh-CN",
    messages: { heading: "应用入口已变更" },
    css: ".pwa-entry { --pwa-entry-accent: #006e52; }",
  }),
]
```

The PWA policy must classify mount-relative `/pwa-entry.html` as a `cache-first` asset and cover its fingerprinted
script (normally through `/assets`). The build rejects a recovery page that is not precached. `maxValidityDays`
accepts 1–90 and defaults to 30. `locale` accepts `"zh-CN"` or `"en"`; `messages` overrides individual strings;
`css` is appended after the default page style and must not contain a closing `</style` sequence.

## Browser integration

The application owns fetching, authentication, authorization, decryption and polling. Hand the already-decoded
object to the package:

```ts
import {
  checkEntryRecovery,
  setPwaTheme,
  updateEntryManifest,
} from "@pwa-platform/entry-resilience/client";

const response = await fetch("/api/pwa-entry", { credentials: "include" });
const result = await updateEntryManifest(await response.json());
if (!result.accepted) reportDiagnostics(result.diagnostics);

const recovery = await checkEntryRecovery({ returnPath: location.pathname });
if (recovery.kind === "available") showRecoveryLink(recovery.recoveryPageUrl);

setPwaTheme("system"); // "light", "dark" or "system"
```

Call `updateEntryManifest()` after a successful application-controlled fetch and at the application's chosen refresh
interval. `checkEntryRecovery()` probes the current entry and decides whether a recovery suggestion is warranted;
it does not navigate. `setPwaTheme()` stores a same-origin preference read by the recovery page and silently no-ops
when storage is unavailable.

## Manifest contract and validation

Validate a manifest in CI or backend code with the side-effect-free root entry:

```ts
import { parseEntryManifest } from "@pwa-platform/entry-resilience";

const now = Date.now();
const manifest = {
  sequence: 7,
  expiresAt: new Date(now + 7 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
  status: "migrating",
  reason: { code: "planned-migration", message: "The old domain is retiring." },
  entries: [{ origin: "https://new.example.com", startPath: "/app/" }],
};

const result = parseEntryManifest(manifest, {
  appId: "exampleapp",
  environment: "production",
  maxValidityDays: 30,
  now,
});

if (!result.ok) throw new Error(result.diagnostics.map((item) => item.code).join(", "));
```

Use UTC `YYYY-MM-DDTHH:mm:ssZ` timestamps without milliseconds. Browsers additionally reject expired manifests and
sequences that do not advance beyond the locally accepted value.

## Export map

| Entry | Intended use |
| --- | --- |
| `@pwa-platform/entry-resilience` | Manifest types/diagnostics, `parseEntryManifest`, pure recovery orchestration and advanced browser ports. |
| `@pwa-platform/entry-resilience/vite` | `pwaEntryResilience()` and build option/page message types. |
| `@pwa-platform/entry-resilience/client` | `updateEntryManifest()`, `checkEntryRecovery()` and `setPwaTheme()`. |

## Security boundary

- The package validates schema, sequence and expiry; it does not authenticate the manifest source or restrict the
  destination origins. Your backend and request layer are the trust boundary.
- Never expose a debugging hook that lets arbitrary page visitors call `updateEntryManifest()` with their own data.
- The recovery page displays a destination before a user click. It does not auto-redirect or transfer credentials.
- A normal manifest plus device-wide loss of connectivity does not create a domain-outage suggestion.
- Keep `identity` identical across both Vite plugins and treat identity changes as a migration.

See the complete [entry-recovery integration guide](https://github.com/haigeerlab/pwa-platform/blob/main/docs/guides/entry-recovery-integration.md)
and [entry-resilience specification](https://github.com/haigeerlab/pwa-platform/blob/main/spec/pwa-entry-resilience.md).
