// Server-side rendering through both bindings, with the real renderers. It lives here rather than next to the
// bindings because this package already carries react-dom, and the React binding's own boundary test keeps every
// renderer out of that package on purpose (spec/vue-react-adapters.md; owner decision 2026-09-17, ssr-adapters T3).
//
// What it pins down (spec/ssr-adapters.md, ADR-0016 amendment):
// - rendering does not throw on either side, and the markup shows the initial state;
// - the four methods reject on the server with the same message on both sides, without reaching a facade.
//
// The bindings are imported through their public entries, which resolve to `dist`: rebuild a binding after
// changing its source, or this suite reads the old build.
import {
  PwaProvider,
  usePwa as useReactPwa,
  type PwaBinding as ReactBinding,
  type PwaProviderProps,
} from "@pwa-platform/react";
import { createPwa, usePwa as useVuePwa, type PwaBinding as VueBinding } from "@pwa-platform/vue";
import { createElement } from "react";
import { renderToString as renderReact } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString as renderVue } from "vue/server-renderer";

const config: PwaProviderProps["config"] = {
  appId: "storefront",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  updateMode: "prompt",
  installEnabled: true,
};

type State = ReactBinding["state"];
type Method = "register" | "promptInstall" | "applyUpdate" | "logout";
const METHODS: readonly Method[] = ["register", "promptInstall", "applyUpdate", "logout"];

const INITIAL: State = { registered: false, installEligible: false, installed: false, updateWaiting: false };

/** One line per flag, so the rendered markup can be compared without depending on either renderer's escaping. */
function describeState(state: State): string {
  return `registered=${state.registered};installEligible=${state.installEligible};installed=${state.installed};updateWaiting=${state.updateWaiting}`;
}

async function renderWithReact(): Promise<{ readonly html: string; readonly binding: ReactBinding }> {
  let captured: ReactBinding | undefined;
  function Probe() {
    captured = useReactPwa();
    return createElement("output", null, describeState(captured.state));
  }
  const html = renderReact(createElement(PwaProvider, { config }, createElement(Probe)));
  if (captured === undefined) throw new Error("the probe did not render");
  return { html, binding: captured };
}

async function renderWithVue(): Promise<{ readonly html: string; readonly binding: VueBinding }> {
  let captured: VueBinding | undefined;
  const Probe = defineComponent({
    setup() {
      const binding = useVuePwa();
      captured = binding;
      return () => h("output", describeState(binding.state.value));
    },
  });
  const app = createSSRApp(Probe);
  app.use(createPwa({ config }));
  const html = await renderVue(app);
  if (captured === undefined) throw new Error("the probe did not render");
  return { html, binding: captured };
}

/** The rejection message of every method, in order; a method that resolves shows up as a failure here. */
async function rejections(binding: ReactBinding | VueBinding): Promise<readonly string[]> {
  const messages: string[] = [];
  for (const method of METHODS) {
    const error: unknown = await binding[method]().then(
      () => new Error(`${method} resolved on the server`),
      (reason: unknown) => reason,
    );
    messages.push(error instanceof Error ? error.message : String(error));
  }
  return messages;
}

describe("server-side rendering with the React binding", () => {
  it("renders the initial state", async () => {
    const { html } = await renderWithReact();
    expect(html).toBe(`<output>${describeState(INITIAL)}</output>`);
  });

  it("rejects every method on the server", async () => {
    const { binding } = await renderWithReact();
    for (const message of await rejections(binding)) {
      expect(message).toMatch(/server-side rendering/);
    }
  });
});

describe("server-side rendering with the Vue binding", () => {
  it("renders the initial state", async () => {
    const { html } = await renderWithVue();
    expect(html).toBe(`<output>${describeState(INITIAL)}</output>`);
  });

  it("rejects every method on the server", async () => {
    const { binding } = await renderWithVue();
    for (const message of await rejections(binding)) {
      expect(message).toMatch(/server-side rendering/);
    }
  });
});

describe("server-side parity between the bindings", () => {
  it("gives the same initial state and the same rejections on both sides", async () => {
    const react = await renderWithReact();
    const vue = await renderWithVue();
    expect(vue.binding.state.value).toEqual(react.binding.state);
    expect(await rejections(vue.binding)).toEqual(await rejections(react.binding));
  });
});
