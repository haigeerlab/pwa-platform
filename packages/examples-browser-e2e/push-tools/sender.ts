// Test-only Web Push sender for the real-delivery evidence collected in spec/push-module.md's 2026-09-24 revision
// ("修订：真实订阅与真实送达的证据收尾"). Never exported from this private, unpublished package (ADR-0028) and
// never imported by @pwa-platform/push or any other workspace package: sending is the business backend's own job
// (ADR-0021), and this module exists only to prove delivery works in tests and local scripts (tasks/push-module/
// plan.md XP2/XP5). Only `node:crypto` and the global `fetch` are used — no new dependency.
//
// VAPID (RFC 8292) is an ES256-signed JWT sent as an `Authorization: vapid t=<jwt>, k=<publicKey>` header.
// aes128gcm (RFC 8291) encrypts the payload with a key derived from an ECDH exchange between an application-server
// key pair (generated per message unless injected for tests) and the subscription's `p256dh`/`auth` keys.
//
// Privacy: no function here ever puts an endpoint, `p256dh`, `auth`, or VAPID private key into a thrown error,
// a log, or a return value. `sendTestPush` resolves with only the HTTP status code and throws with only a
// pipeline stage name — the response body is never read on any status.
import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign as signWithKey,
  type KeyObject,
} from "node:crypto";

/** A raw P-256 key pair for VAPID, both fields base64url-encoded: `publicKey` is the 65-byte uncompressed point
 *  ([0x04, x(32), y(32)]), `privateKey` is the 32-byte scalar `d`. */
export interface VapidKeyPair {
  readonly publicKey: string;
  readonly privateKey: string;
}

/** The subset of the browser's `PushSubscriptionJSON` this module reads. Declared locally (rather than depending
 *  on the DOM lib, which this package's Node-side tsconfig deliberately excludes) but structurally compatible
 *  with a real `PushSubscriptionJSON`. */
export interface PushSubscriptionLike {
  readonly endpoint: string;
  readonly keys: {
    readonly p256dh: string;
    readonly auth: string;
  };
}

function base64urlEncode(data: Uint8Array): string {
  return Buffer.from(data).toString("base64url");
}

function base64urlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/** Rebuilds the full EC key pair from just the raw 32-byte private scalar: `ECDH.setPrivateKey` derives the
 *  matching public point, which JWK import needs alongside `d` (RFC 7518 requires the coordinates on a private
 *  EC JWK). Used by both VAPID signing and encryption, so neither `createVapidKeys()`'s output nor an injected
 *  sender private key needs to carry its public half separately. */
function ecPrivateKeyFromRaw(privateKey: string): { readonly keyObject: KeyObject; readonly publicKey: Buffer } {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(base64urlDecode(privateKey));
  const publicKey = ecdh.getPublicKey();
  const keyObject = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: privateKey,
      x: base64urlEncode(publicKey.subarray(1, 33)),
      y: base64urlEncode(publicKey.subarray(33, 65)),
    },
    format: "jwk",
  });
  return { keyObject, publicKey };
}

/** Generates a P-256 key pair for VAPID, raw and base64url-encoded (see `VapidKeyPair`). */
export function createVapidKeys(): VapidKeyPair {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const privateJwk = privateKey.export({ format: "jwk" }) as { readonly d: string };
  const { publicKey } = ecPrivateKeyFromRaw(privateJwk.d);
  return { publicKey: base64urlEncode(publicKey), privateKey: privateJwk.d };
}

/** Builds the `Authorization: vapid ...` header value for `endpoint` (RFC 8292): an ES256 JWT with `aud` set to
 *  the endpoint's origin (never the full endpoint) and `exp` one hour out, plus the raw public key as `k`.
 *  `options.now` (epoch milliseconds) and `options.subject` are injectable so tests can use fixed inputs. */
export function createVapidAuthorization(
  endpoint: string,
  keys: VapidKeyPair,
  options?: { readonly now?: number; readonly subject?: string },
): string {
  const audience = new URL(endpoint).origin;
  const issuedAtMs = options?.now ?? Date.now();
  const expirationSeconds = Math.floor(issuedAtMs / 1000) + 3600;
  const subject = options?.subject ?? "mailto:push-test@pwa-platform.invalid";

  const header = base64urlEncode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64urlEncode(
    Buffer.from(JSON.stringify({ aud: audience, exp: expirationSeconds, sub: subject })),
  );
  const signingInput = `${header}.${payload}`;

  const { keyObject } = ecPrivateKeyFromRaw(keys.privateKey);
  const signature = signWithKey("sha256", Buffer.from(signingInput), { key: keyObject, dsaEncoding: "ieee-p1363" });

  return `vapid t=${signingInput}.${base64urlEncode(signature)}, k=${keys.publicKey}`;
}

