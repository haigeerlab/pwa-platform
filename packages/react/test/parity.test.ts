// The only thing holding the two independently written state machines to the same conclusions. Each package keeps
// its own copy of the flip rules (spec: "各自实现 + 一致性测试"), so without this suite they are free to drift
// apart silently — a bug that would surface as "the Vue app behaves differently from the React one" long after
// the change that caused it.
//
// The two sides are driven the way this repository always drives a parity check: the local one through its own
// relative import, the foreign one through its public entry only. build-verifier compares its second
// Cache-Control parser against the harness's public assertion rather than its parser; sw-runtime and vite do the
// same for path matching and host-output collection. Here the Vue side is exercised exactly as an application
// would: install the plugin into an app and read the binding it provides.
//
// Reaching into the Vue package's own store.ts is not possible anyway — its `exports` names only "." — and it
// would not be meaningful: what has to match is observable behaviour, not source text.
import type { PwaClient, PwaClientConfig, PwaClientEvent, PwaClientEventType } from "@pwa-platform/client-runtime";
import { createPwa } from "@pwa-platform/vue";
import { describe, expect, it } from "vitest";
import { createStore, type PwaState } from "../src/store.js";

const config: PwaClientConfig = {
  appId: "storefront",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  updateMode: "prompt",
  installEnabled: true,
};

type Fake = { readonly client: PwaClient; readonly emit: (type: PwaClientEventType) => void };

/** A facade whose only job is to hand an identical event stream to whichever side is being driven. */
function fakeClient(): Fake {
  const listeners = new Set<(event: PwaClientEvent) => void>();
  const client: PwaClient = {
    register: async () => undefined,
    promptInstall: async () => "unavailable",
    applyUpdate: async () => false,
    logout: async () => false,
    checkForUpdate: async () => "unavailable",
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => undefined,
  };
  return {
    client,
    emit: (type) => {
      const event: PwaClientEvent = {
        version: 1,
        type,
        timestamp: "2026-09-17T00:00:00.000Z",
        appId: config.appId,
        metadata: {},
      };
      for (const listener of [...listeners]) listener(event);
    },
  };
}

/**
 * Snapshots after each event, starting with the state before any event arrives. Copied on the way out so a later
 * mutation cannot rewrite recorded history — the whole point is to compare the *sequence*, not just the end.
 */
type Sequence = readonly PwaState[];

function reactSequence(types: readonly PwaClientEventType[]): Sequence {
  const store = createStore();
  const fake = fakeClient();
  store.attach(fake.client);

  const seen: PwaState[] = [{ ...store.getSnapshot() }];
  for (const type of types) {
    fake.emit(type);
    seen.push({ ...store.getSnapshot() });
  }
  return seen;
}

/** The Vue side, through its public entry alone: a plugin installed into a stand-in app. */
function vueSequence(types: readonly PwaClientEventType[]): Sequence {
  const fake = fakeClient();
  let provided: { readonly state: { readonly value: PwaState } } | undefined;

  // Only `provide` is needed here. Leaving `onUnmount` off also keeps this suite honest about what it measures:
  // state, not disposal.
  const app = {
    provide(_key: unknown, value: unknown) {
      provided = value as { readonly state: { readonly value: PwaState } };
      return app;
    },
  };

  const plugin = createPwa({ config, client: fake.client }) as { install: (app: unknown) => void };
  plugin.install(app);
  if (provided === undefined) throw new Error("the Vue plugin provided no binding");
  const binding = provided;

  const seen: PwaState[] = [{ ...binding.state.value }];
  for (const type of types) {
    fake.emit(type);
    seen.push({ ...binding.state.value });
  }
  return seen;
}

/** Event orders that between them exercise every branch of the flip rules. */
const SEQUENCES: readonly (readonly [string, readonly PwaClientEventType[]])[] = [
  ["nothing at all", []],
  ["a first registration", ["registered"]],
  ["install offered then accepted", ["install-eligible", "installed"]],
  ["an update waiting", ["registered", "update-waiting"]],
  ["an applied update", ["registered", "update-waiting", "update-applied"]],
  ["the full first-visit order", ["registered", "install-eligible", "installed", "update-waiting"]],
  ["a repeated event", ["registered", "registered", "registered"]],
  ["repeats scattered through a sequence", ["registered", "install-eligible", "install-eligible", "installed", "installed"]],
  ["events out of order", ["update-waiting", "installed", "install-eligible", "registered"]],
  ["installed before eligible", ["installed", "install-eligible"]],
  ["an update before anything else", ["update-waiting"]],
  ["a served-from-cache event changes nothing", ["registered", "served-from-cache", "install-eligible"]],
];

describe("the two state machines agree", () => {
  for (const [name, types] of SEQUENCES) {
    it(`on ${name}`, () => {
      // Compared step by step, not just at the end: two implementations can converge on the same final state
      // while disagreeing in the middle, and a user sees the middle.
      expect(vueSequence(types)).toEqual(reactSequence(types));
    });
  }
});

describe("the two states have the same shape", () => {
  it("exposes exactly the four documented fields on both sides", () => {
    const [reactInitial] = reactSequence([]);
    const [vueInitial] = vueSequence([]);
    const expected = ["installEligible", "installed", "registered", "updateWaiting"];

    expect(Object.keys(reactInitial ?? {}).sort()).toEqual(expected);
    expect(Object.keys(vueInitial ?? {}).sort()).toEqual(expected);
  });

  it("starts from the same initial state", () => {
    expect(vueSequence([])).toEqual(reactSequence([]));
  });
});

describe("the comparison itself discriminates", () => {
  it("reports a difference when one snapshot in a sequence differs", () => {
    // Scope, stated plainly: this checks only that `toEqual` compares these sequences element-wise, so a real
    // divergence could not slip past the assertion style used above. It does NOT prove the two sides are wired to
    // different implementations — it never calls `vueSequence`, and rewriting that function to return
    // `reactSequence(types)` would leave this case passing.
    //
    // Nothing inside this file can prove that wiring: it takes changing the Vue source and observing this suite go
    // red, which is the controlled mutation recorded in ADR-0016 (unbuilt: 50 passed; rebuilt: 3 failed). Treat
    // that experiment, not this case, as the evidence.
    const real = reactSequence(["registered"]);
    const drifted = real.map((state, index) => (index === 1 ? { ...state, registered: false } : state));
    expect(drifted).not.toEqual(real);
  });
});
