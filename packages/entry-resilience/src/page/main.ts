// The platform's entry-recovery page, published by the Vite plugin at `<mountPath>pwa-entry.html` (see
// src/vite/index.ts). Independently re-runs the full selection and decision (src/resolve.ts) rather than trusting
// anything in the URL besides the return path — see spec/pwa-entry-resilience.md's "入口恢复页". Confirmation and
// navigation happen only here, per docs/adr/0018-entry-resilience-delivery-boundary.md's
// "确认与导航只在平台恢复页上发生": `navigate` calls the top-level-navigation assignment method on `location`, only
// ever from a button's click handler, never automatically. Opening a new tab/window and the two other
// full-address-navigation forms this module must not use are enumerated, and checked for by name, in
// test/page/source-scan.test.ts — deliberately not spelled out here, so this comment cannot itself trip that scan.
import config from "virtual:pwa-entry-config";
import { createEntryRuntimePorts } from "../browser/index.js";
import { themeStorageKey } from "../internal/theme-key.js";
import { resolveEntryRecovery } from "../resolve.js";
import { normalizeReturnPath } from "../return-path.js";
import { buildPageModel } from "./model.js";
import { renderPage } from "./render.js";
import type { PageDocument, PageElement } from "./render.js";

/** Maps each adapted `PageElement` back to the native node `adaptedElement` wrapped, so `append` can unwrap its
 *  children without widening `PageElement`'s own type to expose the native node. */
const WRAPPED = new WeakMap<PageElement, Node>();

function unwrap(child: PageElement): Node {
  const native = WRAPPED.get(child);
  if (native === undefined) throw new Error("append: child was not created by this adapter's PageDocument");
  return native;
}

/**
 * Adapts a real DOM element to `PageElement`. `render.ts`'s `append(...children: PageElement[])` cannot accept a
 * real `HTMLElement` directly — the DOM's own `append` takes `(string | Node)[]`, which `PageElement` is not — so
 * this keeps a reference to the wrapped node (via `WRAPPED`) and unwraps children back to it before delegating.
 */
function adaptedElement(native: HTMLElement): PageElement {
  const element: PageElement = {
    get textContent(): string | null {
      return native.textContent;
    },
    set textContent(value: string | null) {
      native.textContent = value;
    },
    append(...children: PageElement[]): void {
      native.append(...children.map(unwrap));
    },
    setAttribute(name: string, value: string): void {
      native.setAttribute(name, value);
    },
    addEventListener(type: "click", listener: () => void): void {
      native.addEventListener(type, listener);
    },
  };
  WRAPPED.set(element, native);
  return element;
}

const pageDocument: PageDocument = { createElement: (tag) => adaptedElement(document.createElement(tag)) };

/**
 * Reads the stored theme preference `setPwaTheme` (src/client/index.ts) writes, so it can be applied before the
 * first render — see spec/pwa-entry-resilience.md's "恢复页在渲染前读取该键". Never throws: a missing key, a value
 * other than exactly `"light"`/`"dark"`, or `localStorage` itself being unavailable (privacy mode, disabled
 * storage) all fall back to `undefined`, which leaves the page following the system preference.
 */
function readStoredTheme(): "light" | "dark" | undefined {
  try {
    const value = localStorage.getItem(themeStorageKey(config.appId, config.environment));
    return value === "light" || value === "dark" ? value : undefined;
  } catch {
    return undefined;
  }
}

const rootNative = document.getElementById("pwa-entry");

if (rootNative !== null) {
  // Set before the first render (below), directly on the native node: `renderPage` only ever manages the `class`
  // attribute (src/page/render.ts), never `data-theme`, so this cannot be clobbered by a later render call either.
  const theme = readStoredTheme();
  if (theme !== undefined) rootNative.setAttribute("data-theme", theme);

  const root = adaptedElement(rootNative);

  const navigate = (href: string): void => {
    location.assign(href);
  };

  renderPage(root, "loading", pageDocument, navigate, config.messages);

  const returnPath = normalizeReturnPath(new URLSearchParams(location.search).get("return"), {
    origin: location.origin,
    scope: config.scope,
  });

  // resolveEntryRecovery never rejects, but assembling the ports runs synchronously and could throw. Either way the
  // page must not stay on "checking" forever: any failure renders "no entry", which offers nothing to click.
  const resolution = (async () => resolveEntryRecovery(config, createEntryRuntimePorts(config)))();
  void resolution.then(
    (resolved) => renderPage(root, buildPageModel(resolved, returnPath), pageDocument, navigate, config.messages),
    () => renderPage(root, { kind: "none" }, pageDocument, navigate, config.messages),
  );
}
