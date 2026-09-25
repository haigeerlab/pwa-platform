# 验证记录：public-read-cache

> 模块质量门禁（T13）的可复现结果。本模块的任务以本地编号 T1–T13 记录在 [plan.md](plan.md)；没有使用远端 tracker。逐任务的实现、变异与偏离见计划中的实施记录，本文汇总门禁层面的证据。

## 环境与对象

- 日期：2026-09-24
- 分支：`claude/pwa-project-completion-review-b324ee`，基点 `main` = `dd9b3a1`
- 被验证的提交：`59d4d4757ae5a79bb00093169e4c4ec47c2533fd`（此后的提交只包含本文件与记录）
- 环境：macOS Darwin 24.6.0 arm64，Node 22.22.0 与 24.18.0，pnpm 11.18.0，Playwright 1.63.0
- 浏览器：Google Chrome 153.0.8010.53（桌面端 N，本机稳定版）；Google Chrome for Testing 152.0.7977.82（桌面端 N-1，经 `PWA_HARNESS_CHROME_PATH`）

## 本地门禁（`pnpm gate:local`）

GitHub 不可用（`gh auth status` 显示本仓库账号 `haigeermail` 的令牌失效），按 [ADR-0031](../../docs/adr/0031-local-gate-substitute-for-ci.md) 以本地门禁记录代替 CI。签署人 **hageer**（项目所有者 2026-09-24 确认）。记录与日志在仓库外 `pwa-release-records/`，不提交。三次尝试全部保留：

| # | 目录 | 提交 | 结论 | 原因 | `record.md` / `results.json` SHA-256 前 16 位 |
|---|---|---|---|---|---|
| 1 | `module-public-read-cache-2026-09-24-61d4004` | `61d4004` | **未通过** | Node 24 的 `pnpm test:browser` 退出码 1：examples 包第一个测试"vue example · handover · re-rendering does not disturb the binding"在创建浏览器上下文时超过 30 秒（`browser.newContext: Test ended`），测试代码尚未执行；同轮 Node 22 与此前三次全仓运行均通过。判断为本机环境问题，未能进一步确认根因 | `b44175b339090c62` / `16b26fc929eaefb2` |
| 2 | `module-public-read-cache-2026-09-24-61d4004-attempt2` | `61d4004` | **未通过** | 14 项命令退出码全为 0，但工具判定 `tool build is stale`：门禁运行期间主会话在同一 worktree 提交了一条计划记录（`59d4d47`），HEAD 与工具构建时的提交不一致 | `d075047e0ff195c4` / `54cd82359292f6e8` |
| 3 | `module-public-read-cache-2026-09-24-59d4d47` | `59d4d47` | **通过** | Node 22 与 24 各 7 项，14 项退出码全为 0；工具提交与构建快照均为 `59d4d47`；UTC 05:48:23–05:58:21 | `e734e90a16af8d2e` / `d9d06bc934c7df19` |

`59d4d47` 相对 `61d4004` 只多一条文档提交（计划记录），代码相同。GitHub 恢复可用后，须对被验证的提交补跑真实 CI 并追加结果。

## 本模块浏览器测试的重复运行（Chrome 153，提交 `59d4d47`）

| 包 | 测试文件 | `--repeat-each 10` |
|---|---|---|
| sw-runtime | `runtime-cache.spec.ts`、`expiration-records.spec.ts` | 180 passed |
| client-runtime | `served-from-cache.spec.ts` | 40 passed |
| engine-workbox | `runtime.spec.ts` | 80 passed |

## 桌面 N-1（Chrome for Testing 152.0.7977.82，提交 `59d4d47`）

同上三组测试各跑一次：sw-runtime 18 passed、client-runtime 4 passed、engine-workbox 8 passed。harness 输出确认使用的是 152 可执行文件。只覆盖本模块新增的浏览器测试，没有在 N-1 上跑全仓浏览器测试。

## 浏览器矩阵字段

| 环境 | 版本 | 结果 |
|---|---|---|
| Chrome 桌面端 N | 153.0.8010.53 | 全仓浏览器测试通过（门禁第 3 次）；本模块测试重复 10 次通过 |
| Chrome 桌面端 N-1 | 152.0.7977.82（Chrome for Testing） | 本模块浏览器测试通过 |
| Chrome Android N | — | **未执行**：无可用设备或设备云 |
| Chrome Android N-1 | — | **未执行**：同上 |

本模块不涉及安装流程，没有原生安装证据的要求。

## 依赖变更

`@pwa-platform/engine-workbox` 新增运行时依赖 `workbox-strategies@7.4.1`、`workbox-expiration@7.4.1`（项目所有者 2026-09-24 批准）。lockfile 相对 `main` 新增的包条目只有 `workbox-expiration@7.4.1` 与其传递依赖 `idb@7.1.1`，均为带 integrity 的普通 registry 条目，无安装脚本；`workbox-strategies@7.4.1` 原本就是 `workbox-precaching` 的传递依赖，只多了 importer 声明。不需要 `minimumReleaseAgeExclude`、`trustPolicyExclude` 或 `allowBuilds`。冻结安装在门禁两轮中均通过。详见计划 T6 实施记录。

## 独立评审

新上下文、只读的 `code-reviewer`（opus），范围 `dd9b3a1..9028baf`。结论：无阻断项，未发现私有数据绕过准入进入缓存的路径；应修 5 项、建议 6 项。主会话逐项核实，其中一项部分不成立（pending 查询的来源检查其实存在），一项证明主会话自己在 T8 记录中写错了（库结构守卫测试并不经过真实 Workbox，已更正）。项目所有者对三项取舍作出决定，全部应修项与相关建议已修复（`75bcbce`、`156024a`、`61d4004`），行为修复均先得 RED，7 项变异逐一转红。细节见计划 T13 实施记录。

## 已知限制

见 [ADR-0035](../../docs/adr/0035-explicit-public-read-runtime-cache.md)"已知限制"与[接入指南](../../docs/guides/public-read-cache.md)：回滚到旧平台版本后的残留；不做网络超时；动态 HTML 不支持 SWR；`Set-Cookie` 无法检查；配额错误清空全部运行时缓存，且只覆盖本次 worker 启动以来访问过的缓存；清理与进行中写入的竞态；查询串中的一次性凭据；经过重定向的动态页面不会被缓存；清理过期记录的代码依赖 `workbox-expiration@7.4.1` 的库结构。v1/v2 应用的请求判断不变，但 worker 产物约增加 50 KB，配置多出 `runtimeCache` 字段。

## 过程偏离

多个任务没有做到"先写失败测试"：T6、T7、T8 与过期记录清理函数是先写实现、事后以变异证明测试有效；T9 的 client-runtime 部分测试与实现同轮写成。各任务的变异表见计划实施记录。独立评审把"测试是否可能空过"列为重点，并找出两处空转的测试，已修复。

## 未取得的证据

- **CI**：GitHub 不可用，以本地门禁代替（ADR-0031）；恢复后须补跑。
- **Chrome Android N 与 N-1**：无设备，未执行。
- **N-1 上的全仓浏览器测试**：只跑了本模块新增的测试。
- **门禁第 1 次失败的根因**：未能确认，只观察到浏览器上下文创建超时；同一测试在其他所有运行中通过。
- **生产或类生产部署**：本模块没有在 Cloudflare 测试站或任何宿主上部署验证。

文档基线中本模块一行保持 `target`。
