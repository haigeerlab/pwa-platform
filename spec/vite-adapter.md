# 规格：vite-adapter

## 目标

把已经各自成立的部件接成一条构建流水线：应用在 `vite.config` 里声明身份与策略，构建结束时得到一份编译计划、一个可注册的平台 worker、一个恢复 worker、一份 manifest、一份页面侧配置，以及一份产物校验报告。

在此之前，每个模块都只交付了"被调用的能力"：`compilePlan` 等着别人递给它文件清单，`injectPrecacheManifest` 与 `injectWorkerConfig` 等着别人递给它打包好的 worker 源码，`createClientConfig` 等着别人把配置送进页面，`verifyArtifacts` 等着别人告诉它发布了哪些路径。**这些"别人"全是本模块。** 在它交付之前，平台没有任何一条路径能从应用配置走到可部署产物。

成功标准：[V1 验收矩阵](../docs/architecture/v1-acceptance-matrix.md)"首次在线访问"一行所需的产物由本模块产出（该行点名 sw-runtime、client-runtime、vite-adapter 三者）；[发布门禁](../docs/operations/release-and-incident-runbook.md#发布门禁)的"产物路径"一项在构建期即可判定。

## 范围

**交付物：**

- 私有工作区包 `packages/vite`，包名 `@pwa-platform/vite`（沿用 README 与包边界文档中的名称）：
  - 单一入口 `.`：插件工厂 `pwa(options)`，以及它的选项与产物类型。
- 单元测试（Vitest）与浏览器自测（Playwright 与 browser-test-harness）：用插件真实构建一个 fixture 应用，在真实 Chrome 中验证注册、预缓存与离线降级确实工作。
- `docs/adr/0015-vite-plugin-build-pipeline.md`：记录插件形态、子构建与注入顺序、产物采集方式、manifest 生成与构建期校验。
- 同步 `docs/architecture/package-boundaries.md`（新增"构建适配器"一节）、`README.md`、`docs/DOCUMENTATION-BASELINE.md`。

**不做的事：**

- **不重新实现任何上游能力**：计划编译调用 `compilePlan`，清单注入调用 `injectPrecacheManifest`，worker 配置调用 `createPlatformWorkerConfig` / `createRecoveryWorkerConfig` / `injectWorkerConfig`，页面配置调用 `createClientConfig`，产物校验调用 `verifyArtifacts`。本模块只负责采集输入、安排顺序、写出产物。
- **不采集响应头、不比较身份基线**：两者分别需要真实部署与基线目录，构建期都拿不到。`verifyResponseHeaders` 与 `compareIdentityBaseline` 由发布流程调用（ADR-0014）。
- 不提供框架绑定（归 `vue-react-adapters`）、不提供 SSR 支持（归 `ssr-adapters`）、不提供示例应用（归 `examples-browser-e2e`）。
- 不生成更新提示界面，不在构建期决定是否刷新页面（ADR-0013）。
- 不修改 contracts、core、engine-workbox、sw-runtime、client-runtime 或 build-verifier 的公开契约。
- 不支持 Vite 的开发服务（`vite dev`）下的 worker：见"已知限制"。

## 依赖

- **运行时依赖**：`@pwa-platform/contracts`、`@pwa-platform/core`、`@pwa-platform/engine-workbox`、`@pwa-platform/sw-runtime`、`@pwa-platform/client-runtime`、`@pwa-platform/build-verifier`，均为 `workspace:*`。**不新增第三方依赖。**
- **peer 依赖**：当前源码为 `vite`（`^5.0.0 || ^8.0.0`）；已发布的 `0.1.0-beta.1` 仍为 `^8.0.0`。宿主应用自己安装 Vite，插件不捆绑它。
- **开发依赖**：均已在 lockfile 中：`@pwa-platform/browser-test-harness`、`@playwright/test@1.63.0`、`vite@8.3.0`、`@types/node@24.13.4`。
- **`node:` 内建模块**：本模块是构建期 Node 插件，允许使用 `node:crypto`（内容哈希）、`node:path`（路径拼接）与 `node:url`（把 `import.meta.resolve` 的 `file://` URL 转成路径），三者都是纯函数、不触碰 IO。**`node:fs` 只允许出现在 `public-files.ts` 一个模块里**，由导入守卫按文件钉死，写法与 build-verifier 的 `baseline-file.ts` 相同；其余模块一律是纯函数，只消费传入的数据。

  这条边界原先写作"完全不允许 `node:fs`"，理由是"bundle 是产物的唯一真相源"。实测推翻了那个前提：**Vite 在写盘阶段把 `publicDir` 原样复制到输出目录，这些文件不进 bundle、不经任何插件钩子**，而应用的图标、`robots.txt`、离线页通常就放在那里。守着原规则会让计划描述的构建**小于**实际发布的构建，而那正是这条规则本来要防的分叉——所以规则改了，目的没有变。读盘因此被限制在单一模块内，且只读 `publicDir`。详见 ADR-0015。

### 本模块是唯一同时依赖六个包的模块

其余包都只依赖 contracts 或至多再加一个。这是接线模块的固有形态，不是边界失守：它不导出上游的任何类型，也不转发它们的函数，只在内部按顺序调用。依赖边界测试断言公开面上不出现上游类型，防止本模块退化成一个再导出层。

## 公开契约

### 插件工厂

```ts
export type PwaViteOptions = {
  readonly identity: PwaIdentity;
  readonly policy: PwaPolicy;
  readonly install: PwaInstallMetadata | null;
  readonly topology: PwaTopology;
};

export function pwa(options: PwaViteOptions): Plugin;
```

四个字段与 `PwaCompileInput` 一一对应，唯独缺 `hostBuildOutput`——那一项由插件采集，应用不填，也无从填对。

插件 `enforce: "post"`：它必须在应用的其他插件产出全部文件之后才能采集清单。原始实现的 `apply: "build"` 已在本页 2026-09-26 修订中移除，以便开发服务解析页面配置；产物钩子依然只在构建时运行。

### 构建期的执行顺序

第 1–6 步发生在 `generateBundle(outputOptions, bundle, isWrite)` 内，顺序固定；第 7 步的产物校验在 `writeBundle` 中进行，理由见该步：

1. **采集宿主产物**。来源有两处，缺一不可：

   **其一，`bundle`**：`OutputChunk` 取 `code`，`OutputAsset` 取 `source`（`string | Uint8Array`）。每个条目产出一条 `PwaHostBuildFile`：
   - `path`：条目的 `fileName`（相对 `outDir` 的 POSIX 路径）；
   - `contentHash`：内容的 sha256，以 URL-safe base64 截断到 43 字符（落在契约要求的 8–128 位内）；
   - `fingerprinted`：文件名是否匹配 Vite 的指纹模式。
   **其二，`publicDir`**：Vite 把该目录原样复制到输出，这些文件不进 bundle，因此由 `public-files.ts` 递归读盘补齐。它们一律记为 `fingerprinted: false`——文件名是人写的，其中的 `-<hash>` 与内容无关，判成带指纹会让 `revision` 变为 `null`，文件更新后 worker 永不重取。`publicDir` 为空串（目录被禁用）或 `build.copyPublicDir` 为 `false` 时不采集：Vite 此时不复制，清单也不能声称它发布了。public 文件与 bundle 条目同名时构建失败——Vite 会让一方覆盖另一方且不报错，而同一 URL 两份字节正是计划要排除的分叉。

   `publicPath` 取 `config.base`，`serviceWorkerFile` 与 `manifestFile` 由身份的 `serviceWorkerUrl`、`manifestUrl` 去掉 `publicPath` 前缀得到。
2. **编译计划**：`compilePlan({ identity, install, policy, topology, hostBuildOutput })`。失败则构建失败，错误列出诊断码与路径，不回显输入值。
3. **生成 manifest** 并 `emitFile` 到 `manifestFile`（见下）。
4. **打包两个 worker**：对 `@pwa-platform/sw-runtime/platform-worker-entry` 与 `./recovery-worker-entry` 各跑一次 `build()`，`configFile: false`、`lib.formats: ["iife"]`、`define` 中 `process.env.NODE_ENV` 恒为 `"production"`。
5. **注入**：平台 worker 先 `injectPrecacheManifest(source, plan)`、再 `injectWorkerConfig(source, createPlatformWorkerConfig(plan))`；恢复 worker 只 `injectWorkerConfig(source, createRecoveryWorkerConfig(plan))`。顺序由 ADR-0012 规定。
6. **写出 worker**：平台 worker 以 `emitFile` 写到 `serviceWorkerFile`；恢复 worker 写到 `pwa-recovery-worker.js`，由发布流程在演练时改名发布到 `serviceWorkerUrl`（[恢复演练](../docs/operations/recovery-drill.md)第 2 步）。写到 `serviceWorkerUrl` 会让每次正常发布都把"删缓存、不服务"的那个 worker 推上线。
7. **校验产物**（在 `writeBundle` 中）：以该钩子的 bundle 键加上 public 目录的文件为 `published`，调用 `verifyArtifacts(plan, published)`。报告不为 `ok` 则**构建失败**，错误列出诊断码与路径。
   - **不用插件自己记的账。** `emitFile` 写出的文件在 `generateBundle` 自己的 bundle 里看不见，到 `writeBundle` 才出现（实测）；在 `writeBundle` 抛错仍能让构建失败（实测）。拿 emit 时记下的清单去校验等于自证，读实际产出才可能发现"编译之后被别的插件删掉"这类漂移。

### 页面侧配置

插件提供虚拟模块 `virtual:pwa-config`，默认导出 `createClientConfig(plan)` 的结果：

```ts
import config from "virtual:pwa-config";
import { createPwaClient } from "@pwa-platform/client-runtime";

const client = createPwaClient({ config });
```

配置随应用代码一起打包，参与 tree-shaking，类型由包内的 `.d.ts` 声明提供。不注入全局变量，也不写出独立的 JSON 让页面 fetch——后者会多一次请求，而那次请求本身还要参与缓存策略判定（ADR-0012 已就 worker 侧拒绝过同样的做法）。

### manifest 生成

`plan.install` 非 `null` 时，插件生成 webmanifest：

| manifest 字段 | 来源 |
|---|---|
| `id` | `identity.manifestId` |
| `scope` | `identity.scope` |
| `start_url` | `install.startUrl` |
| `display` | `install.display` |
| `name` / `short_name` | `install.name` / `install.shortName` |
| `theme_color` / `background_color` | `install.themeColor` / `install.backgroundColor` |
| `icons` | `install.icons` 逐项映射为 `{ src, sizes, type, purpose }` |

字段齐备是 contracts 保证的：`validatePlan` 已经检查 startUrl 落在 scope 内、192×192 与 512×512 的 `any` 与 `maskable` 图标齐全、两个颜色是十六进制。插件不再重复这些判断，只做映射。

`plan.install` 为 `null` 时插件不生成 manifest，要求应用自备该文件；产物中不存在时构建失败。见"开放问题"。

## 命令

```bash
pnpm --filter @pwa-platform/vite build
pnpm --filter @pwa-platform/vite test
pnpm --filter @pwa-platform/vite typecheck
pnpm --filter @pwa-platform/vite test:browser
```

## 测试策略

- **产物采集**：chunk 与 asset 两类；`Uint8Array` 与 `string` 两种 source；带指纹与不带指纹的文件名；内容相同的两个文件得到相同哈希、改一个字节即不同；哈希长度落在契约区间内。
- **内联资源**：小于 `assetsInlineLimit` 的资源不出现在 bundle 中，因而不进清单、不进预缓存——用一个真实的小资源构建并断言它不在 `hostBuildOutput.files` 里。
- **注入链**：打包产物中两个注入点各恰好出现一次（**实测已确认：`minify` 为真为假都成立**，平台 worker 63611 字节 / 压缩后 19208 字节，恢复 worker 2743 / 1146 字节）；恢复 worker 的产物不含 Workbox。
  - **注入顺序不作断言。** 本条原写作"注入顺序颠倒时失败"，实测证伪：两个注入点是彼此独立的字符串，先后替换产出的字节完全相同。ADR-0012 规定的顺序是约定，代码强制不了，测试也区分不出（等价变异）。
- **worker 自足性**：打包产物中不得残留模块导入、动态 import、`require` 或 `process.env`——沿用 sw-runtime 与 engine-workbox 浏览器自测中的同一组断言，失败在构建期而非 Chrome 里。
- **构建期校验**：计划要求的条目缺失时构建失败且诊断指向该条目；worker 或 manifest 不在身份规定路径时失败。
- **manifest**：字段逐项映射正确；`install` 为 `null` 时不生成；生成的 JSON 可被 `JSON.parse` 往返。
- **依赖边界**：包内每个源文件的导入说明符只含六个工作区包（含其子路径入口）、`vite`、相对路径与允许的 `node:` 内建（`crypto`、`path`、`url`）；**`node:fs` 一律禁止**；另有一条检查禁止 `process.getBuiltinModule` / `createRequire` 绕过导入图。每条检查都配自证伪探针。
- **公开面**：断言入口只导出 `pwa` 与其选项类型，不再导出任何上游类型或函数。
- **浏览器自测**：用插件构建 fixture 应用，在真实 Chrome 中验证 worker 注册成功、预缓存命中、断网后离线降级生效、第二版构建触发 `update-waiting`。
- **变异检查**：逐个破坏采集、顺序、注入与校验的核心判断，确认对应测试失败。

## 边界

- **始终**：只通过上游的公开入口调用它们；产物读写经 Vite 的产物管道；worker 按 production 打包；构建期校验不通过即失败。
- **先询问**：新增任何第三方依赖；使用 `node:fs` 或其他未列出的内建模块；改动上游包的公开契约；把响应头或身份基线校验搬进构建期；支持 `vite dev` 下的 worker。
- **禁止**：重新实现 `compilePlan`、两处注入或 `verifyArtifacts` 的任何判断；修改宿主的 `assetsInlineLimit` 等构建选项；把上游类型再导出为本模块的公开面。

## 验收标准

1. `@pwa-platform/vite` 提供上文的插件契约，依赖边界由测试守护。
2. 一次构建产出：编译计划、平台 worker（两处注入齐备）、恢复 worker、manifest、虚拟模块配置、产物校验报告。
3. 产物校验不通过时构建失败，诊断指向具体条目。
4. 浏览器自测在真实 Chrome 中验证注册、预缓存、离线降级与更新提示。
5. 单元测试与变异检查覆盖以上行为。
6. ADR-0015 记录本模块的决定；包边界、README 与文档基线已同步。

## 已决定事项（项目所有者，2026-09-16）

- **形态是单个 Vite 插件工厂**：产物采集、计划编译、worker 打包与三处注入全在插件内部完成，应用只声明意图（ADR-0002）。
- **worker 用 Vite 自身的 `build()` 打包**：vite 8.3.0 已在 lockfile 中，不新增依赖，且与宿主版本天然一致。
- **worker 永远按 production 打包**：不论宿主是 `dev` 还是 `build`，子构建一律 `define` `NODE_ENV=production`。这回答了 workbox-engine 规格留给本模块的开放问题——两种构建产物不一致会造成"本地能跑、上线不同"，而 worker 里根本没有 `process.env`。
- **`generateBundle` 里 `await build()` 后 `emitFile`**：worker 与 manifest 都走 Vite 的产物管道，`bundle` 因而是产物的唯一真相源，产物清单直接从它采集。
- **`contentHash` 用 `node:crypto` 算 sha256**：从 `source` / `code` 直接计算，不依赖文件名模式；`node:crypto` 是内建模块，非新增依赖，可用范围写进规格并由导入守卫钉死。
- **被内联的小资源不列入产物清单**：它们已随引用它们的 chunk 一起被预缓存，再单列一遍反而会被判成产物缺失。
- **构建末尾跑产物一致性校验，不通过则构建失败**：ADR-0011 把这项检查交给构建一侧，在这里失败比到发布门禁才发现便宜得多。
- **manifest 由插件从 install 元数据生成**：不生成就要求应用把同一份信息再写一遍，两份必然分叉。
- **页面侧配置用虚拟模块**：随应用代码打包、参与 tree-shaking、类型可推导；不用全局变量，也不用独立 JSON。
- **`install` 为 `null` 时 manifest 由应用自备**（项目所有者，2026-09-24）：策略关闭安装时计划中没有安装元数据，插件不生成 manifest；身份仍指定 `manifestUrl`，编译器仍要求该文件在产物中，所以应用须自己提供，缺失即构建失败，错误信息提示"自备 manifest 或开启安装"（`packages/vite/src/artifacts.ts`，Nuxt 走同一条产物流水线）。未采用的两种做法：插件生成只含 `id`、`scope`、`start_url` 的最小 manifest——没有名称与图标，浏览器不会视为可安装，反而易被误解为已开启安装；契约在 `install` 为 `null` 时不再要求 `manifestFile`——要改已发布包的公开契约，且会让身份中的 `manifestUrl` 可能指向不存在的文件。

## 已知限制

- **`vite dev` 下不提供 worker**：开发服务不经过 `generateBundle`，没有产物清单可采集，因而没有计划、没有注入。开发期验证 PWA 行为须用 `vite build` + `vite preview`。
- **恢复 worker 不发布在 `serviceWorkerUrl`**：它写在旁路路径，由发布流程在演练或事故处置时改名发布（恢复演练第 2 步）。构建期把两者写到同一路径会让正常发布覆盖掉平台 worker。
- **响应头与身份基线不在构建期校验**：前者要真实部署，后者要基线目录，都由发布流程调用 build-verifier 完成。
- **`base` 必须是同源绝对路径**：以 `/` 开头并以 `/` 结尾。Vite 允许的相对 `base`（如 `./`）与完整 URL 形态不受支持，构建在采集阶段即失败并给出明确消息——`publicPath` 须能与身份的 `scope` 对齐，相对形态无法参与该比较。
- **只支持 `standalone-origin` 拓扑**：`TOPOLOGY_KINDS` 本期只有这一个取值；多槽位与子路径拓扑归 `shared-origin-topology`。

## 开放问题

无。原"`install` 为 `null` 时 manifest 由谁生成"已由项目所有者于 2026-09-24 裁决，见"已决定事项"末条。
（恢复 worker 的旁路路径原为开放问题，已由项目所有者于 2026-09-16 定名为 `pwa-recovery-worker.js`，见"构建期的执行顺序"第 6 步与 [ADR-0015](../docs/adr/0015-vite-plugin-build-pipeline.md)。）

## 修订：构建时注入 manifest 链接（2026-09-18，已评审通过）

### 起因

插件生成并发布 manifest，却不在页面里引用它。应用漏写 `<link rel="manifest">` 时，浏览器永远不会认为它可安装，而构建成功、产物校验也通过，没有任何信号。vue-vben-admin 的真实接入试验实际撞上了这一点（[分析报告第七节](../docs/product/vben-admin-pwa-analysis.md#七真实接入试验结果2026-09-18)）；示例应用之所以可安装，是因为它们的 `index.html` 手写了这一行。

### 已确认的前提（项目所有者，2026-09-18）

1. 只在构建时注入 worker 与构建产物。开发服务器没有 worker，页面侧虚拟配置可解析；开发期若需要 manifest，需由应用自备公开文件。
2. 每个 HTML 入口都注入，多页应用逐页处理。
3. 页面已有 `rel` 含 `manifest` 的 `<link>` 时：地址与 `identity.manifestUrl` 一致就不再插入；不一致就让构建失败。
4. 无论 `install` 是否为 `null` 都注入：两种情况下 `manifestUrl` 上都有文件，`null` 时由应用自备（本规格“开放问题”一节）。
5. 只注入这一个标签，不附带 `theme-color` 等其他标签。
6. Nuxt 模块不在本修订范围内：它走不依赖钩子的 `buildPwaArtifacts` 入口，页面头部由 Nuxt 自己生成，列为已知限制。
7. 决定记为 ADR-0022。

### 契约增量

插件新增 `transformIndexHtml` 钩子，只在构建时运行，对每个 HTML 入口：

- 查找所有 `rel` 属性按空白分词后含 `manifest` 的 `<link>` 元素（大小写不敏感，属性顺序任意）。
- **没有找到**：在 `<head>` 末尾注入 `<link rel="manifest" href="<identity.manifestUrl>">`（Vite 的 `HtmlTagDescriptor`，`injectTo: "head"`）。
- **找到一个**：只接受两种明确写法：以 `/` 开头且逐字等于 `identity.manifestUrl` 的路径，或位于 `identity.origin`、路径恰为 `identity.manifestUrl` 的完整 URL。相同就原样保留、不再注入；相对路径、查询/片段、其他源或其他路径都抛错、构建失败。页面存在 `<base>` 元素也构建失败，避免页面 URL 改变链接的实际解析结果。
- **找到多个**：构建失败。一页指向多份 manifest，浏览器只取第一份，其余都是遗留问题。
- 最终产物会在 `writeBundle` 再扫描一次：每个经过 `transformIndexHtml` 处理的 HTML 入口恰好保留一个正确链接；这能发现其他插件在本钩子之后注入的重复或错误链接。其他插件自行 `emitFile` 的 HTML（如入口恢复页）不属于宿主 HTML entry，仍由各自模块契约校验。错误信息只说明是哪一类问题、在 HTML 入口的 `ctx.path`，**不回显 `href` 或身份的任何值**，并标注可能由其他插件注入，与插件现有的报错约定一致。
- 不修改 HTML 的其他部分，也不向页面注入脚本。

不变的部分：manifest 的生成与发布、产物校验、页面配置虚拟模块、公开导出、`buildPwaArtifacts` 的行为全部不变。已手写且地址正确的应用（包括两个示例应用）构建结果与之前相同。

### 不做的事

- 注入 `theme-color`、`apple-touch-icon` 等标签。
- 在开发服务器下注入。
- 为 `@pwa-platform/nuxt` 注入（已知限制，需另行设计）。
- 改写应用自己写的、地址正确的 manifest 链接（例如补上 `crossorigin`）。

### 测试策略增量

- **单元测试**：
  - 用 Vite 的真实构建跑小型夹具，覆盖以下情况：无链接时注入且只注入一次；已有正确根路径或同源完整 URL 时不重复；相对路径、`<base>`、地址不一致、无效 URL 时构建失败；多个链接时构建失败；`rel` 含多个分词（如 `"manifest foo"`）或大小写不同时仍被识别；多页应用每页都处理；`base` 为子路径（如 `/admin/`）时注入的地址正确；`order: "post"` 的替身插件注入重复或错误链接时最终构建失败。
  - 断言错误信息不含 `href` 与身份的值。
- **浏览器自测（Chrome 桌面端）**：在 vite 包现有的浏览器夹具中，让一个应用的 `index.html` 不写链接，构建后断言页面里只有一个 manifest 链接、它能取到 manifest，且 manifest 的 `id` 与 `start_url` 符合身份。不断言 worker 注册了哪些监听。
- **兼容性**：两个示例应用保持手写链接不变，`examples-browser-e2e` 的现有测试继续通过，以此证明“已有正确链接不重复注入”。
- **变异检查**：去掉“已存在则跳过”、去掉不一致时的报错、只处理第一个 HTML 入口，确认对应测试失败。

### 边界增量

- **始终**：链接地址只取自 `identity.manifestUrl`；注入只发生在构建时。
- **先询问**：注入 manifest 链接以外的任何标签；改写应用已有的正确链接；在开发服务器下注入。
- **禁止**：在错误信息里回显 `href` 或身份的值；向页面注入脚本。

### 验收标准增量

1. 没有手写链接的应用，构建后每个 HTML 入口恰好有一个指向 `identity.manifestUrl` 的 manifest 链接。
2. 已有正确根路径或同源完整 URL 的应用，构建结果与修订前相同；相对链接、`<base>`、链接不一致或多于一个时构建失败，且错误信息不回显值。
3. 真实浏览器中，未手写链接的夹具应用能取到 manifest，字段符合身份。
4. ADR-0022 已记录，迁移指南中“手写 manifest 链接”一步已改为说明插件会自动注入；单元测试、浏览器自测、变异检查通过。

### 开放问题

- **Nuxt**：`@pwa-platform/nuxt` 是否通过 Nuxt 的 `app.head` 注入同样的链接，需另行设计。
- **`crossorigin`**：manifest 需要携带凭据时（如整站走登录网关），链接要加 `crossorigin="use-credentials"`。本修订不处理，应用可以继续手写这类链接。

## public-read-cache 增补（2026-09-24）

插件接受 `PwaPolicy v3`（[public-read-cache](public-read-cache.md)、[ADR-0035](../docs/adr/0035-explicit-public-read-runtime-cache.md)）：`compilePlan` 编译出的 `PwaPlan v3`（含 `runtimeCache` 字段）经既有的 `createPlatformWorkerConfig` 注入平台 worker 配置，不需要修改本模块的生产代码——插件只是把计划转手交给下游入口，下游已经支持 v3。产物、manifest 生成、两处注入顺序、虚拟模块 `virtual:pwa-config` 与构建期产物校验流程均不变。

## 修订：平台默认离线页（2026-09-24，已评审通过）

### 起因

2026-09-24 的平台完成度审查发现：`offlineFallback` 开启时，离线页的 HTML 必须由业务自己放进 `public/`，平台不提供模板；示例中的离线页只有一行英文。多数业务第一版只需要"离线时给用户一个说得过去的页面"，却要各自手写页面、样式与暗色模式。

### 已确认的前提（项目所有者，2026-09-24）

1. 默认离线页由 **Vite 插件的新选项显式开启**，不改 `PwaPolicy` 契约。未开启时行为逐字节不变：自带离线页的业务不受影响；未开启 `offlineFallback` 的应用离线时仍显示浏览器自身的错误页。
2. 语言在**构建期固定**一种（`locale`），内置 `zh-CN` 与 `en`，可用 `messages` 覆盖部分或全部文案；页面不在运行时按浏览器语言切换。
3. 样式沿用入口恢复页的做法：一段内联 `<style>`、CSS 自定义属性、亮暗两套、`data-theme` 覆盖，并可用 `css` 选项追加宿主样式；不引入 CSS 库、图标、网络字体、图片或动画。
4. 只做 Vite 接入，Nuxt 暂不支持（`@pwa-platform/nuxt` 不暴露该选项）。
5. 与恢复页**命名与做法对齐，但不共享代码**：两个包之间不为一段样式新增依赖。

### 契约增量

**插件选项**

```ts
type PwaViteOptions = {
  // ……既有四个字段不变
  readonly offlinePage?: {
    readonly locale?: "zh-CN" | "en";                       // 默认 "zh-CN"
    readonly messages?: Partial<PwaOfflinePageMessages>;     // 覆盖所选语言的部分或全部文案
    readonly css?: string;                                   // 追加在默认样式之后的宿主样式
  };
};

type PwaOfflinePageMessages = {
  readonly documentTitle: string;   // <title>
  readonly heading: string;         // 标题，例如"当前处于离线状态"
  readonly body: string;            // 说明，例如"网络恢复后页面会自动重新加载。"
  readonly retry: string;           // 重试按钮
};
```

- 开启条件：`offlinePage` 存在，且 `policy.offlineFallback.enabled === true`。`offlinePage` 存在而 `offlineFallback` 未开启时，构建失败（诊断码 `vite.offline-page-without-fallback`），不静默忽略。
- 页面写到 `offlineFallback.path` 对应的产物位置。若该位置已有文件（业务在 `public/` 中放了同名文件），构建失败（`vite.offline-page-conflict`），不猜测该用哪一份。
- 页面在**计划编译之前**加入产物，因此与业务自带的离线页一样进入预缓存，并经过 `compile.offline-fallback-not-built` 与 build-verifier 的既有校验。业务仍需按现有规则为该路径写一条资源规则，本修订不替业务添加策略。
- `messages` 的每个值必须是非空字符串、不超过 200 个字符，未知键令构建失败（`vite.offline-page-message-invalid`，只报诊断码与路径，不回显值）。`locale` 只接受两个取值（`vite.offline-page-locale-invalid`）。`css` 与恢复页相同，只拒绝包含 `</style` 的值（`vite.offline-page-css-invalid`）。

**页面内容**

- `<html lang>` 取所选 `locale`；`<meta charset="utf-8">` 与 viewport；`<title>` 取 `documentTitle`。
- 应用名称：`install` 不为 `null` 时显示 `install.name`，否则不显示。
- 标题、说明、重试按钮。所有文案与应用名称在构建期经 HTML 转义后写入静态 HTML；页面不依赖脚本就能显示完整内容。
- 一段内联脚本：点击重试时 `location.reload()`；收到 `online` 事件时自动重新加载。脚本是固定文本，不含任何来自配置的值。
- 默认样式、宿主 `css`、内联脚本三段的 CSP 哈希都经 `this.info` 输出，不写入文件，与恢复页相同；接入说明写明严格 CSP 的站点需要把它们加进响应头。

**class 与变量（公开契约，发布后改名即破坏性变更）**

| 元素 | class |
|---|---|
| 根容器（`<main>`） | `pwa-offline` |
| 应用名称 | `pwa-offline__app` |
| 标题 | `pwa-offline__heading` |
| 说明 | `pwa-offline__body` |
| 重试按钮 | `pwa-offline__retry` |

变量与恢复页一一对应，只换前缀：`--pwa-offline-bg`、`-fg`、`-muted`、`-accent`、`-accent-fg`、`-radius`、`-max-width`、`-font`，亮暗默认值与恢复页相同。暗色的两条路径（`prefers-color-scheme` 与 `[data-theme="dark"]`）选择器写法也与恢复页相同。离线页是独立文档，没有应用脚本可以设置 `data-theme`，因此实际只有 `prefers-color-scheme` 生效；保留 `[data-theme]` 选择器是为了让宿主的换肤 CSS 在两个页面上写法一致。

**内置文案**

| 键 | zh-CN | en |
|---|---|---|
| `documentTitle` | 离线 | Offline |
| `heading` | 当前处于离线状态 | You're offline |
| `body` | 网络恢复后页面会自动重新加载。 | This page will reload when your connection is back. |
| `retry` | 重试 | Try again |

### 不变的部分

- `PwaPolicy`、`PwaPlan`、worker 配置、离线导航回退的判定规则（ADR-0034）都不变。
- 未设置 `offlinePage` 时，插件产物与本修订前逐字节相同（由测试钉住）。

### 本修订不做的事

- 运行时语言切换；除 `zh-CN`、`en` 外的内置语言（可用 `messages` 自行提供任意语言的文案，但 `lang` 属性只能是两者之一）。
- Nuxt 接入；更新提示、安装提示、推送权限等无头 UI。
- 替业务生成资源规则或开启 `offlineFallback`。

### 测试策略增量

- **单元**：选项校验的每个诊断码；`messages` 与内置文案的合并；HTML 转义（文案中含 `<`、`&`、`"` 时原样显示而非被解析）；class 集合与默认样式选择器集合双向一致（同恢复页的 `class-alignment` 测试）。
- **构建**：开启后产物中存在该页面且进入预缓存清单；两种冲突与"未开启 fallback"均构建失败；未设置 `offlinePage` 时产物与基线逐字节相同；三段 CSP 哈希由 `this.info` 输出。
- **真实浏览器（Chrome 桌面 N）**：离线导航显示默认离线页，`lang` 与文案符合所选 `locale`；`en` 与 `messages` 覆盖各一例；`prefers-color-scheme: dark` 下变量取暗色值；恢复联网后自动重新加载回到应用。每个场景配一次变异。

### 验收标准增量

- 上述测试全部通过；既有测试不改断言。
- 新增 ADR-0036，记录"平台提供第二个页面（离线页）"这一边界变化，以及与 ADR-0013"界面归应用"的关系：更新、安装、推送的提示仍归应用，离线页与恢复页属于"应用无法运行时"的页面，由平台提供默认实现。
- 接入说明写明开启方式、资源规则、CSP 哈希与换肤写法；包导览同步。

### 开放问题

无。

## 修订：manifest 扩展字段的输出（2026-09-24，已评审通过）

主体见 [contracts-foundation 的"安装元数据的扩展字段"](contracts-foundation.md)。本节只记录生成侧。

- `createWebManifest` 按契约输出 `description`、`categories`、`orientation`、`display_override`、`screenshots`（`form_factor`）、`shortcuts`（`short_name`、`icons`）；未写的字段不输出任何键，已有应用的 manifest 逐字节不变（以既有 vite 浏览器夹具的构建产物对照证明）。
- 契约校验产生的截图警告经既有的编译警告通道输出（`this.warn`，只含诊断码与路径）。
- Nuxt 复用同一生成器，不改其代码；新增一项 Nuxt 构建测试，证明新字段出现在 Nuxt 产出的 manifest 中、缺失的截图同样使构建失败。

**测试**：字段映射与键名；未写字段时 manifest 逐字节不变；Nuxt 构建一例；真实浏览器中 Chrome 能解析带截图与快捷方式的 manifest（读取 DevTools 协议的 `Page.getAppManifest` 无错误）。

## Documentation impact

本表覆盖 2026-09-24 与 2026-09-26 两次修订；原交付不回填（见下一节）。

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 可选的默认页面，不改变产品范围。 |
| architecture | follow | 不新增分层；页面由既有插件产出。 |
| developer-entry | follow | 根 README 不变；Vite 5 的 Vue 接入与迁移写入专题指南。 |
| capability-map | follow | 不新增模块。 |
| decisions | update | ADR-0036 记录默认离线页；ADR-0015 补充 Vite 5 和开发服务决定。 |
| lifecycle-and-recovery | follow | 离线导航回退的判定不变。 |
| ci-baseline | follow | 不改变 CI 工作流。 |
| supply-chain | follow | 平台运行时与仓库锁文件不新增依赖；隔离消费方在临时目录安装。 |
| browser-matrix | follow | 既有浏览器分档不变；Vite 5 场景记录于模块验证文件。 |
| v1-acceptance | follow | 可选能力，不进入 V1 验收矩阵。 |
| identity-release-baseline | follow | 不改变身份。 |
| release-and-incident | follow | 不改变发布与事故流程。 |
| recovery-drill | follow | 不涉及。 |
| browser-release-evidence | follow | 不改变证据模板。 |
| package-distribution | follow | 新 beta 的发布另走该模块门禁；未发布前网站仍写 beta.1 的真实范围。 |
| cloudflare-test-deployment | follow | 示例是否开启由后续示例修订决定。 |
| browser-test-harness | follow | 复用既有 harness。 |
| workbox-engine | follow | 不涉及。 |
| sw-runtime | follow | worker 行为不变。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 复用既有校验，不新增检查。 |
| release-gate-contract | follow | 不涉及。 |
| local-ci-record | follow | 不涉及。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | update | 本模块规格、计划、验证记录与接入说明。 |
| client-runtime | follow | 不涉及。 |
| vue-react-adapters | follow | Vue 3.4 消费方回归，不改绑定公开接口。 |
| examples-browser-e2e | follow | 示例接入另行决定。 |
| pwa-entry-resilience | follow | 只对齐命名与做法，不改该模块。 |
| ssr-adapters | follow | Nuxt 暂不支持该选项。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | follow | 不涉及。 |
| public-read-cache | follow | 不涉及。 |
| update-notice-ui | follow | 业务接入手册引用可选组件及色值接口，不修改 UI 模块契约。 |
| capability-comparison | follow | 本次仅清理宿主接入文档，不改变公开能力对照。 |

## 文档影响表未回填（2026-09-23）

本模块在 2026-09-23 时**没有** `Documentation impact` 表，因此当时 spec-guard 的文档核验报 `invalid`。这是当时的历史记录；2026-09-24 修订已新增上表。

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。

## 修订：Vite 5 业务接入兼容（2026-09-26）

### 目标与依据

目标兼容场景为 Vite 5.0.0 与 Vue 3.4.0；隔离消费方还覆盖 TypeScript 5.2.2 和 pnpm 8.6.5。迁移自 `vite-plugin-pwa` 的业务应用需要按自身的构建插件、部署路径和既有 worker 上线历史决定迁移步骤。

让公开的 `@pwa-platform/vite` 在上述 Vite 5 环境中可安装、可构建、可在真实浏览器完成注册、离线与受控更新，同时保持 Vite 8 的既有行为。Vue 3.4.0 消费方也须通过类型检查与浏览器场景，不能只凭 `@pwa-platform/vue` 的 peer 范围推断兼容。

### 范围与边界

- 在实际验证通过后，将 Vite peer 范围扩为经测试的主版本；未验证的 Vite 6/7 不随意宣称支持。
- 使用宿主安装的 Vite 打包两个平台 worker；Vite 5 的 Rollup 输出与 Vite 8 的 Rolldown 输出分别验证。保留现有身份、scope、缓存准入、worker 确认接管和构建失败语义。
- 接入示例导入 `virtual:pwa-config` 后，`vite dev` 应能启动普通业务页面，但开发服务不注册平台 worker。生产 PWA 行为仍由 `vite build`、`vite preview` 和目标部署环境验证。
- npm 包须实际携带 `virtual:pwa-config` 的类型声明，供 TypeScript 的 `Bundler` 和 `Node` 模块解析方式使用。
- `writeBundle` 须比对计划编译时与最终 bundle 中同名文件的内容哈希。后置插件改写 JS/CSS 时构建失败，业务可调整插件顺序使平台插件在改写完成后采集。
- 对 Vite 已赋予指纹文件名的 JS/CSS，业务构建插件必须保证同一输入生成相同字节；否则同一 URL 会发布不同内容，现有预缓存、旧资产保留和 `Cache-Control` 契约无法同时成立。使用随机混淆等构建步骤时须固定随机输入，并在相同源码上连续构建两次比较文件名与 SHA-256。没有这项证据不得宣称该宿主可安全更新。
- 真实业务配置中的混淆与 CSS 清理必须纳入构建核对；平台计划中的资源路径、内容哈希和最终产物须一致。没有业务源码时先用复刻配置的最小夹具，不把夹具通过误称为真实项目验收。
- 不保留两套同时生效的 PWA 插件或两个注册入口；业务项目移除 `vite-plugin-pwa`、旧 `sw.ts` 与直接 Workbox 依赖的具体清理，以业务源码的引用核对为准，不在本模块擅自删除。
- 本修订不加入默认更新提示 UI；该需求需另行修订框架绑定的界面边界与 ADR-0013。

### 验收

1. Vite 5.0.0、一个固定的后期 5.x 版本和 Vite 8.3.0 的独立消费方夹具，均能安装平台包、通过配置类型检查并构建出可校验的 manifest、平台 worker、恢复 worker 与预缓存清单；产物路径与内容哈希对应最终字节。
2. Vite 5 夹具在真实 Chrome 中通过首次注册、离线导航、等待更新、确认接管；确认前页面不自动刷新，确认后是否刷新仍归宿主决定。
3. 使用 Vue 3.4.0、TypeScript 5.2.2 与 pnpm 8.6.5 的消费方可完成安装、类型检查、生产构建；`vite dev` 可显示业务页面且不注册 worker。Vite 8 与现有 Vue/React 浏览器场景不回归。
4. 隔离夹具的混淆步骤使用固定种子后，连续两次同源构建的同名 JS/CSS 字节相同；改动源码后文件名或预缓存修订值变化，新 worker 在浏览器中等待确认。无种子配置的失败对照需记录。
5. 接入文档写清迁移步骤、`base` 与资源规则、开发/生产行为差异、Node.js 最低小版本和真实业务部署的未验证项；发布状态只在包实际发布后更新。

### 业务侧实施交接（2026-09-26）

本仓库交付可复制的 Vite 5 + Vue 3.4 接入手册与项目级 AI Skill；宿主源码修改、构建和部署验收由宿主仓库中的执行者完成。手册与 Skill 须按实际已发布版本描述能力，要求核对资源目录、CSS 清理、构建随机输入和发布版本输入，并明确不得把隔离夹具通过写成宿主项目通过。

### 开放问题

- 实际宿主的 Node 小版本、源码与部署响应头需在接入时核对；隔离夹具的结果不能替代宿主验收。
- 隔离夹具已确认混淆插件无固定种子时会让同名 chunk 字节漂移；真实业务仓库仍须重复构建核验其完整插件链。
