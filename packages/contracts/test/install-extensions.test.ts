import { describe, expect, it } from "vitest";
import { validateInstallMetadata } from "../src/index.js";
import type { PwaValidationResult } from "../src/index.js";
import { identity, install } from "./fixtures.js";

type Finding = readonly [code: string, path: string];

function findings(result: PwaValidationResult<unknown>): Finding[] {
  return result.diagnostics.map((finding) => [finding.code, finding.path] as const);
}

function expectRejected(result: PwaValidationResult<unknown>, expected: readonly Finding[]): void {
  expect(result.ok).toBe(false);
  expect(findings(result)).toEqual(expected);
}

function expectWarnings(result: PwaValidationResult<unknown>, expected: readonly Finding[]): void {
  expect(result.ok).toBe(true);
  expect(findings(result)).toEqual(expected);
}

// A complete, warning-free example exercising every new field.
const fullInstall = {
  ...install,
  description: "A shop for buying things you did not know you needed.",
  categories: ["shopping", "lifestyle"],
  orientation: "portrait-primary",
  displayOverride: ["standalone", "minimal-ui"],
  screenshots: [
    { src: "/app/screenshots/wide-1.png", sizes: "1280x800", type: "image/png", formFactor: "wide", label: "Home" },
    { src: "/app/screenshots/narrow-1.png", sizes: "750x1334", type: "image/png", formFactor: "narrow" },
  ],
  shortcuts: [
    {
      name: "Cart",
      url: "/app/cart",
      shortName: "Cart",
      description: "View your cart",
      icons: [install.icons[0]],
    },
  ],
};

