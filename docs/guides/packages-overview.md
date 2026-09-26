# 包导览：每个包做什么、不做什么

本文面向**接入平台的业务开发**。前四章只讲你需要知道的部分；第五章写给平台维护者。包边界的权威定义见[包边界](../architecture/package-boundaries.md)，本文与之冲突时以它为准。

## 1. 一张图看懂

**一句话：你声明意图，平台替你生成并托管 Service Worker。**

你告诉平台"这个应用叫什么、装在哪个路径、哪些页面可以离线打开"，平台负责生成 worker、manifest 和预缓存清单，在构建时检查产物，并在浏览器里处理注册、更新和登出清理。你不写 Service Worker 代码，也不配置 Workbox。

```text
┌──────────────────────────────────────────────────────────────┐
│ 你的应用（界面、业务逻辑、更新提示的样式）                        │
├──────────────────────────────────────────────────────────────┤
│ 宿主层   @pwa-platform/vue · @pwa-platform/react · (nuxt)      │  ← 你直接使用
│ 构建层   @pwa-platform/vite                                    │  ← 你在构建配置里使用
├──────────────────────────────────────────────────────────────┤
│ 运行时层 client-runtime（页面侧） · sw-runtime（worker 侧）      │
│          engine-workbox（缓存引擎）                            │  ← 你碰不到，随上层自动安装
│ 编译层   core（编译计划） · build-verifier（产物质检）           │
│ 契约层   contracts（类型与校验）                               │
├──────────────────────────────────────────────────────────────┤
│ 可选模块 push · offline-write · entry-resilience               │  ← 需要时再装
│ 测试专用 browser-test-harness · examples-browser-e2e           │  ← 平台内部，不发布
└──────────────────────────────────────────────────────────────┘
```

依赖只从上往下走。上层可以调用下层；下层不知道上层存在。

## 2. 我是业务开发，该装什么

| 你的项目 | 安装 | 说明 |
|---|---|---|
| Vite + Vue 3 | `@pwa-platform/vite` + `@pwa-platform/vue` | 最常见的组合 |
| Vite + React 19 | `@pwa-platform/vite` + `@pwa-platform/react` | 同上 |
| Nuxt 4 | `@pwa-platform/nuxt` | 暂未对外发布，仅在工作区内可用 |
| 需要 Web 推送 | 再加 `@pwa-platform/push` | 暂未发布，见 [Push 接入说明](push-integration.md) |
| 需要离线暂存写操作 | 再加 `@pwa-platform/offline-write` | 暂未发布，需要 v2 策略 |
| 需要换域名后的入口灾备 | 再加 `@pwa-platform/entry-resilience` | 已发布 0.1.0；业务须提前交入清单 |

### 安装命令

10 个包已发布到 npm，当前正式版本是 **`0.1.0`**（首批 beta 包于 2026-09-20 发布）。正式包不代表接入它的业务应用已通过生产验收。

```bash
# Vue 项目
pnpm add @pwa-platform/vue@0.1.0
pnpm add -D @pwa-platform/vite@0.1.0

# React 项目
pnpm add @pwa-platform/react@0.1.0
pnpm add -D @pwa-platform/vite@0.1.0

# 需要在配置文件里导入 PwaIdentity 等类型时，另加
pnpm add -D @pwa-platform/contracts@0.1.0
```

注意事项：

- **建议固定版本号。** npm `latest` 指向 0.1.0；固定版本可使业务项目的升级可控。
- **peer 依赖需要项目自带**：已发布的 `0.1.0` 要求 `vite` `^5.0.0 || ^8.0.0`；`vue` 为 `^3.4.0`、`react` 为 `^19.2.0`。React 绑定不要求 `react-dom`，渲染器由你的应用决定。
- 其余内部包（core、sw-runtime 等）由包管理器自动解析，不需要手动安装。
- 能装上不等于能上线：业务应用上线前仍要通过自己的生产发布检查。正式版验收结果见[验证记录](../../tasks/stable-release-qualification/verification.md)。

