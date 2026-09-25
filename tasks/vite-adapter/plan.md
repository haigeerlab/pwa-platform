# 实现计划：vite-adapter

## 概览

按 [spec/vite-adapter.md](../../spec/vite-adapter.md) 交付私有包 `@pwa-platform/vite`：一个 Vite 插件，把已经各自成立的六个包接成一条构建流水线。

在它交付之前，平台没有任何一条路径能从应用配置走到可部署产物——`compilePlan` 等着别人递文件清单，两处 `inject*` 等着别人递打包好的 worker 源码，`createClientConfig` 等着别人把配置送进页面，`verifyArtifacts` 等着别人告诉它发布了哪些路径。这些"别人"全是本模块。

因此本模块的风险不在算法，而在**接线顺序与产物真相源**：谁先谁后、产物从哪里采集、失败在哪一步暴露。任务据此拆分。

## 架构决定

- **不重新实现任何上游能力**。计划编译、两处注入、worker 配置生成、页面配置生成、产物校验，全部调用上游的公开入口。本模块只负责采集输入、安排顺序、写出产物。
- **产物真相源有两处：`bundle` 与 `publicDir`。** worker 与 manifest 都经 `emitFile` 写回主 bundle；但 Vite 在写盘阶段把 `publicDir` 原样复制到输出，那些文件不进 bundle、不经任何钩子（T3 实测）。两处合起来才等于实际发布的文件集。
  - 本条原写作"`bundle` 是产物的唯一真相源"，T3 实施时被实测推翻，详见下文 T2 补记。
- **`node:fs` 限于单一模块**。本模块是构建期 Node 插件，全包可用 `node:crypto`（内容哈希）、`node:path`（路径拼接）与 `node:url`（`import.meta.resolve` 的 URL 转路径），三者都是纯函数；**读盘只允许出现在 `public-files.ts`**。边界由按文件扫描的导入守卫加一条"禁止绕过导入图取用内建模块"的检查共同钉死，写法与 build-verifier 的 `baseline-file.ts` 相同。
  - 本条原写作"不允许 `node:fs`"，理由是"bundle 是唯一真相源"——该前提被 T3 实测推翻（见 T2 补记）。规则改了，目的（不让清单与实际发布分叉）没有变。
- **worker 永远按 production 打包**。不论宿主是 `dev` 还是 `build`，子构建一律 `define` `NODE_ENV=production`（ADR-0011）。这回答了 workbox-engine 规格留给本模块的开放问题。
- **失败尽量早**。计划编译失败、注入点数量不对、产物校验不通过，三者都让构建失败，而不是产出一个可疑的包等发布门禁去发现。

### 已实测确认的前提

这些事实在写规格时实测过，任务的验收标准直接依赖它们：

- Vite **8.3.0**，底层打包器是 **rolldown 1.2.8**；`build.rollupOptions` 已标 `@deprecated`，应写 `rolldownOptions`。
- 打包 sw-runtime 的两个入口后，注入点**各恰好剩 1 次**，且 `minify` 为真为假都成立（平台 worker 63611 → 19208 字节，恢复 worker 2743 → 1146 字节）。既有 `global-setup.ts` 注释里"unminified 所以保留"只是当时的选择，不是硬约束。
- 恢复 worker 的产物**不含 Workbox**，平台 worker 含——这是两者边界正确的可观察证据。
- `OutputChunk.code: string`、`OutputAsset.source: string | Uint8Array`，因此内容哈希可以直接从 bundle 计算，不必读盘。

## 任务定义

### 任务 1：包骨架与插件工厂

**说明：** 建立包结构与单一入口，实现 `pwa(options)` 返回一个 Vite `Plugin`。

**验收标准：**

- `package.json` 声明单一导出 `.`，包为私有，`files` 只含 `dist`；运行时依赖为六个工作区包（`workspace:*`），`vite` 为 peer 依赖（`^8.0.0`）；不新增第三方依赖。
- `pwa(options)` 返回的插件带 `name`、`apply: "build"`、`enforce: "post"`。
- 选项在插件创建时即校验，不等到构建才失败：`identity` 调 `validateIdentity`，`policy` 调 `validatePolicy`，`install` 非 `null` 时调 `validateInstallMetadata`；任一不合法即抛错，消息只列诊断码与路径，不回显输入值。
- **`topology` 没有对应的 contracts 校验函数**（contracts 只导出 `validateIdentity`、`validateInstallMetadata`、`validatePolicy`、`validatePlan` 四个），因此改为用 contracts 导出的 `TOPOLOGY_KINDS` 常量做成员检查：`kind` 不在其中即抛错。这是用契约的常量作判断，不是重新实现校验；完整的拓扑合法性仍由 `compilePlan` 负责。
- 依赖边界测试：包内每个源文件的导入说明符只含六个工作区包、`vite`、相对路径，以及 `node:crypto` 与 `node:path`；**`node:fs` 一律禁止**；另有一条检查禁止 `process.getBuiltinModule` / `createRequire` 绕过导入图。每条检查都配自证伪探针。
- 公开面测试：入口只导出 `pwa` 与其选项类型，不再导出任何上游类型或函数。

