// Types for the virtual module the plugin serves.
//
// The config's type is taken from the binding's own signature rather than re-declared here. Re-declaring the five
// fields would drift from the platform the moment one of them changes, and importing `PwaClientConfig` directly
// would mean depending on client-runtime — which an application is not supposed to reach into (package
// boundaries: applications use the host facade). `Parameters<typeof createPwa>` needs neither.
declare module "virtual:pwa-config" {
  import type { createPwa } from "@pwa-platform/vue";

  const config: Parameters<typeof createPwa>[0]["config"];
  export default config;
}

// The entry-recovery drill's resident hooks (spec/examples-browser-e2e.md's revised "契约增量": "页面钩子常驻"),
// assigned once in src/main.ts. Not part of any application's public interface — see that assignment's comment.
//
// No `declare global` wrapper: this file has no top-level `import`/`export` of its own (the dynamic `import(...)`
// types below are type queries, not module imports), so it is already an ambient script whose declarations merge
// into the global scope directly — wrapping them in `declare global` here is rejected by the compiler instead.
interface Window {
  __entryUpdate?: (data: unknown) => Promise<import("@pwa-platform/entry-resilience/client").EntryUpdateResult>;
  __entryCheck?: (
    options?: Parameters<typeof import("@pwa-platform/entry-resilience/client").checkEntryRecovery>[0],
  ) => ReturnType<typeof import("@pwa-platform/entry-resilience/client").checkEntryRecovery>;
}
