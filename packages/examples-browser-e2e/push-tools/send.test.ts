// tasks/push-module/plan.md XP5. Offline unit tests for push:send's argument parsing, subscription validation,
// and `main`, driven entirely through injected `SendDeps` (never the real filesystem, stdin, network, or
// sender.ts) per send.ts's own header. Every test that touches a subscription uses obviously-marked fake values
// ("MARKER-endpoint" etc.) and asserts they never appear in stdout/stderr.
import { describe, expect, it, vi } from "vitest";
import { isPushSubscriptionLike, main, parseSendArgs, type SendDeps } from "./send.js";

const MARKER_ENDPOINT = "https://push.example.net/MARKER-endpoint-secret";
const MARKER_P256DH = "MARKER-p256dh-secret";
const MARKER_AUTH = "MARKER-auth-secret";
const MARKER_PRIVATE_KEY = "MARKER-vapid-private-key";
const MARKER_PAYLOAD = "MARKER-payload-text";

const VALID_SUBSCRIPTION = {
  endpoint: MARKER_ENDPOINT,
  keys: { p256dh: MARKER_P256DH, auth: MARKER_AUTH },
};

const VALID_VAPID_JSON = JSON.stringify({ publicKey: "pub", privateKey: MARKER_PRIVATE_KEY });

function fakeDeps(overrides: Partial<SendDeps> = {}): SendDeps & { readonly out: string[]; readonly err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    vapidFile: "/demo/.push-demo/vapid.json",
    readFileSync: (path) => {
      if (path === "/demo/.push-demo/vapid.json") return VALID_VAPID_JSON;
      if (path === "/tmp/sub.json") return JSON.stringify(VALID_SUBSCRIPTION);
      throw new Error("ENOENT");
    },
    readStdin: async () => JSON.stringify(VALID_SUBSCRIPTION),
    stdout: { write: (chunk) => void out.push(chunk) },
    stderr: { write: (chunk) => void err.push(chunk) },
    createPushPayload: () => MARKER_PAYLOAD,
    sendTestPush: async () => ({ status: 201 }),
    out,
    err,
    ...overrides,
  };
}

describe("parseSendArgs", () => {
  it("accepts --title alone", () => {
    expect(parseSendArgs(["--title", "Hello"])).toEqual({ ok: true, value: { title: "Hello" } });
  });

  it("accepts every known flag", () => {
    const result = parseSendArgs([
      "--subscription", "/tmp/sub.json",
      "--title", "Hello",
      "--body", "World",
      "--url", "/path",
      "--tag", "demo",
      "--data", "opaque",
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        subscriptionFile: "/tmp/sub.json",
        title: "Hello",
        body: "World",
        url: "/path",
        tag: "demo",
        data: "opaque",
      },
    });
  });

  it("rejects a missing --title", () => {
    expect(parseSendArgs(["--body", "World"])).toEqual({ ok: false, reason: "Missing required argument: --title" });
  });

  it("rejects an unknown flag", () => {
    const result = parseSendArgs(["--title", "Hello", "--bogus", "x"]);
    expect(result).toEqual({ ok: false, reason: "Unsupported argument: --bogus" });
  });

  it("rejects a flag with no following value", () => {
    expect(parseSendArgs(["--title"])).toEqual({ ok: false, reason: "Missing value for --title" });
  });
});

describe("isPushSubscriptionLike", () => {
  it("accepts a well-formed subscription", () => {
    expect(isPushSubscriptionLike(VALID_SUBSCRIPTION)).toBe(true);
  });

  it("rejects a non-https endpoint", () => {
    expect(isPushSubscriptionLike({ ...VALID_SUBSCRIPTION, endpoint: "http://push.example.net/x" })).toBe(false);
  });

  it("rejects a missing p256dh", () => {
    expect(isPushSubscriptionLike({ endpoint: MARKER_ENDPOINT, keys: { auth: MARKER_AUTH } })).toBe(false);
  });

  it("rejects a non-object value", () => {
    expect(isPushSubscriptionLike("not an object")).toBe(false);
    expect(isPushSubscriptionLike(null)).toBe(false);
  });
});

