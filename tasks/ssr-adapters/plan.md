# 实现计划：ssr-adapters

## 概览

按 [spec/ssr-adapters.md](../../spec/ssr-adapters.md) 交付：
- `@pwa-platform/nuxt`（Nuxt 4.5.x 模块）；
- 对 `@pwa-platform/vue` 与 `@pwa-platform/react` 的 SSR 安全最小修改；
- 兼容矩阵修订；
- TanStack Start 支持，**仅在可行性门槛通过后**交付。

本模块的风险集中在四处，排序也照此安排：

1. **平台流水线在 SSR 框架里能不能跑通，完全没有实测过。** 生态里的现成方案在这两个框架上都已知失败。前两个任务是探路，结论不成立就停下来，不写一行产品代码。
2. **产物以哪一步为准。** 预渲染 HTML 在 Vite 客户端构建之后才出现，规格据此要求以最终 `.output/public` 为准。实现方式（开放问题 1）很可能要再改一个已交付包，必须在探路之后由项目所有者决定。
3. **依赖树。** Nuxt 与 TanStack Start 的传递依赖规模、构建脚本与发布时间都未知，而仓库启用了 `minimumReleaseAge` 与 `strictDepBuilds`。安装本身就可能失败，或者提出构建脚本审批请求。
4. **修改已交付的框架绑定。** examples-browser-e2e 与 pwa-entry-resilience 都依赖它们，回归面不小。

## 架构决定

- **探路先于实现。** T1（Nuxt）与 T2（TanStack Start）只产出带实测证据的结论，不产出产品代码。检查点 A 由项目所有者裁决开放问题 1 与 TanStack Start 门槛，之后才进入实现。
- **绑定的 SSR 修改与探路并行。** T3 不依赖任何新依赖，也不依赖探路结论，可以最先完成，为 T5 以后的任务铺路。
- **依赖逐任务申请，安装即审阅。** 每个需要新依赖的任务开工前单独申请；安装后审阅 lockfile 差异。出现构建脚本审批请求、非 registry 来源或发布不满 24 小时的传递依赖时，**停下来询问，不自动放行、不放宽供应链设置**。
- **外部事实会漂移。** 规格中的外部事实表在 T1 开工与 T9 交付时各复核一次，并注明日期。

### 已核实的前提（2026-09-17，计划撰写时）

- `nuxt@4.5.2` 发布于 2026-08-05，满足 `minimumReleaseAge`；有 59 个直接依赖；`@parcel/watcher` 与 `@types/node` 是可选 peer，默认不安装；peer `rolldown ~1.2.1` 与仓库现有的 rolldown 1.2.8 兼容。
- `@tanstack/react-start` 的 latest 1.168.56 发布于 2026-09-16T21:53Z，**计划撰写时未满 24 小时，会被 `minimumReleaseAge` 拒绝**。满足条件的最近版本是 **1.168.54**（2026-09-14）；它精确锁定 `@tanstack/react-router@1.170.36` 与一组 `@tanstack/start-*` 内部包，因此版本要整组选定；`vite` 与 `@rsbuild/core` 是可选 peer。
- TanStack Start 官方示例同时使用 `@vitejs/plugin-react`；它在 Vite 8 下是否必需尚未核实。若必需，T2 另行申请。
- 平台的计划编译（core `compilePlan`）、预缓存注入（engine-workbox `injectPrecacheManifest`）、worker 配置生成与注入（sw-runtime 的 `.` 入口：`createPlatformWorkerConfig`、`createRecoveryWorkerConfig`、`injectWorkerConfig`）、产物校验（build-verifier `verifyArtifacts`）都有公开入口；**worker 打包在 `packages/vite/src/workers.ts`，是 vite-adapter 的内部实现，没有导出。**
- 编译器已有 `compile.asset-rule-unmatched` 警告（`packages/core/src/precache.ts`），被拒绝规则覆盖的构建文件只是不进预缓存，不报错。

## 任务定义

### 任务 1：Nuxt 4.5.x 可行性探路

**说明：** 在真实 Nuxt 构建中，逐项实测规格"测试策略"列出的前提，给出书面结论与开放问题 1 的推荐做法。

**开工前：** 申请 `nuxt@4.5.2` 作为探路夹具的 devDependency，列出安装后的 lockfile 规模与任何构建脚本请求。

**验收标准（每项给出实测结论与证据）：**

- **时序**：客户端 Vite 构建的 `generateBundle`、Nitro 组装 `.output/public`、预渲染三者的先后顺序，以日志或钩子打点证明。
- **最终产物清单**：在构建流程的哪个时点（具体的 Nuxt 或 Nitro 钩子名）可以拿到完整的 `.output/public` 文件清单（含预渲染 HTML 与 `public/` 复制来的文件），并能在该时点写入 worker 与 manifest。
- **平台流水线复用**：用现有公开入口（`compilePlan`、`injectPrecacheManifest`、sw-runtime 配置注入）加一份最小的 worker 打包，在该时点生成平台 worker 与预缓存清单；worker 在身份的 scope 下注册并控制页面。**打包部分只为探路临时实现，不作为交付代码。**
- **离线行为**：预渲染的公开页离线可打开；请求时渲染的页面离线显示离线页；私有路由（拒绝类）的 SSR 响应不进入任何缓存。
- **路径**：`buildAssetsDir` 的默认值与实际位置，是否在 scope 之内；`app.baseURL` 在构建期与运行时分别从哪里读取。
- **客户端注册**：`.client.ts` 插件或 `onMounted` 中注册的实际表现，以及虚拟模块在 Nuxt 客户端构建中能否被解析。
- **只作用于客户端构建**：`addVitePlugin` 配合 `applyToEnvironment` 的实际效果。
- **开放问题 1 的推荐**：基于以上结论，从规格列出的三种做法中给出推荐及理由；若推荐修改 `@pwa-platform/vite`，列出拟新增的公开入口签名。

**验证：** 结论逐项附证据（命令输出、钩子打点日志、浏览器测试结果）；每条"成立"的结论配一次反向检查，证明它不是恒真。

**依赖：** 依赖审批。

**预计范围：** L（探路，不计产品代码）。

#### T1 实施记录（2026-09-17）

探路工程在 `packages/ssr-spike-nuxt`（私有，没有 build/test/typecheck 脚本，不会被全仓批量运行带上）。它是一个 Nuxt 4.5.2 应用，`app.baseURL` 为 `/app/`，包含两个本地模块：
- `modules/probe.ts`：钩子打点，并在指定时点写入测试文件；
- `modules/platform.ts`：在最终产物上运行平台流水线。其中的 worker 打包是 vite-adapter 内部 `bundleEntry` 的**临时副本**，只供探路。

浏览器证据来自 `browser-tests/spike.spec.ts`，使用 Chrome 152 和 Nitro 的 `node-server` 产物。探路工程在检查点 A 裁决后删除，或被正式包取代。

**依赖（项目所有者逐项批准）：**
- `nuxt@4.5.2`（2026-08-05 发布，仍是 latest）：lockfile 新增 549 个包，没有移除或改动任何已有版本；没有非 registry 来源；1 个弃用包 `glob@10.5.0`（nitropack → archiver，无已知公告）。
- **`trustPolicyExclude: semver@6.3.1`**：已登记理由与移除条件。先在仓库外的临时副本中只解析 lockfile，确认只有这一个包被拦。
- **`allowBuilds: esbuild@0.28.2: false`**：只有它声明了 postinstall（逐个查询 registry 得出）。不执行脚本时 esbuild 可用，Nuxt 构建正常。
- 副作用：esbuild、jiti、terser 出现在工作区后，vite、eslint、vitest 在其他包中的可选 peer 解析多了这几项（版本号不变）。由 T1 提交前的干净工作树全量门禁回归。
- `.gitignore` 与 ESLint 忽略项增加 `.nuxt/`、`.output/`：不加的话，全仓 lint 会扫描生成物，报 1396 个错误。

**结论（逐项附证据）：**

1. **时序：成立。** 打点顺序：`nitro:init` → `build:before` → 客户端 Vite `generateBundle`（此时 `.output/public` 为 0 个文件）→ `vite:compiled` ×2 → `build:done` → `prerender:init` → `prerender:done`（4 个文件，只有预渲染 HTML 与 payload）→ Nitro `rollup:before` → Nuxt `nitro:build:public-assets`（15 个文件，完整）→ `compiled` → `close`。依据还有 `@nuxt/nitro-server` 源码：`build:done` 中先 `prerender(nitro)` 再 `build(nitro)`；`rollup:before` 中先 `copyPublicAssets`，再调用 `nitro:build:public-assets`。**客户端 Vite 构建阶段拿不到最终产物**，规格设计 (1) 得到证实。

2. **最终产物清单的时点：`nitro:build:public-assets`，而不是 `compiled`。** Nitro 的 `node-server` 在打包服务端代码时，会把 `.output/public` 的完整清单（含预渲染 HTML）固化进 `nitro.mjs` 的 `assets` 表，服务器只提供表中的文件。
   - 在 `nitro:build:public-assets` 写入的文件出现在表中，`/app/probe-written.txt` 返回 200；
   - **反向对照**：改成在 `compiled` 写入，文件在磁盘上，但不在表中，服务器返回 404。
   - 注意：该钩子在 `compressPublicAssets` 之后，写入的文件不会生成预压缩版本。

3. **平台流水线复用：成立。** 在该钩子中执行：遍历最终产物 → sha256 → `compilePlan` → 打包两个 worker 并 `injectPrecacheManifest` / `injectWorkerConfig` → 写 manifest → `verifyArtifacts`（通过）。
   - 预缓存 15 项：`_nuxt` 下的资源、`index.html`、`about/index.html`、`offline/index.html`、两个 `_payload.json`；
   - `_nuxt/builds/`（public-data）与 `/account`（session-data）按策略未进入；
   - 编译警告为空。
   - 浏览器中 worker 在 `/app/` 下注册并控制页面，页面事件 `registered`；缓存名为 `pwa:nuxtspike:production:r1:precache`。
   - Nuxt 的产物文件名是纯哈希（`1Yo9mI5R.js`），不符合 vite-adapter 的 `-<8位>` 指纹规则，会被当作非指纹文件，带 revision。这样做无害，只是多一个用不到的 revision。

