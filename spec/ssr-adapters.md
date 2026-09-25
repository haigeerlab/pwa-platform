# 规格：ssr-adapters

## 目标

让采用服务端渲染（SSR）的应用接入平台，并获得与 Vite 静态应用相同的安全默认值：可安装、受控更新、可审计的缓存。首要目标框架是 Nuxt 4。TanStack Start 未通过可行性门槛，推迟交付（检查点 A，2026-09-17）。

SSR 带来的根本差异是：**页面 HTML 在请求时生成，可能含有个性化或私有内容**。平台的缓存模型默认拒绝私有数据，本模块不为 SSR 放宽任何一条。因此 SSR 应用的离线体验与静态应用不同：

- **预渲染的公开页**：可以进入预缓存，离线可用；
- **请求时渲染的页面**（包括私有页）：一律不缓存 HTML，离线时显示离线页。

成功的样子：

- Nuxt 4 应用挂载平台模块、声明身份与策略后，构建产物中出现平台 worker、恢复 worker、manifest 与预缓存清单，worker 在身份声明的 scope 下注册。
- 预渲染的公开页离线可打开；请求时渲染的页面离线时显示离线页，不会以其他路由的缓存内容应答。
- 私有、个性化或未分类的 SSR 响应永远不进入任何缓存。
- 应用在服务端渲染期间调用框架绑定不会出错，客户端水合后绑定正常工作。
- 更新提示与恢复路径的行为与 Vite 静态应用一致。

## 已核实的外部事实（2026-09-17）

本节事实经 npm registry、官方文档与 context7 核实，**会随时间变化，计划开工与模块交付时须复核**。标注"未核实"的项不得当作设计前提。

| 事实 | 来源 | 状态 |
|---|---|---|
| Nuxt `latest` 为 4.5.2（2026-08-05）；Nuxt 3 于 2026-07-31 停止维护 | registry、nuxt.com 路线图、nuxt/nuxt#33918 | 已核实 |
| Nuxt 4.5.2 经 `@nuxt/vite-builder` 直接依赖 `vite ^8.2.0`；客户端与服务端分两次 Vite 构建；Nuxt 5 将改用 Environment API | registry、nuxt.com 升级指南 | 已核实 |
| Nuxt 4 推荐以 `addVitePlugin` 配合插件的 `applyToEnvironment` 只作用于客户端构建 | nuxt.com Vite 插件指南 | 已核实 |
| Nuxt 构建产物落在 `.output/`（`public` 与 `server`）；`nuxt generate` 的预渲染 HTML 也落在 `.output/public` | nuxt.com 部署与目录结构文档 | 已核实 |
| `app.baseURL` 是运行时配置，可被 `NUXT_APP_BASE_URL` 在部署时覆盖 | nuxt.com `useRuntimeConfig` | 已核实 |
| Nuxt 4 使用 Nitro v2（`nitropack ^2.13.4`）；Nitro v3（`nitro`）仍是 beta | registry、nitro.build 迁移指南 | 已核实 |
| `@vite-pwa/nuxt@1.1.1` 依赖 `@nuxt/kit ^3.9.0`，与 Nuxt 4 冲突 | registry | 已核实 |
| TanStack Start（`@tanstack/react-start`，latest 1.168.56）官方文档标注为 **Release Candidate**；版本号为全家桶联动编号，不代表 1.0 GA | registry、tanstack.com | 已核实 |
| TanStack Start 以 Vite 插件形态构建（`@tanstack/react-start/plugin/vite`），peer `vite >=7.0.0` 无上限；部署产物遵循 Nitro 目录约定 | registry、tanstack.com | 已核实；是否默认启用 Nitro 为部分核实 |
| TanStack 路由支持 `ssr: true \| false \| 'data-only'` 与插件级预渲染配置 | tanstack.com | 已核实 |
| `vite-plugin-pwa` 与 TanStack Start 生产构建不兼容，上游标记 `needs-upstream-fix` | TanStack/router#4988 | 已核实 |
| Nuxt `buildAssetsDir` 默认 `/_nuxt/`，相对 `app.baseURL` 发布 | T1 实测 | 已核实 |
| Nuxt 构建顺序：客户端 Vite 构建 → `build:done` → 预渲染 → Nitro `rollup:before`（复制 public 后调用 `nitro:build:public-assets`）→ 服务端打包 → `compiled` | T1 实测、`@nuxt/nitro-server` 源码 | 已核实 |
| Nitro v2 `node-server` 在服务端打包时把 `.output/public` 的文件清单固化进服务端代码，晚于 `nitro:build:public-assets` 写入的文件不被提供 | T1 实测（含反向对照）、nitropack 源码 | 已核实 |
| Nuxt `experimental.emitRouteChunkError` 默认 `"automatic"`，发现新构建或分块加载失败时整页重载；`checkOutdatedBuildInterval` 默认 1 小时 | `@nuxt/schema` 与 `nuxt` 源码 | 已核实（未做浏览器实测） |
| Nuxt 注册 service worker 可在 `.client.ts` 插件中进行；只作用于客户端的 Vite 插件提供的虚拟模块可在客户端构建中解析 | T1 实测 | 已核实 |
| TanStack Start 预渲染挂在 `enforce: "post"` 插件的 `buildApp`（order: post）；没有公开的"预渲染完成"钩子；生产托管走 Nitro v3 beta | T2 实测、`@tanstack/start-plugin-core` 源码、tanstack.com 托管文档 | 已核实 |
| 构建期插件读取已解析 `routeRules` 的官方通道 | — | **未核实**（设计不依赖） |

