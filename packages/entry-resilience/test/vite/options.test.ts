// Creation-time option validation for `pwaEntryResilience()` (see src/vite/options.ts). No build runs here.
// ADR-0033 (2026-09-23) removed `keys`, `seed`, `approvedOrigins` and `discoveryUrl` along with the private-key-
// material scan that covered them; only `identity` and `maxValidityDays` remain.
import type { PwaIdentity } from "@pwa-platform/contracts";
import { describe, expect, it } from "vitest";
import { validatePwaEntryResilienceOptions } from "../../src/vite/options.js";
import type { PwaEntryResilienceOptions } from "../../src/vite/options.js";

const IDENTITY: PwaIdentity = {
  appId: "pwaexample",
  manifestId: "/app/",
  origin: "https://entryfixture.example.com",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  manifestUrl: "/app/manifest.webmanifest",
  mountPath: "/app/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

/** Options that pass every rule in this file; individual tests override one field at a time. */
function validOptions(overrides: Partial<PwaEntryResilienceOptions> = {}): PwaEntryResilienceOptions {
  return { identity: IDENTITY, ...overrides };
}

/** Asserts `fn` throws a `TypeError` whose message names `code`. */
function expectFailure(fn: () => unknown, code: string): void {
  let message: string | undefined;
  expect(() => {
    try {
      fn();
    } catch (error) {
      message = error instanceof Error ? error.message : undefined;
      throw error;
    }
  }).toThrow(TypeError);
  expect(message).toBeDefined();
  expect(message).toContain(code);
}

describe("validatePwaEntryResilienceOptions: happy path", () => {
  it("accepts a fully valid options object and defaults maxValidityDays to 30", () => {
    const result = validatePwaEntryResilienceOptions(validOptions());
    expect(result).toEqual({
      identity: IDENTITY,
      maxValidityDays: 30,
      css: undefined,
      locale: "zh-CN",
      messages: undefined,
    });
  });

  it("keeps an explicit maxValidityDays within 1-90", () => {
    expect(validatePwaEntryResilienceOptions(validOptions({ maxValidityDays: 1 })).maxValidityDays).toBe(1);
    expect(validatePwaEntryResilienceOptions(validOptions({ maxValidityDays: 90 })).maxValidityDays).toBe(90);
  });
});

describe("validatePwaEntryResilienceOptions: maxValidityDays", () => {
  it.each([0, 91, 1.5, -1, Number.NaN])("rejects %j", (value) => {
    expectFailure(() => validatePwaEntryResilienceOptions(validOptions({ maxValidityDays: value })), "entry.max-validity-days-invalid");
  });
});

describe("validatePwaEntryResilienceOptions: css", () => {
  it("defaults css to undefined when not given", () => {
    expect(validatePwaEntryResilienceOptions(validOptions()).css).toBeUndefined();
  });

  it("passes a valid css string through verbatim", () => {
    const css = ".pwa-entry { --pwa-entry-accent: #c8102e; }";
    expect(validatePwaEntryResilienceOptions(validOptions({ css })).css).toBe(css);
  });

  it("rejects a css value containing </style, which would close the style block early", () => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ css: "a{}</style><script>evil</script>" })),
      "entry.css-invalid",
    );
  });

  it.each(["</STYLE>", "</Style>"])("rejects css closing the block in any letter case (%s)", (closer) => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ css: `a{}${closer}<script>evil</script>` })),
      "entry.css-invalid",
    );
  });

  it("normalizes CRLF and lone CR in css to LF, the text the browser hashes", () => {
    expect(validatePwaEntryResilienceOptions(validOptions({ css: "a{}\r\nb{}\rc{}" })).css).toBe("a{}\nb{}\nc{}");
  });

  it("rejects a non-string css value", () => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ css: 123 as unknown as string })),
      "entry.css-invalid",
    );
  });
});

describe("validatePwaEntryResilienceOptions: locale", () => {
  it("defaults locale to zh-CN when not given", () => {
    expect(validatePwaEntryResilienceOptions(validOptions()).locale).toBe("zh-CN");
  });

  it.each(["zh-CN", "en"] as const)("accepts %s verbatim", (locale) => {
    expect(validatePwaEntryResilienceOptions(validOptions({ locale })).locale).toBe(locale);
  });

  it.each(["fr", "zh", "EN", "", 1, null, {}])("rejects %j with entry.locale-invalid at /locale", (value) => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ locale: value as never })),
      "entry.locale-invalid",
    );
  });
});

