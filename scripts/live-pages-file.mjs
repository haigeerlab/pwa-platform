import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { setTimeout } from "node:timers";

/** Pages preview aliases can briefly serve the previous deployment after upload. Never accept different bytes. */
export async function matchesLivePagesFile(url, expectedHash, {
  deadline = Date.now(),
  fetchPage = globalThis.fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  while (true) {
    const response = await fetchPage(url);
    if (response.status === 200) {
      const actual = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
      if (actual === expectedHash) return true;
    }
    const remaining = deadline - now();
    if (remaining <= 0) return false;
    await sleep(Math.min(2_000, remaining));
  }
}
