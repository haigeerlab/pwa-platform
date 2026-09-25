// Ambient type for the virtual module `src/vite/index.ts` serves. `src/client/index.ts` and `src/page/main.ts` are
// the only files allowed to import it (see ADR-0018, "src/ 环境中立"); declaring it here, rather than inline in
// either of them, is what lets both import the same specifier without a second declaration.
declare module "virtual:pwa-entry-config" {
  import type { EntryPageVirtualConfig } from "./vite/index.js";

  const config: EntryPageVirtualConfig;
  export default config;
}
