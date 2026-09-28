import { BROWSER_VERSION_ANNOTATION, expect, test } from "../src/index.js";

test("runs in the configured installed branded browser (Google Chrome unless PWA_BROWSER_CHANNEL says otherwise) and records its version", async ({ page, browserName }, testInfo) => {
  expect(browserName).toBe("chromium");
  // ADR-0044: the non-blocking Edge job sets PWA_BROWSER_CHANNEL=msedge; every other run uses Chrome.
  expect(testInfo.project.use.channel).toBe(process.env.PWA_BROWSER_CHANNEL ?? "chrome");

  await page.setContent("<main data-harness-marker>ready</main>");
  await expect(page.locator("[data-harness-marker]")).toHaveText("ready");

  const recorded = testInfo.annotations.filter((annotation) => annotation.type === BROWSER_VERSION_ANNOTATION);
  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.description).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
});
