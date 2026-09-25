// Types for the virtual module the plugin serves. An app adds this package to its tsconfig `types` (or references
// this file) so that `import config from "virtual:pwa-config"` is typed rather than an implicit any.
declare module "virtual:pwa-config" {
  import type { PwaClientConfig } from "@pwa-platform/client-runtime/build";

  /** The five fields the client facade reads; frozen at build time. */
  const config: PwaClientConfig;
  export default config;
}