4. **离线行为：部分成立，有三处偏差待裁决。**
   - 成立：离线打开 `/app/` 与 `/app/about/`（带斜杠）返回预渲染页；从缓存的应用壳离线进行客户端路由跳转到 `/app/about` 成功（payload 与 chunk 已预缓存）。
   - 成立：在线访问过 `/app/account`（私有）与 `/app/news`（请求时渲染的公开页）后，除预缓存外没有任何缓存条目。**说明**：worker 本来就不在运行时缓存导航响应，所以这条断言无法用改策略的方式反证，它证明的是现状，不是新机制。
   - **反向对照**：去掉 `/about/index.html` 的 asset 规则后，离线打开 `/app/about/` 退回离线页；还原后恢复。
   - **偏差 A（地址形态）**：离线打开 `/app/about`（不带斜杠，Nuxt 链接的默认形态）得到离线页，而不是已预缓存的 `about/index.html`。原因是 worker 只为以 `/` 结尾的 URL 尝试 `index.html`（`sw-runtime` 的 `navigationFallbacks`）。
   - **偏差 B（私有页离线）**：离线打开 `/app/account`（session-data，拒绝类）时，浏览器显示断网错误页，没有离线页。原因是拒绝类请求直接 passthrough，不进入导航回退。规格写的是"请求时渲染的页面离线显示离线页"，对私有页不成立。
   - **偏差 C（地址被改写）**：离线页以 `/app/news` 或 `/app/about` 的地址应答后，Nuxt 按离线页的路由水合，把地址栏改写成 `/app/offline`。恢复联网后刷新，得到的是离线页路由，而不是用户原来要去的页面。

5. **路径：**
   - `buildAssetsDir` 默认 `/_nuxt/`，相对于 `baseURL` 发布在 `/app/_nuxt/`，位于 scope 之内（浏览器中实测缓存条目）。
   - 构建期 baseURL 读自 `nuxt.options.app.baseURL`。
   - 运行时 `NUXT_APP_BASE_URL=/other/` 启动同一份产物：整个站点移到 `/other/`（`/other/sw.js` 返回 200，`/app/*` 返回 404），而 worker 配置与虚拟模块里的页面配置仍是构建期的 `/app/`，注册必然失败。**需要规格设计 (4) 中的运行时检查**；该场景没有在浏览器中实测注册表现。

6. **客户端注册：成立。** `app/plugins/pwa.client.ts`（只在客户端运行的插件）从虚拟模块读取配置，调用 `createPwaClient().register()`，结果为 resolved。虚拟模块由只作用于客户端环境的 Vite 插件提供，在 Nuxt 客户端构建中能解析。

7. **只作用于客户端构建：成立。** `addVitePlugin` 的 `applyToEnvironment` 对 `client` 与 `ssr` 各调用一次；返回 `env.name === "client"` 后，`generateBundle` 只在客户端环境执行。

8. **`nuxt generate`：钩子顺序不变，产物照常写出、校验通过。**
   - **generate 会顺着链接爬取，把 `/account`（私有）与 `/news` 也预渲染成了 `account/index.html`、`news/index.html`，另外生成 `200.html`、`404.html`。** 这正是规格新增检查"拒绝类路径下出现预渲染 HTML 即构建失败"要拦的情况；探路工程没有实现该检查，所以构建通过。
   - 产物中还多了指向 `.output/public` 的 `dist` 符号链接。
   - 没有在浏览器中实测 generate 产物。

9. **新发现：Nuxt 自带的重载行为与平台约定冲突。**
   - `experimental.emitRouteChunkError` 默认 `"automatic"`，会启用 `chunk-reload.client` 插件：分块加载失败时，以及收到 `app:manifest:update` 后的下一次路由跳转时，调用 `reloadNuxtApp` 整页重载；
   - `appManifest` 默认开启，`checkOutdatedBuildInterval` 默认 3600000 毫秒，定期拉取 `_nuxt/builds/latest.json`。
   - ADR-0013 约定平台与 facade 不重载页面、更新由用户确认。Nuxt 的这套机制会在用户不知情时重载，并可能绕过更新提示。
   - 本项只读了源码（`@nuxt/schema`、`nuxt/dist/app/plugins/chunk-reload.client.js`），没有做浏览器实测。

**开放问题 1 的推荐：在 `@pwa-platform/vite` 新增一个不依赖 Vite 插件钩子的产物流水线入口，`pwa()` 改为调用同一入口。**
- 另外两种做法都有明确缺陷：
  - **在客户端构建中用 `pwa()`**：结论 1、2 证明那时拿不到预渲染 HTML，也来不及进入 Nitro 的静态文件清单，不可行；
  - **在 Nuxt 包中另写 worker 打包**：会复制 `bundleEntry` 与 `assertSelfContained`，后者是"worker 可在经典脚本中执行"的安全门，两份实现就要再加一致性测试。
- 探路中这段临时副本约 30 行，已证明入口所需的输入仅为身份、策略、安装元数据、拓扑、`publicPath` 和最终文件列表（路径 + 内容）。拟议签名：

```ts
export type PwaArtifactInput = PwaViteOptions & {
  /** Where the files are published; must end with "/". */
  readonly publicPath: `/${string}/`;
  /** Every file of the final output, relative to `publicPath`. */
  readonly files: readonly { readonly path: string; readonly content: Uint8Array | string }[];
};
export type PwaArtifactResult = {
  readonly plan: PwaPlan;
  readonly warnings: readonly PwaWarningDiagnostic[];
  /** Files to write next to the output: platform worker, recovery worker, manifest (when install is enabled). */
  readonly files: readonly { readonly path: string; readonly content: string }[];
};
export function buildPwaArtifacts(input: PwaArtifactInput): Promise<PwaArtifactResult>;
/** Throws with diagnostic codes when `publishedPaths` misses anything the plan requires. */
export function assertPwaArtifacts(plan: PwaPlan, publishedPaths: readonly string[]): void;
```

**检查点 A 需要项目所有者裁决的事项（T1 部分）：**
1. 开放问题 1：是否采用上面的推荐，以及增补 ADR-0015 的方向。
2. **偏差 A**：三选一。
   - (a) 修改 sw-runtime，对不带斜杠的导航也尝试 `<path>/index.html`：已交付包的行为变更，需增补 ADR-0012，静态应用也会受影响；
   - (b) Nuxt 模块强制尾斜杠链接：侵入应用路由，外链与书签不受控；
   - (c) 接受为已知限制：直接打开不带斜杠的地址时得到离线页，应用内跳转不受影响。
3. **偏差 B**：私有页离线时显示浏览器错误页，还是离线页。改成离线页需要修改 sw-runtime 对拒绝类导航的处理（仍然不缓存，只在网络失败时回退到离线页），同样是已交付包的行为变更。否则修订规格的表述。
4. **偏差 C**：接受为已知限制，还是由 Nuxt 模块处理离线页的路由（例如离线页不参与路由水合）。
5. **Nuxt 的自动重载**：Nuxt 模块是否默认设置 `experimental.emitRouteChunkError: "manual"` 并关闭 `checkOutdatedBuildInterval`（应用可以显式改回），还是只在文档中说明。
6. `nuxt generate` 会把私有页预渲染出来，在规格已有的构建失败检查之外，是否还要在文档中提示用 `nitro.prerender.ignore` 排除。

**未验证（如实登记）：**
- 运行时覆盖 baseURL 后浏览器中的注册表现；
- generate 产物的浏览器行为；
- 更新提示与恢复路径（T7 的范围）；
- 安装提示；
- Android；
- Nuxt 自动重载的实测。

### 任务 2：TanStack Start 门槛探路

**说明：** 在 TanStack Start 上逐项验证与 T1 相同的前提，给出门槛结论：通过则同期交付，不通过则登记原因并推迟。

**开工前：** 申请 `@tanstack/react-start@1.168.54` 及其锁定的 `@tanstack/react-router@1.170.36`（以及 T2 实测确认必需的其他包，例如 `@vitejs/plugin-react`），列出 lockfile 规模与构建脚本请求。版本以开工当天满足 `minimumReleaseAge` 的最近版本为准，并复核。

**验收标准：**

- 与 T1 相同的各项前提逐项给出实测结论。
- 明确 TanStack Start 的最终产物是否遵循 Nitro 约定、是否默认启用 Nitro。
- **门槛结论**：全部成立为通过；任一项不成立为未通过，写明是哪一项、失败现象与复现方式。
- 结论同时注明 TanStack Start 仍是 RC，并记录所测的精确版本。

**验证：** 同 T1。

**依赖：** 依赖审批。可与 T1 并行。

**预计范围：** L（探路）。

#### T2 实施记录（2026-09-17）

探路工程在 `packages/ssr-spike-tanstack`（私有，没有 build/test/typecheck 脚本）。它是一个 TanStack Start 应用，Vite `base` 为 `/app/`，包含 5 个路由：`/`、`/about`、`/offline` 预渲染；`/news`、`/account` 在请求时渲染，带 loader。另有两个 Vite 插件：
- `probe.ts`：钩子打点；
- `platform.ts`：平台流水线，worker 打包沿用 T1 的临时副本。

浏览器证据来自 `browser-tests/spike.spec.ts`（与 T1 同一份测试，另记录 worker 实际返回的 HTML），服务端为 `vite preview`，浏览器为 Chrome 152。

**依赖（项目所有者批准）：**
- `@tanstack/react-start@1.168.54`（2026-09-14 发布）与 `@tanstack/react-router@1.170.36`。latest 1.168.56 当日未满 24 小时。
- 先在仓库外的临时副本中只解析 lockfile：新增 34 个包，不需要豁免，逐个查询 registry 没有安装脚本，没有弃用包，没有非 registry 来源。实际安装结果一致。
- `react`、`react-dom`、`vite` 沿用 lockfile 中已有的版本。
- **没有引入 `@vitejs/plugin-react`**：生产构建不需要它。但 TanStack 源码写明，开发模式（React Refresh）需要它或同类插件。
- **没有引入 Nitro**：官方托管文档的生产部署走 `nitro/vite`，也就是 Nitro v3 beta。

**结论（与 T1 逐项对应）：**

1. **时序：成立，但依赖插件排序。**
   - TanStack Start 在配置层的 `builder.buildApp` 中依次构建 client 与 ssr 两个环境；预渲染挂在它自己的后处理插件上（`enforce: "post"` 且 `buildApp` 为 `order: "post"`）。
   - 平台插件同样设为 `enforce: "post"`、排在 `tanstackStart()` 之后时，其 `buildApp`（order: post）在预渲染之后执行，`dist/client` 共 17 个文件，含 3 个预渲染 HTML。
   - **反向对照**：不设 `enforce: "post"` 时，同一钩子排在预渲染之前，一个 HTML 都没有。
   - 这个时点靠的是 Vite 同级钩子的执行顺序加 TanStack 内部插件的声明方式，没有公开的"预渲染完成"钩子。RC 期间随时可能变化。

2. **最终产物与服务器：只在 `vite preview` 上成立。** `vite preview` 从磁盘提供 `dist/client`，钩子里写入的 `sw.js` 返回 200。**官方生产托管（Nitro v3 beta）没有验证**：Nitro v2 会在服务端打包时固化静态文件清单（T1 结论 2），v3 是否同样如此、在 Vite 插件流程中有没有可写入的时点，都未知。

