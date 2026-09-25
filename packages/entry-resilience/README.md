# @pwa-platform/entry-resilience

Private platform package. See [spec/pwa-entry-resilience.md](../../spec/pwa-entry-resilience.md) for the module's
full contract; this file only documents the one thing an integrating backend or CI job needs — validating a
manifest before publishing it.

## Validate a manifest before you publish it

An application's backend produces the entry-recovery manifest and calls the page-side `updateEntryManifest` at
runtime, but that call only ever happens inside a browser, and a rejected manifest is reported only as a
diagnostic code on that page — nothing fails loudly if the manifest was malformed. To catch that before it ships,
call the package's validator directly from Node: in your own CI check, or in the backend process that builds the
manifest, before handing it to clients.

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
  // Must match the `maxValidityDays` passed to `pwaEntryResilience()` in this app's vite.config.ts — the
  // validator does not read the build configuration, so a mismatch here silently checks against the wrong limit.
  maxValidityDays: 30,
  // The validator never reads the system clock; inject the moment you want validity judged as of (typically
  // "now", in milliseconds since the epoch).
  now: Date.now(),
});

if (!result.ok) {
  for (const { code, path } of result.diagnostics) {
    console.error(`${path || "(manifest)"}: ${code}`);
  }
  process.exit(1);
}
```

`parseEntryManifest` never throws and never reads ambient state (no clock, no storage, no network) — the same
function `updateEntryManifest` uses internally, so a manifest that passes here will also be accepted at runtime
given the same `appId`, `environment`, `maxValidityDays` and a `now` no later than the one used at runtime.
