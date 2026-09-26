import { createApp, h } from "vue";
import { createPwa } from "@pwa-platform/vue";
import { PwaUpdateNotice as VueNotice } from "@pwa-platform/vue/ui";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { PwaProvider } from "@pwa-platform/react";
import { PwaUpdateNotice as ReactNotice } from "@pwa-platform/react/ui";

const params = new globalThis.URLSearchParams(globalThis.location.search);
const listeners = new Set();
let failNext = false;
let pending = false;
let settlePending;
let applyCalls = 0;
let reloadCalls = 0;

function emit(type) {
  for (const listener of listeners) listener({ type });
}

const client = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async applyUpdate() {
    applyCalls += 1;
    if (failNext) {
      failNext = false;
      throw new Error("fixture update failure");
    }
    if (pending) await new Promise((resolve) => { settlePending = resolve; });
    emit("update-applied");
    return true;
  },
  async register() { return true; },
  async promptInstall() { return "unavailable"; },
  async logout() { return false; },
  async checkForUpdate() { return "up-to-date"; },
  dispose() { listeners.clear(); },
};

const config = { appId: "ui-fixture", scope: "/", serviceWorkerUrl: "/sw.js", updateMode: "prompt", installEnabled: false };
const position = params.get("position") ?? "bottom-right";
const props = {
  position,
  messages: params.has("custom") ? { readyTitle: "业务自定义更新" } : {},
  ...(params.has("colors") ? { colors: {
    surface: "#fff8e7",
    text: "#1b2130",
    mutedText: "#303f45",
    border: "#b9a77b",
    primaryButtonBackground: "#006e52",
    primaryButtonText: "#ffffff",
  } } : {}),
  ...(params.has("defaultReload") ? {} : { reloadPage: () => { reloadCalls += 1; } }),
};

if (params.get("framework") === "react") {
  await import("@pwa-platform/react/update-notice.css");
  createRoot(globalThis.document.getElementById("app")).render(
    createElement(PwaProvider, { config, client }, createElement(ReactNotice, props)),
  );
} else {
  await import("@pwa-platform/vue/update-notice.css");
  createApp({ render: () => h(VueNotice, props) }).use(createPwa({ config, client })).mount("#app");
}

globalThis.__fixture = {
  wait() { emit("update-waiting"); },
  applied() { emit("update-applied"); },
  failNext() { failNext = true; },
  hold() { pending = true; },
  release() { pending = false; settlePending?.(); settlePending = undefined; },
  applyCalls() { return applyCalls; },
  reloadCalls() { return reloadCalls; },
};
