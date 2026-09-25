# ADR-0010：使用 Playwright Test 进行真实浏览器验证

## 状态

已接受（2026-09-15）。

## 背景

[V1 验收矩阵](../architecture/v1-acceptance-matrix.md)中的多个场景和[恢复演练](../operations/recovery-drill.md)，都要求在真实浏览器中取得证据：worker 的注册、等待与接管要跨导航观察，还要切换离线、检查响应头、比对缓存。现有的 Vitest 负责单元测试；它的浏览器模式把测试放在 Vite 开发服务器的 iframe 中运行，难以控制 worker 的 scope、页面重载、响应头和离线状态。

[浏览器矩阵](../architecture/browser-matrix.md)要求 Chrome 桌面端与 Chrome Android 各测 N 与 N-1，同时[依赖变更流程](../operations/dependency-changes.md)要求新依赖可审计，并且不引入新的下载源。

## 决策

- 真实浏览器验证使用 Playwright Test，版本精确固定；Vitest 继续负责单元测试。
- 由内部测试包 `@pwa-platform/browser-test-harness` 提供 fixture 服务器、最小页面与断言工具，运行时模块直接复用，不再各自搭建。
- CI 在独立的 browser job 中使用 runner 预装的 Google Chrome 稳定版（`channel: "chrome"`），不执行 `playwright install`，不下载浏览器。
- 桌面端 N-1 在本地运行：环境变量 `PWA_HARNESS_CHROME_PATH` 以指定的可执行文件代替 Chrome 渠道。
- harness 暂不提供 Chrome Android 运行目标。Playwright 的 Android 支持是实验性的：首次连接设备需要额外下载驱动 APK，与"不引入新下载源"的要求冲突；它启动的浏览器会忽略离线等上下文选项，可能让测试误报通过；本模块也没有设备可以验证。

## 影响

- CI 只能证明"验证当天 runner 上的稳定版"，Chrome 版本随 runner 镜像更新；实测版本由测试日志中打印的浏览器版本、测试注解与 CI 中的 `google-chrome --version` 记录。桌面端 N-1 在本地运行，结果写入验证记录。
- 浏览器矩阵对 Chrome Android N 与 N-1 的必测要求不变。第一个具备测试设备的运行时模块需要在其规格中决定 Chrome Android 的验证方式，所需的驱动或下载源按依赖变更流程审批，并确认 worker、缓存与离线相关能力可用。
- 升级 Playwright 属于依赖变更，需要按依赖变更流程审阅，并重新运行 harness 自测。
- 运行时包与宿主包只能在 `devDependencies` 中引用 harness（[包边界](../architecture/package-boundaries.md)）。
- harness 的具体用法与运行步骤见 [packages/browser-test-harness/README.md](../../packages/browser-test-harness/README.md)，规格见 [spec/browser-test-harness.md](../../spec/browser-test-harness.md)。
