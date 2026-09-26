import { DIAGNOSTIC_MESSAGES, TOPOLOGY_KINDS, type PwaIdentity, type PwaInstallMetadata, type PwaPolicy } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { pwa } from "../src/index.js";
import { validateOfflinePageOption, validateOptions, type PwaViteOfflinePageOptions, type PwaViteOptions } from "../src/options.js";

const identity: PwaIdentity = {
  appId: "storefront",
  manifestId: "/app/",
  origin: "https://shop.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

const install: PwaInstallMetadata = {
  startUrl: "/app/",
  display: "standalone",
  name: "Storefront",
  shortName: "Shop",
  themeColor: "#0b5fff",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

const policy: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  updateMode: "prompt",
  offlineFallback: { enabled: false },
  resources: [],
};

function options(overrides: Partial<PwaViteOptions> = {}): PwaViteOptions {
  return { identity, policy, install, topology: { kind: "standalone-origin" }, ...overrides };
}

describe("validateOptions", () => {
  it("accepts a complete set of options", () => {
    const validated = validateOptions(options());
    expect(validated.identity.appId).toBe("storefront");
    expect(validated.install).not.toBeNull();
    expect(validated.topology).toEqual({ kind: "standalone-origin" });
  });

  it("accepts a null install, which means the app offers no installation", () => {
    expect(validateOptions(options({ install: null })).install).toBeNull();
  });

  it("preserves a validated v2 offline-write policy for the build pipeline", () => {
    const v2: PwaPolicy = {
      ...policy,
      schemaVersion: 2,
      resources: [{ pathPrefix: "/api/orders", resourceClass: "mutation", cache: "none" }],
      offlineWrites: { enabled: true, maxEntries: 1, maxTotalBodyBytes: 1, targets: [{ id: "submit-order", pathPrefix: "/api/orders", maxBodyBytes: 1 }] },
    };
    expect(validateOptions(options({ policy: v2 })).policy).toEqual(v2);
  });

  it("rejects an invalid identity, naming the code and the contract path", () => {
    const broken = { ...identity, origin: "ftp://shop.example.com" };
    expect(() => validateOptions(options({ identity: broken }))).toThrow(/identity\.invalid-origin at \/identity/);
  });

  it("rejects an invalid policy", () => {
    const broken = { ...policy, updateMode: "silent" } as unknown as PwaPolicy;
    expect(() => validateOptions(options({ policy: broken }))).toThrow(/at \/policy/);
  });

  it("checks install metadata against the identity, not on its own", () => {
    // contracts verifies that startUrl falls inside the scope, which it can only do with the identity at hand.
    const outside = { ...install, startUrl: "/elsewhere/" } as PwaInstallMetadata;
    expect(() => validateOptions(options({ install: outside }))).toThrow(/install\.start-url-outside-scope/);
  });

  it("rejects a topology kind outside the exported constant", () => {
    const broken = { kind: "multi-tenant-origin" } as unknown as PwaViteOptions["topology"];
    expect(() => validateOptions(options({ topology: broken }))).toThrow(/topology\.kind must be one of/);
    expect(TOPOLOGY_KINDS).toContain("standalone-origin");
  });

  it("rejects a topology that is not an object", () => {
    for (const broken of [null, undefined, "standalone-origin", 7]) {
      expect(() => validateOptions(options({ topology: broken as never })), JSON.stringify(broken)).toThrow(TypeError);
    }
  });

  it("rejects options that are not an object at all", () => {
    for (const broken of [null, undefined, "config", 7]) {
      expect(() => validateOptions(broken as never), JSON.stringify(broken)).toThrow(TypeError);
    }
  });

  it("never echoes an option value into the error message", () => {
    // Build logs get pasted into issues. An origin, a scope or an app id must not travel with them.
    const secret = "https://unreleased-tenant.example.com";
    const broken = { ...identity, origin: `${secret}/trailing` };
    try {
      validateOptions(options({ identity: broken }));
      expect.unreachable("should have thrown");
    } catch (error) {
      const { message } = error as Error;
      expect(message).not.toContain(secret);
      expect(message).not.toContain("unreleased-tenant");
      // What it does carry is the platform's own vocabulary: codes and contract paths.
      expect(message).toMatch(/identity\.[a-z-]+ at \/identity/);
    }
  });

  it("uses diagnostic codes the platform publishes, not invented ones", () => {
    const broken = { ...identity, origin: "ftp://shop.example.com" };
    try {
      validateOptions(options({ identity: broken }));
      expect.unreachable("should have thrown");
    } catch (error) {
      const code = /((?:identity|policy|install)\.[a-z-]+)/.exec((error as Error).message)?.[1] ?? "";
      expect(Object.keys(DIAGNOSTIC_MESSAGES)).toContain(code);
    }
  });
});

const enabledFallbackPolicy: PwaPolicy = { ...policy, offlineFallback: { enabled: true, path: "/offline.html" } };

function offlinePageOptions(overrides: Partial<PwaViteOfflinePageOptions> = {}): PwaViteOfflinePageOptions {
  return { ...overrides };
}

describe("validateOfflinePageOption", () => {
  it("returns undefined when offlinePage is not set, regardless of the policy", () => {
    expect(validateOfflinePageOption(undefined, policy)).toBeUndefined();
    expect(validateOfflinePageOption(undefined, enabledFallbackPolicy)).toBeUndefined();
  });

  it("defaults locale to zh-CN and leaves messages/css undefined when offlinePage is an empty object", () => {
    expect(validateOfflinePageOption(offlinePageOptions(), enabledFallbackPolicy)).toEqual({
      locale: "zh-CN",
      messages: undefined,
      css: undefined,
    });
  });

  it("accepts an explicit locale, messages override and css", () => {
    const validated = validateOfflinePageOption(
      offlinePageOptions({ locale: "en", messages: { heading: "Custom" }, css: ".x{color:red}" }),
      enabledFallbackPolicy,
    );
    expect(validated).toEqual({ locale: "en", messages: { heading: "Custom" }, css: ".x{color:red}" });
  });

  it("rejects offlinePage when offlineFallback is not enabled (vite.offline-page-without-fallback)", () => {
    expect(() => validateOfflinePageOption(offlinePageOptions(), policy)).toThrow(
      /vite\.offline-page-without-fallback at \/offlinePage/,
    );
  });

  it("rejects offlinePage when offlineFallback is absent from a disabled policy object", () => {
    const disabled: PwaPolicy = { ...policy, offlineFallback: { enabled: false } };
    expect(() => validateOfflinePageOption(offlinePageOptions(), disabled)).toThrow(
      /vite\.offline-page-without-fallback/,
    );
  });

  it("rejects an invalid locale (vite.offline-page-locale-invalid at /offlinePage/locale)", () => {
    expect(() =>
      validateOfflinePageOption(offlinePageOptions({ locale: "fr" as never }), enabledFallbackPolicy),
    ).toThrow(/vite\.offline-page-locale-invalid at \/offlinePage\/locale/);
  });

  it("never echoes the invalid locale value", () => {
    const secret = "marker-locale-xyz";
    try {
      validateOfflinePageOption(offlinePageOptions({ locale: secret as never }), enabledFallbackPolicy);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("rejects an unknown message key (vite.offline-page-message-invalid)", () => {
    expect(() =>
      validateOfflinePageOption(
        offlinePageOptions({ messages: { unknownKey: "x" } as never }),
        enabledFallbackPolicy,
      ),
    ).toThrow(/vite\.offline-page-message-invalid at \/offlinePage\/messages$/);
  });

  it("rejects a non-string message value", () => {
    expect(() =>
      validateOfflinePageOption(offlinePageOptions({ messages: { heading: 7 as never } }), enabledFallbackPolicy),
    ).toThrow(/vite\.offline-page-message-invalid at \/offlinePage\/messages\/heading/);
  });

  it("rejects an empty message value", () => {
    expect(() =>
      validateOfflinePageOption(offlinePageOptions({ messages: { heading: "" } }), enabledFallbackPolicy),
    ).toThrow(/vite\.offline-page-message-invalid at \/offlinePage\/messages\/heading/);
  });

  it("rejects a message value over 200 characters", () => {
    expect(() =>
      validateOfflinePageOption(
        offlinePageOptions({ messages: { heading: "x".repeat(201) } }),
        enabledFallbackPolicy,
      ),
    ).toThrow(/vite\.offline-page-message-invalid at \/offlinePage\/messages\/heading/);
  });

  it("accepts a message value at exactly 200 characters", () => {
    expect(() =>
      validateOfflinePageOption(
        offlinePageOptions({ messages: { heading: "x".repeat(200) } }),
        enabledFallbackPolicy,
      ),
    ).not.toThrow();
  });

  it("never echoes an invalid message value", () => {
    const secret = "marker-message-value-xyz";
    try {
      validateOfflinePageOption(offlinePageOptions({ messages: { heading: 7 as never } }), enabledFallbackPolicy);
    } catch {
      // fall through to the real assertion below
    }
    try {
      validateOfflinePageOption(offlinePageOptions({ messages: { [secret]: "x" } as never }), enabledFallbackPolicy);
      expect.unreachable("should have thrown");
    } catch (error) {
      // An unknown key is the caller's input too: it is reported at the messages object's own path, never named.
      expect((error as Error).message).toBe("The pwa plugin's offlinePage is not valid: vite.offline-page-message-invalid at /offlinePage/messages");
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("rejects a non-string css value (vite.offline-page-css-invalid)", () => {
    expect(() =>
      validateOfflinePageOption(offlinePageOptions({ css: 7 as never }), enabledFallbackPolicy),
    ).toThrow(/vite\.offline-page-css-invalid at \/offlinePage\/css/);
  });

  it.each(["</STYLE>", "</Style>"])("rejects css closing the block in any letter case (%s)", (closer) => {
    expect(() =>
      validateOfflinePageOption(offlinePageOptions({ css: `a{}${closer}<script>evil()</script>` }), enabledFallbackPolicy),
    ).toThrow(/vite\.offline-page-css-invalid at \/offlinePage\/css/);
  });

  it("normalizes CRLF and lone CR in css to LF, the text the browser hashes", () => {
    const validated = validateOfflinePageOption(offlinePageOptions({ css: "a{}\r\nb{}\rc{}" }), enabledFallbackPolicy);
    expect(validated?.css).toBe("a{}\nb{}\nc{}");
  });

  it("keeps its own copy of messages, unaffected by later edits to the caller's object", () => {
    const messages: { heading: string } = { heading: "before" };
    const validated = validateOfflinePageOption(offlinePageOptions({ messages }), enabledFallbackPolicy);
    messages.heading = "";
    expect(validated?.messages).toEqual({ heading: "before" });
  });

  it("rejects css containing </style", () => {
    expect(() =>
      validateOfflinePageOption(offlinePageOptions({ css: "</style><script>evil()</script>" }), enabledFallbackPolicy),
    ).toThrow(/vite\.offline-page-css-invalid at \/offlinePage\/css/);
  });

  it("never echoes the css value", () => {
    const secret = "marker-css-payload-xyz";
    try {
      validateOfflinePageOption(offlinePageOptions({ css: `${secret}</style` }), enabledFallbackPolicy);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});

describe("pwa", () => {
  it("builds a plugin available in development and builds that runs last", () => {
    const plugin = pwa(options());
    expect(plugin.name).toBe("pwa-platform");
    expect(plugin.apply).toBeUndefined();
    expect(plugin.enforce).toBe("post");
  });

  it("validates when the plugin is created, not when the build runs", () => {
    // The whole point of checking here: vite.config is where the developer can still see what they typed.
    const broken = { ...identity, scope: "app/" } as unknown as PwaIdentity;
    expect(() => pwa(options({ identity: broken }))).toThrow(TypeError);
  });

  it("validates offlinePage at plugin creation too, when offlineFallback is not enabled", () => {
    expect(() => pwa(options({ offlinePage: {} }))).toThrow(/vite\.offline-page-without-fallback/);
  });

  it("accepts offlinePage when offlineFallback is enabled", () => {
    expect(() =>
      pwa(options({ policy: enabledFallbackPolicy, offlinePage: { locale: "en" } })),
    ).not.toThrow();
  });
});
