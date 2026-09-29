import { defineComponent, h, onUnmounted, ref, watch, type PropType, type VNode } from "vue";
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

const noticeProps = {
  position: { type: String as PropType<PwaUpdateNoticePosition>, default: "bottom-right" },
  locale: { type: String as PropType<PwaUpdateNoticeLocale>, default: "zh-CN" },
  messages: { type: Object as PropType<Partial<PwaUpdateNoticeMessages>>, default: (): Partial<PwaUpdateNoticeMessages> => ({}) },
  colors: { type: Object as PropType<Partial<PwaUpdateNoticeColors>>, required: false },
  reloadPage: { type: Function as PropType<() => void>, required: false },
} as const;

export type PwaUpdateNoticeProps = {
  readonly position?: PwaUpdateNoticePosition;
  /** Selects the built-in message table `messages` is layered on top of. Defaults to `"zh-CN"`. */
  readonly locale?: PwaUpdateNoticeLocale;
  readonly messages?: Partial<PwaUpdateNoticeMessages>;
  readonly colors?: Partial<PwaUpdateNoticeColors>;
  readonly reloadPage?: () => void;
};

type Phase = "ready" | "updating" | "reload" | "error";

/** Opt-in, non-modal update notice. Import `@pwa-platform/vue/update-notice.css` for its default appearance. */
export const PwaUpdateNotice: ReturnType<typeof defineComponent<PwaUpdateNoticeProps>> = defineComponent<PwaUpdateNoticeProps>({
  name: "PwaUpdateNotice",
  props: noticeProps,
  setup(props) {
    const pwa = usePwa();
    const phase = ref<Phase>("ready");
    const dismissed = ref(false);
    const stableWaiting = ref(false);
    const currency = ref<PageCurrency | null>(null);
    let currencyCheck: AbortController | undefined;
    let takeoverObserved = false;
    let reminder: ReturnType<typeof setTimeout> | undefined;
    let waitingTimer: ReturnType<typeof setTimeout> | undefined;
    let mounted = true;

    function clearReminder(): void {
      if (reminder !== undefined) clearTimeout(reminder);
      reminder = undefined;
    }

    function clearWaitingTimer(): void {
      if (waitingTimer !== undefined) clearTimeout(waitingTimer);
      waitingTimer = undefined;
    }

    function cancelCurrencyCheck(): void {
      currencyCheck?.abort();
      currencyCheck = undefined;
    }

    /** After a takeover: a stale page is offered a reload; a current one has nothing left to reload for. */
    function afterTakeover(): Phase {
      return currency.value === "current" ? "ready" : "reload";
    }

    watch(
      () => pwa.state.value.updateWaiting,
      (waiting, wasWaiting) => {
        if (waiting && !wasWaiting) {
          takeoverObserved = false;
          phase.value = "ready";
          dismissed.value = false;
          stableWaiting.value = false;
          currency.value = null;
          clearReminder();
          clearWaitingTimer();
          cancelCurrencyCheck();
          waitingTimer = setTimeout(() => {
            waitingTimer = undefined;
            if (!pwa.state.value.updateWaiting) return;
            stableWaiting.value = true;
            const check = new AbortController();
            currencyCheck = check;
            void detectPageCurrency(check.signal).then((result) => {
              if (!check.signal.aborted) currency.value = result;
            });
          }, STABLE_WAITING_MS);
        } else if (!waiting && wasWaiting) {
          const wasStable = stableWaiting.value;
          clearWaitingTimer();
          // A check still in flight can no longer matter; without its answer the page is treated as stale.
          cancelCurrencyCheck();
          stableWaiting.value = false;
          takeoverObserved = wasStable;
          phase.value = wasStable ? afterTakeover() : "ready";
          dismissed.value = false;
          clearReminder();
        }
      },
      { immediate: true },
    );

    onUnmounted(() => {
      mounted = false;
      clearReminder();
      clearWaitingTimer();
      cancelCurrencyCheck();
    });

    function later(): void {
      dismissed.value = true;
      clearReminder();
      reminder = setTimeout(() => {
        reminder = undefined;
        if (pwa.state.value.updateWaiting) dismissed.value = false;
      }, REMIND_AFTER_MS);
    }

    async function apply(): Promise<void> {
      if (phase.value === "updating") return;
      phase.value = "updating";
      try {
        const applied = await pwa.applyUpdate();
        if (!mounted) return;
        phase.value = applied || takeoverObserved ? afterTakeover() : "ready";
      } catch {
        if (mounted) phase.value = takeoverObserved ? afterTakeover() : "error";
      }
    }

    function reload(): void {
      if (props.reloadPage !== undefined) props.reloadPage();
      else window.location.reload();
    }

    return (): VNode | null => {
      const waiting = pwa.state.value.updateWaiting;
      const ready = waiting && stableWaiting.value && currency.value !== null && !dismissed.value;
      const mode = phase.value === "ready" ? (ready ? "ready" : null) : phase.value;
      if (mode === null) return null;

      const overrides = props.messages ?? {};
      const messages = { ...PWA_UPDATE_NOTICE_MESSAGES[props.locale ?? "zh-CN"], ...overrides };
      const current = mode === "ready" && currency.value === "current";
      const title = current ? (overrides.currentTitle ?? overrides.readyTitle ?? messages.currentTitle ?? messages.readyTitle) : messages[`${mode}Title`];
      const body = current ? (overrides.currentBody ?? overrides.readyBody ?? messages.currentBody ?? messages.readyBody) : messages[`${mode}Body`];
      const actions: VNode[] = [];
      if (mode === "ready") {
        actions.push(h("button", { type: "button", class: "pwa-update-notice__button pwa-update-notice__button--primary", onClick: () => void apply() }, messages.update));
        actions.push(h("button", { type: "button", class: "pwa-update-notice__button", onClick: later }, messages.later));
      } else if (mode === "updating") {
        actions.push(h("button", { type: "button", class: "pwa-update-notice__button pwa-update-notice__button--primary", disabled: true }, messages.updatingTitle));
      } else if (mode === "reload") {
        actions.push(h("button", { type: "button", class: "pwa-update-notice__button pwa-update-notice__button--primary", onClick: reload }, messages.reload));
      } else {
        actions.push(h("button", { type: "button", class: "pwa-update-notice__button pwa-update-notice__button--primary", onClick: () => void apply() }, messages.retry));
      }

      return h("section", {
        class: "pwa-update-notice",
        "data-position": props.position,
        style: {
          "--pwa-update-surface": props.colors?.surface,
          "--pwa-update-text": props.colors?.text,
          "--pwa-update-muted": props.colors?.mutedText,
          "--pwa-update-border": props.colors?.border,
          "--pwa-update-accent": props.colors?.primaryButtonBackground,
          "--pwa-update-accent-text": props.colors?.primaryButtonText,
        },
        role: "status",
        "aria-live": "polite",
        "aria-busy": mode === "updating" ? "true" : "false",
      }, [
        h("h2", { class: "pwa-update-notice__title" }, title),
        h("p", { class: "pwa-update-notice__body" }, body),
        h("div", { class: "pwa-update-notice__actions" }, actions),
      ]);
    };
  },
});
