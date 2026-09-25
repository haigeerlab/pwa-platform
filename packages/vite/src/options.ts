// The plugin's options, validated when the plugin is created rather than when the build runs: a misspelled origin
// should fail while the developer is looking at vite.config, not eight steps into generateBundle.
import {
  TOPOLOGY_KINDS,
  validateIdentity,
  validateInstallMetadata,
  validateOriginRegistry,
  validatePolicy,
  type PwaDiagnostic,
  type PwaIdentity,
  type PwaInstallMetadata,
  type PwaPolicy,
  type PwaTopology,
  type PwaValidationResult,
} from "@pwa-platform/contracts";
import type { PwaOfflinePageLocale, PwaOfflinePageMessages } from "./offline-page.js";

/** spec/vite-adapter.md's "修订：平台默认离线页（2026-09-24，已评审通过）" -> "契约增量". Opt-in only: the platform
 *  default offline page is rendered only when this is set, and only Vite exposes it (Nuxt does not). */
export type PwaViteOfflinePageOptions = {
  /** Fixed at build time; no runtime switching. Defaults to `"zh-CN"`. */
  readonly locale?: PwaOfflinePageLocale;
  /** Overrides some or all of the chosen locale's built-in copy (offline-page.ts's `OFFLINE_PAGE_MESSAGES`). */
  readonly messages?: Partial<PwaOfflinePageMessages>;
  /** Host CSS appended verbatim, as a second inline `<style>`, right after the platform's default stylesheet. The
   *  only rule enforced is that it must not contain the literal sequence `</style`, which would close the style
   *  block early — same rule as packages/entry-resilience/src/vite/options.ts's `css`, not shared code. */
  readonly css?: string;
};

export type PwaViteOptions = {
  readonly identity: PwaIdentity;
  readonly policy: PwaPolicy;
  /** `null` when the app does not offer installation; the plugin then emits no manifest. */
  readonly install: PwaInstallMetadata | null;
  readonly topology: PwaTopology;
  /** Enables the platform default offline page. Requires `policy.offlineFallback.enabled === true` — set without
   *  it, the build fails (`vite.offline-page-without-fallback`) rather than silently doing nothing. */
  readonly offlinePage?: PwaViteOfflinePageOptions;
};

/** The same three fields `offlinePage` may carry, each already checked and defaulted. */
export type PwaViteOfflinePageValidated = {
  readonly locale: PwaOfflinePageLocale;
  readonly messages: Partial<PwaOfflinePageMessages> | undefined;
  readonly css: string | undefined;
};

/** The same four fields, each already checked. `compilePlan` still validates everything again at build time. */
export type PwaValidatedOptions = {
  readonly identity: PwaIdentity;
  readonly policy: PwaPolicy;
  readonly install: PwaInstallMetadata | null;
  readonly topology: PwaTopology;
};

/**
 * Validates the plugin options, throwing for anything the platform would reject later.
 *
 * Messages name diagnostic codes and contract paths only. An option's value can be an origin, a scope or an app id,
 * and build logs are routinely pasted into issues — so nothing from the input is echoed back.
 */
export function validateOptions(options: PwaViteOptions): PwaValidatedOptions {
  if (options === null || typeof options !== "object") {
    throw new TypeError("The pwa plugin requires an options object");
  }

  const identity = take("identity", validateIdentity(options.identity));
  const policy = take("policy", validatePolicy(options.policy));

  // contracts publishes no validateTopology function: `kind` membership is checked here against the exported
  // `TOPOLOGY_KINDS` constant, and — for `shared-origin` — the registry itself is fully validated below, the same
  // as every other option. What stays with `compilePlan` is only what needs the identity and the registry
  // together: whether this app's identity matches exactly one registry entry, and everything that follows from
  // which entry it is (root or child).
  const topology = options.topology;
  if (topology === null || typeof topology !== "object" || !isTopologyKind(topology.kind)) {
    throw new TypeError(`topology.kind must be one of: ${TOPOLOGY_KINDS.join(", ")}`);
  }

  // Install metadata is checked against the identity: contracts verifies that startUrl falls inside the scope.
  const install = options.install === null ? null : take("install", validateInstallMetadata(options.install, identity));

  // A standalone topology is rebuilt from its one field, dropping anything else a caller put on the object, as before.
  // A shared-origin registry is checked here, at plugin creation, like every other option: an overlapping child
  // scope or a duplicated worker URL should fail while the developer is looking at vite.config (ADR-0019). Whether
  // this app's identity matches exactly one registry entry is the compiler's check — it needs the identity and the
  // registry together, and compilePlan already runs it.
  const normalized: PwaTopology =
    topology.kind === "standalone-origin"
      ? { kind: "standalone-origin" }
      : {
          kind: "shared-origin",
          registry: take("topology/registry", validateOriginRegistry((topology as { readonly registry?: unknown }).registry)),
        };

  return { identity, policy, install, topology: normalized };
}

function isTopologyKind(kind: unknown): kind is PwaTopology["kind"] {
  return typeof kind === "string" && (TOPOLOGY_KINDS as readonly string[]).includes(kind);
}

function take<T>(field: string, result: PwaValidationResult<T>): T {
  if (result.ok) return result.value;
  throw new TypeError(`The pwa plugin's ${field} is not valid: ${describe(result.diagnostics, field)}`);
}

/** Prefixes each diagnostic path with the option it came from, the way compilePlan prefixes its own inputs. */
function describe(diagnostics: readonly PwaDiagnostic[], field: string): string {
  return diagnostics.map(({ code, path }) => `${code} at /${field}${path}`).join(", ");
}