3. **平台流水线复用：成立。** 预缓存 12 项：`assets/` 下的 chunk、3 个预渲染 HTML；`/account` 路由的 JS chunk 属于代码，也被收录。编译警告为空，`verifyArtifacts` 通过。worker 在 `/app/` 下注册并控制页面，事件为 `registered`。

4. **离线行为：与规格的取舍冲突。**
   - 成立：离线打开 `/app/about/` 返回预渲染页；离线从应用壳用客户端路由跳转到 `/app/about` 成功；在线访问 `/news` 与 `/account` 之后，除预缓存外没有任何缓存条目（同 T1，worker 本来就不缓存导航响应）。
   - **离线页被当作客户端渲染壳使用**：离线打开 `/app/about` 与 `/app/news` 时，worker 实际返回的是离线页 HTML（响应体中 h1 为 `offline`），但 TanStack Router 水合时按地址栏在客户端渲染了请求的路由：页面显示 `about`，以及没有服务端数据的 `news`（`#rendered-at` 不存在）。规格"不在范围内"一节明确写着"以客户端渲染壳应答其他路由的离线导航（项目所有者决定不采用）"；这里不是 worker 在做这件事，而是框架把离线页用成了壳，结果相同。对请求时渲染的页面，用户看到的是缺数据的半成品，而不是离线页。
   - 私有页 `/app/account` 离线：浏览器断网错误页（同 T1 偏差 B）。
   - 离线打开 `/app/index.html`：返回预缓存的首页 HTML，水合后路由匹配不到，页面没有 h1。

5. **路径：** `base` 为 `/app/`，资源在 `/app/assets/`，路由 basepath 由 TanStack 从 `base` 推导，位于 scope 之内。**运行时覆盖挂载路径没有验证**。

6. **客户端注册：成立。** 在根路由组件的 `useEffect` 中注册（服务端不执行 effect），结果为 resolved。

7. **只作用于客户端构建：不成立。** 虚拟模块用 `applyToEnvironment` 限定到 client 后，ssr 构建报 `Rolldown failed to resolve import "virtual:pwa-config"`：路由代码两端共用，SSR 也会导入它。在两个环境都提供后才能构建。页面配置不含敏感信息，影响不大，但"绑定只进入客户端构建"需要换一种做法（例如只在 effect 里读取），尚未验证。

**门槛结论（建议）：未通过，建议推迟 TanStack Start。** 理由：
1. **生产托管路径没有验证**，而官方路径依赖 Nitro v3 beta，还要另外申请依赖；
2. **离线行为与项目所有者的取舍冲突**，而且冲突来自框架的水合方式，不是平台 worker 能单独修正的；
3. **最终产物的时点依赖插件排序和内部实现**，框架仍是 RC；
4. 离线页被当作客户端壳渲染时，请求时渲染的页面会以缺数据的形态出现。

是否通过由项目所有者在检查点 A 裁决。若推迟，按计划 T8 改为登记推迟原因，并提交能力图修订草案。

**未验证（如实登记）：**
- Nitro v3 下的托管与静态文件清单；
- 开发模式；
- 运行时覆盖挂载路径；
- 更新提示与恢复路径；
- 安装提示；
- Android；
- 去掉 `/about/index.html` 规则的反向对照（worker 规则与 T1 相同，没有重复）。

### 任务 3：框架绑定的 SSR 安全修改

**说明：** 修改已交付的 `@pwa-platform/vue` 与 `@pwa-platform/react`（项目所有者已批准），使其在服务端渲染期间安全，并增补 ADR-0016。

**验收标准：**

- **React**：`usePwa()` 调用 `useSyncExternalStore` 时补上 `getServerSnapshot`，服务端快照恒为初始状态。
- **Vue**：插件在服务端（无 `window`）不创建 facade；`usePwa()` 在服务端返回初始状态；方法在服务端调用时返回被拒绝的 Promise，带明确错误信息，不访问任何浏览器 API。
- **客户端行为不变**：两包现有测试的断言一字不改并全部通过。
- **一致性测试**（`packages/react` 中）扩展到服务端路径：两侧在服务端给出相同的初始状态与相同的拒绝行为。
- **服务端渲染实测**：React 用 `react-dom/server` 的 `renderToString`（`react-dom` 已在 lockfile 中）；Vue 用 `vue/server-renderer`（随 `vue` 包提供）。在 Node 中各渲染一次，不报错，输出包含初始状态。
- **增补 ADR-0016**：记录服务端语义与方法调用在服务端的拒绝行为。
- **回归**：examples-browser-e2e 与 pwa-entry-resilience 的浏览器测试全部通过。

**验证：**

- `pnpm test --filter @pwa-platform/react`（其中的一致性测试会构建 vue 包）与 `pnpm test --filter @pwa-platform/vue` 通过。
- 变异：
  - 去掉 `getServerSnapshot`，服务端渲染用例转红；
  - Vue 插件在服务端仍创建 facade，对应用例转红。
- **变异 `src` 后必须重建 `dist` 再跑一致性测试**（vue-react-adapters 的教训）。

**依赖：** 无（可与 T1、T2 并行）。

**预计范围：** M。

#### T3 实施记录（2026-09-17）

**一处与计划不符，已由项目所有者决定。** 计划写的是"一致性测试（`packages/react` 中）扩展到服务端路径"，并用 `react-dom/server` 做实测；但 React 包的包边界测试断言开发依赖里不得有 `react-dom`（vue-react-adapters 的原决定），而计划又要求现有断言一字不改。项目所有者选择：**React 与 Vue 的真实服务端渲染测试和服务端一致性测试放进 `examples-browser-e2e`**。该包已依赖 `react-dom@19.3.0`、`react`、`vue`，因此只加了 `test` 脚本、`vitest.config.ts` 和 `ssr-tests/`，没有新增依赖声明，lockfile 未变。

**实现（主会话完成）：**
- React：`usePwa()` 传入模块级 `getServerSnapshot`（恒为 `INITIAL_STATE`）；无 `window` 时交出 `SERVER_METHODS`（冻结，四个方法立即拒绝）；store 自身的方法不变。
- Vue：插件在无 `window` 且未注入 `client` 时不创建 facade，提供初始状态与 `SERVER_METHODS`，不注册卸载回调。之所以要求"未注入 `client`"：现有单元测试都在 Node 中注入假 client，若只看 `window`，这些测试会全部改走服务端路径。
- 两包的错误信息逐字相同，各自保存一份，由一致性用例比对。
- 增补 ADR-0016（决策末条与三条影响）；在 `spec/vue-react-adapters.md` 的"SSR 未覆盖"已知限制后加了指向增补的说明。

**红色基线**：修改前运行新写的服务端渲染测试，5 条全部失败。React 报 `Missing getServerSnapshot`，Vue 报 `no navigator.serviceWorker`，与预期一致。

**测试**：
- `packages/vue/test/server.test.ts` 新增 4 条：前提"无 `window`"、不创建 facade（对 `createPwaClient` 计数）、初始状态、四个方法拒绝；
- `packages/react/test/server.test.ts` 新增 3 条：四个方法拒绝、已冻结、store 的方法仍然等待 facade；
- `examples-browser-e2e/ssr-tests/server-render.test.ts` 新增 5 条：两侧真实渲染的输出等于初始状态、两侧方法拒绝、两侧一致；
- 现有测试文件没有改动。

**变异**：均在全绿基线上完成，变异后先重建再运行，还原后 `shasum` 一致。

| 变异 | 转红用例 | 失败原因 |
|---|---|---|
| 去掉 `getServerSnapshot` | React 渲染、React 拒绝、一致性（3 条） | `Missing getServerSnapshot` |
| Vue 服务端分支条件改为 `false` | vue 包的 3 条服务端用例；e2e 中 Vue 渲染、Vue 拒绝、一致性 | `no navigator.serviceWorker` |
| React 在服务端仍交出 store 的方法 | React 拒绝、一致性 | 调用挂起，5 秒超时 |
| Vue 错误信息改动几个词（仍含 `server-side rendering`） | 只有一致性用例 | 两侧信息不相等 |

Vue 分支变异下，"不创建 facade"用例是因为 `install` 抛错而转红，并没有走到计数断言：Node 中创建 facade 必然抛错，因此构造不出"创建了 facade 但不抛错"的变异。如实记录。

**结果**：vue 40 条、react 63 条、examples-browser-e2e 单元测试 5 条通过；三包 typecheck 与全仓 lint 退出 0。

**回归（真实浏览器）**：examples-browser-e2e 33 通过、2 跳过，与该模块验证记录一致；entry-resilience 13 通过，与该模块验证记录一致。两个包都退出 0。

### 检查点 A：探路结论与决策（T1–T3 之后）

- T1、T2 的结论逐项有证据。
- **项目所有者裁决：**
  - 开放问题 1 采用哪种做法；若涉及修改 `@pwa-platform/vite`，同时批准并确认 ADR-0015 的增补方向；
  - TanStack Start 门槛是否通过；若未通过，是否修订能力图 `ssr-adapters` 一行（开放问题 2）；
  - Nuxt 模块的配置键名（开放问题 3）。
- 探路中任何前提不成立到"Nuxt 也无法接入"的程度时，停止本模块，回到规格重新评审。

#### 检查点 A 裁决记录（2026-09-17）

项目所有者采纳 T1、T2 记录后提出的全部推荐，逐条写入规格"已决定事项"第 10–17 条：
1. vite-adapter 新增产物流水线入口，增补 ADR-0015（T4）；
2. TanStack Start 门槛未通过，推迟（T8 改为推迟登记与能力图修订草案）；
3. sw-runtime：不带尾斜杠的导航尝试 `<path>/index.html`（新增 T4b）；
4. sw-runtime：拒绝类导航在网络失败时回退离线页，仍不缓存（T4b）；
5. Nuxt 离线页不带脚本（T6、T7 实测）；
6. Nuxt 模块默认关闭自动重载（T5）；
7. 保留拒绝类路径下预渲染 HTML 的构建失败，文档提示 `nitro.prerender.ignore`（T6、T9）；
8. 配置键名 `pwaPlatform`（T5）。

### 任务 4：产物流水线复用的落地

**说明：** 按检查点 A 的裁决，实现"在最终产物上生成计划、worker 与 manifest"的可复用流水线。

**验收标准（检查点 A 裁决：修改 `@pwa-platform/vite`，增加产物流水线入口）：**

