// spec/push-module.md's 2026-09-24 revision ("修订：真实订阅与真实送达的证据收尾") / tasks/push-module/plan.md
// XP2. Offline unit tests for the test-only Web Push sender: an RFC 8291 Appendix A vector (byte-for-byte
// encryption), VAPID JWT verification, leak-safety of every error path, and a decrypt round trip.
import { createECDH, createPublicKey, createDecipheriv, createHmac, verify as verifyWithKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createVapidAuthorization,
  createVapidKeys,
  encryptPayload,
  sendTestPush,
  type PushSubscriptionLike,
  type VapidKeyPair,
} from "./sender.js";

// RFC 8291 Appendix A, "Intermediate Values for Encryption" (https://www.rfc-editor.org/rfc/rfc8291.txt). Every
// value below is copied verbatim from the RFC text, not from memory.
const RFC8291_PLAINTEXT = "When I grow up, I want to be a watermelon";
const RFC8291_AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
const RFC8291_UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const RFC8291_UA_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
const RFC8291_SALT = "DGv6ra1nlYgDCS1FRnbzlw";
const RFC8291_AUTH_SECRET = "BTBZMqHH6r4Tts7J_aSIgg";
// Section 5, "Push Message Encryption Example": the full request body (salt || header || ciphertext), reassembled
// from the RFC's line-wrapped presentation.
const RFC8291_EXPECTED_BODY =
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

function rfc8291Subscription(): PushSubscriptionLike {
  return {
    endpoint: "https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV",
    keys: { p256dh: RFC8291_UA_PUBLIC, auth: RFC8291_AUTH_SECRET },
  };
}

/** The receiver side of RFC 8291, used only by the round-trip test below to prove `encryptPayload`'s output is
 *  actually decryptable and not merely byte-matched by coincidence. Mirrors `encryptPayload`'s key derivation
 *  with the sender/receiver roles reversed. */
function decryptPayload(body: Buffer, uaPrivateKey: string, authSecret: string): string {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const asPublicKey = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);

  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(uaPrivateKey, "base64url"));
  const uaPublicKey = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(asPublicKey);

  const hmac = (key: Uint8Array, data: Uint8Array): Buffer => createHmac("sha256", key).update(data).digest();
  const prkKey = hmac(Buffer.from(authSecret, "base64url"), sharedSecret);
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    uaPublicKey,
    asPublicKey,
    Buffer.from([0x01]),
  ]);
  const ikm = hmac(prkKey, info);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "utf8")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "utf8")).subarray(0, 12);

  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const padded = Buffer.concat([
    decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
    decipher.final(),
  ]);
  expect(padded.at(-1)).toBe(0x02); // padding delimiter (RFC 8291 Section 4)
  return padded.subarray(0, padded.length - 1).toString("utf8");
}

function publicKeyObjectFromRaw(rawBase64url: string) {
  const raw = Buffer.from(rawBase64url, "base64url");
  return createPublicKey({
    key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33, 65).toString("base64url") },
    format: "jwk",
  });
}

describe("encryptPayload", () => {
  it("matches RFC 8291 Appendix A byte-for-byte", () => {
    const body = encryptPayload(rfc8291Subscription(), RFC8291_PLAINTEXT, {
      senderPrivateKey: RFC8291_AS_PRIVATE,
      salt: Buffer.from(RFC8291_SALT, "base64url"),
    });

    expect(body.toString("base64url")).toBe(RFC8291_EXPECTED_BODY);
  });

  it("carries the sender's public key so the RFC 8291 vector's UA private key decrypts it back to the plaintext", () => {
    const body = encryptPayload(rfc8291Subscription(), RFC8291_PLAINTEXT, {
      senderPrivateKey: RFC8291_AS_PRIVATE,
      salt: Buffer.from(RFC8291_SALT, "base64url"),
    });

    expect(decryptPayload(body, RFC8291_UA_PRIVATE, RFC8291_AUTH_SECRET)).toBe(RFC8291_PLAINTEXT);
  });

  it("round-trips a freshly generated key pair, salt, and payload", () => {
    const senderKeys = createVapidKeys(); // any P-256 pair works as an ephemeral sender key for this purpose
    const uaKeys = createVapidKeys();
    const subscription: PushSubscriptionLike = {
      endpoint: "https://push.example.net/push/fresh",
      keys: { p256dh: uaKeys.publicKey, auth: Buffer.alloc(16, 7).toString("base64url") },
    };

    const body = encryptPayload(subscription, "round trip payload", { senderPrivateKey: senderKeys.privateKey });

    expect(decryptPayload(body, uaKeys.privateKey, subscription.keys.auth)).toBe("round trip payload");
  });

  it("rejects an invalid subscription public key", () => {
    const subscription: PushSubscriptionLike = {
      endpoint: "https://push.example.net/push/bad",
      keys: { p256dh: "AAAA", auth: RFC8291_AUTH_SECRET },
    };

    expect(() => encryptPayload(subscription, "x")).toThrow();
  });
});

