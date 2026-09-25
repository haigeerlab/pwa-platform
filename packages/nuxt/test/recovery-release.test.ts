// T7b (spec decision 19): `recoveryRelease: true` publishes the recovery worker at the platform worker's own path.
// Real build + real node-server, not a mock: this is exactly the deployment T7 found cannot be produced by a
// post-build file rename (a stale Content-Length corrupted the response) — so the proof has to be that a build made
// *with the switch on* serves a correct, complete file, Content-Length included.
import { readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withBuiltFixture } from "./nuxt-harness.js";
import { IDENTITY, INSTALL, POLICY } from "./fixtures/artifacts/pwa-config.js";

const FIXTURE = "artifacts";
const BUILD_TIMEOUT = 180_000;

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (address === null || typeof address === "string") reject(new Error("could not read a free port"));
        else resolve(address.port);
      });
    });
  });
}

type StartedServer = { readonly origin: string; stop(): Promise<void> };

/** Spawns a built Nitro `node-server` entry and waits until it actually answers requests, not a fixed delay. */
async function startNodeServer(entry: string): Promise<StartedServer> {
  const port = await getFreePort();
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const origin = `http://127.0.0.1:${port}`;

  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`node server exited early with code ${child.exitCode}`);
    try {
      await fetch(origin);
      ready = true;
      break;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  if (!ready) {
    child.kill();
    throw new Error("node server did not become ready within 30s");
  }

  return {
    origin,
    async stop() {
      child.kill();
      await new Promise((resolveExit) => child.once("exit", resolveExit));
    },
  };
}

describe("recoveryRelease: true publishes the recovery worker at the platform worker's own path", () => {
  it(
    "sw.js is the recovery worker, both on disk and as served — Content-Length matches the file's real size",
    async () => {
      let server: StartedServer | undefined;
      try {
        await withBuiltFixture(
          {
            nitro: { prerender: { routes: ["/", "/about", "/offline"] } },
            pwaPlatform: { identity: IDENTITY, policy: POLICY, install: INSTALL, recoveryRelease: true },
          },
          async (publicDir, nuxt) => {
            const recoveryBytes = readFileSync(join(publicDir, "pwa-recovery-worker.js"));
            const swBytes = readFileSync(join(publicDir, "sw.js"));
            // On disk: the two files are byte-identical, and sw.js is not what a non-recovery build would produce
            // (the platform worker always carries the injected precache manifest; the recovery worker never does).
            expect(swBytes.equals(recoveryBytes)).toBe(true);
            expect(swBytes.toString("utf8")).not.toContain("manifest:");

            const onDiskSize = statSync(join(publicDir, "sw.js")).size;

            const serverEntry = join(nuxt.options.rootDir, ".output", "server", "index.mjs");
            server = await startNodeServer(serverEntry);
            const response = await fetch(`${server.origin}/app/sw.js`);
            expect(response.status).toBe(200);
            const contentLength = Number(response.headers.get("content-length"));
            expect(contentLength).toBe(onDiskSize);
            const body = await response.arrayBuffer();
            expect(body.byteLength).toBe(onDiskSize);
            expect(Buffer.from(body).equals(recoveryBytes)).toBe(true);
          },
          FIXTURE,
        );
      } finally {
        await server?.stop();
      }
    },
    BUILD_TIMEOUT,
  );
});