- **新公开入口**：以 T1 记录中的拟议签名为起点（`buildPwaArtifacts` 与产物校验），输入身份、策略、安装元数据、拓扑、`publicPath` 与最终产物文件列表，输出计划、编译警告、平台 worker、恢复 worker 与 manifest 的内容，不依赖任何 Vite 插件钩子。签名定稿前在本任务实施记录中列出并说明与拟议版的差异。
- **指纹判定**：入口对文件名做与 `pwa()` 相同的指纹判定；Nuxt 的纯哈希文件名按非指纹处理（无害，T1 记录），不在本任务扩展规则。
- **`pwa()` 插件改为调用同一入口**，其选项、产物与全部现有测试不变；公开面只多出本任务声明的导出。
- 产物校验（`verifyArtifacts`）可在调用方给出的清单上执行。
- **修订 ADR-0015**。
- **回归**：vite 包单元与浏览器测试、examples-browser-e2e、pwa-entry-resilience 全部通过；`dist/index.d.ts` 的公开面差异逐项比对。

**验证：** 变异至少覆盖"入口忽略调用方给出的清单而改读 bundle"与"worker 自足性断言被跳过"两处。

**依赖：** 检查点 A。

**预计范围：** M–L。

#### T4 实施记录（2026-09-17）

**实现由 `executor` 子代理完成，主会话按预先定死的接口验收，并在验收中重构了一处。**

**交付的公开面**（`dist/index.d.ts`）：
- 原有：`pwa`、`PWA_PLUGIN_NAME`、`PwaPluginApi`、`PwaViteOptions`；
- 新增函数：`buildPwaArtifacts`、`assertPwaArtifacts`；
- 新增类型：`PwaArtifactInput`、`PwaArtifactSourceFile`、`PwaArtifactResult`、`PwaArtifactOutputFile`。

**与 T1 拟议签名的差异：**
- `publicPath` 为 `string`，而不是模板字面量类型，运行时校验"以 `/` 开头和结尾"，错误信息沿用插件原有的；
- 文件项增加可选的 `fingerprinted`；
- `warnings` 的类型是 contracts 的 `PwaWarningDiagnostic`；
- 返回的 `files` 顺序固定为 manifest（仅在平台生成时）、平台 worker、恢复 worker。

**子代理的偏差与主会话的处理。** 子代理让 `pwa()` 自己拼文件列表，不再调用 `collectHostOutput`，而现有的 `host-output.test.ts` 与 `host-output-parity.test.ts` 钉的正是这个函数。结果是被测试的代码不在运行路径上，运行路径却没有这些测试保护；"公开目录与构建产物重名"的检查也复制成了两份。主会话把它拆成两个函数，两条路径都经过：
- `bundleSourceFiles`：bundle 加公开目录文件合成文件列表，含重名检查；
- `collectSourceFiles`：挂载前缀、重复路径、哈希、指纹判定、worker 与 manifest 的相对名。

`collectHostOutput` 保留为两者的组合，现有测试因此继续覆盖实际运行的代码。`FINGERPRINTED`、`hashOfContent`、`relativeTo` 退回为模块私有。

**测试：**
- `test/artifacts.test.ts` 共 12 条：输出顺序、manifest 省略与缺失报错、编译警告透传、`publicPath` 校验、重复路径、指纹自动判定与显式 `false`、预缓存只收调用方给出的文件、`assertPwaArtifacts` 的通过与失败，以及用模拟的 `vite.build` 证明 worker 自足性断言确实被调用（原有测试没有覆盖这条连线）；
- `test/artifacts-parity.test.ts`：同一应用经 `pwa()` 真实构建后，用磁盘上的产物调用 `buildPwaArtifacts`，计划深度相等，worker 与 manifest 逐字节相同。由于 `pwa()` 本身就调用该入口，这条测试证明的是"从磁盘采集等价于从 bundle 采集"，不是两份实现的一致性；
- 现有测试只改了一处断言：`import-safety.test.ts` 的公开面清单（并补充识别 `export { … } from` 的正则）。

**变异**：均在全绿基线上完成，还原后 `shasum` 一致。

| 变异 | 转红用例 | 执行者 |
|---|---|---|
| 入口忽略调用方的文件列表 | 6 条（plan-api 3、artifact-check 1、artifacts 2） | 子代理 |
| 不再调用 worker 自足性断言 | 原有测试 0 条转红；补测试后转红 1 条 | 子代理 |
| `writeBundle` 跳过产物校验 | artifact-check 5 条 | 子代理 |
| 显式 `fingerprinted: false` 被忽略 | 1 条 | 子代理 |
| **重构后**：`collectSourceFiles` 忽略显式指纹标记 | artifacts 1 条、host-output 1 条 | 主会话 |
| **重构后**：`bundleSourceFiles` 丢掉公开目录文件 | 5 条（含 build-pipeline 的真实构建用例） | 主会话 |
| **重构后**：入口把空列表交给 `collectSourceFiles` | 7 条 | 主会话 |
| **重构后**：去掉 `assertSelfContained` 调用 | 自足性连线用例 1 条 | 主会话 |

**文档**：增补 ADR-0015（决策末条）。`package-boundaries.md` 的公开面描述按计划在 T9 同步。

**结果**：vite 单元测试 109 条通过；typecheck 退出 0。
- 全仓 lint 与 vite build 退出 0。
- 真实浏览器回归：vite 11 通过；examples-browser-e2e 33 通过、2 跳过（与历次记录一致）；entry-resilience 13 通过。

### 任务 4b：sw-runtime 离线导航回退修订

**说明：** 按检查点 A 裁决修订平台 worker 的两处导航回退，增补 ADR-0012。静态应用同样受影响，因此回归范围覆盖全部使用平台 worker 的包。

**验收标准：**

- **不带尾斜杠**：导航 `/<scope>/about` 在网络失败时的候选依次为：请求 URL 本身、`/<scope>/about/index.html`、离线页，只保留预缓存中存在的项。带尾斜杠的行为不变。候选不含其他路由的文件；带查询串时的处理与现有目录规则一致，并在测试中写明。
- **拒绝类导航**：路径命中拒绝类规则的导航改为"网络优先，网络失败时回退离线页"。**网络成功时响应原样返回、不读写任何缓存**；非导航的拒绝类请求仍然 passthrough，行为不变。未分类（没有任何规则匹配）的导航是否同样回退，由本任务在 ADR 增补中写明并测试。离线页未启用时保持 passthrough。
- **passthrough 原因与诊断**：现有 `denied` 原因的可观测性不丢失，若判定结构需要新增 `kind` 或原因，写明并更新测试。
- **增补 ADR-0012**：两处修订、隐私理由（仍不缓存）、对静态应用的影响。
- **回归**：sw-runtime、engine-workbox、vite、examples-browser-e2e、entry-resilience 的单元与浏览器测试全部通过。

**验证：**
- 单元测试覆盖两处修订的每个分支；
- sw-runtime 的真实浏览器测试新增两个场景：离线打开不带斜杠的预渲染地址，以及离线打开拒绝类导航；网络成功时拒绝类导航的响应不进入任何缓存；
- 变异：去掉不带斜杠候选、拒绝类导航不回退、拒绝类导航在网络成功时写缓存，各死在目标断言上。

**依赖：** 检查点 A。可与 T4 并行。

**预计范围：** M。

#### T4b 实施记录（2026-09-17）

**实现由主会话完成**，改动集中在 `src/worker/decide.ts`：`handlers.ts` 的导航处理本来就只做网络请求与降级查找，不写缓存，因此不需要修改。

**行为：**
- **不带尾斜杠**：导航候选依次为请求 URL、同一路由的 `index.html`（带斜杠追加 `index.html`，不带斜杠追加 `/index.html`，查询串照旧保留）、离线页，只保留清单中存在的项。
- **拒绝类导航**：降级页启用且在清单内时，返回 `navigate` 决定，候选**只有降级页**。即使清单里意外存在该路径下的文件，也不会用它应答。否则保持 `passthrough`（`denied`）。
- **不变的部分**：非导航的拒绝类请求、未匹配任何规则的请求（包括导航）仍然 `passthrough`；判定结构没有新增 `kind`。
- **一处顺带的收紧**：降级页候选改为"启用且在清单内"，与原先"先加入候选、再按清单过滤"的结果相同；拒绝类导航以此判断要不要接手。

**现有测试中按批准的行为变更调整的断言（共三处）：**
1. `test/worker/decide.test.ts`："passes through denied paths, whether or not they are navigations" 改为只断言非导航请求透传；导航的新行为另立用例。
2. `test/worker/decide.test.ts`："maps only directory URLs to index.html" 改写为新规则 "tries the same route's index.html with or without a trailing slash"，原断言（`/app/products` 只回退离线页）保留在新用例中。
3. `test/worker/platform-worker.test.ts`：透传清单中的"拒绝类导航"换成"未分类导航"；`browser-tests/offline.spec.ts` 的 "never answers a denied or unclassified navigation from a cache" 拆成拒绝类（显示离线页）与未分类（仍然报错）两条。

**新增测试：**
- 单元测试：不带斜杠与带斜杠、查询串、相邻路由（`/app/guides` 不命中 `guide/index.html`）；拒绝类导航只回退离线页（清单里放了 `api/account/index.html` 作干扰）；没有降级页或降级页不在清单内时透传；未分类导航透传；worker 处理层中拒绝类导航在线时原样返回网络响应且不查预缓存，离线时只查降级页。
- 浏览器测试（新增 `subpage` 站点版本，只有它预缓存 `guide/index.html`，因此 v1 的预缓存清单与逐项列出它的断言不受影响）：
  - 离线打开 `/app/guide` 与 `/app/guide/` 都显示预渲染的子页面；
  - 离线打开拒绝类导航显示离线页，服务器没有收到请求；
  - 在线打开拒绝类导航：响应来自 worker（`fromServiceWorker`），服务器恰好收到一次请求，缓存里只有预缓存且不含该路径。

**变异**：均在全绿基线上完成，还原后 `shasum` 一致。

| 变异 | 转红用例 |
|---|---|
| 只对带斜杠的 URL 尝试 `index.html` | 单元 1 条；浏览器"不带斜杠打开子页面" |
| 拒绝类导航永不回退 | 单元 3 条；浏览器"拒绝类导航离线显示离线页""拒绝类导航在线来自 worker" |
| 拒绝类导航沿用一般导航的候选（会读该路径下的缓存文件） | 单元"只回退离线页"1 条 |
| 降级页不在清单内时仍接手拒绝类导航 | 单元"没有可用降级页时透传"1 条 |
| 网络成功时把响应写入缓存 | 浏览器 3 条，其中新用例死在"缓存名称只有预缓存"一行（多出变异写入的缓存名）；另两条是原有的恢复演练与拒绝类请求用例 |

**文档**：增补 ADR-0012（决策末条、影响三条，原决策中被修订的部分保留并加注）；`spec/sw-runtime.md` 请求处理表第 4 行、导航候选第 2 步与两条已决定事项加注修订。

**对未来拓扑的约束**：[部署拓扑](../../docs/architecture/deployment-topologies.md)要求根 worker 不得为子路径返回自己的离线页。v1 只有独立源拓扑，不受影响；已写入 ADR-0012 的影响。

