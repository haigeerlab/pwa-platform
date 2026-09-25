// The example's interface. Everything visible here belongs to the application, not to the platform: ADR-0013
// gives the adapter state and methods and leaves buttons, dialogs and wording to the app. This is what that
// division looks like in practice.
import { usePwa, type PwaBinding } from "@pwa-platform/vue";
import { checkEntryRecovery } from "@pwa-platform/entry-resilience/client";
import type { EntryRecoveryResult } from "@pwa-platform/entry-resilience";
import { defineComponent, h, ref, watch, type Component, type VNode } from "vue";
import { SHELL_URL } from "../../shared/identity.js";
import { APP_VERSION } from "./version.js";

/**
 * The update banner's own state machine, entirely local to this page. The adapter only ever tells it
 * `updateWaiting`, true or false; everything about *how* to present that (spec: 修订：完整更新提示参考实现) lives
 * here. `idle` is the initial "Update / Later" prompt, `updating` covers the in-flight confirmation, `reload` is
 * what a page shows once control has actually moved — whether this page confirmed it or a sibling tab did — and
 * `error` is `applyUpdate()` rejecting because the takeover never arrived.
 */
type UpdatePhase = "idle" | "updating" | "reload" | "error";

/**
 * The app shell's navigation rule is network-first (apps/shared/identity.ts), so while online a plain reload
 * already fetches the newest HTML and entry script from the network — even though the new worker is still sitting
 * in the waiting slot, untouched (spec: 补充修订：区分"页面已是新代码"). "A new version is available" and "Reload to
 * use the new version" would both be false in that situation: the page already runs the new code, it just has not
 * finished the takeover that makes it available offline. This compares the entry module script this document was
 * built from against the one the server would hand out right now, so the banner can tell the two situations apart.
 *
 * Any ambiguity — a failed fetch, a non-OK response, or a shell whose entry script cannot be found — is reported as
 * "stale", the conservative default that matches the banner's behaviour before this check existed. An aborted
 * fetch (`signal`) resolves the same way; the caller aborts only once it has stopped caring about the answer, so
 * that resolution is discarded rather than shown.
 *
 * This is the Vue example's own copy of the check; the React example carries the same logic. It cannot live in
 * apps/shared next to `SHELL_URL` instead: that directory is typechecked without the DOM lib (tsconfig.json, the
 * Node-side config), while this function needs `document`, `fetch` and `DOMParser`, which only each app's own
 * tsconfig.app.json include provides.
 */
/**
 * Upper bound on the currency check. The banner stays hidden until the check resolves, so a request that never
 * settles would otherwise hide the update prompt for good; past this the page is treated as "stale" and the
 * ordinary prompt appears.
 */
const PAGE_CURRENCY_TIMEOUT_MS = 5_000;