**验证：**

- `pnpm --filter @pwa-platform/vite test`、`typecheck`、`build` 通过；`pnpm install` 不新增 lockfile 第三方包条目。
- 变异检查：去掉 `apply: "build"`；去掉选项校验；把 `node:fs` 加进某个源文件；用 `process.getBuiltinModule` 取 `fs`。

**依赖：** 无。

**预计范围：** M（包配置、插件骨架、三组边界测试）。

### 任务 2：宿主产物采集

**说明：** 在 `generateBundle(outputOptions, bundle, isWrite)` 中把 Vite 的 bundle 转成 `PwaCompileHostOutput`。

**验收标准：**

- 遍历 `bundle`：`OutputChunk` 取 `code`，`OutputAsset` 取 `source`（两种类型都要处理）。
- 每个条目产出一条 `PwaHostBuildFile`：`path` 取 `fileName`；`contentHash` 取内容的 sha256，以 URL-safe base64 截断到 43 字符（落在契约要求的 8–128 位内）；`fingerprinted` 按文件名是否匹配 Vite 的指纹模式判定。
- `publicPath` 取 `config.base`（经 `configResolved` 拿到）；`serviceWorkerFile` 与 `manifestFile` 由 `identity.serviceWorkerUrl`、`identity.manifestUrl` 去掉 `publicPath` 前缀得到；两者拼回去与身份不一致时抛错，而不是交给 `compilePlan` 去报 `compile.invalid-host-output`——那样错误信息指向的是计划而非接线。
- **被内联的小资源不出现在清单中**：它们不在 bundle 里，因而自然不列入，也就不会进预缓存。
- **`publicDir` 的文件必须一并采集**（T3 实施期间补入，见下）。

**验证：**

- 单元测试：chunk 与 asset 两类；`Uint8Array` 与 `string` 两种 source；带指纹与不带指纹的文件名；内容相同的两个文件得到相同哈希、改一个字节即不同；哈希长度落在契约区间内；一个真实的小资源被内联后不在清单里。
- 变异检查：只处理 chunk 不处理 asset；哈希改成取文件名；`fingerprinted` 恒为真。

**依赖：** 任务 1。

**预计范围：** M（采集、哈希、路径推导与测试）。

#### T2 交付后发现的缺口：`publicDir` 未被采集

T2 按"bundle 是产物的唯一真相源"实现，T3 实施时实测发现这个前提不成立：**Vite 在写盘阶段把 `publicDir` 原样复制到输出目录，这些文件不进 bundle、不经任何插件钩子**（已用真实构建验证：磁盘上 4 个文件，`generateBundle` 与 `writeBundle` 都只看得到 2 个）。

后果不止于漏几个文件：应用的图标与离线页通常放在 public，它们会整体从计划中消失，而 T6 的 `verifyArtifacts` 随后会把每一个都报成缺失——一批假警报。这也让"`install` 为 `null` 时应用自备 manifest"（项目所有者选定的方案）在最常见的做法下直接失效。

**处置**（项目所有者批准）：采集 `publicDir`，读盘限制在新模块 `public-files.ts` 内，由导入守卫按文件钉死；T1 立下的"禁止 `node:fs`"边界相应修订——规则变了，目的（不让清单与实际发布分叉）没有变。规格与 ADR-0015 同步记录。

### 任务 3：计划编译与 manifest 生成

**说明：** 调用 `compilePlan`，并在 `install` 非 `null` 时生成 webmanifest。

**验收标准：**

- `compilePlan({ identity, install, policy, topology, hostBuildOutput })` 失败时构建失败，错误列出诊断码与路径，不回显输入值。
- `plan.install` 非 `null` 时按规格的字段表生成 manifest，`emitFile` 到 `manifestFile`；字段逐项映射，不重复 contracts 已做的校验。
- `plan.install` 为 `null` 时不生成 manifest；若产物中也不存在该文件，构建失败并明确指出应用需自备（见"风险与缓解"）。
- 生成的 manifest 可被 `JSON.parse` 往返，`id` 与 `scope` 分别取自 `identity.manifestId` 与 `identity.scope`。

**验证：**

- 单元测试：字段逐项映射正确；`install` 为 `null` 时不生成；`install` 为 `null` 且产物无 manifest 时构建失败；计划不合法时构建失败且消息只含码与路径。
- 变异检查：`id` 改取 `appId`；`scope` 改取 `mountPath`；`install` 为 `null` 时照常生成空 manifest。

**依赖：** 任务 2。

**预计范围：** M（编译接线、manifest 映射与测试）。

### 任务 4：worker 子构建与三处注入

**说明：** 打包 sw-runtime 的两个入口，按 ADR-0012 的顺序注入，并写回 bundle。

**验收标准：**