describe("validateInstallMetadata: extension fields (valid)", () => {
  it("accepts a complete example with every new field, without warnings", () => {
    expect(validateInstallMetadata(fullInstall, identity)).toEqual({ ok: true, value: fullInstall, diagnostics: [] });
  });

  it("leaves an example without the new fields byte-identical to the pre-revision behaviour", () => {
    // Captured from the unmodified validator against the unmodified `install` fixture before this
    // revision: no new field is present, so the schema must parse to exactly this literal, with no
    // diagnostics. This must keep passing even as the schema gains new optional fields.
    const preRevisionExpected = {
      ok: true,
      value: {
        startUrl: "/app/",
        display: "standalone",
        name: "Shop",
        shortName: "Shop",
        themeColor: "#0f172a",
        backgroundColor: "#ffffff",
        icons: [
          { src: "/app/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/app/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/app/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/app/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      diagnostics: [],
    };
    expect(validateInstallMetadata(install, identity)).toEqual(preRevisionExpected);
    expect(validateInstallMetadata(install, identity)).toEqual({ ok: true, value: install, diagnostics: [] });
  });
});

describe("validateInstallMetadata: extension fields (format rejections)", () => {
  it.each([
    ["empty categories", { categories: [] }, [["schema.invalid-value", "/categories"]]],
    [
      "six-digit screenshot dimension",
      { screenshots: [{ ...fullInstall.screenshots[0], sizes: "128000x800" }] },
      [["schema.invalid-value", "/screenshots/0/sizes"]],
    ],
    ["empty displayOverride", { displayOverride: [] }, [["schema.invalid-value", "/displayOverride"]]],
    ["empty screenshots", { screenshots: [] }, [["schema.invalid-value", "/screenshots"]]],
    ["empty shortcuts", { shortcuts: [] }, [["schema.invalid-value", "/shortcuts"]]],
    ["duplicate category", { categories: ["shopping", "shopping"] }, [["schema.invalid-value", "/categories"]]],
    ["uppercase category", { categories: ["Shopping"] }, [["schema.invalid-value", "/categories/0"]]],
    [
      "duplicate displayOverride entry",
      { displayOverride: ["standalone", "standalone"] },
      [["schema.invalid-value", "/displayOverride"]],
    ],
    ["unknown orientation value", { orientation: "diagonal" }, [["schema.invalid-value", "/orientation"]]],
    [
      "unknown displayOverride value (still-incubating tabbed)",
      { displayOverride: ["tabbed"] },
      [["schema.invalid-value", "/displayOverride/0"]],
    ],
    [
      "screenshot sizes using * instead of x",
      { screenshots: [{ ...fullInstall.screenshots[0], sizes: "1280*800" }] },
      [["schema.invalid-value", "/screenshots/0/sizes"]],
    ],
    [
      "screenshot sizes with a zero dimension",
      { screenshots: [{ ...fullInstall.screenshots[0], sizes: "0x10" }] },
      [["schema.invalid-value", "/screenshots/0/sizes"]],
    ],
    [
      "unknown screenshot type",
      { screenshots: [{ ...fullInstall.screenshots[0], type: "image/gif" }] },
      [["schema.invalid-value", "/screenshots/0/type"]],
    ],
    [
      "unknown screenshot formFactor",
      { screenshots: [{ ...fullInstall.screenshots[0], formFactor: "square" }] },
      [["schema.invalid-value", "/screenshots/0/formFactor"]],
    ],
    [
      "unknown key in a screenshot object",
      { screenshots: [{ ...fullInstall.screenshots[0], caption: "nope" }] },
      [["schema.unknown-field", "/screenshots/0"]],
    ],
    [
      "unknown key in a shortcut object",
      { shortcuts: [{ ...fullInstall.shortcuts[0], icon: "nope" }] },
      [["schema.unknown-field", "/shortcuts/0"]],
    ],
  ] as const)("rejects %s", (_name, patch, expected) => {
    expectRejected(validateInstallMetadata({ ...fullInstall, ...patch }, identity), expected);
  });
});

describe("validateInstallMetadata: shortcut scope (error)", () => {
  it("rejects a shortcut URL outside the identity scope", () => {
    const shortcuts = [{ ...fullInstall.shortcuts[0], url: "/other/cart" }];
    expectRejected(validateInstallMetadata({ ...fullInstall, shortcuts }, identity), [
      ["install.shortcut-url-outside-scope", "/shortcuts/0/url"],
    ]);
  });

  it("rejects the scope without its trailing slash (/app is not inside /app/)", () => {
    const shortcuts = [{ ...fullInstall.shortcuts[0], url: "/app" }];
    expectRejected(validateInstallMetadata({ ...fullInstall, shortcuts }, identity), [
      ["install.shortcut-url-outside-scope", "/shortcuts/0/url"],
    ]);
  });

  it("rejects a shortcut URL with a query string (paths only, as for every AbsolutePath)", () => {
    const shortcuts = [{ ...fullInstall.shortcuts[0], url: "/app/cart?from=shortcut" }];
    expect(validateInstallMetadata({ ...fullInstall, shortcuts }, identity).ok).toBe(false);
  });

  it("accepts a shortcut URL exactly at the scope boundary", () => {
    const shortcuts = [{ ...fullInstall.shortcuts[0], url: "/app/" }];
    expect(validateInstallMetadata({ ...fullInstall, shortcuts }, identity).ok).toBe(true);
  });
});

describe("validateInstallMetadata: Chrome preference warnings (boundaries)", () => {
  function withScreenshots(screenshots: readonly Record<string, unknown>[]): unknown {
    return { ...fullInstall, screenshots };
  }

  it.each([
    ["320x320 (minimum, ok)", "320x320", []],
    ["319x319 (below minimum, warns)", "319x319", [["install.screenshot-size-out-of-range", "/screenshots/0/sizes"]]],
    ["3840x3840 (maximum, ok)", "3840x3840", []],
    [
      "3841x3841 (above maximum, warns)",
      "3841x3841",
      [["install.screenshot-size-out-of-range", "/screenshots/0/sizes"]],
    ],
  ] as const)("size range: %s", (_name, sizes, expected) => {
    const screenshots = [{ src: "/app/screenshots/s.png", sizes, type: "image/png", formFactor: "wide" }];
    expectWarnings(validateInstallMetadata(withScreenshots(screenshots), identity), expected);
  });

  it.each([
    ["2300x1000 (ratio exactly 2.3, ok)", "2300x1000", []],
    ["2310x1000 (ratio 2.31, warns)", "2310x1000", [["install.screenshot-aspect-ratio", "/screenshots/0/sizes"]]],
  ] as const)("aspect ratio: %s", (_name, sizes, expected) => {
    const screenshots = [{ src: "/app/screenshots/s.png", sizes, type: "image/png", formFactor: "wide" }];
    expectWarnings(validateInstallMetadata(withScreenshots(screenshots), identity), expected);
  });

  it("warns once when screenshots sharing a form factor have different aspect ratios", () => {
    const screenshots = [
      { src: "/app/screenshots/a.png", sizes: "1280x800", type: "image/png", formFactor: "wide" },
      { src: "/app/screenshots/b.png", sizes: "1200x800", type: "image/png", formFactor: "wide" },
    ];
    expectWarnings(validateInstallMetadata(withScreenshots(screenshots), identity), [
      ["install.screenshot-aspect-mismatch", "/screenshots"],
    ]);
  });

  it("does not warn when screenshots sharing a form factor have the same aspect ratio", () => {
    const screenshots = [
      { src: "/app/screenshots/a.png", sizes: "1280x800", type: "image/png", formFactor: "wide" },
      { src: "/app/screenshots/b.png", sizes: "640x400", type: "image/png", formFactor: "wide" },
    ];
    expectWarnings(validateInstallMetadata(withScreenshots(screenshots), identity), []);
  });

  it("treats a missing formFactor as narrow when checking for a mismatch", () => {
    const screenshots = [
      { src: "/app/screenshots/a.png", sizes: "750x1334", type: "image/png" },
      { src: "/app/screenshots/b.png", sizes: "750x1000", type: "image/png" },
      { src: "/app/screenshots/c.png", sizes: "1000x1000", type: "image/png", formFactor: "wide" },
    ];
    expectWarnings(validateInstallMetadata(withScreenshots(screenshots), identity), [
      ["install.screenshot-aspect-mismatch", "/screenshots"],
    ]);
  });

  it("warns once when 9 wide screenshots are declared but not at 8", () => {
    const wide = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        src: `/app/screenshots/w${index}.png`,
        sizes: "1000x1000",
        type: "image/png" as const,
        formFactor: "wide" as const,
      }));
    expectWarnings(validateInstallMetadata(withScreenshots(wide(8)), identity), []);
    expectWarnings(validateInstallMetadata(withScreenshots(wide(9)), identity), [
      ["install.screenshot-count", "/screenshots"],
    ]);
  });

  it("warns once when 6 narrow (including missing formFactor) screenshots are declared but not at 5", () => {
    const withNarrowCount = (count: number) => [
      { src: "/app/screenshots/w.png", sizes: "1000x1000", type: "image/png", formFactor: "wide" },
      ...Array.from({ length: count }, (_, index) => ({
        src: `/app/screenshots/n${index}.png`,
        sizes: "1000x1000",
        type: "image/png" as const,
      })),
    ];
    expectWarnings(validateInstallMetadata(withScreenshots(withNarrowCount(5)), identity), []);
    expectWarnings(validateInstallMetadata(withScreenshots(withNarrowCount(6)), identity), [
      ["install.screenshot-count", "/screenshots"],
    ]);
  });

  it("warns when screenshots are declared but none is wide", () => {
    const screenshots = [{ src: "/app/screenshots/n.png", sizes: "750x1334", type: "image/png", formFactor: "narrow" }];
    expectWarnings(validateInstallMetadata(withScreenshots(screenshots), identity), [
      ["install.screenshot-no-wide", "/screenshots"],
    ]);
  });

  it.each([
    ["324 characters (ok)", 324, []],
    ["325 characters (warns)", 325, [["install.description-too-long", "/description"]]],
  ] as const)("description length: %s", (_name, length, expected) => {
    const description = "d".repeat(length);
    expectWarnings(validateInstallMetadata({ ...fullInstall, description }, identity), expected);
  });
});

describe("validateInstallMetadata: diagnostics never echo values", () => {
  // A successful result's `value` legitimately carries the input back (existing behaviour); the
  // no-echo guarantee is about `diagnostics`, so these force a diagnostic to fire and inspect only that.
  it("keeps a marker string in an over-long description out of the diagnostic", () => {
    const description = "MARKER-DESCRIPTION-".repeat(20);
    const result = validateInstallMetadata({ ...fullInstall, description }, identity);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toContain("MARKER-DESCRIPTION");
  });

  it("keeps a marker string in a screenshot label out of the diagnostic it triggers", () => {
    const screenshots = [
      { src: "/app/screenshots/s.png", sizes: "100x100", type: "image/png", formFactor: "wide", label: "MARKER-LABEL" },
    ];
    const result = validateInstallMetadata({ ...fullInstall, screenshots }, identity);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toContain("MARKER-LABEL");
  });

  it("keeps a marker string in an out-of-scope shortcut URL out of every diagnostic", () => {
    const shortcuts = [{ ...fullInstall.shortcuts[0], url: "/other/MARKER-URL" }];
    const result = validateInstallMetadata({ ...fullInstall, shortcuts }, identity);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("MARKER-URL");
  });
});