**结果**：sw-runtime 单元测试 92 条、浏览器测试 16 条通过。

**全仓回归（当前工作区）**：lint、build、test、typecheck、test:browser 全部退出 0。浏览器测试：browser-test-harness 22、engine-workbox 6、sw-runtime 16、client-runtime 12、vite 11、entry-resilience 13、examples-browser-e2e 33 通过 2 跳过。

### 任务 5：`@pwa-platform/nuxt` 模块骨架与客户端接入

**说明：** 建立 Nuxt 模块包：选项校验、挂载路径一致性检查、客户端绑定安装与页面配置交付。

**验收标准：**

- **包声明**：私有包；`nuxt` 为 peer 依赖 `>=4.5.0 <4.6.0`；依赖 `@pwa-platform/vue` 与 T4 的流水线入口；`tsconfig` 覆盖全部源文件扩展名并显式声明所用 `@types/*`。
- **选项校验**：模块加载时校验身份、策略、安装元数据，错误只含诊断码与契约路径。
- **构建期检查**：`app.baseURL` 必须等于身份的 `mountPath`，否则构建失败。
- **运行时检查**：客户端在注册前比对运行时 `app.baseURL` 与 `mountPath`，不一致时不注册并发出诊断。
- **只作用于客户端构建**：Vite 插件使用 `applyToEnvironment`，只作用于客户端构建。
- **页面配置**：经虚拟模块只在客户端交付；客户端插件安装 Vue 绑定，**不自动注册**。
- **配置键名** `pwaPlatform`。
- **自动重载默认关闭**：未显式设置时，模块把 `experimental.emitRouteChunkError` 设为 `"manual"`、`experimental.checkOutdatedBuildInterval` 设为 `false`；应用显式设置时保留应用的值。
- 模块文档写明注册的惯用位置（`.client.ts` 插件，T1 实测）。

**验证：** 单元测试覆盖每条选项失败、两处 baseURL 检查与重载默认值（含应用显式设置时不覆盖），各配变异。

**依赖：** 检查点 A、T3。

**预计范围：** M。

#### T5 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话按预先定死的接口验收。**

**包声明：**
- 私有包，只导出 `"."`；
- peer：`nuxt >=4.5.0 <4.6.0`、`vue ^3.5.0`（Nuxt 4.5 自身要求 vue ^3.5.40）；
- 依赖：client-runtime、contracts、vue 三个平台包；T6 再加 vite；
- 开发依赖：`nuxt@4.5.2`、`vue@3.5.42`、`@types/node@24.13.4`、`@pwa-platform/core`（一致性测试用）。
- lockfile 核对：没有新增或删除任何包条目，只多了 `packages/nuxt` 的 importer，以及已有包按新 peer 上下文生成的解析变体。

**公开面：**
- 默认导出 Nuxt 模块（`configKey: "pwaPlatform"`）与 `PwaNuxtOptions` 类型；
- **比约定多两项**：常量 `BASE_URL_MISMATCH_CODE`，以及对 `nuxt/schema` 的类型增补，让应用的 `nuxt.config.ts` 中 `pwaPlatform` 字段有类型检查。两者都只增不改，主会话接受。

**行为：**
- **选项校验**：模块加载时用 contracts 的三个校验函数，错误只含诊断码与带选项名前缀的契约路径。拓扑固定为 `standalone-origin`，不作为选项。
- **构建期挂载路径检查**：`app.baseURL` 不等于 `identity.mountPath` 时抛出 `nuxt.base-url-mismatch`。
- **自动重载默认关闭**：从 `nuxt.options._layers[*].config.experimental` 判断应用是否显式设置；未设置时写入 `emitRouteChunkError: "manual"` 与 `checkOutdatedBuildInterval: false`。
  - 真实构建证明模块的执行时机来得及：默认情况下客户端产物中没有 `nuxt:chunk-reload` 与 `nuxt:check-outdated-build`；应用显式设为 `"automatic"` 时有 `nuxt:chunk-reload`，模块没有覆盖。
  - **`nuxt:chunk-reload-crawler` 仍然存在**：它只要 `emitRouteChunkError` 为真值就会被加入。主会话读了源码：它只在"页面水合期间、user agent 为爬虫"且发生分块加载错误时重载，真实用户不会触发。接受，写入已知限制。
- **页面配置**：虚拟模块 `virtual:pwa-platform/nuxt` 只在客户端环境提供，默认导出冻结的 `{ config, mountPath }`；`config` 的组装方式与 vite-adapter 一致，由一致性测试钉住 client-runtime 的 `createClientConfig(plan)`。
- **客户端插件**（`mode: "client"`，经 `build.transpile` 打包）：安装 Vue 绑定，不调用 `register()`。运行时挂载路径检查放在纯函数 `bindClientToRuntimeBase` 中：
  - 一致时原样返回 facade；
  - 不一致时返回一个 `register()` 立即拒绝（`nuxt.runtime-base-url-mismatch`，不含路径值）、其余方法照常转发的包装对象，并 `console.warn` 一次。
  - `usePwa()` 仍然可用。

**主会话在验收中补的文档**：Nuxt 模块在生产代码里使用了 Vue 绑定的 `client` 注入点，而 Vue 包注释与 ADR-0016 原先都写着"只用于测试"。已更正 `packages/vue/src/index.ts` 的注释（不改行为，已重建），并在 ADR-0016 的影响中补充一条。

**测试**（5 个文件、37 条）：
- 选项校验（断言错误信息中不含输入值）；
- 构建期与运行时的挂载路径检查；
- 页面配置与 `createClientConfig` 的一致性；
- 真实 Nuxt 构建：默认、应用显式开启重载、挂载路径不一致三种情况；
- 包边界。

真实构建夹具每次复制到 `test/fixtures/.tmp-*`，用完即删，因为 `loadNuxt` 从工作目录向上查找 `nuxt` 包，不能放在系统临时目录。

**变异**：均在全绿基线上完成，还原后 `shasum` 一致。

| 变异 | 转红用例 | 执行者 |
|---|---|---|
| 不再设置 `emitRouteChunkError` 默认值 | 3 条，其中真实构建用例死在"客户端产物中不应有 chunk-reload" | 子代理；主会话复做一次 |
| 判断"显式设置"恒为假 | 4 条 | 子代理 |
| 运行时判断忽略挂载路径不一致 | 2 条 | 子代理；主会话复做一次 |
| 跳过策略校验 | 1 条 | 子代理 |
| 虚拟模块不限定客户端环境 | 0 条：服务端构建两种情况下都成功，不影响 SSR（按要求只报告） | 子代理 |

**结果**：nuxt 包 37 条测试通过（子代理连续 3 次，主会话 2 次）；typecheck、build、全仓 lint 退出 0。

**未验证（属于 T7）**：真实浏览器中运行时覆盖挂载路径后的表现。

### 任务 6：在最终产物上生成平台产物

**说明：** 在 `nitro:build:public-assets` 钩子中（T1 实测：预渲染之后、Nitro 固化静态文件清单之前），以最终 `.output/public` 为输入调用 T4 的流水线，写出 worker、manifest，并执行产物校验与本模块新增的检查。

**验收标准：**

- **采集**：清单包含 Vite 客户端产物、`public/` 复制来的文件与预渲染 HTML。
- **写出**：平台 worker、恢复 worker 与 manifest 写到 `.output/public` 下身份声明的路径。
- **产物校验**：`verifyArtifacts` 针对最终产物执行，失败即构建失败。
- **沿用编译器警告**：`asset` 规则匹配不到文件时，编译器的 `compile.asset-rule-unmatched` 警告传递给构建输出，不重复实现。
- **新增检查**：拒绝类规则路径下出现 HTML 文件时构建失败，错误不回显路径值。
- **静态资源目录**：`buildAssetsDir` 的实际位置不在 scope 之内时构建失败。
- 离线页缺失时沿用 `compile.offline-fallback-not-built` 失败。
- **离线页不带脚本**：模块为离线页路由设置 `routeRules` 的 `noScripts`（原写 `experimentalNoScripts`，T6 实测更正），产物中离线页 HTML 不引用应用脚本。实测不可行时停下回报项目所有者。
- **写入的产物进入 Nitro 静态文件清单**：构建后 `node-server` 能提供 worker 与 manifest（T1 反向对照的正向用例）。

**验证：** 真实 Nuxt 构建夹具覆盖成功路径与每个失败条件，各配变异。

**依赖：** T4、T5。

**预计范围：** L。若超过 5 个源文件，拆出"产物采集"单独提交。

#### T6 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收，并补了两处没有覆盖的测试。**

**sw-runtime（项目所有者批准）**：构建期入口 `.` 新增导出 `createPathMatcher` 与 `PwaPathMatcher`，行为不变；没有测试钉住该入口的导出清单，现有测试未改动。已在 ADR-0012、`spec/sw-runtime.md`、`package-boundaries.md` 中同步。

**Nuxt 模块新增 `src/artifacts.ts`，开发模式下整体跳过：**
- **加载时检查**：
  - `app.baseURL` 与 `app.buildAssetsDir` 合成的资源前缀不在 `identity.scope` 内，报 `nuxt.build-assets-outside-scope`（按 Nuxt 运行时的方式解析 `.` 与 `..`）；
  - `app.cdnURL` 非空，报 `nuxt.cdn-url-unsupported`。
- **离线页不带脚本**：由离线页路径推出路由（`/x/index.html` → `/x`，`/index.html` → `/`，`/x.html` → `/x`，其他形式报 `nuxt.offline-page-route-unknown`），为该路由设置 `noScripts: true`，并与应用已有的规则合并。应用显式设为 `false` 时保留应用的值，并记录警告 `nuxt.offline-page-scripts-kept`。
- **`nitro:build:public-assets` 钩子**，依次执行：
  1. 遍历最终产物，全部标为非指纹；
  2. 调用 `buildPwaArtifacts`；
  3. 经 Nuxt logger 输出编译警告（只含诊断码与路径）；
  4. **检查预渲染 HTML 是否落在拒绝规则下**：用 worker 自己的 `createPathMatcher`，候选地址包括文件本身、`index.html` 所在目录带斜杠与不带斜杠两种写法，以及去掉 `.html` 的写法。任一候选命中拒绝规则即报 `nuxt.prerendered-html-denied`，只给数量和 `nitro.prerender.ignore` 的提示，不给路径。此检查在写出任何文件之前进行；
  5. 写出文件；
  6. `assertPwaArtifacts`。
- 依赖新增工作区包 `@pwa-platform/vite`、`@pwa-platform/sw-runtime`；lockfile 只多两个工作区链接。

