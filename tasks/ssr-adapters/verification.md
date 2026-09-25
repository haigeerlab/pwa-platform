# 验证记录：ssr-adapters

> 模块质量门禁（T10）的可复现结果。本模块的任务以本地编号 T1–T10（含 T4b、T7b）记录在 [plan.md](plan.md)，GitHub 账号恢复后补建 issue 并回填编号。各任务的实施细节与逐次变异记录见计划中的实施记录，本文汇总门禁层面的证据。

## 环境与对象

- 日期：2026-09-18
- 分支：`feat/ssr-adapters`，基线 `main` = `8c3916c`
- 环境：Node v24.18.0，pnpm 11.18.0，macOS 15.7.3（arm64），Google Chrome 152.0.7977.84（本机安装的稳定版），Playwright 1.63.0
- 被验证的提交：门禁先在 `24a6471`（T1–T9）上执行；处置独立评审之后，在 `756f03e` 上重新执行

本分支相对 `main`：15 条提交、108 个文件、12700 行新增 430 行删除。其中 `3bf1cdb`（`docs(product)`）不属于本模块，是项目所有者另行提交的产品文档。本模块的每条提交都带 `Task:` 标记。

| 提交 | 标记 | 内容 |
|---|---|---|
| `2dad233` | T3 | Vue 与 React 绑定的服务端渲染安全路径 |
| `4983f23` | T1 | Nuxt 4.5 可行性探路与结论 |
| `ff03439` | T2 | TanStack Start 门槛探路与结论 |
| `11a0c26` | — | 检查点 A 裁决写入规格与计划 |
| `d88299c` | T4 | vite-adapter 的产物流水线入口（修改已交付包，已获批准） |
| `7c46eeb` | T4b | 平台 worker 的两处离线导航回退修订（修改已交付包，已获批准） |
| `4e1676d` | T5 | `@pwa-platform/nuxt` 模块骨架与客户端接入 |
| `09a9369` | T6 | 在最终产物上生成平台产物与三项构建期检查 |
| `6969ace` | T7 | 九个真实浏览器场景 |
| `a3e2d08` | — | T7 发现的两项裁决与 T7b 任务 |
| `da7ab6b` | T7b | 服务端绑定与恢复发布开关 |
| `1579507` | T8 | TanStack Start 推迟登记与能力图修订 |
| `24a6471` | T9 | 兼容矩阵、运维手册、包边界等文档同步 |
| `756f03e` | T10 | 独立评审发现的修复 |

## 干净 worktree 门禁

从被验证的提交新建独立的 detached git worktree（位于会话临时目录，不在仓库内），依次执行。两轮之间只有被检出的提交不同：

| 命令 | `24a6471`（评审前） | `756f03e`（评审后） |
|---|---|---|
| `pnpm install --frozen-lockfile` | 退出 0 | 退出 0 |
| `pnpm lint` | 退出 0 | 退出 0 |
| `pnpm build` | 退出 0 | 退出 0 |
| `pnpm test` | 退出 0，1011 通过 | 退出 0，**1027** 通过 |
| `pnpm typecheck` | 退出 0 | 退出 0 |
| `pnpm test:browser` | 退出 0，125 通过、2 跳过 | 退出 0，125 通过、2 跳过 |

评审后一轮的逐包计数：

- `pnpm test`：contracts 139、browser-test-harness 61、core 94、build-verifier 100、engine-workbox 37、sw-runtime 92、client-runtime 80、vue 40、vite 114、react 63、entry-resilience 225、**nuxt 77**、examples-browser-e2e 5。
- `pnpm test:browser`：browser-test-harness 22、engine-workbox 6、sw-runtime 16、client-runtime 12、vite 11、entry-resilience 13、**nuxt 12**，以及 examples-browser-e2e 33 通过、2 跳过。8 个包的日志均打印 `chromium 152.0.7977.84 (configured channel)`。
- 跳过的 2 条是 examples-browser-e2e 的真实 `beforeinstallprompt` 用例，按该模块规格跳过、不计通过，与其交付时一致。
- 本模块浏览器测试的稳定性：在同一 worktree 中 `playwright test --repeat-each 10`，**120 条全部通过**，耗时 2.0 分钟。

## 浏览器矩阵

| 字段 | 值 |
|---|---|
| 必测范围 | Chrome 桌面端 N；Chrome Android N 与 N-1（[浏览器矩阵](../../docs/architecture/browser-matrix.md)） |
| 本次执行 | Chrome 桌面端 152.0.7977.84（本机安装的稳定版，`channel: "chrome"`，不下载浏览器） |
| 未执行 | Chrome 桌面端 N-1；Chrome Android N 与 N-1；真实 `beforeinstallprompt` 安装流程 |
| 结论 | **按矩阵计为未通过**：Android 两档未执行。桌面端 N 的全部场景通过。 |

## 场景与变异

九个场景各配一次变异，均在全绿基线上执行、还原后 `shasum` 一致，明细见计划的 T7 实施记录。T7b 之后，恢复场景改为部署 `recoveryRelease: true` 的真实构建，不再由测试替换文件字节。

| 场景 | 结果 |
|---|---|
| 首次访问：注册、控制页面、预缓存与构建一致、不含私有与动态页 | 通过 |
| 预渲染页离线（`/app/`、`/app/about`、`/app/about/`） | 通过 |
| 请求时渲染的公开页离线显示离线页，地址不被改写 | 通过 |
| 私有页离线显示离线页，地址不被改写 | 通过 |
| 私有页在线访问后不进入任何缓存 | 通过（T10 已按评审加强断言） |
| 更新提示：等待确认、确认后接管且不刷新页面 | 通过（T10 已按评审补版本见证） |
| 恢复路径：恢复 worker 接管、只删本应用缓存、不提供任何响应 | 通过 |
| 运行时覆盖挂载路径：`register()` 拒绝、无任何注册 | 通过 |
| 自动重载默认关闭；应用显式开启时照常重载 | 通过 |