**不要直接依赖**以下包：`contracts`、`core`、`engine-workbox`、`sw-runtime`、`client-runtime`、`build-verifier`。它们会作为传递依赖自动安装。唯一的例外是：写配置文件时可以从 `@pwa-platform/contracts` 导入**类型**（`PwaIdentity`、`PwaPolicy`、`PwaInstallMetadata`）。

原因是这些包的入口会随平台演进而调整。你通过上层包使用它们，平台才能在不打扰你的前提下修改内部实现。

## 3. 每个包一张卡片

每张卡片的栏目相同：它是什么、你什么时候会碰到它、它替你解决了什么、它不做什么（你仍要自己做的）、入口。

### 3.1 你直接使用的包

#### `@pwa-platform/vite` · 装配线

- **它是什么**：一个 Vite 插件，把平台的所有环节串成一条构建流水线：编译计划 → 生成 manifest → 打包并注入 worker → 交付页面配置 → 检查产物。
- **什么时候碰到**：每个项目都要用，在 `vite.config` 里挂载一次。
- **替你解决**：你不必手写 manifest、worker 或预缓存清单。构建结束时如果发现计划与实际产物不一致（比如声明的离线页没有生成），构建会直接失败，不会把问题带到线上。插件还会自动向 HTML 注入 `<link rel="manifest">`。
- **不做什么**：不接受自定义 worker 代码或 Workbox 配置；不负责部署；不自动注册 worker（注册由页面调用）。
- **可选**：`offlinePage` 选项生成默认离线页（中英文、亮暗主题），见[默认离线页接入说明](offline-page.md)；安装元数据可以写截图、快捷方式等 manifest 扩展字段，见[manifest 扩展字段接入说明](manifest-fields.md)。
- **入口**：

  ```ts
  // vite.config.ts
  import { pwa } from "@pwa-platform/vite";
  import { defineConfig } from "vite";
  import { IDENTITY, INSTALL, POLICY } from "./pwa.config";

  export default defineConfig({
    base: "/app/", // 与 IDENTITY.scope 一致
    plugins: [pwa({ identity: IDENTITY, policy: POLICY, install: INSTALL, topology: { kind: "standalone-origin" } })],
  });
  ```

  `IDENTITY`、`INSTALL`、`POLICY` 的完整写法见示例应用的 [identity.ts](../../packages/examples-browser-e2e/apps/shared/identity.ts)。

#### `@pwa-platform/vue` 与 `@pwa-platform/react` · 遥控器

- **它是什么**：把平台的页面侧能力包装成框架里的惯用写法。Vue 用 `createPwa` 插件加 `usePwa()` composable，React 用 `PwaProvider` 加 `usePwa()` hook。
- **什么时候碰到**：在应用入口挂载一次，然后在需要显示 PWA 状态的组件里调用 `usePwa()`。
- **替你解决**：你直接拿到 4 个状态和 5 个方法，不必自己订阅事件，也不必处理销毁。

  | 状态 | 含义 |
  |---|---|
  | `registered` | worker 已注册 |
  | `installEligible` | 浏览器允许弹出安装提示 |
  | `installed` | 应用已安装 |
  | `updateWaiting` | 新版本已下载好，等待用户确认 |

  | 方法 | 用途 |
  |---|---|
  | `register()` | 注册 worker，在应用启动后调用 |
  | `promptInstall()` | 弹出浏览器的安装提示，何时展示由你决定（建议放在安装按钮的点击里） |
  | `applyUpdate()` | 用户确认后切换到新版本 |
  | `checkForUpdate()` | 主动检查是否有新版本 |
  | `logout()` | 用户登出时清理平台持有的敏感缓存 |

  Vue 里状态是 `Ref`（读 `pwa.state.value.updateWaiting`），React 里是快照值。两边的状态变化序列由测试保证一致。
