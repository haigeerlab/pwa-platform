// The default offline page's render function — spec/vite-adapter.md's "修订：平台默认离线页（2026-09-24，已评审通
// 过）". Pure and synchronous input handling: everything here assumes `options.ts` (wired in OP3) has already
// validated `locale`, `messages` and `css`; this module renders whatever it is given.
//
// Built-in copy, HTML escaping, and the fixed retry/online-reload script are all fixed text or fixed logic, never
// derived from plugin configuration beyond the message/appName values themselves — the same separation
// `default-style.ts` documents for the stylesheet.
import { DEFAULT_OFFLINE_PAGE_STYLE } from "./offline-page-style.js";

export type PwaOfflinePageLocale = "zh-CN" | "en";

export type PwaOfflinePageMessages = {
  readonly documentTitle: string;
  readonly heading: string;
  readonly body: string;
  readonly retry: string;
};

/** Built-in copy per locale, spec's "内置文案" table, character for character. */
export const OFFLINE_PAGE_MESSAGES: Readonly<Record<PwaOfflinePageLocale, PwaOfflinePageMessages>> = {
  "zh-CN": {
    documentTitle: "暂时无法连接",
    heading: "暂时无法连接",
    body: "网络连接或服务响应暂时异常，请稍后重试。",
    retry: "重试",
  },
  en: {
    documentTitle: "Temporarily unavailable",
    heading: "Temporarily unable to connect",
    body: "The connection or service may be temporarily unavailable. Please try again shortly.",
    retry: "Try again",
  },
};

/** Fixed script: ADR-0052's document probe and per-tab budget, independent of host configuration. */
export const OFFLINE_PAGE_SCRIPT = `let reloadStarted = false;
let recoveryEnabled = false;
let storageKey;
const initialController = navigator.serviceWorker?.controller;
try {
  if (initialController) {
    storageKey = "pwa:offline-recovery:v1:" + new URL(initialController.scriptURL).pathname;
    const budget = sessionStorage.getItem(storageKey);
    if (budget === null || budget === "0") {
      sessionStorage.setItem(storageKey, "0");
      recoveryEnabled = sessionStorage.getItem(storageKey) === "0";
    }
  }
} catch {}
document.querySelector(".pwa-offline__retry").addEventListener("click", () => {
  if (reloadStarted) return;
  reloadStarted = true;
  recoveryEnabled = false;
  try { if (storageKey) sessionStorage.removeItem(storageKey); } catch {}
  location.reload();
});
let probeInFlight = false;
let successes = 0;
let failures = 0;
let visibilityEpoch = 0;
let nextProbeAt = Date.now() + 10_000;
let probeTimer;
const scheduleProbe = () => {
  clearTimeout(probeTimer);
  if (recoveryEnabled && !reloadStarted && document.visibilityState === "visible") {
    probeTimer = setTimeout(probeConnection, Math.max(0, nextProbeAt - Date.now()));
  }
};
const probeConnection = () => {
  if (!recoveryEnabled || reloadStarted || probeInFlight || document.visibilityState !== "visible" || Date.now() < nextProbeAt) return;
  const controller = navigator.serviceWorker?.controller;
  if (!controller || controller !== initialController) { recoveryEnabled = false; return; }
  probeInFlight = true;
  const epoch = visibilityEpoch;
  const channel = new MessageChannel();
  let finished = false;
  let timeout;
  const finish = (reachable, supported) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    channel.port1.close();
    probeInFlight = false;
    if (!supported) { recoveryEnabled = false; return; }
    if (reloadStarted || navigator.serviceWorker?.controller !== controller || epoch !== visibilityEpoch || document.visibilityState !== "visible") {
      successes = 0;
      nextProbeAt = Date.now() + 10_000;
      scheduleProbe();
      return;
    }
    successes = reachable ? successes + 1 : 0;
    failures = reachable ? 0 : failures + 1;
    nextProbeAt = Date.now() + (reachable ? 10_000 : Math.min(60_000, 10_000 * 2 ** Math.min(failures - 1, 3)));
    if (successes < 2) { scheduleProbe(); return; }
    recoveryEnabled = false;
    try {
      if (sessionStorage.getItem(storageKey) !== "0") return;
      sessionStorage.setItem(storageKey, "1");
      if (sessionStorage.getItem(storageKey) !== "1") return;
    } catch { return; }
    reloadStarted = true;
    location.reload();
  };
  timeout = setTimeout(() => finish(false, false), 4_000);
  channel.port1.onmessage = (event) => {
    const result = event.data;
    const supported = result && typeof result === "object" && Object.keys(result).length === 3 &&
      result.type === "pwa:offline:probe-result" && result.version === 1 && typeof result.reachable === "boolean";
    finish(supported && result.reachable, supported);
  };
  try { controller.postMessage({ type: "pwa:offline:probe", version: 1 }, [channel.port2]); }
  catch { finish(false, false); }
};
window.addEventListener("online", probeConnection);
document.addEventListener("visibilitychange", () => {
  visibilityEpoch++;
  successes = 0;
  if (document.visibilityState === "visible") scheduleProbe();
  else clearTimeout(probeTimer);
});
scheduleProbe();
`;

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes the five HTML-significant characters so any message or app name is safe wherever it is written into the
 *  static document — spec's "所有文案与应用名称在构建期经 HTML 转义后写入静态 HTML". */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** `sha256-<base64>`, the exact form CSP's `style-src`/`script-src` expects, for one inline block's text — see
 *  spec's "三段内联脚本的 CSP 哈希都经 this.info 输出". Mirrors
 *  packages/entry-resilience/src/vite/index.ts's `inlineStyleHash`. */