**2026-09-18 复核（T9，交付前）：** 逐项对照 npm registry 复核以下三项，均无实质变化，未更新上表任何一行：
- `nuxt` 的 `latest` 仍为 `4.5.2`（2026-08-05 发布）；`3x` 标签为 `3.21.11`，Nuxt 3 已于 2026-07-31 停止维护，与上表一致；
- `nitropack`（Nitro v2）的 `latest` 仍为 `2.13.4`（2026-04-29 发布）；`nitro`（v3）的 `latest` 为 `3.0.260903-beta`（2026-09-03 发布），仍是 beta，与上表"Nitro v3 仍是 beta"一致；
- `@tanstack/react-start` 的 `latest` 仍为 `1.168.56`（2026-09-16 发布），仍标注为 Release Candidate；T2 探路实测的精确版本 `1.168.54` 不变。

## 范围

### 本模块交付

- **`@pwa-platform/nuxt`**：Nuxt 4 模块。应用在 `nuxt.config` 中声明身份、策略与安装元数据，模块负责：
  - 构建期产出平台 worker、恢复 worker、manifest 与预缓存清单；
  - 在客户端安装 Vue 绑定；
  - 校验身份与 Nuxt 配置的一致性。
- ~~**`@pwa-platform/tanstack-start`**：仅在可行性门槛通过后交付。~~ **门槛未通过，推迟**（检查点 A，2026-09-17，理由见计划 T2 实施记录）：生产托管依赖 Nitro v3 beta 且未验证；框架水合会把离线页当作客户端渲染壳，与已决定的离线模型冲突；产物时点依赖插件排序与内部实现。本模块登记推迟原因，并提交能力图修订草案。
- **对已交付的 `@pwa-platform/vue` 与 `@pwa-platform/react` 做最小修改，使其在服务端渲染期间安全**（项目所有者 2026-09-17 批准），并增补 ADR-0016。
- **修订兼容矩阵**（项目所有者 2026-09-17 决定）：Nuxt 只支持 `>=4.5.0 <4.6.0`，去掉已停止维护的 3.x；~~TanStack Start 维持"每次适配器发布时验证"，并注明 RC 状态~~ **2026-09-18 更正**：门槛未通过后，该行改为"未通过可行性门槛，推迟"，并注明所测版本 `1.168.54`（RC）。
- 构建夹具、单元测试与真实浏览器测试。

### 不在范围