- 对 `@pwa-platform/sw-runtime/platform-worker-entry` 与 `./recovery-worker-entry` 各跑一次 Vite `build()`：`configFile: false`、`lib.formats: ["iife"]`、`define` 中 `process.env.NODE_ENV` 恒为 `"production"`。
- 平台 worker：先 `injectPrecacheManifest(source, plan)`，再 `injectWorkerConfig(source, createPlatformWorkerConfig(plan))`，即 ADR-0012 规定的顺序。
  - **本条是约定，不是可执行断言。** 原先写作"顺序颠倒即失败"，实测证伪：两个注入点是彼此独立的字符串（`self.__WB_MANIFEST` 与 `self.__PWA_WORKER_CONFIG`），先后替换产出的字节完全相同。ADR-0012 把顺序写在"影响"一节作为交接说明，未给出技术理由。实现按约定写并在注释中说明它无法被代码强制。
- 恢复 worker：只 `injectWorkerConfig(source, createRecoveryWorkerConfig(plan))`。
- 平台 worker 以 `emitFile` 写到 `serviceWorkerFile`；恢复 worker 写到 **`pwa-recovery-worker.js`**（项目所有者 2026-09-16 确认），不写到 `serviceWorkerUrl`——那会让正常发布覆盖掉平台 worker。发布流程在演练或事故处置时把它改名发布上去（恢复演练第 2 步）。
- 自足性断言：打包产物中不得残留模块导入、动态 `import`、`require` 或 `process.env`。沿用 sw-runtime 与 engine-workbox 浏览器自测中的同一组断言，失败在构建期而非 Chrome 里。

**验证：**

- 单元测试：两个注入点在产物中各恰好一次；注入顺序颠倒时失败；恢复 worker 产物不含 Workbox；自足性断言对一个故意残留 `process.env` 的样本报错。
- 变异检查：恢复 worker 也注入 precache 清单；去掉 `NODE_ENV` 的 `define`；把恢复 worker 写到 `serviceWorkerUrl`；去掉自足性断言。
  - **两项预期为等价变异**，不计入未杀死项，理由都记在代码注释里：
    - **注入顺序对调**：两处注入点是彼此独立的字符串，对调后产出字节一致。
    - **子构建 `root` 改成别的目录**：`lib.entry` 传的是绝对路径，入口的 import 从入口自身位置解析，与 `root` 无关——实测三种 root（包根／入口目录／无关临时目录）产出逐字相同。保留包根只为与 sw-runtime、engine-workbox 既有 fixture 一致。

**依赖：** 任务 3。

**预计范围：** L（两次子构建、三处注入、自足性守卫与测试）。

### 任务 5：虚拟模块 `virtual:pwa-config`

**说明：** 把 `createClientConfig(plan)` 的结果作为虚拟模块提供给页面。

**验收标准：**

- 插件解析 `virtual:pwa-config`，默认导出与 `createClientConfig(plan)` 逐字相同的配置。
- **配置由已校验的插件选项产出，不等待计划**（项目所有者批准的方案 A）。原验收标准写作"计划就绪前导入给出明确错误"，实测证伪：钩子顺序为 `configResolved → buildStart → resolveId → load → buildEnd → renderStart → generateBundle`，而计划要到 `generateBundle` 才编译得出——"计划未就绪"是每次构建的常态，按原写法应用将永远拿不到配置。
  - 可行的依据：`createClientConfig` 只读 `identity`、`install`、`updateMode`，产出 5 个字段，**无一来自 `hostBuildOutput`**，因此配置在选项确定时即已确定。
  - 代价：本模块与 client-runtime 各有一份组装逻辑，由一致性测试钉死（做法同 build-verifier 的第二份 `Cache-Control` 解析）。测试覆盖三种组合，其中"policy 禁用安装但传了元数据"是最易写错的一处——`compilePlan` 会校验该元数据却仍令 `plan.install` 为 `null`。
- 包内提供 `.d.ts` 声明，使应用侧 `import config from "virtual:pwa-config"` 有类型。
- 不注入全局变量，也不写出独立的 JSON 产物。

**验证：**

- 单元测试：解析与加载返回的内容等于 `createClientConfig(plan)`；计划未就绪时导入报错；产物中不出现独立的配置 JSON。
- 变异检查：改为注入全局变量；把整份 `plan` 而非 `PwaClientConfig` 送进页面；`installEnabled` 只看元数据而忽略 policy 开关；去掉 `Object.freeze`；`resolveId` 不加 NUL 前缀；子路径守卫放宽成裸 `startsWith`。
  - **曾以为的"已知缺口"不成立，已补上断言。** 原记录称：把 `updateMode: input.policy.updateMode` 换成硬编码 `"prompt"` 无法被证伪，因为 `UPDATE_MODES` 只有一个成员、构造不出第二个合法值。独立评审指出并实测反驳：区分二者不需要第二个**合法**值，只需要一个**非法**值——`validateClientConfig` 会因此抛错，而硬编码变异照常返回。已补一条传 `"silent"` 的用例，`client-config.ts` 的注释同步更正。

**依赖：** 任务 3。

**预计范围：** M（虚拟模块、类型声明与测试）。

### 检查点：一次构建能跑通

