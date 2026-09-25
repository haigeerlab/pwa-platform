import { BROWSER_VERSION_ANNOTATION, expect, test } from "../src/index.js";

test("runs in the installed Google Chrome and records its version", async ({ page, browserName }, testInfo) => {
  expect(browserName).toBe("chromium");
  expect(testInfo.project.use.channel).toBe("chrome");

  await page.setContent("<main data-harness-marker>ready</main>");
  await expect(page.locator("[data-harness-marker]")).toHaveText("ready");

  const recorded = testInfo.annotations.filter((annotation) => annotation.type === BROWSER_VERSION_ANNOTATION);
  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.description).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
});
