import { defineComponent, h, onUnmounted, ref, watch, type PropType, type VNode } from "vue";
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

const noticeProps = {
  position: { type: String as PropType<PwaUpdateNoticePosition>, default: "bottom-right" },
  messages: { type: Object as PropType<Partial<PwaUpdateNoticeMessages>>, default: (): Partial<PwaUpdateNoticeMessages> => ({}) },
  colors: { type: Object as PropType<Partial<PwaUpdateNoticeColors>>, required: false },
  reloadPage: { type: Function as PropType<() => void>, required: false },
} as const;

export type PwaUpdateNoticeProps = {
  readonly position?: PwaUpdateNoticePosition;
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

    watch(
      () => pwa.state.value.updateWaiting,
      (waiting, wasWaiting) => {
        if (waiting && !wasWaiting) {
          takeoverObserved = false;
          phase.value = "ready";
          dismissed.value = false;
          stableWaiting.value = false;
          clearReminder();
          clearWaitingTimer();
          waitingTimer = setTimeout(() => {
            waitingTimer = undefined;
            if (pwa.state.value.updateWaiting) stableWaiting.value = true;
          }, STABLE_WAITING_MS);
        } else if (!waiting && wasWaiting) {
          const wasStable = stableWaiting.value;
          clearWaitingTimer();
          stableWaiting.value = false;
          takeoverObserved = wasStable;
          phase.value = wasStable ? "reload" : "ready";
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
        phase.value = applied || takeoverObserved ? "reload" : "ready";
      } catch {
        if (mounted) phase.value = takeoverObserved ? "reload" : "error";
      }
    }

    function reload(): void {
      if (props.reloadPage !== undefined) props.reloadPage();
      else window.location.reload();
    }

    return (): VNode | null => {
      const waiting = pwa.state.value.updateWaiting;
      const mode = phase.value === "ready" ? (waiting && stableWaiting.value && !dismissed.value ? "ready" : null) : phase.value;
      if (mode === null) return null;

      const messages = { ...DEFAULT_MESSAGES, ...props.messages };
      const title = messages[`${mode}Title`];
      const body = messages[`${mode}Body`];
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