- 从一个 fixture 应用跑 `vite build`，产出计划、平台 worker、恢复 worker、manifest 与页面配置。
- 与项目所有者确认恢复 worker 的旁路路径命名之后，再进入任务 6。

### 任务 6：构建期产物校验

**说明：** 在流水线末尾调用 `verifyArtifacts`，不通过则构建失败。

**验收标准：**

- 在 **`writeBundle`** 中以**实际产出**为 `published` 调用 `verifyArtifacts(plan, published)`：该钩子的 bundle 已包含插件 `emitFile` 写出的 manifest 与两个 worker，再补上 public 目录的文件（它们任何阶段都不进 bundle）。
  - **选这个钩子有实测依据**，不是随手挑的：① `generateBundle` 看不到自己刚 emit 的文件（实测 emit 前后条目数不变，到 `writeBundle` 才出现）；② 在 `writeBundle` 抛错**能**让构建失败（与 `generateBundle`、`closeBundle` 一并实测确认）。
  - **不用插件自己记的账**：拿 emit 时记下的清单去校验，等于用自己的账本验自己；读实际 bundle 才可能发现"编译之后被别的插件删掉"这类漂移。
- 报告不为 `ok` 时构建失败，错误列出诊断码与路径，不回显输入值。
- 响应头与身份基线**不在构建期校验**：前者要真实部署，后者要基线目录，均由发布流程调用（ADR-0014）。

**验证：**

- 单元测试：计划要求的条目缺失时构建失败且诊断指向该条目；worker 或 manifest 不在身份规定路径时失败；全部齐备时构建成功。
- 变异检查：校验结果被忽略（只打日志不失败）；`published` 漏掉新写出的 worker。

**依赖：** 任务 4。

**预计范围：** S（接线与测试）。

### 任务 7：浏览器自测

**说明：** 用插件真实构建一个 fixture 应用，在真实 Chrome 中验证整条链路。

**验收标准：**

- fixture 应用经插件构建后，在真实 Chrome 中：worker 注册成功；预缓存命中；断网后离线降级生效；第二版构建触发 `update-waiting`。
- 复用 `@pwa-platform/browser-test-harness`，不新造 fixture 服务器。
- 这是本模块**唯一**能证明接线正确的手段：单元测试只能证明每一步调用了正确的函数，证明不了产出的 worker 真能注册并工作。

**验证：**

- `pnpm --filter @pwa-platform/vite test:browser` 通过；日志打印所用 Chrome 版本。
- 变异检查：**漏注入预缓存清单**后浏览器自测报红（证明它确实在验证端到端行为，而非重复单元测试）。
  - 原写作"注入顺序对调后报红"，T4 实测证伪：两处注入点互不干扰，对调后产出字节完全相同，不可能让任何测试报红。换成漏注入清单——那会让 worker 装不进任何预缓存，离线访问随即失败，是浏览器才看得见的真实故障。
  - **变异必须是"构建能通过、只有浏览器才发现"的破坏。** 实施时踩过一次：把错误的 `precacheCacheName` 展开进 `createPlatformWorkerConfig` 的结果，被 `injectWorkerConfig` 的配置校验在构建期挡下（`Build failed in 174ms`，浏览器根本没启动）。那验证的是配置校验有效，不是端到端测试有证伪力——拿构建期失败冒充端到端证据，正是这条变异要防的事。正确做法是对**注入之后**的 worker 产物文本动手。

**依赖：** 任务 6。

**预计范围：** L（fixture 应用、四个场景与两版构建）。

### 任务 8：ADR-0015 与文档同步

**说明：** 记录本模块的决定，并同步四处文档。

**验收标准：**

- `docs/adr/0015-vite-plugin-build-pipeline.md` 记录：插件形态、子构建与注入顺序、产物采集方式、manifest 生成、构建期校验、`node:` 内建模块的可用范围。
- `docs/architecture/package-boundaries.md` 新增"构建适配器"一节。
- `README.md` 的交付状态与包清单同步。
- `docs/DOCUMENTATION-BASELINE.md` 新增 vite-adapter 行，状态 `target`（CI 证据取得前不翻 `verified`）。
- 逐行复验文档基线表格的列数，避免插入行把表格挤散。

**验证：**

- 全仓扫描跨文档锚点与相对链接可解析；ADR 的每条断言与实现对照核验。

**依赖：** 任务 7。

**预计范围：** M（ADR 与四处文档）。

### 检查点：交付前

- 全部核心判断都有成立与不成立两类测试，变异检查已完成。
- 与项目所有者确认 ADR-0015 的写法之后，再进入模块质量门禁。

### 任务 9：模块质量门禁

**说明：** 完成模块级验证、独立评审与交付记录。

**验收标准：**