async function inlineTextHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}

export type RenderOfflinePageInput = {
  readonly locale: PwaOfflinePageLocale;
  readonly messages?: Partial<PwaOfflinePageMessages>;
  readonly css?: string;
  readonly appName: string | null;
};

export type RenderOfflinePageResult = {
  readonly html: string;
  readonly hashes: {
    readonly defaultStyle: string;
    readonly hostStyle: string | null;
    readonly script: string;
  };
};

/**
 * Renders the default offline page's HTML document, plus the CSP hashes of each inline block it contains.
 *
 * Class names and CSS custom properties are the public contract spec's "class 与变量" table pins; see
 * offline-page-style.ts's own comment and test/offline-page-class-alignment.test.ts for how the two files are kept
 * in sync.
 */
export async function renderOfflinePage(input: RenderOfflinePageInput): Promise<RenderOfflinePageResult> {
  const { locale, messages, css, appName } = input;
  const resolved: PwaOfflinePageMessages = { ...OFFLINE_PAGE_MESSAGES[locale], ...messages };

  // A CSP hash covers the element's whole text content, and the parser keeps the newline right after `<style>` and
  // `<script>` (it drops it only for <pre>, <listing> and <textarea>). Each hash is therefore taken over exactly the
  // string written between the tags — measured on 2026-09-24: hashing the text without that newline gets both the
  // stylesheet and the script blocked under a hash-only CSP.
  const defaultStyleContent = `\n${DEFAULT_OFFLINE_PAGE_STYLE}`;
  let styleBlocks = `<style>${defaultStyleContent}</style>`;
  const defaultStyleHash = await inlineTextHash(defaultStyleContent);
  let hostStyleHash: string | null = null;
  if (css !== undefined) {
    const hostStyleContent = `\n${css}`;
    styleBlocks += `\n<style>${hostStyleContent}</style>`;
    hostStyleHash = await inlineTextHash(hostStyleContent);
  }

  const scriptContent = `\n${OFFLINE_PAGE_SCRIPT}`;
  const appNameMarkup =
    appName === null ? "" : `<p class="pwa-offline__app">${escapeHtml(appName)}</p>\n`;

  const html =
    "<!doctype html>\n" +
    `<html lang="${locale}">\n` +
    "<head>\n" +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${escapeHtml(resolved.documentTitle)}</title>\n` +
    `${styleBlocks}\n` +
    "</head>\n" +
    "<body>\n" +
    '<main class="pwa-offline">\n' +
    appNameMarkup +
    `<h1 class="pwa-offline__heading">${escapeHtml(resolved.heading)}</h1>\n` +
    `<p class="pwa-offline__body">${escapeHtml(resolved.body)}</p>\n` +
    `<button type="button" class="pwa-offline__retry">${escapeHtml(resolved.retry)}</button>\n` +
    "</main>\n" +
    `<script>${scriptContent}</script>\n` +
    "</body>\n" +
    "</html>\n";

  const scriptHash = await inlineTextHash(scriptContent);

  return {
    html,
    hashes: { defaultStyle: defaultStyleHash, hostStyle: hostStyleHash, script: scriptHash },
  };
}