describe("validatePwaEntryResilienceOptions: messages", () => {
  it("defaults messages to undefined when not given", () => {
    expect(validatePwaEntryResilienceOptions(validOptions()).messages).toBeUndefined();
  });

  it("passes a valid partial override through verbatim", () => {
    const messages = { documentTitle: "Custom title", go: "Continue to {host}" };
    expect(validatePwaEntryResilienceOptions(validOptions({ messages })).messages).toEqual(messages);
  });

  it("accepts an empty override object", () => {
    expect(validatePwaEntryResilienceOptions(validOptions({ messages: {} })).messages).toEqual({});
  });

  it("rejects a non-object messages value", () => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ messages: "nope" as unknown as Record<string, string> })),
      "entry.message-invalid",
    );
  });

  it("rejects an array messages value", () => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ messages: [] as unknown as Record<string, string> })),
      "entry.message-invalid",
    );
  });

  it("rejects an unknown message key at the messages path, without naming the key", () => {
    let message: string | undefined;
    try {
      validatePwaEntryResilienceOptions(validOptions({ messages: { bogusKey: "x" } as never }));
    } catch (error) {
      message = error instanceof Error ? error.message : undefined;
    }
    expect(message).toContain("entry.message-invalid at /messages");
    expect(message).not.toContain("bogusKey");
  });

  it.each(["documentTitle", "loading", "empty", "headlineMigrating", "headlineIncident", "headlineUnconfirmedOutage", "expiry", "go"] as const)(
    "rejects a non-string value for %s",
    (key) => {
      const messages = { [key]: 123 } as unknown as Record<string, string>;
      expectFailure(
        () => validatePwaEntryResilienceOptions(validOptions({ messages })),
        "entry.message-invalid",
      );
    },
  );

  it("rejects an empty string value", () => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ messages: { loading: "" } })),
      "entry.message-invalid",
    );
  });

  it("rejects a value longer than 200 characters", () => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ messages: { loading: "a".repeat(201) } })),
      "entry.message-invalid",
    );
  });

  it("accepts a value of exactly 200 characters", () => {
    const messages = { loading: "a".repeat(200) };
    expect(validatePwaEntryResilienceOptions(validOptions({ messages })).messages).toEqual(messages);
  });

  it("rejects expiry missing the {expiresAt} placeholder", () => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ messages: { expiry: "valid until later" } })),
      "entry.message-invalid",
    );
  });

  it("rejects expiry with a duplicated {expiresAt} placeholder", () => {
    expectFailure(
      () =>
        validatePwaEntryResilienceOptions(
          validOptions({ messages: { expiry: "{expiresAt} and again {expiresAt}" } }),
        ),
      "entry.message-invalid",
    );
  });

  it("rejects go missing the {host} placeholder", () => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ messages: { go: "Continue" } })),
      "entry.message-invalid",
    );
  });

  it("rejects go with a duplicated {host} placeholder", () => {
    expectFailure(
      () => validatePwaEntryResilienceOptions(validOptions({ messages: { go: "{host} or {host}" } })),
      "entry.message-invalid",
    );
  });

  it("accepts expiry and go with their placeholder exactly once", () => {
    const messages = { expiry: "Valid until {expiresAt}!", go: "Continue to {host} now" };
    expect(validatePwaEntryResilienceOptions(validOptions({ messages })).messages).toEqual(messages);
  });

  // "never echo input" (this package's rule, restated for messages in spec's revision): the error for an invalid
  // message value must not contain the value itself anywhere in the thrown message.
  it("never echoes the invalid value in the thrown message", () => {
    const marker = "UNMISTAKABLE_SENTINEL_VALUE_31337";
    let message: string | undefined;
    try {
      validatePwaEntryResilienceOptions(validOptions({ messages: { loading: marker.repeat(10) } }));
    } catch (error) {
      message = error instanceof Error ? error.message : undefined;
    }
    expect(message).toBeDefined();
    expect(message).not.toContain(marker);
  });

  it("never echoes a too-long value's own text, even truncated, in the thrown message", () => {
    const marker = "ECHO_CHECK_TOKEN";
    let message: string | undefined;
    try {
      validatePwaEntryResilienceOptions(validOptions({ messages: { expiry: `${marker} no placeholder here` } }));
    } catch (error) {
      message = error instanceof Error ? error.message : undefined;
    }
    expect(message).toBeDefined();
    expect(message).not.toContain(marker);
  });
});

describe("validatePwaEntryResilienceOptions: options object", () => {
  it("rejects a null options value", () => {
    expect(() => validatePwaEntryResilienceOptions(null as unknown as PwaEntryResilienceOptions)).toThrow(TypeError);
  });
});

describe("validatePwaEntryResilienceOptions: removed options (ADR-0033)", () => {
  it.each(["keys", "seed", "approvedOrigins", "discoveryUrl"])(
    "rejects %s with a message naming the option and ADR-0033",
    (name) => {
      const options = { ...validOptions(), [name]: {} } as unknown as PwaEntryResilienceOptions;
      expectFailure(() => validatePwaEntryResilienceOptions(options), "entry.option-removed");
      let message: string | undefined;
      try {
        validatePwaEntryResilienceOptions(options);
      } catch (error) {
        message = error instanceof Error ? error.message : undefined;
      }
      expect(message).toContain(name);
      expect(message).toContain("ADR-0033");
    },
  );
});