- Next.js（兼容矩阵未承诺）。
- Nuxt 3.x。
- 缓存任何请求时渲染的 HTML，或以客户端渲染壳应答其他路由的离线导航（项目所有者决定不采用）。
- 运行时缓存（平台 v1 仍无运行时缓存能力）。
- Nitro v3 与 Nuxt 5 的适配：两者 GA 后另行评估。
- `nuxt generate` 纯静态部署之外的 serverless 或边缘平台专项适配。部署平台差异只在响应头基线层面登记。
- 修改 `PwaPlan` 契约，或 sw-runtime 除"设计第 3 节"两处导航回退修订之外的请求判断。

## 依赖

| 模块 | 本模块如何使用 |
|---|---|
| vite-adapter | 复用其产物流水线：本模块为其新增不依赖 Vite 插件钩子的产物流水线入口，`pwa()` 改为调用同一入口（检查点 A 决定，增补 ADR-0015） |
| sw-runtime（经 vite-adapter 间接依赖） | 本模块修订其两处离线导航回退（检查点 A 决定，增补 ADR-0012），见设计第 3 节 |
| examples-browser-e2e | 沿用其真实浏览器测试的做法：站点版本、恢复演练、`fixtureSite` |
| vue-react-adapters（经 vite-adapter 间接依赖） | 客户端绑定；本模块对其做 SSR 安全的最小修改 |

## 设计

### 1. 产物流水线必须以最终部署产物为准

SSR 框架的最终产物不是 Vite 客户端构建的输出：
- Nuxt 与 TanStack Start 由 Nitro 组装 `.output/public`；
- **预渲染的 HTML 在 Vite 客户端构建结束之后才生成**；
- `public/` 目录由框架复制，不一定经过 Vite。

因此：

- 预缓存清单**以最终 `.output/public` 中实际存在的文件为输入**编译，不以 Vite 客户端 bundle 为准。否则预渲染页永远无法进入预缓存，而计划描述的产物也会小于实际部署的产物——这正是 ADR-0015 读取 `publicDir` 要防的同一类分叉。
- 平台 worker 与恢复 worker 写到 `.output/public` 下身份声明的路径，manifest 同理。
- 产物校验（`verifyArtifacts`）同样针对最终产物执行，失败即构建失败。
- **Nuxt 中的时点是 `nitro:build:public-assets`**：此时预渲染已完成、public 已复制，而 Nitro 尚未打包服务端代码。更晚写入的文件不会进入 Nitro 固化的静态文件清单（T1 实测）。
- 复用方式：`@pwa-platform/vite` 新增产物流水线入口（检查点 A 决定）。**不修改 `PwaPlan` 契约。**

### 2. 路由分类沿用现有策略契约，不推断私有性

- 应用仍通过 `PwaPolicy` 的资源规则声明意图。适配器**不**从框架的 `routeRules`、`definePageMeta` 或路由 `ssr` 选项推断某个页面是否私有：这些元数据描述的是渲染方式，不是数据敏感度。而且构建期读取它们的官方通道尚未核实。
- **预渲染的公开页**：应用以 `asset` 类规则覆盖其 HTML 路径，编译器按现有规则将最终产物中存在的文件纳入预缓存。没有预渲染文件的路径不会进入预缓存，因为清单只收实际存在的文件。
- **请求时渲染的页面**：应用以 `navigation-public-dynamic`（网络优先）或拒绝类（`session-data` 等）声明；未声明的请求按平台默认拒绝。
- **构建期检查**：
  - **`asset` 规则匹配不到任何文件时的警告沿用编译器现有的 `compile.asset-rule-unmatched`**，本模块不重复实现。只要以最终产物清单调用编译器，预渲染没有生效的页面就会得到这条警告。
  - **本模块新增**：最终产物中出现落在拒绝类规则（`session-data`、`mutation`、`stream`、`unclassified`）路径下的 HTML 文件时，构建失败。编译器对这类文件只是不纳入预缓存、不报错；但一个被声明为私有的页面被预渲染成了静态文件，本身就是配置错误——它会被部署为任何人都能取得的静态文件。

### 3. 离线行为

