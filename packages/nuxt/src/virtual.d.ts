// Types for the virtual module the module's Vite plugin serves in both the client and server builds (design
// section 5, amended T7b / spec decision 18). Declared here so the runtime plugin's
// `import ... from "virtual:pwa-platform/nuxt"` is typed rather than an implicit any.
declare module "virtual:pwa-platform/nuxt" {
  import type { PwaNuxtVirtualModule } from "./client-config.js";

  const virtualModule: PwaNuxtVirtualModule;
  export default virtualModule;
}
