import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let origin: string;

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../apps/update-notice/", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || typeof address === "string" || address === undefined) throw new Error("Vite did not listen");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await server?.close();
});

for (const framework of ["vue", "react"] as const) {
  test(`${framework}: a brief waiting signal does not leave a false reload prompt`, async ({ page }) => {
    await page.goto(`${origin}/?framework=${framework}`);
    await page.waitForFunction("typeof window.__fixture?.wait === 'function'");
    await page.evaluate("(async () => { window.__fixture.wait(); await new Promise(resolve => setTimeout(resolve, 20)); window.__fixture.applied(); })()");
    await page.waitForTimeout(150);
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test(`${framework}: waiting, later, retry, takeover and explicit reload`, async ({ page }) => {
    await page.goto(`${origin}/?framework=${framework}`);
    await page.waitForFunction("typeof window.__fixture?.wait === 'function'");
    await page.evaluate("window.__fixture.wait()");
    const notice = page.getByRole("status");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("有可用更新");
    await page.getByRole("button", { name: "稍后" }).click();
    await expect(notice).toHaveCount(0);
    await page.evaluate("window.__fixture.applied()");
    await expect(notice).toContainText("更新已完成");
    await expect(page.getByRole("heading", { name: "业务页面" })).toBeVisible();
    expect(await page.evaluate("window.__fixture.reloadCalls()")).toBe(0);
    await page.getByRole("button", { name: "刷新页面" }).click();
    expect(await page.evaluate("window.__fixture.reloadCalls()")).toBe(1);
  });

  test(`${framework}: failure and in-flight state allow retry without duplicate apply`, async ({ page }) => {
    await page.goto(`${origin}/?framework=${framework}`);
    await page.waitForFunction("typeof window.__fixture?.wait === 'function'");
    await page.evaluate("window.__fixture.wait()");
    await page.evaluate("window.__fixture.failNext()");
    await page.getByRole("button", { name: "更新", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("更新未完成");
    await page.evaluate("window.__fixture.hold()");
    await page.getByRole("button", { name: "重试" }).click();
    await expect(page.getByRole("button", { name: "正在更新" })).toBeDisabled();
    expect(await page.evaluate("window.__fixture.applyCalls()")).toBe(2);
    await page.evaluate("window.__fixture.release()");
    await expect(page.getByRole("button", { name: "刷新页面" })).toBeVisible();
  });

  test(`${framework}: position, theme override and narrow viewport stay usable`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 650 });
    await page.goto(`${origin}/?framework=${framework}&position=top-center&custom`);
    await page.waitForFunction("typeof window.__fixture?.wait === 'function'");
    await page.evaluate("document.documentElement.style.setProperty('--pwa-update-accent', '#006e52')");
    await page.evaluate("window.__fixture.wait()");
    const notice = page.getByRole("status");
    await expect(notice).toHaveAttribute("data-position", "top-center");
    await expect(notice).toContainText("业务自定义更新");
    const box = await notice.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.width).toBeGreaterThan(270);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(box!.y).toBeLessThan(120);
    await expect(page.getByRole("button", { name: "更新", exact: true })).toHaveCSS("background-color", "rgb(0, 110, 82)");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "更新", exact: true })).toBeFocused();
    if (framework === "vue") await page.screenshot({ path: "/private/tmp/pwa-update-notice-mobile.png" });
  });

  test(`${framework}: colors prop overrides inherited colors for this notice`, async ({ page }) => {
    await page.goto(`${origin}/?framework=${framework}&colors`);
    await page.waitForFunction("typeof window.__fixture?.wait === 'function'");
    await page.evaluate("document.documentElement.style.setProperty('--pwa-update-accent', '#ff0000')");
    await page.evaluate("window.__fixture.wait()");
    const notice = page.getByRole("status");
    const primary = page.getByRole("button", { name: "更新", exact: true });
    await expect(notice).toHaveCSS("background-color", "rgb(255, 248, 231)");
    await expect(notice).toHaveCSS("color", "rgb(27, 33, 48)");
    await expect(notice).toHaveCSS("border-color", "rgb(185, 167, 123)");
    await expect(notice.locator(".pwa-update-notice__body")).toHaveCSS("color", "rgb(48, 63, 69)");
    await expect(primary).toHaveCSS("background-color", "rgb(0, 110, 82)");
    await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator("html")).toHaveCSS("--pwa-update-accent", "#ff0000");
    if (framework === "vue") await page.screenshot({ path: "/private/tmp/pwa-update-notice-colors.png" });
  });

  test(`${framework}: later reminds again and refresh is an explicit browser action`, async ({ page }) => {
    await page.clock.install();
    await page.goto(`${origin}/?framework=${framework}&defaultReload`);
    await page.waitForFunction("typeof window.__fixture?.wait === 'function'");
    await page.evaluate("window.__fixture.wait()");
    await page.getByRole("button", { name: "稍后" }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.clock.fastForward(30 * 60_000);
    await expect(page.getByRole("button", { name: "更新", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "更新", exact: true }).click();
    await expect(page.getByRole("button", { name: "刷新页面" })).toBeVisible();
    await page.evaluate("sessionStorage.setItem('before-reload', 'present')");
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "刷新页面" }).click(),
    ]);
    expect(await page.evaluate("sessionStorage.getItem('before-reload')")).toBe("present");
    await expect(page.getByRole("status")).toHaveCount(0);
  });
}

for (const framework of ["vue", "react"] as const) {
  test(`${framework}: desktop dark mode uses a calm surface and stays inside the viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`${origin}/?framework=${framework}`);
    await page.waitForFunction("typeof window.__fixture?.wait === 'function'");
    await page.evaluate("window.__fixture.wait()");
    const notice = page.getByRole("status");
    await expect(notice).toHaveCSS("background-color", "rgb(22, 27, 34)");
    const box = await notice.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800);
    if (framework === "vue") await page.screenshot({ path: "/private/tmp/pwa-update-notice-dark.png" });
  });
}
