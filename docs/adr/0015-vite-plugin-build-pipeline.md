# ADR-0015：Vite 插件的构建流水线

## 状态

已接受（2026-09-16）。执行 [ADR-0011](0011-platform-injects-compiled-precache-manifest.md) 的清单注入、[ADR-0012](0012-platform-worker-runtime-config-and-recovery-worker.md) 的 worker 配置注入与恢复 worker、[ADR-0013](0013-client-facade-and-page-side-lifecycle-events.md) 的页面配置交付，并在构建一侧调用 [ADR-0014](0014-build-verification-boundary-and-report.md) 的产物校验。

2026-09-17 增补只读计划 API（见决策倒数第二条）；同日增补不依赖 Vite 插件钩子的产物流水线入口（见决策末条），由 [ssr-adapters](../../spec/ssr-adapters.md) 检查点 A 决定。

2026-09-18 后续修订：插件在构建时向每个 HTML 入口注入 manifest 链接，已有的正确链接原样保留，见 [ADR-0022](0022-vite-injects-manifest-link.md)。

2026-09-26 后续修订：插件在开发服务中提供 `virtual:pwa-config`，构建钩子仍只在生产构建运行；Vite 5.0.0、5.4.21 与 8.3.0 的独立消费方验证后，peer 范围改为 `^5.0.0 || ^8.0.0`。类型专用的 `@pwa-platform/vite/virtual` 子路径随包交付，供宿主 TypeScript 配置引用。`writeBundle` 还会比对计划采集时与最终 bundle 中同名文件的内容哈希；后置插件若改写已采集的字节，构建会失败，避免预缓存计划与发布文件分叉。本修订的证据见[验证记录](../../tasks/vite-adapter/verification.md)。

上述同次构建校验不能证明两次构建的指纹 URL 与内容稳定。隔离构建夹具中的随机混淆步骤在未设置固定种子时，实测同名 JS 会生成不同字节，而 worker 因指纹 URL 未变也不变。采用此类构建步骤的宿主须固定随机输入并重复构建比对；不改变 `fingerprinted` 与 `revision: null` 的契约，因为该契约还用于旧资产保留及不可变资源响应头验证。若重复构建仍不稳定，不能发布该宿主接入。

## 背景

在此之前，平台的每个包都只交付"被调用的能力"，没有一条路径能从应用配置走到可部署产物：`compilePlan` 等着别人递文件清单，`injectPrecacheManifest` 与 `injectWorkerConfig` 等着别人递打包好的 worker 源码，`createClientConfig` 等着别人把配置送进页面，`verifyArtifacts` 等着别人告诉它发布了哪些路径。这些"别人"全是本模块。

因此本模块的风险不在算法，而在**接线顺序与产物真相源**：谁先谁后、清单从哪里采集、失败在哪一步暴露。下面每一条决定都对应一次实测，而不是对 Vite 行为的假定——其中两条假定在实施中被实测推翻。

## 决策

- **形态是单个 Vite 插件工厂**，原始决定为 `apply: "build"`、`enforce: "post"`；2026-09-26 修订后移除 `apply`，使开发服务也能解析虚拟配置，产物钩子仍仅在构建时执行。应用只声明 identity、policy、install、topology 四项（与 `PwaCompileInput` 一一对应，独缺 `hostBuildOutput`——那一项应用无从填对）。选项在插件创建时即校验，不等到构建：一个写错的 origin 应当在开发者还看着 `vite.config` 时失败。

- **产物清单有两个来源，缺一不可。** `generateBundle` 的 bundle 给出 chunk 与 asset；`publicDir` 的文件则由包内唯一读盘的模块补齐。**Vite 在写盘阶段把 `publicDir` 原样复制到输出，这些文件不进 bundle、不经任何插件钩子**（实测：磁盘 4 个文件，`generateBundle` 与 `writeBundle` 都只看得见 2 个）。应用的图标、`robots.txt`、离线页通常就放在那里。

- **`node:fs` 只允许出现在 `public-files.ts` 一个模块里**，由导入守卫按文件钉死，写法与 build-verifier 的 `baseline-file.ts` 相同；其余模块是纯函数。本模块最初的规矩是"完全不允许读盘"，理由是"bundle 是产物的唯一真相源"——上一条实测推翻了这个前提。守着原规则会让计划描述的构建**小于**实际发布的构建，而那正是这条规则本来要防的分叉。**规则改了，目的没有变。**

- **两个 worker 各自独立打包，再注入。** 平台 worker 先注入预缓存清单、后注入运行时配置（ADR-0012 的顺序）；恢复 worker 只注入配置。打包一律 `define` `NODE_ENV=production`，不随宿主模式变化——两种构建产物不一致会造成"本地能跑、上线不同"，而 worker 是最不该如此的地方。产物须通过自足性断言：不得残留模块导入、动态 `import`、`require` 或 `process.env`。