## 恢复演练

- 恢复 worker 的接管、缓存删除范围与"不提供任何响应"三项，由 `packages/nuxt/browser-tests/recovery.spec.ts` 的两条用例在 Chrome 桌面端覆盖，部署的是 `recoveryRelease: true` 的真实 Nuxt 生产构建。
- **实测发现（记入运维手册与演练文档）**：Nuxt Nitro `node-server` 部署不能用"构建后把恢复 worker 改名覆盖"发布。Nitro 在构建时把每个静态文件的大小固化进服务端代码，构建后替换的文件仍按旧 `Content-Length` 响应，响应体被截断（T7 实测 66464 对 66507 字节；独立评审用另一组夹具复现为 67091 对 67421 字节，并补充发现 `ETag` 同样被固化）。恢复发布须改用 `recoveryRelease` 重新构建。
- **未执行**：类生产环境中按 [恢复演练](../../docs/operations/recovery-drill.md) 的完整流程（含受控浏览器配置、对照缓存与人工记录）走一遍。本模块只在自动化测试中覆盖了演练的检查项。

## 供应链与 lockfile 审阅

- 相对 `main` 新增 **549 个包条目**，全部来自 Nuxt 依赖树；零删除。
- **来源**：逐条检查 lockfile，无 git、tarball 或本地目录来源。
- **安装脚本**：逐个查询 registry，只有 `esbuild@0.28.2` 声明 `postinstall`；已在 `pnpm-workspace.yaml` 中设为 `false`（不执行），Nuxt 构建与全部测试正常。
- **弃用包**：只有 `glob@10.5.0`（nitropack → archiver 引入），查询公告接口无已知漏洞。
- **豁免**：`trustPolicyExclude: semver@6.3.1` 一条。理由与移除条件写在配置注释中：它是 2023-07-10 对 6.x 线的安全修复版本，手工发布、无 provenance，而 7.x 线更早已有 provenance，pnpm 按发布时间跨线比较判为降级；仅经 `@babel/core` 引入，无已知公告。
- **新增的外部开发依赖**：`nuxt@4.5.2`（2026-08-05 发布）、`@playwright/test@1.63.0`（lockfile 中已有版本）。TanStack Start 的依赖随探路工程删除，lockfile 中已无 `@tanstack/*`。
- 门禁中的 `pnpm install --frozen-lockfile` 退出 0，证明 lockfile 与工作区一致。

## 独立评审

新上下文评审 `main...HEAD`，重点为隐私、挂载路径检查、私有 HTML 检查、对已交付包的改动面、测试是否空过、记录与代码是否相符。

- **隐私结论**：逐层追查后未发现私有或未分类的 SSR 响应进入缓存的路径（拒绝类导航只可能回退离线页、非导航拒绝类与未分类请求完全不接管、请求处理函数任何分支都不写缓存、编码路径绕不过匹配）。
- **阻断项 1 条**：本文件（`verification.md`）缺失，而文档基线已指向它。评审同时指出 T9 的链接扫描器按设计不检查反引号代码跨度中的路径，因此这个悬空引用没有被扫出。本文件即为处置；扫描器的这一局限如实登记，未扩展扫描器。
- **应修项 7 条，全部已修**（`756f03e`），每条配测试，主会话另行重做了 5 个变异：钩子内复查挂载路径、逐文件流式求哈希（`PwaArtifactSourceFile` 增加 `contentHash`，ADR-0015 已增补）、站点根部候选地址、目录遍历跳过符号链接、开发模式不改写重载默认值、私有 HTML 报错提示覆盖 `public/` 来源、私有页缓存与更新提示两条浏览器断言加强。主会话另将并发开流改为顺序处理，避免文件多时耗尽文件描述符。
- **观察项保留不改**：恢复 worker 文件名常量在 nuxt 包中重复（vite 未导出，漂移会被测试拦下）；`assertPwaArtifacts` 的错误信息会带计划中的路径（沿用 vite 原有文案，与 Nuxt 模块"不回显路径"的约定不一致，记为已知不一致）；恢复场景的离线断言单独看区分力弱；examples-browser-e2e 的服务端渲染一致性测试读 `dist`（由 `pnpm test` 先构建的顺序兜住）。
- **评审未能核实**：`--repeat-each 10` 的稳定性（它只跑了一遍）、四张变异表的逐条复做、CI 实跑、浏览器矩阵未取得项、TanStack Start 门槛结论（探路工程已删除）、549 个传递依赖的逐包审阅。其中稳定性与供应链审阅由本文件其他小节补足。

## 未取得的证据

- **CI 实跑**：GitHub 账号当前不可用，无法推送分支、开 PR 或取得 CI 证据。文档基线中本模块一行保持 `target`。
- **浏览器矩阵**：Chrome Android N 与 N-1、桌面端 N-1、真实安装流程未执行。
- **类生产环境的恢复演练**：未执行，仅自动化覆盖。
- **TanStack Start**：门槛未通过，未交付包，也无浏览器证据；结论只保留在计划的 T2 与 T8 实施记录中。
- **`.agent/state.json` 未同步**：能力图行修订后其行指纹已过期；spec-guard 处于只读的退役阶段，同步命令不可用，未改 state、未伪造 Issue。
- **构建期内存**：已按评审改为流式求哈希，但未在大体积发布目录上实测过峰值内存。