**偏差：`experimentalNoScripts` → `noScripts`（已核实）。** 子代理发现 Nuxt 4.5.2 的渲染器只读取 `noScripts`。主会话核对了 `@nuxt/nitro-server/dist/runtime/handlers/renderer.mjs` 的第 142、212、245 行，都只读 `routeOptions.noScripts`；`experimentalNoScripts` 只在类型声明中作为 `@deprecated` 别名出现。规格设计第 3 节、已决定事项第 14 条与本计划 T6 的验收标准已更正。真实构建证明：该规则下预渲染的离线页没有任何 `<script>`，普通预渲染页仍有。

**其他偏差：**
- `nitro:build:public-assets` 与 `routeRules` 的类型来自 `@nuxt/nitro-server` 的模块增补，而该包不在批准的依赖边界内，于是模块自己声明了同样的窄增补，经 `useNitro`、`useLogger` 的返回类型间接取得 Nitro 与 logger 的类型。
- 真实构建过程中截获不到 consola 的输出，所以"警告被输出"改为对导出的 `runArtifactPipeline` 用替身 logger 做单元测试；真实构建的警告用例只断言构建成功。
- "nuxt generate"用 `nitro.static: true` 加 CLI 同样传给 `loadNuxt` 的覆盖项来模拟，没有直接调用 `nuxt generate` 命令。实测 `nitro.static` 会把所有非动态页面加入预渲染，所以该用例需要 `nitro.prerender.ignore: ["/account"]`，与文档要提示的做法一致。

**主会话补的测试**（`test/offline-route-rules.test.ts`，3 条，只加载 Nuxt 不构建）：
- 离线页路由设置 `noScripts: true`，同时保留应用在该路由上的其他字段；
- 应用显式设为 `false` 时不覆盖；
- 开发模式下不设置。

为此给测试夹具工具加了 `dev` 参数：`dev` 是 `loadNuxt` 的选项，写在应用配置里不会生效。这一点是新用例的前提检查抓出来的。

**测试**：nuxt 包共 58 条；真实构建覆盖：
- 成功路径：`node .output/server/index.mjs` 实际返回 `sw.js` 与 manifest 为 200；预缓存含预渲染页与离线页，不含私有路径；离线页无脚本；
- 警告透传；
- 两种预渲染形态下的私有页各自构建失败；
- 资源目录不在 scope 内、配置了 CDN 地址时失败；
- 离线页缺失时失败；
- generate 模式。

**变异**：均在全绿基线上完成，还原后 `shasum` 一致。

| 变异 | 转红用例 | 执行者 |
|---|---|---|
| 改在 Nitro 的 `compiled` 钩子里写入与校验 | 成功路径用例：`sw.js` 返回 404 | 子代理；主会话复做一次 |
| 跳过私有 HTML 检查 | 3 条（两种形态的真实构建各 1 条，单元 1 条） | 子代理；主会话复做一次 |
| 去掉"去掉 `.html`"候选 | 只有 `account.html` 形态的用例 | 子代理 |
| 不设置 `noScripts` | 离线页无脚本断言 | 子代理 |
| 不输出警告 | 单元层的警告用例 | 子代理 |
| 显式 `noScripts: false` 被覆盖 | 主会话新增用例 1 条 | 主会话 |
| 开发模式不跳过 | 主会话新增用例 1 条 | 主会话 |

**结果**：
- nuxt 包 58 条通过，typecheck、build 退出 0；
- sw-runtime 单元 92 条、浏览器 16 条通过；
- client-runtime 80 条、vite 109 条回归通过；
- 全仓 lint 退出 0。

**未验证（属于 T7）**：浏览器中的注册、离线与更新表现。

### 任务 7：Nuxt 真实浏览器证据

**说明：** 按规格"测试策略"的场景在 Chrome 桌面端验证。

**验收标准：**

- 场景：
  - 首次在线访问与注册；
  - 预渲染页离线启动，含不带尾斜杠的地址；
  - 动态页与私有页离线显示离线页，地址栏不被改写；
  - 私有页的 SSR 响应不进入任何缓存；
  - 自动重载默认关闭（有新构建时路由跳转不整页重载）；
  - 更新提示；
  - 恢复路径（按恢复演练，缓存名由 contracts 计算）；
  - 运行时 baseURL 被覆盖时不注册。
- **等待条件以状态为准**；夹具的站点版本由真实构建产出，不手工拼装。
- **每个场景一次变异**，死在目标断言上；`--repeat-each` 至少 10 次无失败。

**验证：** `pnpm test:browser --filter @pwa-platform/nuxt` 通过；变异与重复运行结果写入实施记录。

**依赖：** T6、T4b。

**预计范围：** L。

#### T7 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收。**

**夹具与运行方式：**
- 夹具应用 `browser-tests/site/`，包含页面 `/`、`/about`、`/offline`（预渲染），`/news`、`/account`、`/lazy`（请求时渲染）。
- `global-setup.ts` 做 4 次真实生产构建（`emitRouteChunkError` 为 manual 与 automatic 两种 × v1、v2），每次从 `site/` 的独立副本构建。实测：共用构建目录时，Nuxt 的构建缓存会让 v2 与 v1 逐字节相同。
- `servers.ts` 用一个反向代理维持固定的源，"部署"就是在代理后面切换 Nitro 子进程。
- 新增 `test:browser` 脚本与 `@playwright/test@1.63.0`、`@pwa-platform/browser-test-harness` 两个开发依赖（lockfile 中已有，没有新的外部包）。

**场景（Chrome 152.0.7977.84，全部通过）：**

| # | 场景 | 文件 |
|---|---|---|
| 1 | 首次访问：在 `/app/` 注册并控制页面，预缓存与构建结果一致，不含 `/app/account`、`/app/news` | register.spec.ts |
| 2 | 预渲染页离线：`/app/`、`/app/about`、`/app/about/` 显示各自内容，服务器没有收到请求 | offline.spec.ts |
| 3 | 请求时渲染的公开页离线：显示离线页，地址仍为 `/app/news` | offline.spec.ts |
| 4 | 私有页离线：显示离线页而非浏览器错误页，地址仍为 `/app/account` | offline.spec.ts |
| 5 | 在线访问私有页后，任何缓存中都没有它 | private-cache.spec.ts |
| 6 | 更新提示：v2 在等待槽中，旧 worker 仍在运行；确认后接管，页面不刷新 | update.spec.ts |
| 7 | 恢复路径：恢复 worker 接管，只删除本应用的缓存；在线与离线都不提供任何响应 | recovery.spec.ts |
| 8 | 运行时覆盖挂载路径：`register()` 以 `nuxt.runtime-base-url-mismatch` 拒绝，警告一次，没有任何注册 | base-url.spec.ts |
| 9 | 自动重载：模块默认值下，分块加载失败不重载页面；应用显式改为 automatic 时会重载 | reload.spec.ts |

**稳定性**：`--repeat-each 10` 共 120 条全部通过，耗时 2.0 分钟。主会话重跑一次，12 条通过。

**变异**：均在全绿基线上完成，还原后 `shasum` 一致。

| 场景 | 变异 | 转红 |
|---|---|---|
| 1 | 去掉 `/index.html` 的 asset 规则（实测：离线页不论规则如何都会被编译器纳入预缓存，因此改用首页） | register |
| 2 | 去掉 `/about/index.html` 的 asset 规则 | offline（另有 register） |
| 3 | `noScripts` 改为 `false` | offline 中的 news 用例 |
| 4 | 关闭离线降级 | offline 中的私有页与 news 用例 |
| 5 | 夹具在 `/account` 页面主动写入缓存 | private-cache |
| 6 | `controllerchange` 时重载页面 | update（另有 recovery 2 条） |
| 7 | 发布平台 worker 而非恢复 worker | recovery 2 条 |
| 8 | 运行时判断忽略不一致 | base-url |
| 9 | 跳过重载默认值的设置 | reload 中的 manual 用例 |

**场景 9 的做法**：`_nuxt` 必须预缓存，离线整页加载才能拿到自己的分块，所以部署 v2 本身不会让已预缓存的分块 404。测试先从真实构建的清单中找出分块，删掉这些预缓存条目，经 CDP 清空浏览器 HTTP 缓存，再部署 v2，由此产生真实的 404、`vite:preloadError` 与 `app:chunkError`。另外发现 `/lazy` 的分块在 v1、v2 之间逐字节相同，已加入版本引用，让它的哈希真正变化。

**发现 1：模块缺陷（子代理报告、主会话核实，由 T7b 修复）。** 模块以 `mode: "client"` 注册运行时插件，服务端渲染时没有任何地方提供 Vue 绑定。页面组件一调用 `usePwa()` 就抛出 `No PWA binding found`，连预渲染都会失败；T3 做的 Vue 服务端安全路径在 Nuxt 中根本没有机会运行。这违反规格成功标准"应用在服务端渲染期间调用框架绑定不会出错"。本任务的夹具用 `<ClientOnly>` 绕过。

**发现 2：Nitro 部署无法用"构建后改名"发布恢复 worker（由 T7b 处理）。** 实测：构建后把 `.output/public/sw.js` 换成不同内容，服务器返回 200，但 `Content-Length` 仍是构建时的大小（66464，而磁盘上的新文件为 66507 字节），响应体被截断。恢复演练第 2 步在 Nuxt 的 Node 服务器部署上行不通。本任务的场景 7 用前置代理提供恢复 worker 的字节，验证的是恢复 worker 本身的行为，不是 Nitro 上的发布方式。

**发现 3：运行时覆盖挂载路径时，预渲染页整体不可用。** 预渲染页的脚本地址和嵌入的运行时配置都在构建时写死（实测 `window.__NUXT__.config.app.baseURL` 仍为 `/app/`），覆盖后所有资源 404，没有任何 JS 运行。因此场景 8 访问的是请求时渲染的 `/other/news`。这是"部署时覆盖 baseURL 不受支持"的又一个理由，在 T9 写入已知限制。

**结果**：
- nuxt 浏览器测试 12 条、单元测试 58 条通过；
- typecheck、全仓 lint 退出 0；
- 包边界测试只改了脚本清单一处断言。

### 任务 7b：服务端绑定与恢复发布开关（T7 发现，项目所有者 2026-09-18 决定）

**说明：** 修复 T7 发现的模块缺陷，并按裁决新增恢复发布开关；T7 的夹具与场景相应改为直接覆盖这两条路径。