- 在干净 worktree 中冻结安装后，lint、build、test、typecheck、test:browser 全部通过。
- 由新上下文的独立评审代理审阅，重点包括：产物采集是否漏类型、哈希是否可能碰撞或越界、注入顺序是否可被绕过、虚拟模块是否泄漏整份计划、构建失败路径是否都真的失败、`node:` 边界是否可绕过、文档一致性。阻断项与应修项已处理。
- **CI 证据**：GitHub 账号恢复后取得（PR 上 quality 与 browser job 通过，加一次报红/恢复的对照）；在此之前按 build-verifier 的先例执行本地完整门禁，并在记录中写明它**不替代** CI 证据，基线行保持 `target`。
- 结果写入 `tasks/vite-adapter/verification.md`。

**验证：**

- 干净 worktree 的命令输出；spec-guard 产物校验；CI 运行链接（账号恢复后补）。

**依赖：** 任务 8。

**预计范围：** M（验证记录与评审修复）。

## Task List

> Tasks tracked in this plan using local ids (T1–T9). GitHub 账号在本模块开工时不可用，因此没有 sub-issue；账号恢复后按本表补建 issue 并把编号回填到这里。在此之前，commit 用 `Task: T<n>` 标注，不写 closing keyword——写一个不存在的 issue 号比不写更糟。

### Phase 1：采集与编译

- T1 包骨架与插件工厂
- T2 宿主产物采集（blocked by T1）
- T3 计划编译与 manifest 生成（blocked by T2）

### Phase 2：worker 与页面配置

- T4 worker 子构建与三处注入（blocked by T3）
- T5 虚拟模块 `virtual:pwa-config`（blocked by T3）

### 检查点：一次构建能跑通（T4、T5 之后）

### Phase 3：校验与交付

- T6 构建期产物校验（blocked by T4）
- T7 浏览器自测（blocked by T6）
- T8 ADR-0015 与文档同步（blocked by T7）

### 检查点：交付前（T8 之后）

- T9 模块质量门禁（blocked by T8）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **`install` 为 `null` 时无人生成 manifest** | 高：`hostBuildOutput.manifestFile` 是必填且 `compilePlan` 会校验它等于 `identity.manifestUrl`，而插件此时没有元数据可映射 | 规格暂定"应用自备，缺失即构建失败"，T3 按此实现。另两条出路（生成最小 manifest、或改 contracts 契约）都需要项目所有者裁决，后者还要立 ADR。**本项仍为开放问题** |
| 恢复 worker 的旁路路径未定名 | 中：T4 无法验收 | T4 提议 `pwa-recovery-worker.js`（与平台 worker 同目录），在"检查点：一次构建能跑通"处与项目所有者确认后钉死 |
| 主构建要等一次完整子构建 | 中：构建时间变长 | 两个 worker 入口都很小（平台 worker 压缩后 19KB、恢复 worker 1KB），子构建只打包这两个入口而非整个应用 |
| 压缩改写注入点 | 中：注入会失败 | 已实测 `minify` 为真为假注入点都各剩一次；T4 的测试直接断言计数，压缩策略变化会立刻暴露 |
| 哈希截断导致碰撞 | 低：预缓存 revision 失真 | sha256 截断到 43 字符（约 256 bit 的前 258 bit 编码），碰撞概率远低于构建出错概率；测试断言改一个字节即得到不同哈希 |
| 单元测试只能证明"调用了正确的函数" | 高：接线错误照样全绿 | T7 的浏览器自测是唯一的端到端证据，且要求"注入顺序对调后它必须报红"——一个从不报红的端到端测试没有意义 |

## 执行顺序

任务 1 → 任务 2 → 任务 3 → 任务 4、任务 5（可并行）→ 检查点"一次构建能跑通" → 任务 6 → 任务 7 → 任务 8 → 检查点"交付前" → 任务 9。

每个任务一个提交，提交信息带 `Task: T<n>`（账号不可用期间不写 closing keyword）。

---

## 修订计划：构建时注入 manifest 链接（2026-09-18）

