// Copied literally from website/start/react.md step 2, apart from the `UserConfig` annotation this monorepo's
// isolatedDeclarations setting requires on every exported value (apps/react/vite.config.ts does the same); a
// consumer's own tsconfig would not need it.
import { pwa } from "@pwa-platform/vite";
import { defineConfig, type UserConfig } from "vite";
import { IDENTITY, INSTALL, POLICY } from "./pwa.config.ts";

const config: UserConfig = defineConfig({
  base: "/",
  plugins: [
    pwa({
      identity: IDENTITY,
      install: INSTALL,
      policy: POLICY,
      topology: { kind: "standalone-origin" },
      offlinePage: {},
    }),
  ],
});

export default config;
