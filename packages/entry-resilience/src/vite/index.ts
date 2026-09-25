// The Vite plugin that publishes the entry-recovery page's build-time half: the recovery page, its fingerprinted
// script, and the virtual config module every page-side entry reads. Runs alongside `pwa()` (`@pwa-platform/vite`),
// never in place of it — see spec/pwa-entry-resilience.md's "构建集成" and ADR-0018's "构建集成是与 pwa() 并列的独
// 立 Vite 插件".
//
// ADR-0033 (2026-09-23) removed the build-time seed and its signature verification: the platform no longer holds a
// trust root, so there is nothing left to verify in `buildStart` before emitting the recovery page's chunk.
import { PWA_PLUGIN_NAME, type PwaPluginApi } from "@pwa-platform/vite";
import type { Plugin } from "vite";
import type { EntryCheckerConfig } from "../browser/index.js";
import { diagnostic } from "../diagnostics.js";
import type { EntryDiagnostic } from "../diagnostics.js";
import { mergeEntryPageMessages } from "../page/messages.js";
import type { PwaEntryPageLocale, PwaEntryPageMessages } from "../page/messages.js";
import { DEFAULT_RECOVERY_PAGE_STYLE } from "./default-style.js";
import { resolveEntryPageId } from "./entry-page.js";
import { failWithDiagnostic, validatePwaEntryResilienceOptions } from "./options.js";
import type { PwaEntryResilienceOptions } from "./options.js";

export type { PwaEntryResilienceOptions } from "./options.js";
export type { PwaEntryPageLocale, PwaEntryPageMessages } from "../page/messages.js";

/** The virtual module's full shape: `EntryCheckerConfig` (what `createEntryRuntimePorts` needs) plus the resolved
 *  `locale` and fully-merged `messages` the recovery page (`src/page/main.ts`) renders with. */
export type EntryPageVirtualConfig = EntryCheckerConfig & {
  readonly locale: PwaEntryPageLocale;
  readonly messages: PwaEntryPageMessages;
};

const PLUGIN_NAME = "pwa-platform-entry-resilience";
const ENTRY_CONFIG_MODULE_ID = "virtual:pwa-entry-config";
const ENTRY_CONFIG_RESOLVED_ID = `\0${ENTRY_CONFIG_MODULE_ID}`;
const RECOVERY_PAGE_ASSET_NAME = "pwa-entry.html";
const RECOVERY_PAGE_CHUNK_NAME = "pwa-entry";

/** Minimal shape of a Vite/Rollup output bundle entry; only the fields this module reads are named (mirrors
 *  `@pwa-platform/vite`'s `host-output.ts` `BundleEntry`). */
type BundleEntry = { readonly type: "chunk"; readonly imports: readonly string[] } | { readonly type: "asset" };
type OutputBundleLike = Readonly<Record<string, BundleEntry>>;

function formatDiagnostics(diagnostics: readonly EntryDiagnostic[]): string {
  return diagnostics.map(({ code, path }) => `${code} at ${path === "" ? "(root)" : path}`).join(", ");
}

/**
 * `sha256-<base64>`, the exact form CSP's `style-src` expects, for one inline style block's text — see
 * spec/pwa-entry-resilience.md's "CSP 支持". `crypto` and `btoa` are Web APIs Node exposes globally (no import),
 * the same reason ADR-0018's "src/ 环境中立" let this package's now-removed signature verification use
 * `crypto.subtle` directly; `btoa` only encodes these locally-computed, trusted digest bytes for a build log, never
 * decodes untrusted input (contrast src/internal/base64url.ts, which avoids `atob` for exactly that reason).
 */
async function inlineStyleHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes the five HTML-significant characters — used only for `<title>`, the one place plugin-configured text
 *  (`documentTitle`) is written into the shell itself rather than through the page's own `textContent`-only
 *  rendering (src/page/render.ts). Mirrors packages/vite/src/offline-page.ts's `escapeHtml`; not shared, per this
 *  revision's "同一套选项形态与校验方式，但不共享代码". */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Every chunk the recovery page script statically imports, transitively, including the entry chunk itself. */
function collectStaticImportClosure(bundle: OutputBundleLike, entryFileName: string): ReadonlySet<string> {
  const visited = new Set<string>();
  const stack: string[] = [entryFileName];
  for (;;) {
    const fileName = stack.pop();
    if (fileName === undefined) break;
    if (visited.has(fileName)) continue;
    visited.add(fileName);
    const chunk = bundle[fileName];
    if (chunk !== undefined && chunk.type === "chunk") stack.push(...chunk.imports);
  }
  return visited;
}

/**
 * Creates the entry-resilience Vite plugin.
 *
 * Options are validated here (see src/vite/options.ts: a bad `maxValidityDays` should fail while the developer is
 * still looking at vite.config).
 *
 * `configResolved` finds `pwa()` by its published `PWA_PLUGIN_NAME` rather than by requiring the app to pass a
 * reference to it: `pwa()` returns `Plugin<PwaPluginApi>`, but nothing in this plugin's own options threads that
 * object through, and looking it up by name is exactly what `PWA_PLUGIN_NAME` publishes it for.
 */
