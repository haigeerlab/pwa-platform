import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { matchesLivePagesFile } from "./live-pages-file.mjs";

const bytes = Buffer.from("expected release asset");
const expectedHash = createHash("sha256").update(bytes).digest("hex");
const response = (status, body = bytes) => ({ status, arrayBuffer: async () => body });

test("waits for a newly deployed asset, then checks its exact bytes", async () => {
  let calls = 0;
  const matched = await matchesLivePagesFile("https://example.test/app/asset.js", expectedHash, {
    deadline: 5,
    fetchPage: async () => ++calls === 1 ? response(404) : response(200),
    now: () => 0,
    sleep: async () => {},
  });
  assert.equal(matched, true);
  assert.equal(calls, 2);
});

test("never accepts a persistent byte mismatch", async () => {
  let time = 0;
  const matched = await matchesLivePagesFile("https://example.test/app/asset.js", expectedHash, {
    deadline: 2_000,
    fetchPage: async () => response(200, Buffer.from("wrong asset")),
    now: () => time,
    sleep: async (ms) => { time += ms; },
  });
  assert.equal(matched, false);
});

test("does not hide TLS or other fetch failures behind a retry", async () => {
  await assert.rejects(matchesLivePagesFile("https://example.test/app/asset.js", expectedHash, {
    deadline: 2_000,
    fetchPage: async () => { throw new Error("certificate validation failed"); },
    now: () => 0,
    sleep: async () => {},
  }), /certificate validation failed/);
});
