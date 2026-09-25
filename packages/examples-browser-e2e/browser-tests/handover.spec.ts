// The three gaps vue-react-adapters handed over. Each one is here because its unit tests cannot reach it.
import { expect, test } from "@pwa-platform/browser-test-harness";
import { SHELL_URL } from "../apps/shared/identity.js";
import { hasRegistration, installAndControl } from "./page.js";
import { EXAMPLES, fixtureSite } from "./sites.js";

/** The binding's own message, copied from packages/react/src/index.ts. */
const NO_PROVIDER = "No PWA binding found: wrap the tree in a PwaProvider first";

for (const example of EXAMPLES) {
  test.describe(`${example} example · handover`, () => {
    test.use({ fixtureSite: fixtureSite(example) });

    test("re-rendering does not disturb the binding", async ({ page, fixtureServer }) => {
      // In the React example this is the gap: `Root` holds the counter and passes `config={{ ... }}`, so every bump
      // hands the provider a new object. If it depended on that object instead of on its fields, the effect would
      // tear the facade down and build a fresh, unregistered one, and the interface would go back to saying "not
      // registered" while the worker was still installed. The mutation check drives exactly that.
      //
      // In the Vue example nothing above the component rebuilds anything, so the same assertions are a parity
      // check rather than evidence. They are run anyway: both examples answer the same interface.
      //
      // The premise that makes this discriminate: nothing registers again after a rebuilt facade. `Registrar`'s
      // effect depends on `register`, which is the store's own method and keeps its identity across attach and
      // detach, so a rebuilt facade stays unregistered and the interface shows it. If that effect ever re-ran on
      // every attach, a rebuilt facade would register itself again and this test could no longer see the rebuild.
      await installAndControl(page, fixtureServer);
      await expect(page.locator("#count")).toHaveText("0");

      for (let click = 1; click <= 3; click += 1) {
        await page.locator("#bump").click();
        await expect(page.locator("#count")).toHaveText(String(click));
      }

      await expect(page.locator("#registered")).toHaveText("registered");
      // Both halves matter. The interface must say "registered", and that must still be true — a check on the
      // interface alone would also pass a binding that says "registered" about a registration that is long gone.
      expect(await hasRegistration(page)).toBe(true);
    });

    test("logout removes the registration while the binding keeps reporting it", async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      await page.locator("#logout").click();

      // The application's own flag, set from what `logout()` returned: a registration really was removed.
      await expect(page.locator("#logged-out")).toHaveText("logged out");
      expect(await hasRegistration(page)).toBe(false);

      // And the documented limitation, on screen: `logout()` emits no event, so the adapter never learns the
      // registration is gone and `registered` stays true. Asserted as it is, not as it should be — an example that
      // hid this would misrepresent what an application actually gets (spec: vue-react-adapters, 已知限制).
      await expect(page.locator("#registered")).toHaveText("registered");
    });
  });
}

test.describe("react example · handover", () => {
  test.use({ fixtureSite: fixtureSite("react") });

  test("usePwa() outside the provider throws the binding's own error", async ({ page, fixtureServer }) => {
    // Unit tests stop short of this: called outside a render, React's dispatcher rejects `useContext` before the
    // binding's own null check runs, so the message below is only reachable from a real render.
    await page.goto(fixtureServer.url(SHELL_URL));
    await expect(page.locator("#outside-usepwa")).toHaveText(NO_PROVIDER);
    await expect(page.locator("#outside-usepwa")).toBeHidden();
  });
});
