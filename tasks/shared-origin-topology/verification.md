# 验证记录：shared-origin-topology

> 模块质量门禁（T9）的可复现结果。本模块的任务以本地编号 T1–T9 记录在 [plan.md](plan.md)，GitHub 账号恢复后补建 issue 并回填编号。各任务的实施细节与逐次变异记录见计划中的实施记录，本文汇总门禁层面的证据。

## 环境与对象

- 日期：2026-09-18
- 分支：`feat/shared-origin-topology`，基线 `main` = `8d423f8`
- 环境：Node v24.18.0，pnpm 11.18.0，macOS 15.7.3（arm64），Google Chrome **153.0.8010.50**（本机安装的稳定版，T7 期间自动更新；此前各模块的证据取自 152.0.7977.84），Playwright 1.63.0
- 被验证的提交：门禁先在 `b3170b2`（T1–T8）上执行；处置独立评审之后，在 `4e6ee2a` 上重新执行

本分支相对 `main`（不含本文件所在的提交）：10 条提交、74 个文件、3730 行新增 83 行删除。每条提交都带 `Task:` 标记。

| 提交 | 标记 | 内容 |
|---|---|---|
| `90541a2` | T1 | ADR-0019 提议稿 |
| `02c68c5` | T1 | 接受 ADR-0019，关闭规格的开放问题 |
| `dbc3cb6` | T2 | contracts：同源登记表、`shared-origin` 拓扑与 `exclude` 动作 |
| `06b739c` | T3 | core：编译 `shared-origin` 拓扑 |
| `8f1d697` | T4 | sw-runtime：平台 worker 执行 `exclude` |
| `2fef753` | T5 | build-verifier：按已部署的根计划校验发布顺序 |
| `c248c35` | T6 | Vite 插件接受同源拓扑 |
| `d6a3e6c` | T7 | 同源真实浏览器证据 |
| `b3170b2` | T8 | ADR-0012、部署拓扑、运维手册与包边界等文档同步 |
| `4e6ee2a` | T9 | 独立评审发现的修复 |

## 干净 worktree 门禁

从被验证的提交新建独立的 detached git worktree（位于会话临时目录，不在仓库内），依次执行。两轮之间只有被检出的提交不同：

| 命令 | `b3170b2`（评审前） | `4e6ee2a`（评审后） |
|---|---|---|
| `pnpm install --frozen-lockfile` | 退出 0 | 退出 0 |
| `pnpm lint` | 退出 0 | 退出 0 |
| `pnpm build` | 退出 0 | 退出 0 |
| `pnpm test` | 退出 0，1199 通过 | 退出 0，**1245** 通过 |
| `pnpm typecheck` | 退出 0 | 退出 0 |
| `pnpm test:browser` | 退出 0，134 通过、2 跳过 | 退出 0，134 通过、2 跳过 |
| vite 浏览器测试 `--repeat-each 10` | 190 通过（2.1 分钟） | 190 通过（1.9 分钟） |

评审后一轮的逐包计数：

- `pnpm test`：contracts 179、browser-test-harness 61、core 146、build-verifier 113、engine-workbox 37、sw-runtime 97、client-runtime 80、vue 40、vite 122、react 63、entry-resilience 225、nuxt 77、examples-browser-e2e 5。
- `pnpm test:browser`：browser-test-harness 22、engine-workbox 6、sw-runtime 17、client-runtime 12、vite 19、entry-resilience 13、nuxt 12，以及 examples-browser-e2e 33 通过、2 跳过。日志打印 `chromium 153.0.8010.50 (configured channel)`。
- 跳过的 2 条是 examples-browser-e2e 的真实 `beforeinstallprompt` 用例，按该模块规格跳过、不计通过，与其交付时一致。
- 此前各模块的全部浏览器测试在 Chrome 153 上也全部通过。

## 浏览器矩阵

| 字段 | 值 |
|---|---|
| 必测范围 | Chrome 桌面端 N；Chrome Android N 与 N-1（[浏览器矩阵](../../docs/architecture/browser-matrix.md)） |
| 本次执行 | Chrome 桌面端 153.0.8010.50（本机安装的稳定版，`channel: "chrome"`，不下载浏览器） |
| 未执行 | Chrome 桌面端 N-1；Chrome Android N 与 N-1 |
| 结论 | **按矩阵计为未通过**：Android 两档未执行。桌面端 N 的全部场景通过。 |

## 场景与变异

六个场景，在全绿基线上变异、还原后 `shasum` 一致，明细见计划的 T7 实施记录、检查点 C 的 T9 更正与 T9 实施记录。

| 场景 | 结果 | 证明的是什么 |
|---|---|---|
| 1 两个 worker 各自注册并只控制自己 scope 的页面 | 通过；子应用不注册即转红 | 同源双注册可行 |
| 2 断网时子页面由子 worker 应答 | 通过 | **只证明浏览器按 scope 具体程度分派**，与 `exclude` 无关（T9 更正） |
| 3 根页面发往子路径的请求不经根 worker，子路径下的根构建文件不进任何缓存 | 通过；T9 补强后，同时去掉 core 的子 scope 过滤与 contracts 的对应不变式即转红 | 编译期预缓存过滤在真实浏览器中成立；不是 `exclude` 的效果（v1 无运行时缓存） |
| 4 只有根应用时断网访问子路径得到网络错误，不是根应用的离线页 | 通过；根应用按独立源构建（无 `exclude`）即转红，主会话复做一致 | **`exclude` 的直接证据** |
| 5 根、子各自的恢复 worker 只删本应用缓存 | 通过；恢复 worker 发布到错误地址即转红 | 缓存命名空间隔离 |
| 6 发布顺序校验用两次真实构建产出的计划 | 通过与失败两组断言各自成立 | 发布校验在真实计划上可用（单元测试，不需要浏览器） |

