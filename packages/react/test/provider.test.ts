// PwaProvider's own render-time guard: passing both `client` and `updateCheck` throws (spec: 修订：主动检查更新,
// 框架绑定增量). The check sits before any hook call in the component body, so — unlike the rest of the provider —
// it can be exercised by calling `PwaProvider` directly as a plain function, without React's renderer: execution
// never reaches `useState`, so there is no "invalid hook call" to worry about.
import type { PwaClient, PwaClientConfig } from "@pwa-platform/client-runtime";
import { describe, expect, it } from "vitest";
import { PwaProvider, type PwaProviderProps } from "../src/index.js";
import { CLIENT_AND_UPDATE_CHECK_ERROR } from "../src/store.js";

const config: PwaClientConfig = {
  appId: "storefront",
  scope: "/app/",
  serviceWorkerUrl: "/app/sw.js",
  updateMode: "prompt",
  installEnabled: true,
};

const fakeClient: PwaClient = {
  register: async () => undefined,
  promptInstall: async () => "unavailable",
  applyUpdate: async () => false,
  logout: async () => false,
  checkForUpdate: async () => "unavailable",
  subscribe: () => () => undefined,
  dispose: () => undefined,
};

function render(props: PwaProviderProps): void {
  PwaProvider(props);
}

describe("PwaProvider", () => {
  it("throws when both client and updateCheck are passed", () => {
    expect(() => render({ config, client: fakeClient, updateCheck: { intervalMs: 60_000 } })).toThrow(
      CLIENT_AND_UPDATE_CHECK_ERROR,
    );
  });
});
