import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { pwa } from "@pwa-platform/vite";
import { identity, policy } from "./options.mjs";

const plugin = pwa({ identity, policy, install: null, topology: { kind: "standalone-origin" } });
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new globalThis.URL("./app/", import.meta.url)),
  base: "/app/",
  logLevel: "error",
  plugins: [plugin],
});
try {
  await server.transformRequest("/src/main.js");
  const module = await server.ssrLoadModule("virtual:pwa-config");
  if (module.default.appId !== identity.appId || plugin.api.getPlan() !== null) {
    throw new Error("Development config or build-only plan is incorrect");
  }
} finally {
  await server.close();
}