/** `offlinePage`'s diagnostic codes: this package's own vocabulary, not one of contracts' `PwaDiagnosticCode`s —
 *  the option they describe is Vite-only and never reaches `compilePlan`. Same "never echo input" rule as
 *  `take`/`describe` above: only a code and a JSON-Pointer-like path, never a value. */
export type PwaViteDiagnosticCode =
  | "vite.offline-page-without-fallback"
  | "vite.offline-page-locale-invalid"
  | "vite.offline-page-message-invalid"
  | "vite.offline-page-css-invalid"
  | "vite.offline-page-conflict";

/** Throws a `TypeError` naming a `PwaViteDiagnosticCode` and a path; never returns. Exported so index.ts's build-
 *  time conflict check (`vite.offline-page-conflict`, only detectable once the bundle is known) uses the exact
 *  same message shape as the option-validation failures below. */
export function failOfflinePageDiagnostic(code: PwaViteDiagnosticCode, path: string): never {
  throw new TypeError(`The pwa plugin's offlinePage is not valid: ${code} at ${path}`);
}

const OFFLINE_PAGE_LOCALES = ["zh-CN", "en"] as const;
const OFFLINE_PAGE_MESSAGE_KEYS = ["documentTitle", "heading", "body", "retry"] as const;
const MAX_OFFLINE_PAGE_MESSAGE_LENGTH = 200;

/** Defaults to `"zh-CN"` when absent; rejected if present and not one of `OFFLINE_PAGE_LOCALES`. */
function validateOfflinePageLocale(value: unknown): PwaOfflinePageLocale {
  if (value === undefined) return "zh-CN";
  if (typeof value !== "string" || !(OFFLINE_PAGE_LOCALES as readonly string[]).includes(value)) {
    failOfflinePageDiagnostic("vite.offline-page-locale-invalid", "/offlinePage/locale");
  }
  return value as PwaOfflinePageLocale;
}

/** Validates one already-known message key's value; throws `vite.offline-page-message-invalid` at
 *  `/offlinePage/messages/<key>` for anything a build would reject — never a string, empty, or over 200
 *  characters. Never echoes the value itself. */
function validateOfflinePageMessageValue(key: string, value: unknown): void {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_OFFLINE_PAGE_MESSAGE_LENGTH) {
    failOfflinePageDiagnostic("vite.offline-page-message-invalid", `/offlinePage/messages/${key}`);
  }
}

/** `undefined` when the option is absent; otherwise the override object, rejected as a whole if it is not a plain
 *  object, and key by key for an unknown key (any key outside `OFFLINE_PAGE_MESSAGE_KEYS`) or an invalid value. */
function validateOfflinePageMessages(value: unknown): Partial<PwaOfflinePageMessages> | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    failOfflinePageDiagnostic("vite.offline-page-message-invalid", "/offlinePage/messages");
  }

  const record = value as Record<string, unknown>;
  const copy: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    // An unknown key is reported at the object's own path: the key name is the caller's input, and diagnostics
    // never carry input (packages/contracts/src/internal/diagnostic.ts truncates unknown path segments likewise).
    if (!(OFFLINE_PAGE_MESSAGE_KEYS as readonly string[]).includes(key)) {
      failOfflinePageDiagnostic("vite.offline-page-message-invalid", "/offlinePage/messages");
    }
    validateOfflinePageMessageValue(key, record[key]);
    copy[key] = record[key] as string;
  }

  // A copy: the page renders in generateBundle, long after this check, and must not see later edits to the object.
  return copy as Partial<PwaOfflinePageMessages>;
}

/** `undefined` when the option is absent; otherwise the string, rejected if it is not a string at all or contains
 *  `</style` — mirrors packages/entry-resilience/src/vite/options.ts's `validateCss`, not shared code. */
function validateOfflinePageCss(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  // Case-insensitive: the HTML tokenizer lowercases end-tag names, so `</STYLE` closes the block just as well.
  if (typeof value !== "string" || /<\/style/i.test(value)) {
    failOfflinePageDiagnostic("vite.offline-page-css-invalid", "/offlinePage/css");
  }
  // Line endings normalized before the text is written or hashed: the HTML parser turns CRLF and lone CR into LF,
  // and CSP hashes the normalized text, so a CRLF file would otherwise log a hash no browser would match.
  return value.replace(/\r\n?/g, "\n");
}

/**
 * Validates the plugin's `offlinePage` option, throwing for anything a build would reject later. Returns
 * `undefined` when the option is absent, which means: no page is rendered, and the build's output is unchanged
 * from before this option existed.
 *
 * Takes the already-validated `policy`, not the raw option, so the "requires offlineFallback" check reads the
 * same normalized value `compilePlan` will.
 */
export function validateOfflinePageOption(
  offlinePage: PwaViteOfflinePageOptions | undefined,
  policy: PwaPolicy,
): PwaViteOfflinePageValidated | undefined {
  if (offlinePage === undefined) return undefined;
  if (offlinePage === null || typeof offlinePage !== "object") {
    throw new TypeError("The pwa plugin's offlinePage must be an object");
  }
  if (policy.offlineFallback.enabled !== true) {
    failOfflinePageDiagnostic("vite.offline-page-without-fallback", "/offlinePage");
  }

  const locale = validateOfflinePageLocale(offlinePage.locale);
  const messages = validateOfflinePageMessages(offlinePage.messages);
  const css = validateOfflinePageCss(offlinePage.css);

  return { locale, messages, css };
}