- **恢复 worker 写到 `pwa-recovery-worker.js`，不写到 `serviceWorkerUrl`。** 后者是平台 worker 的地址，每次正常发布都会把"删缓存、不服务"的那个 worker 推上线。发布流程在演练或事故处置时把它改名发布上去（[恢复演练](../operations/recovery-drill.md)第 2 步）。

- **manifest 由插件从 install 元数据生成**，`id` 与 `scope` 取自 identity 而非元数据——浏览器据此判断是不是同一个已安装应用，那属于平台所有（ADR-0004）。不生成就要求应用把同一份信息用另一种格式再写一遍，两份必然分叉。

- **页面配置经虚拟模块 `virtual:pwa-config` 交付，且从选项产出而非从计划产出。** 实测钩子顺序为 `configResolved → buildStart → resolveId → load → buildEnd → renderStart → generateBundle`：虚拟模块在第四步加载，计划在第七步才编译得出。所幸 `createClientConfig` 只读 `identity`、`install`、`updateMode`，五个字段**无一来自 `hostBuildOutput`**，因此配置在选项确定时即已确定。本模块与 client-runtime 由此各有一份组装逻辑，以一致性测试钉死。

- **产物校验在 `writeBundle` 中以实际产出为输入。** `emitFile` 写出的文件在 `generateBundle` 自己的 bundle 对象里看不见，到 `writeBundle` 才出现（实测）；在 `writeBundle` 抛错仍能让构建失败（实测）。用插件自己 emit 时记下的清单去校验，等于拿自己的账本验自己；读实际 bundle 才可能发现"编译之后被别的插件删掉"这类漂移。

- **新增只读计划 API（2026-09-17，任务 4）**，服务 `pwa-entry-resilience` 即将实现的 `pwaEntryResilience()` 插件——它需要在同一构建里确认自己发布的恢复页已经进入 `plan.precache`，而不必自己重新编译计划或重新解析 bundle。插件的 `api` 字段暴露 `PwaPluginApi.getPlan()`，返回本次构建编译出的 `PwaPlan`，未就绪时返回 `null`。**就绪时机定在本插件自己的 `generateBundle` 编译成功之后，读取方应放在 `writeBundle` 或更晚的钩子**：本插件 `enforce: "post"`，哪怕是另一个插件自己的 `generateBundle`，此时计划也还没编译出来，读到的只能是 `null`。**暴露的对象是 `structuredClone` 出的深度冻结副本，与内部供 `writeBundle` 产物校验使用的 `planForCheck` 是两个不同的对象**：调用方无论怎么处理这份副本，都碰不到流水线自己在用的那份，运行期本身就拒绝对副本的写入，不必只靠文档约定"只读"。实施中发现，`compilePlan` 返回的计划本身已被 contracts 的校验深度冻结（Zod v4 的 `.readonly()` 在解析成功后调用 `Object.freeze`），因此"直接暴露内部对象"在今天的代码里不可观测；保留克隆与冻结是为了不依赖上游这一实现细节，深度冻结的测试对两种写法都成立。**同时新增 `buildStart` 钩子，把对外的副本与内部的 `planForCheck` 一并重置为未就绪**：同一个插件实例可能被多次调用构建，若本次构建自己的编译失败，`getPlan()` 必须返回 `null`，而不能是上一次构建遗留的计划——否则读取方会把上一次的计划误当作这一次的。