export function pwaEntryResilience(options: PwaEntryResilienceOptions): Plugin {
  const validated = validatePwaEntryResilienceOptions(options);
  const { identity, maxValidityDays, css, locale, messages } = validated;
  const resolvedMessages = mergeEntryPageMessages(locale, messages);

  let base = "";
  let platformApi: PwaPluginApi | undefined;
  // Set once `buildStart` has emitted the recovery page's script chunk; `generateBundle` resolves its published
  // file name from the reference id, and `writeBundle` reuses that resolved name rather than re-resolving it.
  let entryPageChunkRefId: string | undefined;
  let entryPageFileName: string | undefined;

  return {
    name: PLUGIN_NAME,
    apply: "build",

    configResolved(config) {
      // `base` is read once, here, for the same reason `@pwa-platform/vite`'s own plugin reads it in this hook
      // rather than later: a later plugin mutating the resolved config must not change what this plugin checks.
      base = config.base;
      if (base !== identity.mountPath) failWithDiagnostic("entry.base-mismatch", "/base");

      const platformPlugin = config.plugins.find((plugin) => plugin.name === PWA_PLUGIN_NAME);
      if (platformPlugin === undefined) failWithDiagnostic("entry.platform-plugin-missing", "");
      platformApi = platformPlugin.api as PwaPluginApi;
    },

    buildStart() {
      entryPageChunkRefId = this.emitFile({
        type: "chunk",
        id: resolveEntryPageId(import.meta.url),
        name: RECOVERY_PAGE_CHUNK_NAME,
      });
    },

    resolveId(id) {
      return id === ENTRY_CONFIG_MODULE_ID ? ENTRY_CONFIG_RESOLVED_ID : null;
    },

    load(id) {
      if (id !== ENTRY_CONFIG_RESOLVED_ID) return null;
      // Built from the validated options alone: like `@pwa-platform/vite`'s own client-config virtual module, this
      // runs while the module graph is assembled, long before `generateBundle` or `writeBundle` produce anything
      // this config could otherwise have read.
      const config: EntryPageVirtualConfig = {
        appId: identity.appId,
        environment: identity.environment,
        scope: identity.scope,
        mountPath: identity.mountPath,
        maxValidityDays,
        recoveryPagePath: `${identity.mountPath}${RECOVERY_PAGE_ASSET_NAME}`,
        locale,
        messages: resolvedMessages,
      };
      return `export default Object.freeze(${JSON.stringify(config)});\n`;
    },

    async generateBundle() {
      // `buildStart` failing calls `this.error`, which always throws, so the build never reaches this hook without
      // a ref id — this guard only documents that invariant, it does not paper over a real failure.
      if (entryPageChunkRefId === undefined) return;
      entryPageFileName = this.getFileName(entryPageChunkRefId);

      // Default style first, host `css` (already validated in src/vite/options.ts) appended verbatim right after
      // it — spec's "构建时作为第二段内联 <style>，紧随默认样式之后写入同一文档". Each block's CSP hash is logged
      // through Vite's `this.info`, never written to a file (spec's "不生成额外文件").
      //
      // A CSP hash covers the element's whole text content, and the parser keeps the newline right after `<style>`
      // (it drops it only for <pre>, <listing> and <textarea>). Each hash is therefore taken over exactly the string
      // written between the tags. Until 2026-09-24 the hash left that newline out, so a site copying the logged
      // values into a hash-only `style-src` had the stylesheet blocked (measured in Chrome 153); the page bytes are
      // unchanged by the fix, only the logged values are.
      const defaultStyleContent = `\n${DEFAULT_RECOVERY_PAGE_STYLE}`;
      let styleBlocks = `<style>${defaultStyleContent}</style>`;
      this.info(`pwa-entry.html style (default): ${await inlineStyleHash(defaultStyleContent)}`);
      if (css !== undefined) {
        const hostStyleContent = `\n${css}`;
        styleBlocks += `\n<style>${hostStyleContent}</style>`;
        this.info(`pwa-entry.html style (host css): ${await inlineStyleHash(hostStyleContent)}`);
      }

      // Fixed shell otherwise, aside from `lang` and `<title>`: everything else reaches the page solely through the
      // virtual module `src/page/main.ts` imports, never written into this shell. The charset is declared in the
      // document because the page can render non-ASCII text and the platform cannot rely on every deployment
      // sending a charset in Content-Type.
      const html =
        "<!doctype html>\n" +
        `<html lang="${locale}">\n` +
        "<head>\n" +
        '<meta charset="utf-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
        `<title>${escapeHtml(resolvedMessages.documentTitle)}</title>\n` +
        `${styleBlocks}\n` +
        "</head>\n" +
        "<body>\n" +
        '<main id="pwa-entry"></main>\n' +
        `<script type="module" src="${base}${entryPageFileName}"></script>\n` +
        "</body>\n" +
        "</html>\n";
      this.emitFile({ type: "asset", fileName: RECOVERY_PAGE_ASSET_NAME, source: html });
    },

    writeBundle(_outputOptions, bundle) {
      if (entryPageFileName === undefined) return;

      // Read here, not in `generateBundle`: `@pwa-platform/vite`'s own plugin only exposes its compiled plan once
      // its `generateBundle` has run, and hook order between sibling plugins within one phase is not guaranteed.
      const plan = platformApi?.getPlan() ?? null;
      if (plan === null) throw new Error(formatDiagnostics([diagnostic("entry.platform-plan-unavailable", "")]));

      const closure = collectStaticImportClosure(bundle, entryPageFileName);
      const requiredUrls = [
        `${base}${RECOVERY_PAGE_ASSET_NAME}`,
        ...[...closure].map((fileName) => `${base}${fileName}`),
      ];
      const missing = requiredUrls.some((url) => !plan.precache.some((entry) => entry.url === url));
      if (missing) throw new Error(formatDiagnostics([diagnostic("entry.recovery-page-not-precached", "/precache")]));
    },
  };
}
