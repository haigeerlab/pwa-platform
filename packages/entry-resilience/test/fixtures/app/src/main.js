// Minimal app used by test/vite/plugin.test.ts's real-build tests. Importing the virtual module and keeping a
// reference to it (rather than importing it only for a side effect) is what proves `pwaEntryResilience()` serves
// `virtual:pwa-entry-config` to ordinary application code, not only to the recovery page it emits itself — and
// keeps the import from being tree-shaken away before the build's own assertions can inspect its output.
/* global window */
import config from "virtual:pwa-entry-config";

window.__entryResilienceFixtureConfig = config;
