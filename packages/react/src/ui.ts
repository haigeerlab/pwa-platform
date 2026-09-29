import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { usePwa } from "./index.js";

export type PwaUpdateNoticePosition = "bottom-right" | "bottom-center" | "top-right" | "top-center";

/** Built-in copy is available for these locales; anything else needs a full `messages` override. */
export type PwaUpdateNoticeLocale = "zh-CN" | "en";

export type PwaUpdateNoticeMessages = {
  readonly readyTitle: string;
  readonly readyBody: string;
  /**
   * Shown instead of `readyTitle` when this page already runs the new code (ADR-0046). Optional so a full custom
   * table written before it existed still type-checks; when missing, a `messages.readyTitle` override is used,
   * otherwise the built-in copy of the selected locale.
   */
  readonly currentTitle?: string;
  /** Shown instead of `readyBody` when this page already runs the new code; falls back like `currentTitle`. */
  readonly currentBody?: string;
  readonly update: string;
  readonly later: string;
  readonly updatingTitle: string;
  readonly updatingBody: string;
  readonly reloadTitle: string;
  readonly reloadBody: string;
  readonly reload: string;
  readonly errorTitle: string;
  readonly errorBody: string;
  readonly retry: string;
};

export type PwaUpdateNoticeProps = {
  readonly position?: PwaUpdateNoticePosition;
  /** Selects the built-in message table `messages` is layered on top of. Defaults to `"zh-CN"`. */
  readonly locale?: PwaUpdateNoticeLocale;
  readonly messages?: Partial<PwaUpdateNoticeMessages>;
  readonly colors?: Partial<PwaUpdateNoticeColors>;
  readonly reloadPage?: () => void;
};

export type PwaUpdateNoticeColors = {
  readonly surface: string;
  readonly text: string;
  readonly mutedText: string;
  readonly border: string;
  readonly primaryButtonBackground: string;
  readonly primaryButtonText: string;
};

const DEFAULT_MESSAGES: PwaUpdateNoticeMessages = {
  readyTitle: "有可用更新",
  readyBody: "新版离线资源已准备好，你可以在合适的时候更新。",
  currentTitle: "新版已可离线使用",
  currentBody: "当前页面已是新版。更新后，离线时也会使用新版。",
  update: "更新",
  later: "稍后",
  updatingTitle: "正在更新",
  updatingBody: "正在切换离线资源，请稍候。",
  reloadTitle: "更新已完成",
  reloadBody: "需要时刷新页面，以确保使用最新内容。",
  reload: "刷新页面",
  errorTitle: "更新未完成",
  errorBody: "请检查连接后重试。",
  retry: "重试",
};

/** English copy, verified on real Android and iPhone devices via the public examples. */
const EN_MESSAGES: PwaUpdateNoticeMessages = {
  readyTitle: "A new version is available",
  readyBody: "The new offline resources are ready. Update when it suits you.",
  currentTitle: "An update is ready for offline use",
  currentBody: "This page already runs the new version. Update to use it offline too.",
  update: "Update",
  later: "Later",
  updatingTitle: "Updating",
  updatingBody: "Switching offline resources. Please wait.",
  reloadTitle: "Update complete",
  reloadBody: "Reload this page when you're ready to use the latest version.",
  reload: "Reload page",
  errorTitle: "Update incomplete",
  errorBody: "Check your connection and try again.",
  retry: "Retry",
};

/** The single source of truth for built-in copy, keyed by locale (ADR-0039, "增补：内置语言选择"). Exported so the
 * public examples can reference it instead of keeping their own copy. */
export const PWA_UPDATE_NOTICE_MESSAGES: Readonly<Record<PwaUpdateNoticeLocale, PwaUpdateNoticeMessages>> = {
  "zh-CN": DEFAULT_MESSAGES,
  en: EN_MESSAGES,
};

const REMIND_AFTER_MS = 30 * 60_000;
const STABLE_WAITING_MS = 100;
const PAGE_CURRENCY_TIMEOUT_MS = 5_000;

