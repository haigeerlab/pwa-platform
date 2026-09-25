# @pwa-platform/browser-test-harness

运行时模块在真实浏览器中验证行为的测试工具包，基于 Playwright Test。私有工作区包，只能在 `devDependencies` 中引用，不得在生产代码中导入。规格见 [spec/browser-test-harness.md](../../spec/browser-test-harness.md)，决定见 [ADR-0010](../../docs/adr/0010-real-browser-verification-with-playwright.md)。

## 接入

1. 在使用方包的 `devDependencies` 中声明 `@pwa-platform/browser-test-harness`（`workspace:*`）与 `@playwright/test`（`1.63.0`，与 harness 相同的精确版本）。
2. Playwright 配置使用已安装的 Google Chrome 稳定版，不下载浏览器：

   ```ts
   import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

   const config: PlaywrightTestConfig = defineConfig({
     testDir: "browser-tests",
     use: { channel: "chrome", headless: true },
   });

   export default config;
   ```

3. 测试从 harness 导入 `test` 与 `expect`：

   ```ts
   import { expect, registerWorker, requestFromPage, test, waitForController } from "@pwa-platform/browser-test-harness";

   test("worker controls the page", async ({ page, fixtureServer }) => {
     await page.goto(fixtureServer.url("/"));
     await registerWorker(page, { scriptUrl: "/sw.js" });
     await waitForController(page, "/sw.js");
     expect(await requestFromPage(page, "/app.js")).toMatchObject({ outcome: "response", fromServiceWorker: true });
   });
   ```

## 提供的能力

| 类别 | 导出 |
|---|---|
| fixture | `test`（含 `fixtureSite` 选项、每个测试独立的 `fixtureServer`，并把浏览器版本写入 `browser-version` 注解）、`expect` |
| 服务器与页面 | `startFixtureServer`、`fixturePath`、`MINIMAL_PAGE_MARKER` |
| worker | `registerWorker`、`waitForController`、`waitForControllerChange`、`readRegistration`、`waitForWorkerState`、`requestFromPage` |
| 缓存与响应头 | `snapshotCaches`、`createCaches`、`diffCacheSnapshots`、`expectDeletedExactlyUnderPrefix`、`expectCacheControl` |
| 生命周期事件 | `expectLifecycleSequence` |
| 常量 | `BROWSER_VERSION_ANNOTATION`、`CHROME_PATH_ENV` |

### 使用时要注意

- **同一 URL 的新旧 worker**：平台的 worker URL 不可变，`waitForController` 与 `waitForWorkerState` 只比较脚本 URL，区分不了同一 URL 的新旧版本。检查更新或恢复 worker 是否真正接管页面时，用 `waitForControllerChange`：

  ```ts
  await waitForControllerChange(page, async () => {
    fixtureServer.deploy("v2");
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  });
  ```

  它等待 `controllerchange`，并确认新的 controller 就是 registration 的 active worker；新版本只进入等待状态时会失败。传入的动作不能导航页面。

- **`expectCacheControl` 的匹配规则**：
  - 只写指令名（如 `no-cache`）时，只匹配不带值的指令；`no-cache="set-cookie"` 不满足它；
  - `max-age=*` 匹配任意值，`max-age=0` 要求该值；
  - 同名指令重复出现直接失败；等号两侧带空白等格式错误的指令被忽略；
  - 逗号与换行都分隔指令，Playwright 的 `Response.headers()` 用换行合并同名的多行响应头。
- **`expectDeletedExactlyUnderPrefix`** 要求没有任何新增缓存，对应恢复演练第 3 步；清理后又重新预缓存的场景，要另行检查新增的缓存。
- **`requestFromPage`** 只用于同源 URL：请求带唯一的 `x-pwa-harness-request` 请求头，以区分对同一 URL 的并发请求；URL 片段会被忽略。
- **`snapshotCaches`** 应在被测 worker 稳定后调用；缓存名在记录过程中持续变化时会失败。
- **fixture 服务器**只绑定 `127.0.0.1`，只接受 `localhost:<端口>` 与 `127.0.0.1:<端口>` 的 Host；文件只按原始写法提供，`..`、符号链接、大小写变体等别名一律 404；目录不带结尾斜杠时重定向。
- `fixtures/` 中的 worker 只用于 harness 自测，不代表平台行为。最小页面声明了内联空图标，浏览器不会请求 `/favicon.ico`。
- 生命周期事件在页面与 worker 之间怎么传输由 client-runtime 决定；`expectLifecycleSequence` 只校验测试收集到的事件值。

## 运行目标

| 目标 | 运行方式 |
|---|---|
| Chrome 桌面端 N | 默认，使用已安装的 Google Chrome 稳定版；CI 使用 runner 预装的 Chrome |
| Chrome 桌面端 N-1 | 设置 `PWA_HARNESS_CHROME_PATH=<可执行文件>`，见下文 |
| Chrome Android | 暂不支持，原因见 ADR-0010；由第一个具备测试设备的运行时模块决定运行方式 |

每个 Playwright worker 启动浏览器后会打印一行 `[browser-test-harness] chromium <版本> (...)`，每个测试也会写入 `browser-version` 注解。把实测版本与操作系统信息按[浏览器矩阵](../../docs/architecture/browser-matrix.md)的"版本号"字段写入验证记录。

### 桌面端 N-1

1. 取得上一个稳定主版本的 Chrome 可执行文件，并确认 `<可执行文件> --version` 的主版本号比已安装的稳定版小 1。获取来源若涉及新的下载源，先按依赖变更流程确认。
2. 运行：

   ```bash
   PWA_HARNESS_CHROME_PATH="/path/to/chrome" pnpm test:browser --filter <使用方包名>
   ```

3. 确认日志中打印的版本是 N-1 的版本号。使用方配置里自带的其他 `launchOptions` 会保留。

## 自测

```bash
pnpm --filter @pwa-platform/browser-test-harness test
pnpm test:browser --filter @pwa-platform/browser-test-harness
```

harness 自身的浏览器自测串行运行（`workers: 1`）：本机并行启动多个 Chrome 时，创建上下文曾出现超时。

全仓 `pnpm test:browser`（不带 `--filter`）同样逐包串行，根脚本对它传 `--workspace-concurrency=1`：多个包同时启动 Chrome 时，Push 点击场景曾在重负载下偶发超时（[规格增补](../../spec/browser-test-harness.md)）。