- **不做什么**：0.1.0 的 Vue／React 默认更新提示需要业务显式挂载并导入 CSS；不挂载时业务可自行绘制。安装按钮仍由业务实现。平台不在更新后自动刷新页面，也不默认开启定时检查（需通过 `updateCheck` 显式开启）。
- **入口**：

  ```ts
  // Vue：main.ts
  import config from "virtual:pwa-config"; // 由 @pwa-platform/vite 提供
  import { createPwa } from "@pwa-platform/vue";
  app.use(createPwa({ config, updateCheck: { intervalMs: 1_800_000 } }));
  ```

  ```tsx
  // React：main.tsx
  import config from "virtual:pwa-config";
  import { PwaProvider } from "@pwa-platform/react";
  <PwaProvider config={{ ...config }} updateCheck={{ intervalMs: 1_800_000 }}>
    <App />
  </PwaProvider>
  ```

  更新提示的完整参考写法见[更新提示接入指南](update-prompt.md)。

#### `@pwa-platform/nuxt` · Nuxt 专用装配线（暂未发布）

- **它是什么**：Nuxt 4 模块，在 Nuxt 最终的部署产物（`.output/public`）上生成 worker、manifest 和预缓存清单。
- **什么时候碰到**：项目用 Nuxt 时，替代 `@pwa-platform/vite`。
- **替你解决**：Nuxt 的预渲染 HTML 在客户端构建结束之后才生成，普通 Vite 插件看不到这些页面。这个模块等预渲染完成后再生成平台产物，因此离线页和预缓存能覆盖到预渲染页面。它会自动安装 Vue 绑定，页面里同样用 `usePwa()`。
- **不做什么**：只支持独立域名部署，不支持多个应用共用一个域名；不自动注册 worker；不根据 `routeRules` 等配置推断哪些数据是私有的。数据是否可缓存，仍然要你在策略里明确声明。
- **入口**：在 `nuxt.config` 的 `pwaPlatform` 键中声明身份、策略和安装信息。

### 3.2 你碰不到、但值得知道的包

这些包会随上面的包自动安装。了解它们有助于你理解报错和边界，但不要在业务代码里导入。

#### `contracts` · 合同

- **它是什么**：平台所有配置和消息的类型、校验规则与诊断码。
- **替你解决**：配置写错（比如 scope 和 mountPath 对不上）时，你会在构建期得到一个带编号的明确诊断，而不是上线后才发现 worker 不工作。
- **不做什么**：不包含任何运行行为，只负责"长什么样、合不合法"。

#### `core` · 编译器

- **它是什么**：把你的身份、安装信息和策略编译成一份 `PwaPlan`（部署计划）：规定哪些路径预缓存、哪些可以离线打开、哪些一律不缓存。
- **替你解决**：你只需要声明意图，具体规则由平台生成。平台的安全基线会自动合并进去，**你的配置不能覆盖它**：私有数据、写操作、流媒体和未分类的请求默认不缓存。
- **不做什么**：不接触浏览器和构建工具，只做计算。

#### `engine-workbox` · 发动机

- **它是什么**：对 Workbox 的内部封装，负责预缓存的具体实现；v1.1 起还封装了公共读取运行时缓存（`network-first`、`stale-while-revalidate`）的执行。
- **替你解决**：平台用上了 Workbox 成熟的缓存实现，而你不必学习或维护 Workbox 配置。
- **不做什么**：Workbox 是实现细节，不是公开 API。你不能通过任何入口传入 Workbox 的选项或插件；平台将来更换引擎，也不会影响你的代码。

#### `sw-runtime` · 驻场管家与急救包

- **它是什么**：平台自己的 Service Worker（负责安装、激活、预缓存、离线降级、清理旧缓存），外加一个**恢复 worker**。v1.1 起，`PwaPolicy v3` 显式开启后，它还负责公共读取的运行时缓存（响应准入、network-first / SWR、激活期与登出清理），见[公共读取缓存接入说明](public-read-cache.md)。
- **替你解决**：你不写 worker 代码。万一某个版本的 worker 出了问题，发布方可以换上恢复 worker：它不含 Workbox，会立即接管页面，只删除当前应用自己的平台缓存，并且不拦截任何请求，因此页面直接从网络加载最新版本。
- **不做什么**：不接受业务注入的 handler；激活时只清理本平台命名空间下的缓存，不会动你应用自己创建的缓存。

