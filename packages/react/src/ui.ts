import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { usePwa } from "./index.js";

export type PwaUpdateNoticePosition = "bottom-right" | "bottom-center" | "top-right" | "top-center";

export type PwaUpdateNoticeMessages = {
  readonly readyTitle: string;
  readonly readyBody: string;
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

const REMIND_AFTER_MS = 30 * 60_000;
const STABLE_WAITING_MS = 100;

type Phase = "ready" | "updating" | "reload" | "error";

/** Opt-in, non-modal update notice. Import `@pwa-platform/react/update-notice.css` for its default appearance. */
export function PwaUpdateNotice({
  position = "bottom-right",
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
      clearReminder();
      clearWaitingTimer();
      waitingTimer.current = setTimeout(() => {
        waitingTimer.current = undefined;
        if (previousWaiting.current) markStableWaiting(true);
      }, STABLE_WAITING_MS);
    } else if (!waiting && wasWaiting) {
      const wasStable = stableWaitingRef.current;
      clearWaitingTimer();
      markStableWaiting(false);
      takeoverObserved.current = wasStable;
      setPhase(wasStable ? "reload" : "ready");
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
      setPhase(applied || takeoverObserved.current ? "reload" : "ready");
    } catch {
      if (mounted.current) setPhase(takeoverObserved.current ? "reload" : "error");
    }
  }

  function reload(): void {
    if (reloadPage !== undefined) reloadPage();
    else window.location.reload();
  }

  const mode = phase === "ready" ? (waiting && stableWaiting && !dismissed ? "ready" : null) : phase;
  if (mode === null) return null;

  const messages = { ...DEFAULT_MESSAGES, ...overrides };
  const title = messages[`${mode}Title`];
  const body = messages[`${mode}Body`];
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