**验收标准：**
- **服务端绑定**：虚拟模块在客户端与服务端构建中都提供；运行时插件两端运行，服务端只 `createPwa({ config })`，不创建 facade，不调用运行时挂载路径检查，也不访问任何浏览器 API。页面组件在服务端渲染与预渲染期间调用 `usePwa()` 不抛错，服务端渲染出的 HTML 带初始状态。
- **`recoveryRelease` 选项**（默认 `false`，严格布尔校验）：开启时，钩子把恢复 worker 写到 `serviceWorkerUrl`，不写平台 worker，仍写 manifest 与 `pwa-recovery-worker.js`；构建日志输出带诊断码的警告；产物校验照常通过。关闭时行为不变。
- **夹具**：去掉 `<ClientOnly>`，在页面组件中直接调用 `usePwa()`；场景 7 改为用 `recoveryRelease: true` 真实构建出恢复版本，删除前置代理中替换 `sw.js` 的逻辑（代理若仍用于维持固定的源，可以保留）。
- 新增真实构建或加载级的单元测试：服务端渲染的 HTML 中带初始状态；开关开启时 `sw.js` 的内容是恢复 worker，而且 Node 服务器提供的是完整文件（长度与磁盘一致）。

**验证：**
- nuxt 单元、浏览器测试全部通过；`--repeat-each 10` 全部通过。
- 变异：服务端插件不安装绑定，服务端渲染用例转红；开关开启时仍写平台 worker，恢复场景转红；开关关闭时写了恢复 worker，更新场景或注册场景转红。

**依赖：** T7。

**预计范围：** M。

#### T7b 实施记录（2026-09-18）

**实现由做 T7 的同一个 `executor` 子代理续做，主会话验收。**

**服务端绑定（裁决 18）：**
- 虚拟模块去掉 `applyToEnvironment` 限制，客户端与服务端构建都提供；
- `runtime/plugin.client.ts` 改名为 `runtime/plugin.ts`，`addPlugin` 不再限定 `mode`，按 `import.meta.server` / `import.meta.client` 分支：服务端只 `createPwa({ config })`，走 Vue 绑定的服务端安全路径，不创建 facade、不做运行时挂载路径检查、不访问浏览器 API；客户端行为不变。
- 子代理核对了真实构建的服务端产物：其中没有 `bindClientToRuntimeBase`，也没有读取运行时 `baseURL`；客户端分块里有。`createPwaClient` 的函数定义仍出现在服务端产物中，因为 Vue 绑定自身把它写成了兜底调用，但 `createPwa` 的服务端分支先返回，实际不会调用。
- 夹具页面去掉 `<ClientOnly>`，直接调用 `usePwa()`。

**恢复发布开关（裁决 19）：**
- `PwaNuxtOptions.recoveryRelease`，默认 `false`，严格布尔校验，错误只含诊断码与路径；
- 开启时，在同一钩子里把恢复 worker 的内容写到身份的 worker 路径，`pwa-recovery-worker.js` 与 manifest 不变，日志输出 `nuxt.recovery-release` 警告，产物校验照常通过；
- 浏览器的恢复场景改为部署一个 `recoveryRelease: true` 的真实构建，`servers.ts` 中替换 `sw.js` 字节的逻辑已删除。代理保留，用途只剩"为 v1→v2 部署维持固定的源"。

**新增测试：**
- `test/server-binding.test.ts`：真实构建下，预渲染页面直接调用 `usePwa()` 不报错，HTML 中带初始状态；
- `test/recovery-release.test.ts`：真实构建加真实 Node 服务器，`sw.js` 与 `pwa-recovery-worker.js` 逐字节相同，且服务器返回的 `Content-Length` 与磁盘文件大小一致——这正是 T7 发现 2 中"构建后改名"失败的那一点；
- 选项与流水线的单元测试补充了开关的两种取值。

**主会话更正了子代理的一处结论。** 子代理报告"全局准备步骤抛错时 `playwright test` 仍退出 0"，若属实，浏览器测试这道门禁就形同虚设。主会话实测：在全局准备步骤开头抛错，`pnpm test:browser` **退出码为 1**，且一条测试都没运行。该结论不成立，门禁可靠。

**变异**：均在全绿基线上完成，还原后 `shasum` 一致。

| 变异 | 转红用例 | 执行者 |
|---|---|---|
| 服务端不安装绑定 | 单元 8 条，含"预渲染页面直接调用 `usePwa()`" | 子代理；主会话复做一次 |
| 开关开启时仍写平台 worker | 单元 2 条（含真实服务器的用例）；浏览器恢复场景 2 条 | 子代理；主会话复做一次 |
| 开关关闭时也写恢复 worker | 单元 2 条；浏览器注册与更新场景 | 子代理；主会话复做一次 |

**结果**（主会话复跑）：
- nuxt 单元测试 66 条通过（T7 时为 58）；
- 浏览器测试 12 条通过，`--repeat-each 10` 共 120 条通过，耗时 2.4 分钟，无不稳定；
- typecheck、build、全仓 lint 退出 0；
- Chrome 152.0.7977.84。

### 任务 8：TanStack Start 推迟登记（检查点 A：门槛未通过）

**说明：** 门槛通过时，交付 `@pwa-platform/tanstack-start` 及其真实浏览器证据，形态与验收标准参照 T5–T7，客户端使用 React 绑定。门槛未通过时，本任务改为：
- 在规格与验证记录中登记推迟原因与复现方式；
- 按检查点 A 的裁决提交能力图修订草案，供项目所有者评审。

**检查点 A 裁决后的范围：** 只做门槛未通过的两项。同时删除探路工程 `packages/ssr-spike-tanstack` 及其 lockfile 条目（删除前确认没有其他包引用），删除提交中写明结论已记录在 T2 实施记录中。

**依赖：** 检查点 A。

**预计范围：** S。

#### T8 实施记录（2026-09-18）

检查点 A 裁定 TanStack Start 门槛未通过，本任务只做推迟登记与能力图修订。

**推迟原因与复现方式**（详见 T2 实施记录）：
1. 生产托管依赖 Nitro v3 beta，未验证；探路只用 `vite preview` 跑通。
2. 离线行为与项目所有者的取舍冲突：worker 返回离线页后，TanStack Router 按地址栏在客户端渲染出原路由，请求时渲染的页面因此显示为缺数据的半成品。这来自框架的水合方式，平台 worker 改不了。
3. 最终产物的可写入时点依赖插件排序与 `@tanstack/start-plugin-core` 的内部实现，没有公开钩子，而框架仍是 RC。
4. 虚拟模块无法只提供给客户端环境：路由代码两端共用，限定后服务端构建直接失败。

复现方式：按 T2 记录重建探路工程（`@tanstack/react-start` 与 `@tanstack/react-router` 的版本、Vite `base`、插件 `enforce: "post"` 与 `buildApp` order post、预渲染配置），依赖当日需重新选取满足 `minimumReleaseAge` 的版本。

**能力图修订（项目所有者 2026-09-18 批准）**：`ssr-adapters` 一行的职责由"支持 Nuxt 与 TanStack Start"改为只承诺 Nuxt 4，并写明 TanStack Start 未过门槛与推迟条件。依赖列不变，顶部"目标"段不变。

**`.agent/state.json` 未改动**：修订该行后，state 中记录的行指纹已过期。本轮 spec-guard 处于只读的退役阶段（`LEGACY_TRACKER_RETIRED`），同步命令不可用，因此不改 state、不伪造 Issue；账号与 tracker 恢复后，与其余待办（推送 main、补建 Issue、CI 证据）一并处理。

**删除探路工程 `packages/ssr-spike-tanstack`**：结论已完整记录在 T2 实施记录中。`pnpm install` 后 lockfile 移除 34 个包，其中不再有任何 `@tanstack/*`；没有新增条目。仓库中除计划的历史记录外，不再引用该工程。

**未交付**：`@pwa-platform/tanstack-start` 包、其构建夹具与浏览器证据。规格"范围"与"已知限制"已相应登记。

### 检查点 B：证据齐备（T5–T8 之后）

- Nuxt 场景全部通过且各有变异证明；TanStack Start 的结论落地。
- 未取得的范围逐条登记。

### 任务 9：文档同步

**验收标准：**

- 运维手册与恢复演练补充 Nuxt 的恢复发布方式（`recoveryRelease` 重新构建），并登记"Nitro 部署不能构建后改名"。

- **修订兼容矩阵**（`docs/architecture/compatibility.md`）：Nuxt 为 `>=4.5.0 <4.6.0`；TanStack Start 注明"未通过门槛、推迟"及所测版本；写明依据（项目所有者 2026-09-17 决定、Nuxt 3 停止维护日期）。
- **复核规格的外部事实表**，注明复核日期；有变化的逐项更新。
- `README.md` 交付状态、`docs/DOCUMENTATION-BASELINE.md` 新增本模块一行（`target`）、`docs/architecture/package-boundaries.md` 新增包说明。
- `package-boundaries.md` 同步 `@pwa-platform/vite` 新增的公开面与 sw-runtime 的回退修订。
- Nuxt 模块文档：`nitro.prerender.ignore` 提示、自动重载默认值与改回的后果、离线页不带脚本。
- 删除 `packages/ssr-spike-nuxt`（结论已在 T1 实施记录），删除前确认 `@pwa-platform/nuxt` 的夹具已覆盖其证据。
- 全仓相对链接与锚点扫描 0 失效（扫描器先做注入对照）；基线表格列数逐行复验。
- 不修订浏览器矩阵与 V1 验收矩阵。

**依赖：** 检查点 B。

**预计范围：** M。

#### T9 实施记录（2026-09-18）

**起草由 `executor` 子代理完成，主会话逐条核对事实来源并独立复扫链接。**

**外部事实复核（主会话在派活前自行查询 registry，结论交给子代理，不由其推断）：**
- `nuxt` 的 latest 仍为 4.5.2（2026-08-05），`3x` 标签为 3.21.11，Nuxt 3 已于 2026-07-31 停止维护；
- `nitropack` 的 latest 仍为 2.13.4；`nitro`（v3）的 latest 为 3.0.260903-beta（2026-09-03），仍是 beta；
- `@tanstack/react-start` 的 latest 为 1.168.56（2026-09-16），仍是 RC；探路实测的 1.168.54 不变。
规格的外部事实表因此无需改行，只在表下新增一段复核说明并注明日期。

**文档改动：**
- **兼容矩阵**：Nuxt 收窄为 `>=4.5.0 <4.6.0`（去掉已停止维护的 3.x）；TanStack Start 一行改为"未通过可行性门槛，推迟；所测版本为 1.168.54（RC）"；表下新增依据与复核日期。Vue、React、Next.js 三行未动，"支持"的定义未动。
- **运维手册回滚第 2 步**与**恢复演练第 2、4 步**：分成静态主机与 Nuxt Nitro 两种情况。Nuxt 部署不能用构建后改名（Nitro 固化文件大小，响应被截断，T7 实测 66464 对 66507 字节），改为把 `pwaPlatform.recoveryRelease` 设为 `true` 重新构建并部署；恢复正常则改回 `false` 重新构建。验证步骤两种方式相同。
- **README** 开发状态段新增本模块一句，写明已验证范围与未取得的证据。
- **文档基线**新增 `ssr-adapters` 一行（`target`），分列已证明与未证明的部分；表格列数经脚本核对，全表一致为 6 列。
- **包边界**：包清单去掉 `@pwa-platform/nuxt` 的 `(future)` 标记、`tanstack-start` 标为推迟；vite-adapter 一节补上产物流水线入口的函数与类型；新增"SSR 适配器"一节，写明依赖、peer、不得做的事与 TanStack Start 推迟的原因。
- **已知限制**已含全部六条（请求时渲染页离线只显示离线页、覆盖 baseURL 不受支持且预渲染页整体不可用、Nuxt 不能构建后改名发布恢复 worker、爬虫重载插件保留、TanStack Start 未交付、Nitro v3 与 Nuxt 5 待重新评估），本次无需新增。