#### `client-runtime` · 页面侧联络员

- **它是什么**：页面和 worker 之间的协调层，负责注册、安装引导、更新检查与确认、生命周期事件和登出清理。`vue` 和 `react` 两个包就是包装它。v1.1 起，运行时缓存开启时它还会发出 `served-from-cache` 事件（[接入说明](public-read-cache.md#served-from-cache-事件)）。
- **替你解决**：`navigator.serviceWorker` 有很多边界情况（新 worker 等待中、页面被接管、多个标签页同时打开等），这些都由它统一处理，你只需要看状态。
- **不做什么**：不刷新页面，不跳转路由，不直接操作 `caches`。这些都属于你的应用。

#### `build-verifier` · 质检员

- **它是什么**：检查编译器自己答不上来的问题：预缓存条目是否真的在产物里、线上响应头是否符合基线、应用身份是否被意外修改、多应用共用一个域名时发布顺序是否正确、旧版本资产是否保留足够的时间。
- **替你解决**：防止出现"计划写得对，实际发布的东西不一样"的情况。`vite` 插件会在构建末尾自动调用它；发布系统也可以在 CI 里离线调用。
- **不做什么**：不发网络请求（响应头由调用方采集后传入），不写盘，不负责部署；只给出通过或不通过的结论。

### 3.3 可选模块（暂未发布）

#### `push` · 推送

- **它是什么**：页面侧提供查询、订阅、取消订阅；服务端侧（`@pwa-platform/push/server`）提供推送负载的构造与校验。
- **替你解决**：前后端使用同一份负载格式和同一套校验规则。worker 收到合格的推送后会自动展示通知，并在用户点击时打开 scope 内的页面。
- **你仍要自己做**：在用户操作中发起订阅；把订阅信息发到你的后端并保存；从后端发送推送；清理失效的订阅。详见 [Push 接入说明](push-integration.md)。

#### `offline-write` · 离线写队列

- **它是什么**：一个需要显式创建、与登录会话绑定的受限队列，提供 `enqueue`、`flush`、`clear`。
- **替你解决**：用户离线时可以暂存写操作，恢复网络后再提交。
- **你仍要自己做**：保证接口幂等、校验授权、处理冲突。它不会拦截 `fetch`，不使用 Background Sync，也不会自动重放；只有在页面已被 worker 控制之后才能创建。

#### `entry-resilience` · 入口灾备

- **它是什么**：当前域名迁移或不可达时，读取业务应用提前取得并交入的入口清单，为仍能从缓存启动的已安装应用展示需要用户确认的备用入口；平台不再验签（ADR-0033）。
- **替你解决**：旧应用壳仍能从缓存启动且清单已提前存入时，为已安装用户提供可确认的备用入口；原域名上的登录态和本地数据不会迁移。
- **不做什么**：不突破浏览器的同源隔离，不会把登录状态或本地数据带到新域名；跳转必须由用户确认。

### 3.4 测试专用（平台内部，不发布）

#### `browser-test-harness` · 试车场

- **它是什么**：平台各运行时包在**真实 Chrome** 里验证 Service Worker 行为的测试工具箱，基于 Playwright。它提供测试服务器、不依赖框架的最小页面、worker 注册与等待工具，以及缓存和响应头断言。
- **为什么需要**：worker 的注册、接管、缓存和版本更替在 Node 单元测试里模拟不出来，必须在真浏览器里跑。把这套基础设施集中到一个包里，各包的浏览器测试才能写法一致。
- **谁在用**：sw-runtime、client-runtime、engine-workbox、build-verifier、vite、nuxt、push、entry-resilience、examples-browser-e2e。
- **边界**：只能作为开发依赖，生产代码不得导入；包内的 worker fixture 只用于自测，不代表平台的真实行为。业务应用用不到它。

#### `examples-browser-e2e` · 样板间

- **它是什么**：Vue 和 React 两个示例应用（同一个应用写两遍），加上安装、离线启动、更新提示、恢复路径和发布检查的端到端测试。
- **对你的用处**：它是**可以照抄的参考实现**。接入时遇到问题，先看示例应用的 `vite.config.ts`、`identity.ts` 和更新提示组件是怎么写的。
- **和 harness 的区别**：harness 测单个零件，这里测拼装好的整个应用。

### 3.5 治理工具（平台内部，不发布）

#### `release-tools` · 本地门禁

- **它是什么**：GitHub 不可用期间代替真实 CI 的本地门禁工具（[ADR-0031](../adr/0031-local-gate-substitute-for-ci.md)）：按 Node 版本在干净 worktree 中跑一遍基线 CI 命令，生成[本地门禁记录](../operations/local-ci-record-template.md)。
- **谁在用**：只有发布操作者，通过根目录的 `gate:local` 脚本调用。
- **不做什么**：不代替真实 CI；不判断 GitHub 是否可用；业务开发用不到它，也不应在产品代码或其他平台包中引入。

## 4. 几条不能碰的红线

1. **身份上线后不可变更。** `scope`、Service Worker URL、manifest ID 和缓存命名空间一旦在生产环境注册，就不能再改。改了会导致已安装用户的应用失联或出现重复安装。确实需要变更时，必须先有架构决策记录（ADR）和迁移计划。
2. **不能注入自己的 Service Worker 代码或 Workbox 配置。** 你只能通过策略（`PwaPolicy`）声明意图。
3. **敏感请求默认不缓存。** 私有数据、写操作、流媒体和没有被策略归类的请求都不会进入缓存。想缓存某类请求，必须在策略里明确声明，而且不能突破安全基线。
4. **界面归你。** 平台只提供状态和方法，不弹任何提示，也不替你刷新页面。
5. **正式包不代替业务应用的生产浏览器验收。** v1 计划按桌面端通道发布（[ADR-0030](../adr/0030-desktop-release-channel.md)），Chrome 桌面端当前版和上一个稳定版是必测目标。**Chrome Android 尚未通过完整发布矩阵、不做任何保证**：已有少量真机安装、离线和更新的单项证据，但 Android N/N-1、各框架原生安装与恢复演练没有闭合，不能由这些单项结果推断基础网页、安装或推送已受支持。平台无法阻止 Android 用户访问你的应用，所以如果你的用户主要在手机上，请把这一点告诉产品负责人，不要对外宣称支持 Android。平台首次按 `desktop+android` 通道发布之后，这一条才会改变。

## 5. 给平台维护者

- **依赖方向与导入守卫**：每个包的允许依赖、入口划分和导入闭包测试见[包边界](../architecture/package-boundaries.md)。
- **测试分层**：单元测试在各包内；单个模块的真实浏览器行为用 `browser-test-harness`；整条链路用 `examples-browser-e2e`。宿主绑定包（vue、react）不提供自己的浏览器测试。
- **能力与规格**：模块索引见[能力图](../../spec/CAPABILITY-MAP.md)，每个模块的规格在 `spec/` 下，实现计划在 `tasks/<module-id>/plan.md`。
- **发布范围**：首批 npm 预发布只包含 Vite、Vue、React 接入的依赖闭包，见 [npm 包发布流程](../operations/npm-package-release.md)。
- **关键决策**：真实浏览器验证 [ADR-0010](../adr/0010-real-browser-verification-with-playwright.md)、引擎注入 [ADR-0011](../adr/0011-platform-injects-compiled-precache-manifest.md)、worker 与恢复 worker [ADR-0012](../adr/0012-platform-worker-runtime-config-and-recovery-worker.md)、页面 facade [ADR-0013](../adr/0013-client-facade-and-page-side-lifecycle-events.md)、产物校验 [ADR-0014](../adr/0014-build-verification-boundary-and-report.md)、Vite 流水线 [ADR-0015](../adr/0015-vite-plugin-build-pipeline.md)、框架绑定 [ADR-0016](../adr/0016-framework-bindings.md)。