按 [spec/vite-adapter.md 的同名修订](../../spec/vite-adapter.md#修订构建时注入-manifest-链接2026-09-18已评审通过) 执行。原任务 1–9 已交付，不重开。

> 任务用本地编号 M1–M4 记录。远程仓库不可用，不建 issue；提交信息写 `Task: M<n>`，不写 closing keyword。

### 与并行会话的协调（2026-09-18）

- 在独立 worktree `../pwa-platform-vite-manifest-link`、分支 `feat/vite-manifest-link` 上开发，不进入主目录。
- 与 push-module（会话“Contracts v1 序列化模型”）没有代码交集：它不改 `packages/vite`，也不改示例应用的 `index.html`。它合入后，平台 worker 会多出推送相关的监听；本修订的测试不断言 worker 的监听集合。
- 会话“PWA 标杆项目调研”在做 Range 修订，会改 sw-runtime、contracts、core、build-verifier，不改 `packages/vite`。vite 插件依赖 core 与 build-verifier，因此 M4 要等它们合入 `main`、本分支 rebase 之后，再在最新的 `main` 上跑。
- ADR 编号：本修订用 0022，0021、0023 已被其他会话占用。
- 两边都要改的文档（`package-boundaries.md`、README、文档基线）放到 M3，谁后合入谁 rebase。

### 架构决定

- **只加一个钩子**：`transformIndexHtml` 只在构建时运行，没有链接就返回一个 `HtmlTagDescriptor` 注入到 `<head>`；已有链接时只做检查，不改写。
- **检查靠解析，不靠字符串拼接**：用容错的正则找出 `rel` 分词含 `manifest` 的 `<link>`；仅接受逐字相等的根路径或同源完整 URL，拒绝相对路径与 `<base>`，不依赖页面 URL 推断地址。最终扫描只覆盖 `transformIndexHtml` 已处理的 HTML entry，不接管其他模块自行输出的恢复页。
- **`buildPwaArtifacts` 不动**：Nuxt 等不经过 Vite 插件钩子的调用方不受影响。

### 任务定义

#### M1：注入与检查

**说明：** 实现 `transformIndexHtml`：没有链接就注入，有一个正确的链接就保留，链接不一致或有多个就报错。

**验收标准：**

- 规格“测试策略增量”中列出的单元测试情况全部覆盖并通过：只注入一次、已有正确根路径或同源完整 URL 时不重复、相对路径与 `<base>` 被拒绝、不一致时失败、多个链接时失败、`rel` 多分词或大小写不同都能识别、多页应用逐页处理、`base` 为子路径时地址正确，并能拒绝其他插件在最终 HTML 注入的重复或错误链接。
- 错误信息不含 `href` 与身份的值。

**验证：** `pnpm --filter @pwa-platform/vite test`、`typecheck`、`build`、`pnpm exec eslint packages/vite`；变异检查：去掉“已存在则跳过”、去掉不一致报错、只处理第一个入口，每一项都要让对应测试失败。

**依赖：** 无。

**文件：** `packages/vite/src/index.ts`，可能新增 `packages/vite/src/manifest-link.ts`，以及对应的单元测试。

**预计范围：** S–M。

#### M2：浏览器自测

**说明：** 在 vite 包的浏览器夹具中，让一个应用不手写链接，验证注入后的页面能取到 manifest。

**验收标准：**

- 夹具应用的构建产物中只有一个 manifest 链接，浏览器能取到 manifest，`id` 与 `start_url` 符合身份。
- 现有 vite 浏览器测试与 `examples-browser-e2e` 全部通过。两个示例应用保留手写链接，用来证明已有正确链接时不会重复注入。
- 不断言 worker 的监听集合。

**验证：** `pnpm --filter @pwa-platform/vite test:browser` 连续通过 3 次；`pnpm --filter @pwa-platform/examples-browser-e2e test:browser` 通过。使用本机 Chrome，不下载浏览器。

**依赖：** M1。

**文件：** `packages/vite/browser-tests/` 下的夹具与测试。

**预计范围：** S–M。

#### M3：ADR-0022 与文档同步

**说明：** 记录决定，并更新接入文档。

**验收标准：**

- 写好 `docs/adr/0022-vite-injects-manifest-link.md`，并在 ADR-0015 中补一条后续修订的指针。
- 迁移指南中“手写 manifest 链接”一步改为说明插件会自动注入，并写明手写链接时的规则（地址必须一致，只能有一个）。
- 同步 `docs/architecture/package-boundaries.md`、README 与文档基线。这三份其他会话也在改，按“后合入者 rebase”处理。

**验证：** 规格、ADR、迁移指南与代码中的行为描述逐条一致。

**依赖：** M2。

**预计范围：** S。

#### M4：修订质量门禁

**说明：** 做修订级的验证与独立评审。

**验收标准：**

- 在最新的 `main` 上 rebase 之后，在干净的 worktree 中执行冻结安装，lint、build、test、typecheck 全部通过；vite、nuxt、examples-browser-e2e 的 test:browser 全部通过。
- 由新上下文的代理做独立评审，阻断项与应修项已处理。
- 结果写入 `tasks/vite-adapter/verification.md`。CI 证据因远程不可用而缺失，写明原因。

**依赖：** M3；Range 修订与 push-module 中已合入 `main` 的部分已完成 rebase。

**预计范围：** S–M。

### Task List（修订）

- M1 注入与检查
- M2 浏览器自测（blocked by M1）
- M3 ADR-0022 与文档同步（blocked by M2）
- M4 修订质量门禁（blocked by M3，以及 rebase 到最新的 `main`）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 正则解析 HTML 漏判或误判 | 中：重复注入，或者误报不一致 | 单元测试覆盖属性顺序、引号、大小写、多分词与相对路径；只识别 `<link>` 元素 |
| 应用确实需要多份 manifest 链接（极少见） | 低 | 规格规定报错；如有真实需求，再开新的修订 |
| Vite 的 `transformIndexHtml` 在多页应用或 `index.html` 不在根目录时的行为 | 中 | M1 用真实构建的多页夹具验证 |
| 其他会话合入导致需要 rebase | 低 | M4 在最新的 `main` 上重跑门禁 |

## 修订计划：平台默认离线页（2026-09-24）

规格见[模块规格](../../spec/vite-adapter.md)"修订：平台默认离线页"。分支 `claude/pwa-platform-review-cba86f`，基于 `main` 的 `66f4131`；规格提交 `805b05c`。每个任务一个提交，提交信息带 `Task: OP<n>`。与 [pwa-entry-resilience 的语言修订](../pwa-entry-resilience/plan.md)（任务 EL<n>）同批进行，门禁与评审合并做一次。

### 架构决定

- **页面生成是一个纯函数，插件只负责接线。** `src/offline-page.ts` 导出 `renderOfflinePage({ locale, messages, css, appName })`，返回 HTML 文本和三段内联内容（默认样式、宿主样式、脚本）的 CSP 哈希；默认样式是 `src/offline-page-style.ts` 中的独立常量。这样文案合并、转义与样式都能脱离 Vite 做单元测试。
- **在 `generateBundle` 中、`buildPwaArtifacts` 之前生成页面并加入 `files`。** 计划据此编译，页面自然进入预缓存并经过 `compile.offline-fallback-not-built` 与 `assertPwaArtifacts`；随后与平台产物一起 `emitFile`。冲突检查同时看 bundle 与 `public/` 读出的文件。
- **"未设置时逐字节不变"用一次性对照证明，不写成常驻测试。** OP3 在改动前后各构建一次 vite 包的测试 app（不设置 `offlinePage`），比对产物目录逐文件 SHA-256，结果写入验证记录；常驻测试只断言"未设置时不产出离线页、`this.info` 不输出离线页哈希"。
- **浏览器测试新增一个构建变体**，不改已有 app 的配置：`browser-tests/global-setup.ts` 多构建一份开启 `offlinePage` 的 app（`zh-CN` 默认一份、`en` 加 `messages` 覆盖一份），既有场景不受影响。
- **执行分工。** OP2、OP3 派给 `executor` 子代理（sonnet），OP2 可与 EL2 并行；OP4 的浏览器测试与变异留在主会话，并与其他会话错开浏览器运行（见 push 收尾时的约定）。ADR-0036 由主会话写。

#### OP1：规格、ADR-0036 与本计划

**范围：** 规格修订（已提交 `805b05c`）；新增 `docs/adr/0036-platform-default-offline-page.md`（状态"已接受"，记录平台提供离线页这一边界变化及其与 ADR-0013、ADR-0018 的关系）；本计划与 Documentation delivery 表。

**验收：** Spec Guard 文档核验对 vite-adapter 为 `attention`（只差交付结果）；项目所有者确认计划后开始 OP2。

#### OP2：离线页渲染函数（TDD，完成：`248e21e`；29 项；三处变异转红；主会话修正 CSP 哈希须覆盖标签之间的完整内容）

**范围：** `src/offline-page.ts`、`src/offline-page-style.ts`，以及对应单元测试。

**验收：**
- `zh-CN`、`en` 内置文案与规格表逐字一致；`messages` 部分覆盖只替换对应键。
- 文案与应用名称含 `<`、`&`、`"`、`'` 时，输出为转义后的实体，`<title>` 同样转义；`install` 为 `null` 时不输出应用名称元素。
- 输出的 class 集合与默认样式中的选择器集合双向一致（同 entry-resilience 的 `class-alignment` 测试）。
- 内联脚本为固定文本：点击 `.pwa-offline__retry` 时 `location.reload()`，`online` 事件时重新加载；脚本中不含任何配置值（测试断言不同配置下脚本文本相同）。
- 三段 CSP 哈希按 `sha256-<base64>` 计算，与对应内联文本一致。
- 变异：去掉转义（至少一项转红）；去掉一个 class 的样式（对齐测试转红）。

**验证：** `pnpm --filter @pwa-platform/vite test`、`typecheck`、`pnpm lint`。

**范围估计：** 中，4 个文件。依赖：OP1。

#### OP3：插件选项与接线（TDD，完成：`9c66bb4`、`c486cf3`、`b8eb573`；vite 208 项；未开启时 110 个文件逐字节不变；四处变异转红，一处存活后删除复制的路径换算）

**范围：** `src/options.ts`（`offlinePage` 校验与四个诊断码）、`src/index.ts`（`generateBundle` 接线、`this.info` 输出哈希），以及选项与构建测试。

**验收：**
- 四个诊断码各有测试：`vite.offline-page-without-fallback`、`vite.offline-page-conflict`（bundle 与 `public/` 两种来源各一例）、`vite.offline-page-message-invalid`（未知键、空串、超过 200 字符、非字符串）、`vite.offline-page-locale-invalid`，另加 `vite.offline-page-css-invalid`。错误信息只含诊断码与路径，带标记值的断言证明不回显。
- 开启后：产物中 `offlineFallback.path` 位置为生成的页面，计划的预缓存清单包含它，`assertPwaArtifacts` 通过。
- 未设置时：不产出页面，不输出离线页哈希；改动前后逐字节对照结果写入验证记录。
- 变异：跳过冲突检查（冲突测试转红）；页面在 `buildPwaArtifacts` 之后才加入（预缓存测试转红）。

**验证：** 同 OP2，另加 `pnpm --filter @pwa-platform/vite test:browser` 既有场景不回归。

**范围估计：** 中，4–5 个文件。依赖：OP2。

### 检查点 A（OP3、EL2 之后）

- 两个包的单元与构建测试通过；生成的离线页与英文恢复页各取一张截图给项目所有者看观感。

#### OP4：真实浏览器场景（完成：`1500740`；5 个场景 `--repeat-each 5` 25/25，vite 浏览器 27 项；两处变异转红）

**范围：** `browser-tests/global-setup.ts` 增加开启 `offlinePage` 的构建变体；新增 `browser-tests/offline-page.spec.ts`。

**验收：**
- 离线导航显示默认离线页：`zh-CN` 变体的 `lang`、标题、说明、重试按钮文案正确，应用名称出现；`en` 变体的文案为 `messages` 覆盖值。
- `prefers-color-scheme: dark` 下，根容器的计算背景色等于暗色变量值。
- 离线页打开后恢复联网，页面自动回到应用（由 `online` 事件触发，不经点击）。
- `--repeat-each 5` 无失败；既有 vite 浏览器场景不回归。
- 变异：内联脚本不再监听 `online`（自动重载场景转红）；默认语言改为 `en`（`zh-CN` 场景转红）。

**验证：** `pnpm --filter @pwa-platform/vite test:browser`。

**范围估计：** 中，2–3 个文件。依赖：检查点 A。

#### OP5：文档同步（完成：见本任务的提交）

**范围：** ADR-0036 定稿；新增 `docs/guides/offline-page.md`（开启方式、资源规则、CSP 哈希、换肤写法、内置文案表）；[包导览](../../docs/guides/packages-overview.md)中 vite 一节加入指向离线页接入说明的链接；本模块新增 `tasks/vite-adapter/verification.md` 的修订一节（若文件不存在则新建）；文档基线中本模块一行；Documentation outcome。

**验收：** 相对链接检查通过；`git diff --check` 通过；Spec Guard 文档核验为 `ready`。

**范围估计：** 中。依赖：OP4、EL3。

#### OP6：合并门禁与独立评审（完成：门禁全绿；评审阻断 0、应修 4，已在 `890e193` 修复并各配变异；见验证记录）

与 EL4 合为一次：干净 worktree 中全仓 `install --frozen-lockfile --offline`、`lint`、`build`、`test`、`typecheck`、`test:browser`；新上下文评审两份修订，重点是转义与注入、诊断码不回显、未设置时逐字节不变、CSP 哈希与实际内联内容一致、既有测试断言未改。

### Task List（修订）

- OP1 规格、ADR-0036 与本计划
- OP2 离线页渲染函数（blocked by OP1；可与 EL2 并行）
- OP3 插件选项与接线（blocked by OP2）
- 检查点 A（OP3、EL2 之后，含截图评审）
- OP4 真实浏览器场景（blocked by 检查点 A）
- OP5 文档同步（blocked by OP4、EL3）
- OP6 合并门禁与独立评审（blocked by OP5、EL4）

### 风险与缓解（修订）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 文案或应用名称未转义，构成 HTML 注入 | 高 | 统一转义函数；带特殊字符的测试与去掉转义的变异；评审重点 |
| 页面未进入预缓存，离线时不可用 | 高 | 在 `buildPwaArtifacts` 之前加入 `files`；预缓存断言与"加入过晚"的变异 |
| 未设置时产物意外变化，波及所有既有应用 | 中 | 改动前后逐字节对照；常驻测试断言不产出页面 |
| 严格 CSP 的站点上重试脚本被拦截 | 中 | 页面不依赖脚本也能完整显示；哈希经 `this.info` 输出并写入接入说明 |
| 与其他会话的浏览器测试并发互扰 | 低 | 浏览器运行前用会话消息错开 |

## 修订计划：manifest 扩展字段的输出（2026-09-24）

任务统一编号在 [contracts-foundation 的计划](../contracts-foundation/plan.md)"修订计划：安装元数据的扩展字段"（MX1–MX7）；本模块对应 MX4（生成与 Nuxt 构建）与 MX5（真实浏览器验证）。


## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| decisions | `docs/adr/0036-platform-default-offline-page.md` | 平台提供默认离线页及其与 ADR-0013 的关系。 |
| vite-adapter | `spec/vite-adapter.md`、`docs/adr/0015-vite-plugin-build-pipeline.md`、`docs/adr/0022-vite-injects-manifest-link.md` | 规格修订、验证记录与离线页接入说明。 |

## Documentation outcome

| Concern | Outcome | Evidence | Rationale |
|---|---|---|---|
| decisions | delivered | `docs/adr/0036-platform-default-offline-page.md` | ADR-0036 已接受：平台提供可选的默认离线页，及其与 ADR-0013 的关系。 |
| vite-adapter | delivered | `tasks/vite-adapter/verification.md` | 规格修订、验证记录与[默认离线页接入说明](../../docs/guides/offline-page.md)已交付。 |