**删除探路工程 `packages/ssr-spike-nuxt`**：结论保留在 T1 实施记录中。lockfile 删除 325 行，全部是该工程的 importer 及其带来的重复解析变体；**包条目集合零新增、零删除**（`nuxt` 等仍在，正式包的开发依赖要用）。

**链接与锚点扫描**：子代理写了扫描器并做了注入对照。主会话另写一份独立扫描器复核：全仓 86 个受版本控制的 Markdown 文件，坏链接 0、坏锚点 0；注入一个坏链接与一个坏锚点后，恰好报出这两条，还原后回到 0。两份扫描器彼此独立。

**门禁**：`pnpm install --frozen-lockfile` 与全仓 `pnpm lint` 均退出 0。本任务不改任何包源码与测试。

**留给 T10**：`tasks/ssr-adapters/verification.md`（文档基线的该行已指向它，但未断言其内容）。

### 检查点 C：交付前（T9 之后）

### 任务 10：模块质量门禁

**验收标准：**

- 干净 worktree 冻结安装后，lint、build、test、typecheck、test:browser 全部通过。
- lockfile 审阅：新增外部包逐个记录版本、发布时间、来源与安装脚本情况，并与审批记录对照。
- 新上下文独立评审，重点：
  - 最终产物清单是否完整；
  - 私有 SSR 响应是否有任何进入缓存的路径；
  - baseURL 检查能否被绕过；
  - 绑定修改是否改变了客户端行为；
  - 已交付包的修改是否只多出声明的公开面；
  - 测试是否可能空过；
  - 外部事实与兼容矩阵是否如实。
- 阻断项与应修项处理完毕。
- `verification.md` 含浏览器矩阵字段、恢复演练记录与未执行范围；CI 证据未取得时明写，基线行保持 `target`。

**依赖：** 检查点 C。

**预计范围：** M。

## Task List

> Tasks tracked in this plan using local ids (T1–T10, T4b, T7b). GitHub 账号在本模块开工时不可用，因此没有 sub-issue；账号恢复后按本表补建 issue 并把编号回填到这里。在此之前，commit 用 `Task: T<n>` 标注，不写 closing keyword。

### Phase 1：探路与前置修改

- T1 Nuxt 4.5.x 可行性探路（需依赖审批）
- T2 TanStack Start 门槛探路（需依赖审批，可与 T1 并行）
- T3 框架绑定的 SSR 安全修改（无依赖，可与 T1、T2 并行）

### 检查点 A：探路结论与决策（已裁决，2026-09-17）

### Phase 2：Nuxt 实现

- T4 产物流水线复用的落地（blocked by 检查点 A）
- T4b sw-runtime 离线导航回退修订（blocked by 检查点 A，可与 T4 并行）
- T5 `@pwa-platform/nuxt` 模块骨架与客户端接入（blocked by 检查点 A、T3）
- T6 在最终产物上生成平台产物（blocked by T4、T5）
- T7 Nuxt 真实浏览器证据（blocked by T6、T4b）
- T7b 服务端绑定与恢复发布开关（blocked by T7）
- T8 TanStack Start 推迟登记与能力图修订草案（blocked by 检查点 A）

### 检查点 B：证据齐备（T5–T8 之后）

### Phase 3：交付

- T9 文档同步（blocked by 检查点 B）

### 检查点 C：交付前（T9 之后）

- T10 模块质量门禁（blocked by T9）

#### T10 实施记录（2026-09-18）

门禁结果、供应链审阅、浏览器矩阵与未取得的证据，汇总在 [verification.md](verification.md)。本节只记过程。

**执行顺序**：lockfile 审阅 → 干净 worktree 门禁（`24a6471`）→ 新上下文独立评审 → 处置评审意见（`756f03e`）→ 干净 worktree 门禁复跑 → 验证记录。

**供应链审阅**：相对 `main` 新增 549 个包条目，全部来自 Nuxt 依赖树；逐条检查 lockfile 无非 registry 来源，逐个查询 registry 只有 `esbuild@0.28.2` 声明安装脚本（已设为不执行），弃用包只有 `glob@10.5.0`（无已知公告），豁免只有 `semver@6.3.1`（理由与移除条件在配置注释中）。

**独立评审**：1 条阻断项（本模块缺 `verification.md`，而文档基线已指向它；评审同时指出 T9 的链接扫描器按设计不检查反引号代码跨度里的路径，因此该悬空引用未被扫出）、7 条应修项、10 条观察。隐私主线逐层追查后未发现私有或未分类 SSR 响应进入缓存的路径。评审还独立复现了两条关键实测（Nuxt 只读 `noScripts`；Nitro 构建后换文件被截断），并补充发现 `ETag` 同样被构建期固化。

**应修项的处置**（全部在 `756f03e`，各配测试）：
1. 钩子内复查 `app.baseURL` 与 `mountPath` 相等——原先只在 setup 时查过一次，中间可被其他模块改掉；
2. 逐文件流式求哈希，不再把整个发布目录读进内存。按项目所有者决定改到 `@pwa-platform/vite` 的入口：`PwaArtifactSourceFile` 的 `content` 改为可选、新增可选 `contentHash`，两者必须恰好给一个，违反时只报字段名。ADR-0015 已增补；
3. 规格两处与已交付代码矛盾的旧表述；
4. 私有页缓存、更新提示两条可能空过的浏览器断言；
5. 私有 HTML 报错提示覆盖 `public/` 复制来的文件；
6. 站点根部 `index.html` 的候选地址；
7. 开发模式不再改写重载默认值；目录遍历跳过符号链接。

**主会话在验收中另改一处**：流式哈希原为 `Promise.all` 并发开流，文件多时会耗尽文件描述符，改为顺序处理。

**主会话重做的变异**（均在全绿基线上，还原后 `shasum` 一致）：

| 变异 | 转红用例 |
|---|---|
| 去掉钩子内的挂载路径复查 | 1 条（后置钩子改 baseURL 的新用例） |
| 忽略调用方给的 `contentHash` | vite 2 条（计划一致性、哈希透传） |
| 去掉站点根部的候选分支 | 2 条（根部候选、去掉假候选） |
| 目录遍历改回跟随符号链接 | 3 条（含符号链接用例） |
| （T7b 三条）服务端不装绑定、开关开启仍写平台 worker、开关关闭却写恢复 worker | 见 T7b 记录 |

**观察项保留不改**，逐条写入验证记录：恢复 worker 文件名常量在 nuxt 包中重复、`assertPwaArtifacts` 的错误信息会带路径（沿用 vite 原有文案，与本模块"不回显路径"的约定不一致）、恢复场景离线断言区分力弱、examples-browser-e2e 的服务端渲染测试读 `dist`。

**结果**：评审后一轮干净 worktree 门禁六项全部退出 0，单元测试 1027 条、浏览器测试 125 条通过 2 条跳过；本模块浏览器测试 `--repeat-each 10` 共 120 条通过。全仓链接扫描 88 个文件、0 失效。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **平台流水线在 SSR 框架中跑不通** | 高：模块无法交付 | T1、T2 前置探路；不成立即停，回到规格评审 |
| **依赖安装失败或需要构建脚本** | 高：阻塞探路 | 每个任务单独申请；安装后审阅 lockfile；构建脚本、非 registry 来源、未满 24 小时的传递依赖一律停下询问，不放宽供应链设置 |
| **开放问题 1 需要再次修改已交付的 vite-adapter** | 中高：回归面大 | 检查点 A 由项目所有者裁决；T4 要求现有测试不变、公开面逐项比对、三个下游包全部回归 |
| **绑定修改破坏客户端行为** | 高：波及 examples-browser-e2e 与 pwa-entry-resilience | T3 要求现有断言一字不改；两个下游包的浏览器测试回归；变异后必须重建 `dist` |
| **私有 SSR 响应进入缓存** | 高：隐私事故 | 沿用默认拒绝；T6 新增"拒绝类路径下出现预渲染 HTML 即失败"；T7 专设私有页场景；T10 评审重点 |
| **部署时覆盖 baseURL 使身份漂移** | 中：注册到错误 scope | 构建期与运行时双重检查；已知限制中写明不受支持 |
| **外部框架快速迭代（TanStack Start RC、Nitro v3 beta、Nuxt 5）** | 中：结论过时 | 外部事实表在 T1 与 T9 各复核一次；兼容矩阵只写实测过的版本 |
| **E2E 不稳定或空过** | 中：证据失真 | 等待以状态为准；每场景变异；`--repeat-each` 至少 10 次 |
| **浏览器矩阵必测范围取不到** | 中：按矩阵计为未通过 | 如实登记，不外推 |

## 待项目所有者审批的依赖

在对应任务开工时逐个确认。以下是计划撰写时的候选，实际版本以开工当天满足 `minimumReleaseAge` 的版本为准：

| 任务 | 包 | 候选版本 | 已知情况 |
|---|---|---|---|
| T1 | `nuxt` | 4.5.2 | 发布于 2026-08-05；59 个直接依赖；`@parcel/watcher` 为可选 peer；传递依赖规模与构建脚本待安装后审阅 |
| T2 | `@tanstack/react-start` | 1.168.54 | latest 1.168.56 未满 24 小时；精确锁定一组 `@tanstack/*` 内部包 |
| T2 | `@tanstack/react-router` | 1.170.36 | 由 react-start 1.168.54 锁定 |
| T2 | `@vitejs/plugin-react` | 待定 | 仅在实测确认必需时申请 |

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| ssr-adapters | `spec/ssr-adapters.md`、`tasks/ssr-adapters/verification.md`（T10 交付）、`docs/adr/0012-platform-worker-runtime-config-and-recovery-worker.md`（2026-09-17 增补两处离线导航回退）、`docs/adr/0015-vite-plugin-build-pipeline.md`（2026-09-17 增补不依赖 Vite 插件钩子的产物流水线入口）、`docs/adr/0016-framework-bindings.md`（2026-09-17 增补服务端渲染语义） | Nuxt 对启用的 v3 明确报错。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| ssr-adapters | delivered | `spec/ssr-adapters.md` | 2026-09-24 规格追加"public-read-cache 增补"（`2453445`）。 |