type PageCurrency = "current" | "stale";

/**
 * Whether reloading would change the code this page runs (ADR-0046). Navigations are network-first while online, so
 * a page can already be on the new code while the new worker still waits. Asks the server for this document again
 * and compares its entry module script with the one this document loaded. Anything ambiguous — no module script,
 * a failed or non-OK request, the timeout, an abort — is "stale", the behaviour this notice had before the check.
 */
async function detectPageCurrency(signal: AbortSignal): Promise<PageCurrency> {
  const ownScript = document.querySelector('script[type="module"][src]');
  if (!(ownScript instanceof HTMLScriptElement)) return "stale";
  const request = new AbortController();
  const stop = (): void => request.abort();
  const timer = setTimeout(stop, PAGE_CURRENCY_TIMEOUT_MS);
  signal.addEventListener("abort", stop, { once: true });
  try {
    const url = new URL(window.location.href);
    url.hash = "";
    const response = await fetch(url.href, { cache: "no-store", credentials: "same-origin", signal: request.signal });
    if (!response.ok) return "stale";
    const latest = new DOMParser().parseFromString(await response.text(), "text/html").querySelector('script[type="module"][src]');
    const latestSrc = latest?.getAttribute("src");
    if (typeof latestSrc !== "string") return "stale";
    return new URL(latestSrc, response.url).href === ownScript.src ? "current" : "stale";
  } catch {
    return "stale";
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

type Phase = "ready" | "updating" | "reload" | "error";

/** Opt-in, non-modal update notice. Import `@pwa-platform/react/update-notice.css` for its default appearance. */
export function PwaUpdateNotice({
  position = "bottom-right",
  locale = "zh-CN",
  messages: overrides,
  colors,
  reloadPage,
}: PwaUpdateNoticeProps): ReactElement | null {
  const pwa = usePwa();
  const waiting = pwa.state.updateWaiting;
  const [phase, setPhase] = useState<Phase>("ready");
  const [dismissed, setDismissed] = useState(false);
  const [stableWaiting, setStableWaiting] = useState(false);
  const previousWaiting = useRef(false);
  const stableWaitingRef = useRef(false);
  const [currency, setCurrency] = useState<PageCurrency | null>(null);
  const currencyRef = useRef<PageCurrency | null>(null);
  const currencyCheck = useRef<AbortController | undefined>(undefined);
  const takeoverObserved = useRef(false);
  const reminder = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waitingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  function clearReminder(): void {
    if (reminder.current !== undefined) clearTimeout(reminder.current);
    reminder.current = undefined;
  }

  function clearWaitingTimer(): void {
    if (waitingTimer.current !== undefined) clearTimeout(waitingTimer.current);
    waitingTimer.current = undefined;
  }

  function cancelCurrencyCheck(): void {
    currencyCheck.current?.abort();
    currencyCheck.current = undefined;
  }

  function markCurrency(value: PageCurrency | null): void {
    currencyRef.current = value;
    setCurrency(value);
  }

  /** After a takeover: a stale page is offered a reload; a current one has nothing left to reload for. */
  function afterTakeover(): Phase {
    return currencyRef.current === "current" ? "ready" : "reload";
  }

  function markStableWaiting(value: boolean): void {
    stableWaitingRef.current = value;
    setStableWaiting(value);
  }

  useEffect(() => {
    const wasWaiting = previousWaiting.current;
    previousWaiting.current = waiting;
    if (waiting && !wasWaiting) {
      takeoverObserved.current = false;
      setPhase("ready");
      setDismissed(false);
      markStableWaiting(false);
      markCurrency(null);
      clearReminder();
      clearWaitingTimer();
      cancelCurrencyCheck();
      waitingTimer.current = setTimeout(() => {
        waitingTimer.current = undefined;
        if (!previousWaiting.current) return;
        markStableWaiting(true);
        const check = new AbortController();
        currencyCheck.current = check;
        void detectPageCurrency(check.signal).then((result) => {
          if (!check.signal.aborted) markCurrency(result);
        });
      }, STABLE_WAITING_MS);
    } else if (!waiting && wasWaiting) {
      const wasStable = stableWaitingRef.current;
      clearWaitingTimer();
      // A check still in flight can no longer matter; without its answer the page is treated as stale.
      cancelCurrencyCheck();
      markStableWaiting(false);
      takeoverObserved.current = wasStable;
      setPhase(wasStable ? afterTakeover() : "ready");
      setDismissed(false);
      clearReminder();
    }
  }, [waiting]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearReminder();
      clearWaitingTimer();
      cancelCurrencyCheck();
      previousWaiting.current = false;
    };
  }, []);

  function later(): void {
    setDismissed(true);
    clearReminder();
    reminder.current = setTimeout(() => {
      reminder.current = undefined;
      if (previousWaiting.current) setDismissed(false);
    }, REMIND_AFTER_MS);
  }

  async function apply(): Promise<void> {
    if (phase === "updating") return;
    setPhase("updating");
    try {
      const applied = await pwa.applyUpdate();
      if (!mounted.current) return;
      setPhase(applied || takeoverObserved.current ? afterTakeover() : "ready");
    } catch {
      if (mounted.current) setPhase(takeoverObserved.current ? afterTakeover() : "error");
    }
  }

  function reload(): void {
    if (reloadPage !== undefined) reloadPage();
    else window.location.reload();
  }

  const ready = waiting && stableWaiting && currency !== null && !dismissed;
  const mode = phase === "ready" ? (ready ? "ready" : null) : phase;
  if (mode === null) return null;

  const messages = { ...PWA_UPDATE_NOTICE_MESSAGES[locale], ...overrides };
  const current = mode === "ready" && currency === "current";
  const title = current ? (overrides?.currentTitle ?? overrides?.readyTitle ?? messages.currentTitle ?? messages.readyTitle) : messages[`${mode}Title`];
  const body = current ? (overrides?.currentBody ?? overrides?.readyBody ?? messages.currentBody ?? messages.readyBody) : messages[`${mode}Body`];
  const buttons: ReactElement[] = [];
  if (mode === "ready") {
    buttons.push(createElement("button", { key: "update", type: "button", className: "pwa-update-notice__button pwa-update-notice__button--primary", onClick: () => void apply() }, messages.update));
    buttons.push(createElement("button", { key: "later", type: "button", className: "pwa-update-notice__button", onClick: later }, messages.later));
  } else if (mode === "updating") {
    buttons.push(createElement("button", { key: "updating", type: "button", className: "pwa-update-notice__button pwa-update-notice__button--primary", disabled: true }, messages.updatingTitle));
  } else if (mode === "reload") {
    buttons.push(createElement("button", { key: "reload", type: "button", className: "pwa-update-notice__button pwa-update-notice__button--primary", onClick: reload }, messages.reload));
  } else {
    buttons.push(createElement("button", { key: "retry", type: "button", className: "pwa-update-notice__button pwa-update-notice__button--primary", onClick: () => void apply() }, messages.retry));
  }

  return createElement("section", {
    className: "pwa-update-notice",
    "data-position": position,
    style: {
      "--pwa-update-surface": colors?.surface,
      "--pwa-update-text": colors?.text,
      "--pwa-update-muted": colors?.mutedText,
      "--pwa-update-border": colors?.border,
      "--pwa-update-accent": colors?.primaryButtonBackground,
      "--pwa-update-accent-text": colors?.primaryButtonText,
    } as CSSProperties,
    role: "status",
    "aria-live": "polite",
    "aria-busy": mode === "updating",
  },
  createElement("h2", { className: "pwa-update-notice__title" }, title),
  createElement("p", { className: "pwa-update-notice__body" }, body),
  createElement("div", { className: "pwa-update-notice__actions" }, buttons));
}