另外，`standalone-origin` 的编译输出由 core 的四组逐字节快照钉住（`packages/core/test/shared-origin-topology.test.ts`），与本模块之前的输出一致；原有独立源浏览器测试未改动并照常通过。

T9 发现并修复的一处**测试空过**：共用工具 `urlIsInAnyCache` 原先按完整 URL 精确匹配，而 Workbox 的预缓存键带 `?__WB_REVISION__=` 查询串，导致"不在缓存中"的断言恒真。改为只比较源与路径后，上述双重变异才让场景 3 转红，基线仍通过。

## 恢复演练

- 根、子各自的恢复 worker 接管后只删除本应用命名空间下的缓存，另一方与无关缓存原样保留，由 `packages/vite/browser-tests/shared-origin-recovery.spec.ts` 的两条用例在 Chrome 桌面端覆盖，部署的是真实构建的恢复版本。
- 同源拓扑的发布顺序（先根后子）与移除顺序（先子应用发布恢复 worker、确认缓存清空，再从登记表移除并重新发布根应用）写入运维手册"同源拓扑的发布与移除顺序"一节。
- **未执行**：移除子应用流程没有自动化检查，也没有在类生产环境中演练过。

## 供应链与 lockfile 审阅

- 本模块**不引入任何外部依赖**。
- lockfile 相对 `main` 只多出 3 行：build-verifier 的 importer 下新增工作区开发依赖 `@pwa-platform/core: workspace:*`（`link:../core`），仅供 `release-order` 的测试用真实编译器生成计划；发布产物不依赖 core。
- 门禁中的 `pnpm install --frozen-lockfile` 两轮均退出 0。

## 独立评审

新上下文评审 `main...HEAD`（`b3170b2`），重点按 T9 验收标准：根 worker 是否会应答子 scope、`exclude` 与 `deny` 是否可能混淆、登记表校验能否被路径写法绕过、对五个已交付包的改动面、`standalone-origin` 是否逐字节不变、测试是否空过。

- **阻断项**：无。
- **应修项 6 条，全部已修**（`4e6ee2a`），每条配测试，主会话另行重做了变异：
  1. 登记表的 scope 重叠与字段重复改为按解码后的路径比较（contracts 新增 `packages/contracts/src/internal/path-key.ts`，并加 core 与 contracts 的一致性测试）。变异：比较时不解码 → contracts 3 条、core 一致性 3 条转红。
  2. 根应用计划的不变式：预缓存、离线页与安装 `startUrl` 不得落在子 scope 内，`exclude` 必须排在最前。
  3. 发布顺序校验比较登记表内容：根登记表中本子应用的条目必须与子应用身份一致（`verify.root-registry-child-mismatch`）；版本号相同而内容不同时报 `verify.root-registry-diverged`。变异：去掉前者 → 4 条转红；去掉后者 → 2 条转红。
  4. 场景 3 补上真正触发预缓存过滤的夹具，并修复上文的空过断言。
  5. `isPrecacheSource` 改为显式的缓存策略白名单，不再依赖"不是 deny 也不是 none"；补公开导出测试。
  6. vite 中一处过期注释。
- **观察项已处理**：运维手册写明服务器不得对路径做规范化；ADR-0015 补充编译警告经 `onwarn` 输出的说明；`waitForActiveWorkerActivated` 的参数改为选项对象；根应用安装 `startUrl` 落在子 scope 时报 `compile.start-url-in-child-scope`。
- ADR-0019 增补两点：`PwaTopology` 由单一类型变为联合类型，对按穷举方式匹配的调用方是类型层面的破坏性变化；三层检查（contracts 不变式、core 编译、build-verifier 发布校验）的分工。ADR 结论未改。
- 评审结论中的隐私部分：根 worker 对子 scope 的请求只可能透传，`exclude` 在 `deny` 之前判断且永不回退离线页；v1 没有运行时缓存，子路径资源不进根应用缓存的保证来自编译期过滤，并由上文场景 3 在真实浏览器中证明。

## 未取得的证据

- **CI 实跑**：GitHub 账号当前不可用，无法推送分支、开 PR 或取得 CI 证据。文档基线中本模块一行保持 `target`。
- **浏览器矩阵**：Chrome Android N 与 N-1、桌面端 N-1 未执行。
- **Nuxt**：`@pwa-platform/nuxt` 只支持 `standalone-origin`，同源拓扑没有 Nuxt 接入与证据。
- **移除子应用流程**：只有运维手册中的步骤，没有自动化检查，也未演练。
- **服务器路径规范化**：运维手册要求服务器不对路径做规范化，但没有测试覆盖服务器实际这样做时的行为。
- **`reload` 与 `goto` 的差异**：T7 观察到同源双注册时 Chrome 刷新页面会保留原来较宽泛的控制者，测试工具因此改用重新导航。这是实测现象，原因未查证，也未在其他浏览器上确认。
- **`.agent/state.json` 未同步**：spec-guard 处于只读的退役阶段，未改 state、未伪造 Issue。
