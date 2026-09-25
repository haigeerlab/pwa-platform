import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_URL_MISMATCH_CODE } from "../src/index.js";
import { bindClientToRuntimeBase, RUNTIME_BASE_URL_MISMATCH_CODE } from "../src/runtime/binding.js";
import { withBuiltFixture, withLoadedFixture } from "./nuxt-harness.js";

const SECRET_PATH = "/should-not-appear/";

function fakeClient() {
  return {
    register: vi.fn().mockResolvedValue(undefined),
    promptInstall: vi.fn().mockResolvedValue("unavailable"),
    applyUpdate: vi.fn().mockResolvedValue(false),
    logout: vi.fn().mockResolvedValue(false),
    checkForUpdate: vi.fn().mockResolvedValue("unavailable"),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    dispose: vi.fn(),
  };
}

describe("bindClientToRuntimeBase (runtime decision, no Nuxt involved)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the same client object when the runtime baseURL matches mountPath", () => {
    const client = fakeClient();
    expect(bindClientToRuntimeBase(client, "/app/", "/app/")).toBe(client);
  });

  it("rejects register() with the diagnostic code and no URL values, when they differ", async () => {
    const client = fakeClient();
    const bound = bindClientToRuntimeBase(client, SECRET_PATH, "/app/");
    await expect(bound.register()).rejects.toThrow(new RegExp(`^${RUNTIME_BASE_URL_MISMATCH_CODE}:`));
    await expect(bound.register()).rejects.not.toThrow(new RegExp(SECRET_PATH));
    expect(client.register).not.toHaveBeenCalled();
  });

  it("forwards the other three methods (and subscribe/dispose) to the original client unchanged", async () => {
    const client = fakeClient();
    const bound = bindClientToRuntimeBase(client, SECRET_PATH, "/app/");

    await bound.promptInstall();
    await bound.applyUpdate();
    await bound.logout();
    const listener = (): void => undefined;
    bound.subscribe(listener);
    bound.dispose();

    expect(client.promptInstall).toHaveBeenCalledTimes(1);
    expect(client.applyUpdate).toHaveBeenCalledTimes(1);
    expect(client.logout).toHaveBeenCalledTimes(1);
    expect(client.subscribe).toHaveBeenCalledWith(listener);
    expect(client.dispose).toHaveBeenCalledTimes(1);
  });

  it("logs the mismatch once, naming the code, when the paths differ", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    bindClientToRuntimeBase(fakeClient(), SECRET_PATH, "/app/");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(RUNTIME_BASE_URL_MISMATCH_CODE);
    expect(warn.mock.calls[0]?.[0]).not.toContain(SECRET_PATH);
  });

  it("logs nothing when the paths match", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    bindClientToRuntimeBase(fakeClient(), "/app/", "/app/");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("build-time app.baseURL check (real Nuxt, loadNuxt only — no bundling needed to observe this)", () => {
  it("fails to load when app.baseURL does not equal identity.mountPath", async () => {
    await expect(withLoadedFixture({ app: { baseURL: "/wrong/" } }, async () => undefined)).rejects.toThrow(
      new RegExp(`^${BASE_URL_MISMATCH_CODE}:`),
    );
  });

  it("loads cleanly when app.baseURL equals identity.mountPath (the fixture's default, /app/)", async () => {
    await expect(withLoadedFixture({}, async (nuxt) => nuxt.options.app.baseURL)).resolves.toBe("/app/");
  });
});

describe("build-time app.baseURL check, re-asserted at build-hook time (评审第 2 项)", () => {
  const BUILD_TIMEOUT = 180_000;

  it(
    "fails with nuxt.base-url-mismatch when a later hook changes app.baseURL after setup already passed",
    async () => {
      // "ready" fires once every module's own setup (including this one's) has already run and returned
      // successfully, so the setup-time check in src/index.ts cannot have seen this mutation — only a re-assert
      // inside the nitro:build:public-assets hook itself (artifacts.ts's registerArtifactPipeline) can catch it.
      await expect(
        withBuiltFixture(
          { nitro: { prerender: { routes: ["/", "/about", "/offline"] } } },
          async () => undefined,
          "artifacts",
          {
            hooks: {
              ready: (nuxt) => {
                nuxt.options.app.baseURL = "/mutated/";
              },
            },
          },
        ),
      ).rejects.toThrow(new RegExp(`^${BASE_URL_MISMATCH_CODE}:`));
    },
    BUILD_TIMEOUT,
  );

  it(
    "still builds cleanly when nothing mutates app.baseURL after setup",
    async () => {
      await withBuiltFixture(
        { nitro: { prerender: { routes: ["/", "/about", "/offline"] } } },
        async () => undefined,
        "artifacts",
      );
    },
    BUILD_TIMEOUT,
  );
});