- 沿用平台 worker 的导航规则：网络失败时依次尝试同路由的预缓存文件、同路由的 `index.html`，最后是离线页，**不以其他路由的缓存内容应答**。
- **sw-runtime 两处修订**（检查点 A 决定，增补 ADR-0012；静态应用同样受益）：
  - **不带尾斜杠的导航也尝试 `<path>/index.html`**。Nuxt 预渲染写 `about/index.html`，而链接默认是 `/app/about`（T1 偏差 A）。候选仍只是同一路由自己的文件。
  - **拒绝类路径上的导航，网络失败时回退到离线页**。仍然一律不读、不写任何缓存，只在网络请求失败时以预缓存的离线页应答；网络成功时响应原样透传（T1 偏差 B）。
- **Nuxt 的离线页不带脚本**（`routeRules` 的 `noScripts`；T6 实测：Nuxt 4.5.2 的渲染器只读取 `noScripts`，`experimentalNoScripts` 只是没有代码读取的废弃类型别名）：离线页以其他路由的地址应答时不水合，不会把地址栏改写成离线页路由（T1 偏差 C）。该做法在 T6/T7 实测；不可行时改为已知限制，并回报项目所有者。
- 离线页必须是最终产物中的静态文件，并被预缓存；缺失时构建失败（沿用 `compile.offline-fallback-not-built`）。
- 已知限制：请求时渲染的页面离线时一律显示离线页，体验弱于静态应用的离线应用壳。这是项目所有者 2026-09-17 的明确取舍。

### 4. 挂载路径与 scope

- 身份的 `mountPath` 与 `scope` 是生产注册后不可变的字段（ADR-0004）。**Nuxt 的 `app.baseURL` 可以在部署时被 `NUXT_APP_BASE_URL` 覆盖，这会让实际挂载路径偏离身份。**
- 构建期：`app.baseURL` 必须等于身份的 `mountPath`，否则构建失败。
- 运行时：客户端在注册 worker 之前比对运行时的 `app.baseURL` 与身份的 `mountPath`，不一致时不注册，并发出诊断。部署时覆盖 baseURL 视为不受支持的配置，写入已知限制。
- 静态资源目录（Nuxt 的 `buildAssetsDir`，默认 `/_nuxt/`，相对 `app.baseURL` 发布）的实际位置以最终产物为准，由构建期检查确认它位于 scope 之内。

### 5. 客户端注册与框架绑定

- 注册 service worker 仍是应用的调用（ADR-0013），模块**不**自动注册。模块在客户端安装绑定；应用在只在客户端执行的位置调用 `register()`，例如 Nuxt 的 `.client.ts` 插件（T1 实测可行），或组件的 `onMounted`。
- 页面配置经虚拟模块交付。~~只在客户端构建中提供~~ **2026-09-18 更正：客户端与服务端构建都提供**（T7 发现：只在客户端安装绑定时，页面组件在服务端渲染期间调用 `usePwa()` 会抛错）。配置不含敏感信息。插件在两端都安装 Vue 绑定：服务端只调用 `createPwa`，走 T3 的服务端安全路径（初始状态、方法立即拒绝），不创建 facade，也不做运行时挂载路径检查；客户端行为不变。
- **Nuxt 自动重载的默认值**（检查点 A 决定）：模块默认设置 `experimental.emitRouteChunkError: "manual"` 与 `experimental.checkOutdatedBuildInterval: false`，避免 Nuxt 在用户不知情时整页重载、绕过更新提示（ADR-0013）。应用显式设置时以应用为准，文档写明后果。
- **框架绑定的 SSR 安全修改**（修订 ADR-0016）：
  - React：`usePwa()` 使用的 `useSyncExternalStore` 补上 `getServerSnapshot`，服务端快照恒为初始状态；Provider 的 effect 在服务端本就不执行。
  - Vue：插件在服务端不创建 facade；`usePwa()` 在服务端返回初始状态。方法在服务端调用时返回被拒绝的 Promise，带明确错误信息，不访问任何浏览器 API。
  - 两侧的一致性测试扩展到覆盖服务端路径。
  - 客户端行为与现有全部测试保持不变。

