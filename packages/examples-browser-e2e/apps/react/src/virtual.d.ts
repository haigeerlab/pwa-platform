// Types for the virtual module the plugin serves.
//
// Taken from the binding's own props rather than re-declared, for the same reason as the Vue example: re-stating
// the five fields would drift from the platform, and importing `PwaClientConfig` directly would mean an
// application depending on client-runtime, which package boundaries forbid.
declare module "virtual:pwa-config" {
  import type { PwaProviderProps } from "@pwa-platform/react";

  const config: PwaProviderProps["config"];
  export default config;
}

// The entry-recovery drill's resident hooks (spec/examples-browser-e2e.md's revised "契约增量": "页面钩子常驻"),
// assigned once in src/main.tsx. Not part of any application's public interface — see that assignment's comment.
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