describe("createVapidAuthorization", () => {
  it("produces a JWT that verifies with the matching public key, with aud as the endpoint's origin and exp within 24h", () => {
    const keys = createVapidKeys();
    const now = Date.parse("2026-09-24T00:00:00.000Z");

    const header = createVapidAuthorization("https://push.example.net/push/abc123?query=ignored", keys, { now });

    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, jwt, publicKey] = match as unknown as [string, string, string];
    expect(publicKey).toBe(keys.publicKey);

    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
    expect(JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"))).toEqual({ typ: "JWT", alg: "ES256" });
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      readonly aud: string;
      readonly exp: number;
      readonly sub: string;
    };
    expect(payload.aud).toBe("https://push.example.net"); // origin only, never the full endpoint
    expect(payload.exp - Math.floor(now / 1000)).toBeLessThanOrEqual(24 * 3600);
    expect(payload.exp).toBeGreaterThan(Math.floor(now / 1000));

    const verified = verifyWithKey(
      "sha256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      { key: publicKeyObjectFromRaw(keys.publicKey), dsaEncoding: "ieee-p1363" },
      Buffer.from(encodedSignature, "base64url"),
    );
    expect(verified).toBe(true);
  });

  it("rejects an invalid VAPID private key", () => {
    const keys: VapidKeyPair = {
      publicKey: createVapidKeys().publicKey,
      privateKey: Buffer.alloc(32, 0).toString("base64url"), // all-zero scalar: not valid for P-256
    };

    expect(() => createVapidAuthorization("https://push.example.net/push/abc", keys)).toThrow();
  });
});

describe("sendTestPush leak safety", () => {
  const ENDPOINT_MARKER = "https://push.example.net/push/MARKER-ENDPOINT-abc123";
  const AUTH_MARKER = Buffer.from("MARKER-AUTH-0000").toString("base64url");
  // An all-zero P-256 scalar: not a valid private key for the curve, so signing fails deterministically.
  const PRIVATE_KEY_MARKER = Buffer.alloc(32, 0).toString("base64url");

  function markedSubscription(overrides?: Partial<PushSubscriptionLike["keys"]>): PushSubscriptionLike {
    return {
      endpoint: ENDPOINT_MARKER,
      keys: { p256dh: createVapidKeys().publicKey, auth: AUTH_MARKER, ...overrides },
    };
  }

  function assertNoMarkersLeaked(error: unknown): void {
    const text = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    expect(text).not.toContain(ENDPOINT_MARKER);
    expect(text).not.toContain("MARKER-ENDPOINT");
    expect(text).not.toContain(AUTH_MARKER);
    expect(text).not.toContain(PRIVATE_KEY_MARKER);
  }

  it("fails at the encrypt stage for an invalid subscription key, without leaking markers", async () => {
    const subscription = markedSubscription({ p256dh: "AAAA" });
    const keys = createVapidKeys();

    await expect(sendTestPush(subscription, keys, "payload")).rejects.toMatchObject({
      message: "push send failed at encrypt stage",
    });
    try {
      await sendTestPush(subscription, keys, "payload");
    } catch (error) {
      assertNoMarkersLeaked(error);
    }
  });

  it("fails at the sign stage for an invalid VAPID private key, without leaking markers", async () => {
    const subscription = markedSubscription();
    const keys: VapidKeyPair = { publicKey: createVapidKeys().publicKey, privateKey: PRIVATE_KEY_MARKER };
    // Defensive: sign() must throw before any fetch is attempted, so this stub should never actually be called.
    const fetchImpl = (async () => {
      throw new Error("sign stage should have failed before any network call");
    }) as unknown as typeof fetch;

    await expect(sendTestPush(subscription, keys, "payload", { fetchImpl })).rejects.toMatchObject({
      message: "push send failed at sign stage",
    });
    try {
      await sendTestPush(subscription, keys, "payload", { fetchImpl });
    } catch (error) {
      assertNoMarkersLeaked(error);
    }
  });

  it("fails at the network stage when fetch rejects, without leaking markers", async () => {
    const subscription = markedSubscription();
    const keys = createVapidKeys();
    const fetchImpl = (async () => {
      throw new Error(`connection reset for ${ENDPOINT_MARKER}`);
    }) as unknown as typeof fetch;

    await expect(sendTestPush(subscription, keys, "payload", { fetchImpl })).rejects.toMatchObject({
      message: "push send failed at network stage",
    });
    try {
      await sendTestPush(subscription, keys, "payload", { fetchImpl });
    } catch (error) {
      assertNoMarkersLeaked(error);
    }
  });

  it("returns a non-2xx status (such as 410 for an expired subscription) without reading the response body", async () => {
    const subscription = markedSubscription();
    const keys = createVapidKeys();
    let bodyAccessed = false;
    const stubResponse = {
      status: 410,
      get body(): never {
        bodyAccessed = true;
        throw new Error("response body must not be read");
      },
      text: () => {
        bodyAccessed = true;
        return Promise.reject(new Error("response body must not be read"));
      },
      json: () => {
        bodyAccessed = true;
        return Promise.reject(new Error("response body must not be read"));
      },
    };
    const fetchImpl = (async () => stubResponse) as unknown as typeof fetch;

    const result = await sendTestPush(subscription, keys, "payload", { fetchImpl });
    expect(result).toEqual({ status: 410 });
    assertNoMarkersLeaked(result);
    expect(bodyAccessed).toBe(false);
  });

  it("never reads the response body on a successful (2xx) response either", async () => {
    const subscription = markedSubscription();
    const keys = createVapidKeys();
    let bodyAccessed = false;
    const stubResponse = {
      status: 201,
      get body(): never {
        bodyAccessed = true;
        throw new Error("response body must not be read");
      },
      text: () => {
        bodyAccessed = true;
        return Promise.reject(new Error("response body must not be read"));
      },
    };
    const fetchImpl = (async () => stubResponse) as unknown as typeof fetch;

    const result = await sendTestPush(subscription, keys, "payload", { fetchImpl });

    expect(result).toEqual({ status: 201 });
    expect(bodyAccessed).toBe(false);
  });
});