### 6. Nuxt 模块的接入面

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@pwa-platform/nuxt"],
  app: { baseURL: "/app/" },
  pwaPlatform: {
    identity,      // PwaIdentity，与 vite-adapter 相同
    policy,        // PwaPolicy，路径为 mount-relative
    install,       // PwaInstallMetadata | null
  },
});
```

- 选项在模块加载时校验，错误只含诊断码与契约路径，不回显输入值（与 vite-adapter 一致）。
- ~~插件只作用于客户端构建，使用 `applyToEnvironment`~~ **2026-09-18 更正（裁决 18）**：虚拟模块在客户端与服务端构建都提供，运行时插件两端运行，否则页面组件在服务端渲染期间调用 `usePwa()` 会抛错（T7 发现）。为 Nuxt 5 的 Environment API 预留的写法改在 T4 的产物流水线入口一侧体现。
- 不向应用暴露 Workbox 或原始 service worker 配置。
- 配置键名定为 `pwaPlatform`（检查点 A 决定）。
- **恢复发布开关 `recoveryRelease`**（2026-09-18 决定，默认 `false`）：Nitro 在构建时固化静态文件的大小，构建后把恢复 worker 改名覆盖到 worker 地址，得到的是被截断的响应（T7 实测），恢复演练第 2 步因此在 Nuxt 的 Node 服务器部署上行不通。开启后，模块在同一钩子中把恢复 worker 写到身份的 `serviceWorkerUrl`，不写平台 worker，构建日志给出醒目警告；恢复发布即"带开关重新构建并部署一次"。运维手册与恢复演练补充 Nuxt 的做法。
- 文档提示：`nuxt generate` 会顺着链接爬取并预渲染私有页（T1 实测），应以 `nitro.prerender.ignore` 排除；漏排除时由设计第 2 节的构建期检查拦下。

## 命令

```bash
pnpm test --filter @pwa-platform/nuxt
pnpm build --filter @pwa-platform/nuxt
pnpm typecheck --filter @pwa-platform/nuxt
pnpm test:browser --filter @pwa-platform/nuxt
```

修改框架绑定后，还须跑 `pnpm test --filter @pwa-platform/react`（其中的一致性测试会构建 vue 包），以及 examples-browser-e2e 的浏览器测试作为回归。

## 测试策略

- **可行性探路最先执行**，结论决定"开放问题"第 1 条与 TanStack Start 是否同期交付。必须实测的项：
  - 在 Nuxt 4.5.x 的真实构建中，平台 worker 与预缓存清单能基于最终 `.output/public` 生成，worker 在 scope 下注册并控制页面；
  - 预渲染的公开页离线可打开，请求时渲染的页面离线显示离线页；
  - 私有路由的 SSR 响应不进入任何缓存；
  - `buildAssetsDir` 的实际位置在 scope 之内；
  - 同样的前提在 TanStack Start 上逐项验证；任一项不成立即登记为门槛未通过。
- **单元测试**：
  - 选项校验；
  - baseURL 与 mountPath 的一致性；
  - 最终产物清单的采集，以及由此得到的 `compile.asset-rule-unmatched` 警告；
  - "拒绝类路径下出现预渲染 HTML"的构建失败；
  - 两个绑定的服务端路径。
- **真实浏览器测试**（Chrome 桌面端，沿用 browser-test-harness）：
  - 首次在线访问与注册；
  - 预渲染页离线启动，含不带尾斜杠的地址；
  - 动态页与私有页离线显示离线页，地址栏不被改写；
  - 私有页不被缓存；
  - 更新提示；
  - 恢复路径；
  - 运行时 baseURL 被覆盖时不注册。
- **每项真实浏览器测试配一次变异**，确认死在目标断言上；等待条件以状态为准（examples-browser-e2e 的教训）。
- **按浏览器矩阵如实登记**未取得的范围。

## 边界

- **始终**：
  - 以最终部署产物为准；
  - 私有与未分类响应默认拒绝；
  - 错误信息不回显输入；
  - 外部事实变化时先复核再动手；
  - 未取得的证据如实登记。
- **先询问**：
  - 新增任何依赖，特别是 `nuxt`、`@tanstack/react-start` 及其依赖树；
  - 修改 vite-adapter、sw-runtime、contracts 或 core；
  - 超出已批准范围的绑定改动；
  - 改动浏览器矩阵或 V1 验收矩阵。
- **禁止**：
  - 缓存请求时渲染的 HTML；
  - 以其他路由的缓存内容应答离线导航；
  - 从渲染方式元数据推断数据是否私有；
  - 依赖 `vite-plugin-pwa` 或 `@vite-pwa/nuxt`；
  - 把 RC 或 beta 阶段的框架写成已验证支持。

## 验收标准

1. 可行性探路的每一项有实测结论，写入计划的实施记录；TanStack Start 门槛结论明确（同期交付或推迟及原因）。
2. `@pwa-platform/nuxt` 在 Nuxt 4.5.x 的真实构建中产出正确的 worker、manifest 与预缓存清单，产物校验针对最终产物执行。
3. 设计第 2、4 节列出的构建期检查逐条有测试，并有变异证明。
4. 两个框架绑定在服务端渲染期间安全，现有客户端测试全部不变且通过，一致性测试覆盖服务端路径；ADR-0016 已增补。
5. 真实浏览器测试的各场景在 Chrome 桌面端 N 通过，各配变异。
6. 兼容矩阵按项目所有者决定修订；外部事实表在交付时复核一次并注明日期。
7. 未取得的范围逐条登记：浏览器矩阵中的其余档位、Nuxt 以外的部署平台、Nitro v3 与 Nuxt 5，以及未通过门槛时的 TanStack Start。
8. 模块质量门禁：干净 worktree 冻结安装后全部门禁通过、独立评审完成、lockfile 审阅记录在案；CI 证据待账号恢复后补取。

## 已决定事项

**项目所有者，2026-09-17，经选项确认：**

1. **框架范围**：Nuxt 为主；TanStack Start 先过可行性门槛，通过才同期交付。
2. **Nuxt 版本**：只支持 4.5.x，修订兼容矩阵、去掉 3.x。
3. **离线模型**：只预缓存预渲染的公开页，请求时渲染的页面离线显示离线页；不缓存 SSR HTML，不以客户端渲染壳应答导航。
4. **框架绑定**：允许对 `@pwa-platform/vue` 与 `@pwa-platform/react` 做最小修改，使其 SSR 安全，并增补 ADR-0016。

**本规格提出、列为假设时项目所有者未提出异议，随规格评审一并确认：**

5. 可行性探路是第一个任务，不通过即停下询问。
6. 每个框架一个包，框架之间互不依赖。
7. 路由分类沿用 `PwaPolicy` 资源规则，预缓存只收最终产物中实际存在的文件，不从框架元数据推断私有性。
8. 私有与个性化 SSR 页面永不进入缓存。
9. 新增依赖在计划阶段逐个申请。

**检查点 A，项目所有者，2026-09-17（依据计划中 T1、T2 的实施记录）：**

10. **开放问题 1**：`@pwa-platform/vite` 新增不依赖 Vite 插件钩子的产物流水线入口，`pwa()` 改为调用同一入口，增补 ADR-0015。
11. **TanStack Start 门槛未通过，推迟**；能力图 `ssr-adapters` 一行的修订草案在 T8 提交评审（开放问题 2）。
12. sw-runtime 对不带尾斜杠的导航也尝试 `<path>/index.html`，增补 ADR-0012。
13. sw-runtime 对拒绝类路径上的导航，在网络失败时回退到离线页，仍不缓存；与第 12 条同一次增补。
14. Nuxt 离线页不带脚本，避免水合改写地址；实测不可行时改为已知限制。（T6 以 `routeRules` 的 `noScripts` 实现，见设计第 3 节。）
15. Nuxt 模块默认关闭自动重载（`emitRouteChunkError: "manual"`、`checkOutdatedBuildInterval: false`），应用可显式改回。
16. 保留"拒绝类路径下出现预渲染 HTML 即构建失败"，文档另外提示 `nitro.prerender.ignore`。
17. **开放问题 3**：配置键名为 `pwaPlatform`。

**T7 之后，项目所有者，2026-09-18：**

18. 服务端也安装 Vue 绑定：虚拟模块在客户端与服务端构建中都提供，插件两端运行，服务端只走 Vue 绑定的服务端安全路径。
19. 模块新增构建期开关 `recoveryRelease`，恢复发布改为带开关重新构建；浏览器场景改用真实构建，不再依赖前置代理。

## 已知限制

- **请求时渲染的页面离线只能显示离线页**；只有预渲染的公开页离线可用。
- **部署时用 `NUXT_APP_BASE_URL` 覆盖 baseURL 不受支持**：客户端检测到不一致时不注册 worker。预渲染页的脚本地址与运行时配置在构建时写死，覆盖后预渲染页整体不可用（T7 实测）。
- **Nuxt Node 服务器部署不能用"构建后改名"发布恢复 worker**，须用 `recoveryRelease` 重新构建。
- Nuxt 自带的 `chunk-reload-crawler` 插件保留：它只在页面水合期间、访问者为爬虫时重载。
- **TanStack Start 未交付**：门槛未通过，推迟到其 GA 且生产托管路径（Nitro v3）稳定后重新评估。
- **Nitro v3 与 Nuxt 5**（Environment API）GA 后需要重新评估。
- 响应头基线（worker 与 manifest 的 `no-cache`、指纹资源的 `immutable`）依赖部署平台配置，Nitro 未显式配置时静态资源的默认 `Cache-Control` 未核实，由发布门禁核对。

## 开放问题

原三个开放问题已在检查点 A 裁决，见"已决定事项"第 10、11、17 条。

## public-read-cache 增补（2026-09-24）

`@pwa-platform/nuxt` 对启用的 `PwaPolicy v3` 公共读取缓存明确报错，不静默忽略（[public-read-cache](public-read-cache.md)、[ADR-0035](../docs/adr/0035-explicit-public-read-runtime-cache.md)）：模块启动时新增 `checkNoRuntimeCache`，遇到 `runtimeCache.enabled: true` 的 v3 策略即抛出诊断码 `nuxt.runtime-cache-unsupported`，不回显策略值。`runtimeCache.enabled: false` 的 v3 策略构建结果与同内容的 v2 策略一致。本节以外的产物流水线、离线导航行为与框架绑定契约不变。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。

**2026-09-24 补齐**：本模块当天再次进入修订，按上述约定补齐了该表，见下方 Documentation impact；表只针对那次修订。

## Documentation impact

本表针对 2026-09-24 的 public-read-cache 增补：`@pwa-platform/nuxt` 对启用的 `PwaPolicy` v3 明确报错（见上文增补）。此前交付的部分不据此反推（2026-09-23 的决定）。

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不涉及。 |
| architecture | follow | 不涉及。 |
| developer-entry | follow | 不涉及。 |
| capability-map | follow | 不涉及。 |
| decisions | follow | ADR-0035 由 public-read-cache 模块创建；Nuxt 暂不支持记为其已知限制。 |
| lifecycle-and-recovery | follow | 不涉及。 |
| ci-baseline | follow | 不涉及。 |
| supply-chain | follow | 不涉及。 |
| browser-matrix | follow | 不涉及。 |
| v1-acceptance | follow | 不涉及。 |
| identity-release-baseline | follow | 不涉及。 |
| release-and-incident | follow | 不涉及。 |
| recovery-drill | follow | 不涉及。 |
| browser-release-evidence | follow | 不涉及。 |
| package-distribution | follow | 不涉及。 |
| cloudflare-test-deployment | follow | 不涉及。 |
| browser-test-harness | follow | 不涉及。 |
| workbox-engine | follow | 不涉及。 |
| sw-runtime | follow | 不涉及。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 不涉及。 |
| release-gate-contract | follow | 不涉及。 |
| local-ci-record | follow | 不涉及。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | follow | 不涉及。 |
| client-runtime | follow | 不涉及。 |
| vue-react-adapters | follow | 不涉及。 |
| examples-browser-e2e | follow | 不涉及。 |
| pwa-entry-resilience | follow | 不涉及。 |
| ssr-adapters | update | 规格追加 public-read-cache 增补。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | follow | 不涉及。 |
| public-read-cache | follow | 已知限制"Nuxt 暂不支持"由该模块的接入说明记录。 |
