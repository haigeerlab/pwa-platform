import { fileURLToPath } from "node:url";
import { build } from "vite";
import { pwa } from "@pwa-platform/vite";
import { identity, policy } from "./options.mjs";

const root = fileURLToPath(new globalThis.URL("./app/", import.meta.url));
await build({
  configFile: false,
  root,
  base: "/app/",
  logLevel: "error",
  build: { outDir: fileURLToPath(new globalThis.URL("./dist/", import.meta.url)), emptyOutDir: true },
  plugins: [pwa({ identity, policy, install: null, topology: { kind: "standalone-origin" } })],
});