describe("push:send main()", () => {
  it("exits 0 and prints only the status on a 2xx response", async () => {
    const deps = fakeDeps({ sendTestPush: async () => ({ status: 201 }) });

    const code = await main(["--subscription", "/tmp/sub.json", "--title", "Hi"], deps);

    expect(code).toBe(0);
    expect(deps.out).toEqual(["status 201\n"]);
    expect(deps.err).toEqual([]);
  });

  it("exits 1 and prints only the status on a non-2xx response", async () => {
    const deps = fakeDeps({ sendTestPush: async () => ({ status: 500 }) });

    const code = await main(["--subscription", "/tmp/sub.json", "--title", "Hi"], deps);

    expect(code).toBe(1);
    expect(deps.out).toEqual(["status 500\n"]);
  });

  it("hints at an expired subscription on 404", async () => {
    const deps = fakeDeps({ sendTestPush: async () => ({ status: 404 }) });

    const code = await main(["--subscription", "/tmp/sub.json", "--title", "Hi"], deps);

    expect(code).toBe(1);
    expect(deps.out.join("")).toContain("status 404");
    expect(deps.out.join("")).toContain("expired or unsubscribed");
  });

  it("hints at an expired subscription on 410", async () => {
    const deps = fakeDeps({ sendTestPush: async () => ({ status: 410 }) });

    await main(["--subscription", "/tmp/sub.json", "--title", "Hi"], deps);

    expect(deps.out.join("")).toContain("expired or unsubscribed");
  });

  it("reads the subscription from stdin when --subscription is omitted", async () => {
    const readStdin = vi.fn(async () => JSON.stringify(VALID_SUBSCRIPTION));
    const deps = fakeDeps({ readStdin });

    const code = await main(["--title", "Hi"], deps);

    expect(code).toBe(0);
    expect(readStdin).toHaveBeenCalled();
  });

  it("rejects a malformed subscription without echoing any of its values", async () => {
    const deps = fakeDeps({
      readFileSync: (path) => {
        if (path === "/demo/.push-demo/vapid.json") return VALID_VAPID_JSON;
        if (path === "/tmp/sub.json") {
          return JSON.stringify({ endpoint: MARKER_ENDPOINT, keys: { p256dh: MARKER_P256DH } }); // missing auth
        }
        throw new Error("ENOENT");
      },
      sendTestPush: async () => {
        throw new Error("should never be called for a malformed subscription");
      },
    });

    const code = await main(["--subscription", "/tmp/sub.json", "--title", "Hi"], deps);

    expect(code).toBe(1);
    const combined = deps.out.join("") + deps.err.join("");
    expect(combined).not.toContain(MARKER_ENDPOINT);
    expect(combined).not.toContain(MARKER_P256DH);
    expect(combined).not.toContain(MARKER_AUTH);
  });

  it("rejects non-JSON subscription input", async () => {
    const deps = fakeDeps({ readFileSync: (path) => (path === "/demo/.push-demo/vapid.json" ? VALID_VAPID_JSON : "not json") });

    const code = await main(["--subscription", "/tmp/sub.json", "--title", "Hi"], deps);

    expect(code).toBe(1);
    expect(deps.err.join("")).toContain("not valid JSON");
  });

  it("errors clearly, without a stack of endpoint/key values, when the VAPID key file is missing", async () => {
    const deps = fakeDeps({
      readFileSync: () => {
        throw new Error("ENOENT");
      },
    });

    const code = await main(["--subscription", "/tmp/sub.json", "--title", "Hi"], deps);

    expect(code).toBe(1);
    expect(deps.err.join("")).toContain("push:keys");
  });

  it("passes the built payload and parsed keys straight through to sendTestPush, and builds the payload from the given fields", async () => {
    const createPushPayload = vi.fn(() => MARKER_PAYLOAD);
    const sendTestPush = vi.fn(async () => ({ status: 201 }));
    const deps = fakeDeps({ createPushPayload, sendTestPush });

    await main(
      ["--subscription", "/tmp/sub.json", "--title", "Hi", "--body", "World", "--url", "/x", "--tag", "t", "--data", "d"],
      deps,
    );

    expect(createPushPayload).toHaveBeenCalledWith({ title: "Hi", body: "World", url: "/x", tag: "t", data: "d" });
    expect(sendTestPush).toHaveBeenCalledWith(VALID_SUBSCRIPTION, { publicKey: "pub", privateKey: MARKER_PRIVATE_KEY }, MARKER_PAYLOAD);
  });

  it("never echoes the VAPID private key or the payload text in any output", async () => {
    const deps = fakeDeps({
      sendTestPush: async () => {
        throw new Error("push send failed at network stage");
      },
    });

    await main(["--subscription", "/tmp/sub.json", "--title", "Hi"], deps);

    const combined = deps.out.join("") + deps.err.join("");
    expect(combined).not.toContain(MARKER_PRIVATE_KEY);
    expect(combined).not.toContain(MARKER_PAYLOAD);
    expect(combined).not.toContain(MARKER_ENDPOINT);
  });

  it("prints a sendTestPush error's stage-only message without throwing", async () => {
    const deps = fakeDeps({
      sendTestPush: async () => {
        throw new Error("push send failed at encrypt stage");
      },
    });

    const code = await main(["--subscription", "/tmp/sub.json", "--title", "Hi"], deps);

    expect(code).toBe(1);
    expect(deps.err.join("")).toBe("push send failed at encrypt stage\n");
  });

  it("rejects unusable argv before touching the filesystem", async () => {
    const readFileSync = vi.fn();
    const deps = fakeDeps({ readFileSync });

    const code = await main([], deps);

    expect(code).toBe(1);
    expect(readFileSync).not.toHaveBeenCalled();
  });
});