/** Encrypts `plaintext` for `subscription` per RFC 8291 ("aes128gcm"), returning `salt(16) || rs(4) ||
 *  idlen(1)=65 || senderPublicKey(65) || ciphertext`. `options.senderPrivateKey` (raw base64url `d`) and
 *  `options.salt` are injectable so `sendTestPush` can use a fresh key and salt per call while tests reproduce
 *  RFC 8291 Appendix A's fixed intermediate values. */
export function encryptPayload(
  subscription: PushSubscriptionLike,
  plaintext: string,
  options?: { readonly senderPrivateKey?: string; readonly salt?: Uint8Array },
): Buffer {
  const uaPublicKey = base64urlDecode(subscription.keys.p256dh);
  const authSecret = base64urlDecode(subscription.keys.auth);

  const ecdh = createECDH("prime256v1");
  if (options?.senderPrivateKey !== undefined) {
    ecdh.setPrivateKey(base64urlDecode(options.senderPrivateKey));
  } else {
    ecdh.generateKeys();
  }
  const senderPublicKey = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublicKey);
  const salt = options?.salt !== undefined ? Buffer.from(options.salt) : randomBytes(16);

  const hmac = (key: Uint8Array, data: Uint8Array): Buffer => createHmac("sha256", key).update(data).digest();

  const pseudoRandomKeyForCombining = hmac(authSecret, sharedSecret);
  const keyCombiningInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    uaPublicKey,
    senderPublicKey,
    Buffer.from([0x01]),
  ]);
  const inputKeyingMaterial = hmac(pseudoRandomKeyForCombining, keyCombiningInfo);

  const pseudoRandomKey = hmac(salt, inputKeyingMaterial);
  const contentEncryptionKey = hmac(pseudoRandomKey, Buffer.from("Content-Encoding: aes128gcm\0\x01", "utf8")).subarray(
    0,
    16,
  );
  const nonce = hmac(pseudoRandomKey, Buffer.from("Content-Encoding: nonce\0\x01", "utf8")).subarray(0, 12);

  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const paddedPlaintext = Buffer.concat([Buffer.from(plaintext, "utf8"), Buffer.from([0x02])]);
  const ciphertext = Buffer.concat([cipher.update(paddedPlaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const header = Buffer.concat([salt, recordSize, Buffer.from([65]), senderPublicKey]);

  return Buffer.concat([header, ciphertext]);
}

/** Sends `payloadText` to `subscription.endpoint` via VAPID + aes128gcm and returns only the HTTP status code.
 *  Never reads the response body, on success or failure. Any failure throws an `Error` naming just the pipeline
 *  stage ("encrypt", "sign", or "network") — never the endpoint, subscription keys, VAPID private key, or
 *  payload. Every HTTP response, 2xx or not, resolves with its status. */
export async function sendTestPush(
  subscription: PushSubscriptionLike,
  keys: VapidKeyPair,
  payloadText: string,
  options?: {
    readonly now?: number;
    readonly subject?: string;
    readonly ttl?: number;
    readonly urgency?: "very-low" | "low" | "normal" | "high";
    readonly fetchImpl?: typeof fetch;
  },
): Promise<{ readonly status: number }> {
  let body: Buffer;
  try {
    body = encryptPayload(subscription, payloadText);
  } catch {
    throw new Error("push send failed at encrypt stage");
  }

  let authorization: string;
  try {
    authorization = createVapidAuthorization(subscription.endpoint, keys, {
      ...(options?.now !== undefined && { now: options.now }),
      ...(options?.subject !== undefined && { subject: options.subject }),
    });
  } catch {
    throw new Error("push send failed at sign stage");
  }

  const doFetch = options?.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(options?.ttl ?? 60),
        Urgency: options?.urgency ?? "high",
        Authorization: authorization,
      },
      body: new Uint8Array(body),
    });
  } catch {
    throw new Error("push send failed at network stage");
  }

  // Any status is an answer, not a failure: callers assert on it (201 delivered; 404/410 for an unsubscribed
  // endpoint, the signal ADR-0021 tells backends to clean up on). Only the stages above throw.
  return { status: response.status };
}