- **新增不依赖 Vite 插件钩子的产物流水线入口（2026-09-17，ssr-adapters 任务 4）。** SSR 框架的最终产物不是 Vite 客户端构建的输出：Nuxt 在客户端构建结束后才预渲染 HTML、复制公开目录，并在打包服务端代码时把静态文件清单固化进去，可写入平台产物的时点是 `nitro:build:public-assets`（ssr-adapters 计划的 T1 实施记录，含反向对照）。那时 `generateBundle` 早已结束，`pwa()` 无从参与。于是：
  - 包的公开面新增 `buildPwaArtifacts(input)` 与 `assertPwaArtifacts(plan, publishedPaths)`，以及 `PwaArtifactInput`、`PwaArtifactSourceFile`、`PwaArtifactResult`、`PwaArtifactOutputFile` 四个类型。输入是四项选项加 `publicPath` 与最终产物文件列表（路径、内容、可选的指纹标记），输出是计划、编译警告，以及调用方应写出的 manifest（仅在平台生成时）、平台 worker、恢复 worker。
  - **`pwa()` 改为调用同一入口，全仓只有一条流水线。** `generateBundle` 把 bundle 与公开目录文件合成文件列表（`bundleSourceFiles`），交给入口；`writeBundle` 的产物校验改为调用 `assertPwaArtifacts`。原有错误信息逐字保留，原有测试断言除公开面清单外一字未改。
  - **文件列表到 `PwaCompileHostOutput` 的换算只有一份**（`collectSourceFiles`：挂载前缀校验、重复路径、sha256、指纹判定、worker 与 manifest 的相对名）。插件与入口都经过它；原先的 `collectHostOutput` 保留为"`bundleSourceFiles` 加 `collectSourceFiles`"的组合，其单元测试与一致性测试因此仍覆盖实际运行的代码。
  - **重复路径一律失败，不静默去重。** 公开目录与 bundle 重名时保留原来那条更具体的错误信息；其他来源的重复由通用检查报出。
  - 调用方未给出指纹标记时，沿用 Vite 的 `-<8 位>` 规则。Nuxt 的纯哈希文件名因此按非指纹处理，只是多带一个用不到的 revision，无害；本次不扩展规则。
  - 本入口不读写文件系统：采集最终产物、写出返回的文件，都由调用方负责。`node:fs` 仍只允许出现在 `public-files.ts`。
  - **2026-09-18 增补（ssr-adapters 交付前评审）**：`PwaArtifactSourceFile` 的 `content` 改为可选，另增可选的 `contentHash`，两者必须恰好给一个，违反时报 `TypeError` 且只报字段名（回显 `content` 就等于把整个文件的字节打进错误信息）。起因是 Nuxt 侧要为最终产物的每个文件求哈希，而 `.output/public` 可能包含视频等大文件：调用方现在可以逐文件流式求哈希后只传哈希，不必把内容读进内存。给定的哈希与内部计算的哈希形式相同（sha256、base64url），一致性由 vite 包的测试钉住。
  - **2026-09-18 增补（shared-origin-topology 任务 6）**：`pwa()` 把编译器的警告逐条经 `this.warn` 输出到构建日志，格式为"诊断码 at 契约路径"，不带任何值。此前插件丢弃了这些警告；同源根应用的产物混入子应用文件时给出的 `compile.host-file-in-child-scope`（[ADR-0019](0019-shared-origin-registry-and-exclude.md)）必须让开发者看到。独立源应用的产物不变，只是日志里会多出原本就存在的警告（例如 `compile.asset-rule-unmatched`）。同源拓扑的登记表在插件创建时校验，与其他选项一致。**注意**：在 Vite 配置里用 `onwarn` 把警告当错误抛出的项目，原本能通过的构建会因这些新出现的警告失败；这类项目应按诊断码放行，或修正对应的策略规则。

## 影响

- 平台首次具备从应用配置到可部署产物的完整路径。[V1 验收矩阵](../architecture/v1-acceptance-matrix.md)"首次在线访问"所需的产物由本模块产出。
- `vue-react-adapters` 在本模块之上包装框架绑定；`ssr-adapters` 复用同一条流水线并扩展 SSR 路由分类。两者都消费 `virtual:pwa-config` 与本模块产出的 worker。
- **`install` 为 `null` 时 manifest 无人生成，这是平台留下的缺口。** `policy.install.enabled` 为 false 时 `plan.install` 为 `null`，插件没有元数据可映射；但 `hostBuildOutput.manifestFile` 仍是必填，且 `compilePlan` 会校验它等于 `identity.manifestUrl`。当前由"应用自备该文件，缺失即构建失败"兜住（项目所有者 2026-09-16 决定）。另两条出路是生成最小 manifest、或让 contracts 在 `install` 为 `null` 时不再要求 `manifestFile`——后者改动已交付包的公开契约，须另立 ADR。
- **ADR-0012 规定的注入顺序是约定，不是代码能强制的约束。** 两个注入点是彼此独立的字符串，先后替换产出的字节完全相同（实测）。实现遵守该顺序并在注释中写明这一点，避免后人以为有测试在守护它。
- **public 文件与 bundle 条目同名时构建失败。** Vite 会让一方覆盖另一方且不报错（实测：后者胜出），而同一 URL 两份字节正是计划要排除的分叉。
- **`vite` 是 peer 依赖**（当前源码 `^5.0.0 || ^8.0.0`），宿主自带；插件不捆绑第二份 Vite。Vite 5 的底层打包器是 Rollup，Vite 8 是 Rolldown；两者分别验证。npm `0.1.0-beta.1` 的 peer 仍为 `^8.0.0`，本修订发布前不得把 Vite 5 写成已发布包的支持范围。
- 浏览器自测中的 fixture 站点全部由插件真实构建产出，不含手工摆放的文件；对它做变异时，破坏必须能通过构建、只在浏览器里失败，否则验证的是构建期校验而非端到端行为。
- 规格见 [spec/vite-adapter.md](../../spec/vite-adapter.md)，依赖边界见[包边界](../architecture/package-boundaries.md)。