async function detectPageCurrency(signal: AbortSignal): Promise<"current" | "stale"> {
  const ownScript = document.querySelector('script[type="module"][src]');
  if (!(ownScript instanceof HTMLScriptElement)) return "stale";
  const ownUrl = ownScript.src;

  // One controller for both reasons to stop: the caller no longer cares (`signal`), or the timeout elapsed. Aborting
  // it also cancels reading the body, so a stalled response cannot outlive the timeout either.
  const request = new AbortController();
  const stop = (): void => request.abort();
  const timer = setTimeout(stop, PAGE_CURRENCY_TIMEOUT_MS);
  signal.addEventListener("abort", stop, { once: true });
  try {
    const response = await fetch(SHELL_URL, { cache: "no-store", signal: request.signal });
    if (!response.ok) return "stale";
    const html = await response.text();
    const shellDocument = new DOMParser().parseFromString(html, "text/html");
    const latestScript = shellDocument.querySelector('script[type="module"][src]');
    const latestSrc = latestScript?.getAttribute("src");
    if (typeof latestSrc !== "string") return "stale";
    return new URL(latestSrc, response.url).href === ownUrl ? "current" : "stale";
  } catch {
    return "stale";
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

/**
 * How long the currency check waits before it fires, once `updateWaiting` turns true. A worker that self-activates
 * (the recovery worker, ADR-0005) can flip `updateWaiting` true and back to false within milliseconds — the check
 * would otherwise still send a real request for a prompt that was never going to be shown, competing with the
 * takeover already in flight for the same origin. A genuine update stays waiting far longer than this, so nothing
 * here delays a real prompt in any way a person could notice.
 */
const PAGE_CURRENCY_CHECK_DELAY_MS = 100;

// A few inline styles, no stylesheet and no framework: this example demonstrates the interaction, not a design
// system.
const BANNER_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.5rem 1rem",
  marginBottom: "1rem",
  background: "#fff7e6",
  border: "1px solid #d4a017",
};

// Typed as `Component` because `isolatedDeclarations` needs an explicit annotation on an exported binding, and
// `defineComponent`'s own return type is not writable by hand. `createApp` accepts `Component`, which is all this
// example needs from it.
export const App: Component = defineComponent({
  name: "PwaExample",
  setup() {
    // Explicitly typed: `isolatedDeclarations` will not infer it, and the binding's type is part of what this
    // example demonstrates.
    const pwa: PwaBinding = usePwa();

    // Registration is the application's call, not the adapter's — the binding never registers on its own.
    void pwa.register();

    // Application state of its own, with nothing to do with the platform. Its only job is to make the component
    // re-render on demand, which is what the React example's provider-lifetime check needs; this example carries
    // it too so both keep the same interface.
    const count = ref(0);

    // `logout()` returns whether a registration was removed and emits no event, so `state.registered` stays true
    // afterwards (spec: vue-react-adapters, known limitations). An application that wants to show the logout has
    // to keep that fact itself, from the return value — which is what this flag is.
    const loggedOut = ref(false);

    // The entry-recovery status display (spec/examples-browser-e2e.md's revised "契约增量": "页面上增加一块状态显
    // 示"). `checkEntryRecovery()` only reads what is already stored — it makes no network request of its own — so
    // a single check on mount is enough for the drill's visual sanity check; the primary way the drill drives this
    // is `window.__entryCheck` (src/main.ts), not this display.
    const entryStatus = ref<EntryRecoveryResult | null>(null);
    void checkEntryRecovery().then((result) => {
      entryStatus.value = result;
    });

    const updatePhase = ref<UpdatePhase>("idle");
    // Later only hides the banner on this page; the waiting worker underneath is untouched (spec: 修订：完整更新
    // 提示参考实现). It is separate from `updatePhase` because dismissing is a display choice, not a step in the
    // update itself.
    const dismissed = ref(false);

    // Whether *this* waiting cycle's page is already running the code the server would hand out right now. `null`
    // means unresolved — either the check has not run yet or it is in flight — and the banner stays hidden rather
    // than flash the wrong text (spec: 补充修订：区分"页面已是新代码"). Local per-waiting-cycle state: it is reset to
    // `null` every time a fresh cycle starts, below.
    const pageCurrency = ref<"current" | "stale" | null>(null);

    function confirmUpdate(): void {
      updatePhase.value = "updating";
      // `false` means nothing was waiting after all (it is not an error, ADR-0013); drop back so the page cannot
      // sit on "Updating…" forever. Success needs no handling here: `update-applied` moves the banner to Reload.
      void pwa.applyUpdate().then(
        (applied) => {
          if (!applied) updatePhase.value = "idle";
        },
        () => {
          updatePhase.value = "error";
        },
      );
    }

    // `updateWaiting` is cleared only by the `update-applied` event (packages/vue/src/store.ts), which fires in
    // every controlled same-scope page once its own `controllerchange` observes the new worker — this page's
    // included, regardless of whether it called `applyUpdate()` itself or a sibling tab did. Control has already
    // moved either way, and the platform never reloads the page itself (V1 acceptance matrix) — what differs is
    // whether there is anything left to reload *for* (see `pageCurrency` below).
    watch(
      () => pwa.state.value.updateWaiting,
      (isWaiting, wasWaiting) => {
        if (!wasWaiting && isWaiting) {
          // A fresh update became available: start the prompt over even if the previous cycle ended in an error or
          // was dismissed, and forget what the previous cycle found about page currency — a new deployment needs
          // its own check.
          updatePhase.value = "idle";
          dismissed.value = false;
          pageCurrency.value = null;
        } else if (wasWaiting && !isWaiting) {
          // If the page was already on the new code, there is nothing left to reload for and the banner just
          // disappears; otherwise show the usual reload prompt.
          updatePhase.value = pageCurrency.value === "current" ? "idle" : "reload";
          dismissed.value = false;
        }
      },
    );

    // Runs the currency check once per waiting cycle, including when `updateWaiting` is already true when this
    // component is set up — `immediate: true` covers that case, since the watcher above only reacts to a
    // `false -> true` transition, which a page that starts already waiting never has. The debounced fetch is also
    // aborted if the cycle ends before it fires or before it settles, so a cycle this short never sends the
    // request at all and a cycle that ends mid-flight does not needlessly finish it.
    watch(
      () => [pwa.state.value.updateWaiting, pageCurrency.value] as const,
      ([isWaiting, currency], _previous, onCleanup) => {
        if (!isWaiting || currency !== null) return;
        const controller = new AbortController();
        let cancelled = false;
        const timer = setTimeout(() => {
          void detectPageCurrency(controller.signal).then((result) => {
            if (!cancelled) pageCurrency.value = result;
          });
        }, PAGE_CURRENCY_CHECK_DELAY_MS);
        onCleanup(() => {
          cancelled = true;
          clearTimeout(timer);
          controller.abort();
        });
      },
      { immediate: true },
    );

    return (): VNode => {
      const state = pwa.state.value;
      const children = [
        h("h1", { id: "shell" }, "PWA Platform · Vue example"),
        h("p", { id: "version" }, APP_VERSION),
        h("p", { id: "registered" }, state.registered ? "registered" : "not registered"),
        h("p", { id: "count" }, String(count.value)),
        h("button", { id: "bump", onClick: () => (count.value += 1) }, "Bump"),
        h(
          "button",
          {
            id: "logout",
            onClick: () => {
              void pwa.logout().then((removed) => (loggedOut.value = removed));
            },
          },
          "Log out",
        ),
      ];

      if (loggedOut.value) {
        children.push(h("p", { id: "logged-out" }, "logged out"));
      }

      // Entry-recovery status, for eyeballing during the drill. Only `kind` and, when available, `status` — never
      // an entry origin (spec/pwa-entry-resilience.md's revised page-side API never hands one to application code
      // in the first place).
      const status = entryStatus.value;
      children.push(
        h(
          "p",
          { id: "entry-status" },
          status === null ? "checking" : status.kind === "available" ? `kind: available, status: ${status.status}` : "kind: none",
        ),
      );

      // The update prompt, expanded from a single button into the full interaction ADR-0013 leaves to the
      // application: Update/Later while a version waits, an in-flight state while confirming, a Reload prompt once
      // control has actually moved, and Retry if the takeover times out. The platform never reloads the page
      // itself (V1 acceptance matrix).
      const bannerMode =
        updatePhase.value === "updating" || updatePhase.value === "reload" || updatePhase.value === "error"
          ? updatePhase.value
          : state.updateWaiting && !dismissed.value && pageCurrency.value !== null
            ? "prompt"
            : null;

      if (bannerMode !== null) {
        const bannerChildren: VNode[] =
          bannerMode === "prompt"
            ? [
                // Same Update/Later buttons either way; only the wording differs, on what `detectPageCurrency`
                // found for this cycle (spec: 补充修订：区分"页面已是新代码").
                h("span", {}, pageCurrency.value === "current" ? "An update is ready for offline use" : "A new version is available"),
                h("button", { id: "apply-update", onClick: confirmUpdate }, "Update"),
                h("button", { id: "update-later", onClick: () => (dismissed.value = true) }, "Later"),
              ]
            : bannerMode === "updating"
              ? [h("button", { id: "apply-update", disabled: true }, "Updating…")]
              : bannerMode === "reload"
                ? [
                    h("span", {}, "Reload to use the new version"),
                    h("button", { id: "update-reload", onClick: () => window.location.reload() }, "Reload"),
                  ]
                : [
                    h("span", { id: "update-error" }, "Update failed"),
                    h("button", { id: "update-retry", onClick: confirmUpdate }, "Retry"),
                  ];
        children.push(h("div", { id: "update-banner", role: "status", style: BANNER_STYLE }, bannerChildren));
      }

      // Shown only while the browser has offered installation and the app is not installed yet.
      if (state.installEligible) {
        children.push(h("button", { id: "install", onClick: () => void pwa.promptInstall() }, "Install"));
      }

      if (state.installed) {
        children.push(h("p", { id: "installed" }, "installed"));
      }

      return h("main", children);
    };
  },
});
