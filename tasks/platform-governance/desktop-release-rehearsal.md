# `desktop` 通道发布演练清单：Cloudflare 示例站点

> **性质：演练，不构成生产发布证据。** 本清单拿 Cloudflare 上的 React/Vue 示例站点，把[发布门禁](../../docs/operations/release-and-incident-runbook.md#发布门禁)的 6 项逐一走一遍，找出正式发布前还缺什么。Cloudflare 测试部署不替代 V1 发布门禁（[能力图](../../spec/CAPABILITY-MAP.md) `cloudflare-test-deployment` 行）；这里得到的任何"通过"都不能直接转为生产发布记录。
>
> 盘点日期：2026-09-22，基于 `main` 的 `9de22be`（本地门禁工具已合入）。本清单只做盘点，不执行部署、演练或签署。

## 演练对象与前提

| 项 | 取值 | 依据 |
|---|---|---|
| 发布通道 | `desktop`：必测范围为 Chrome 桌面端 N/N-1；Chrome Android 填"不在本通道" | [ADR-0030](../../docs/adr/0030-desktop-release-channel.md) |
| 应用与槽位 | `react` 与 `vue` 的 `main` 槽位，`https://pwa-platform-react-demo.pages.dev/app/`、`https://pwa-platform-vue-demo.pages.dev/app/` | [目标登记](../../docs/operations/cloudflare-test-deployment.md#目标登记) |
| 拓扑 | 独立源；`requiredChecks` 为 `artifacts`、`response-headers`、`identity-baseline`、`release-retention` | [发布门禁](../../docs/operations/release-and-incident-runbook.md#发布门禁) |
| 身份环境 | 两站身份的 `environment` 均为 `test`，不是 `production` | [cloudflare-test-deployment 验证记录](../cloudflare-test-deployment/verification.md) T3/T4 节 |
| 是否首次发布 | **否**。两站 `main` 已有基线文件 `react-main.json`、`vue-main.json`，身份比较应当是"与基线一致"，不会出现 `verify.baseline-missing` | `packages/examples-browser-e2e/apps/shared/release-baseline/` |
| CI | GitHub 不可用，按 [ADR-0031](../../docs/adr/0031-local-gate-substitute-for-ci.md) 以本地门禁记录代替 | 同左 |

## 总览

| # | 门禁 | 现状 | 是否卡住演练 |
|---|---|---|---|
| 1 | CI（本地替代） | 2026-09-23 对候选提交 `e7458f3` 运行 `pnpm gate:local`，Node 22 与 24 各七项退出码全为 0，结论通过，签署人 hageer | 否 |
| 2 | 浏览器证据 | 已按模板建[证据记录](desktop-rehearsal-browser-evidence.md)；恢复演练已引用；原生安装 2026-09-23 现场四项全部通过（含已安装窗口离线重载）。V1 场景有条件通过：N-1 更新检测引用 `drill` 恢复演练的现场证据；隐私/流式响应经项目所有者决定现场不适用，以本地真实浏览器证据为准（业务项目发布时须现场验证）。证据记录整体仍因 CI 证据缺失未通过（第 1 项） | 否（剩余缺口在第 1 项） |
| 3 | 机器发布门禁 | 工具已就位（`pnpm verify:cloudflare:release`）；2026-09-22 上线后核验：三项检查通过，保留检查因历史发布缺计划未执行，结论未通过；同日加入 `html-headers` 后重跑，四项检查通过，结论同样因保留检查未执行而未通过 | **是**（等历史补齐） |
| 4 | 身份基线比较 | 随第 3 项运行，两站均与基线一致；已注明基线来源未经首次发布评审 | 否 |
| 5 | 类生产环境核对 | 已对演练候选逐项核对：安装与浏览器证据闭合有条件通过（2026-09-23），其余通过（公开 HTML 响应头已由 `html-headers` 机器检查） | 部分（随第 2 项） |
| 6 | 恢复演练 | 2026-09-22 在两站 `drill` 按子记录模板完成，N 与 N-1 全部通过 | 否 |

剩下的卡点：**第 3 项的保留检查要等历史补齐**。第 1 项已于 2026-09-23 取得并签署。第 6 项恢复演练已于 2026-09-22 完成。

## 逐项清单

### 1. CI（本地替代）

- **要求**：发布提交的 CI 通过；GitHub 不可用期间以[本地门禁记录](../../docs/operations/local-ci-record-template.md)代替，证据写明"本地替代"，GitHub 恢复后补跑。
- **已有**：两次演练记录，日志在仓库外 `pwa-release-records/`：`local-ci-2026-09-22-d2a15a9`（本目录 [verification.md](verification.md) 的"修订演练 D4"）与 `d6-final-2026-09-22-2e368ae`（"修订门禁"一节）。两次都是演练，没有签署人。
- **工具**：本地门禁工具已合入 `main`（`9de22be`），入口是根目录的 `pnpm gate:local`（私有包 `packages/release-tools`），它自身的修订门禁见本目录 [verification.md](verification.md) 的"修订门禁：本地门禁工具（G5）"一节。
- **已取得（2026-09-23）**：对候选提交 `e7458f3cbff7da1f4079b5326e9bab4a1ae911e0` 运行 `pnpm gate:local`，签署人 **hageer**，结论**通过**。Node 22.22.0 与 24.18.0 各新建分离 worktree（跑完已移除），两轮观测到的提交均为 `e7458f3`；Chrome 153.0.8010.53、pnpm 11.18.0；14 条命令退出码全为 0，无失败项。记录在仓库外 `pwa-release-records/local-ci-2026-09-23-e7458f3/`：`record.md`（SHA-256 前 16 位 `09ac170753bcd4ae`）、`results.json`（`1f09faa235870738`）与 14 份命令日志；终端输出另存为同目录的 `.runner.log`。门禁工具提交与其 `dist/build-info.json` 均为 `2d91adc`。
- **替代理由（项目所有者 2026-09-23 判定）**：可用性检查 `gh auth status` 退出码 1，输出显示本仓库对应的账号 `haigeermail` 令牌失效、登录失败，因此无法为本仓库取得真实 CI 运行。同一输出中另一个账号 `yizhongkaimail-collab` 处于登录状态，但**未用于本仓库**，本判定不声称 GitHub 整体不可用。按 [ADR-0031](../../docs/adr/0031-local-gate-substitute-for-ci.md)，GitHub 恢复可用后，此提交仍须补跑真实 CI 并把结果追加到证据记录。
- **下一步**：
  - [x] 本地门禁工具合入 `main`（`9de22be`）。
  - [x] 确定候选提交，用 `pnpm gate:local` 产出记录，并与本清单关联（`e7458f3`，2026-09-23）。
  - [x] 发布负责人签署（hageer，2026-09-23；签署人写入 `record.md` 的"签署人"一栏）。

### 2. 浏览器证据

- **要求**：按[生产发布浏览器证据](../../docs/operations/browser-release-evidence.md#发布证据记录模板)模板建一份记录，声明 `desktop` 通道，覆盖桌面 N/N-1 的 V1 场景、Vue 与 React 原生安装、恢复演练子记录，并附已知 Android 问题清单。本通道内任一项未执行即不通过。
- **已有**（均为 Cloudflare 测试站现场记录，见 [cloudflare-test-deployment 验证记录](../cloudflare-test-deployment/verification.md)）：
  - Chrome N（153.0.8010.50）：T3/T4 节，两站在线/离线冒烟。
  - Chrome N-1（152.0.7977.82）："桌面 Chrome N-1 门禁"节，四个槽位现场访问，外加 39 个浏览器场景 `37 passed`、`2 skipped`。
  - 原生安装："桌面 Chrome 原生安装与已安装窗口离线重载"节，结论为**有条件通过**。React 已安装窗口只验证了在线启动，离线重载只在 Vue 上做过。
  - 已知 Android 问题：[examples-browser-e2e 验证记录](../examples-browser-e2e/verification.md) 的 T13、T14。
- **缺口**：
  - 以上记录没有整理成按通道声明的发布证据记录。
  - N-1 的 2 项 skip 必须在记录里说明原因，并确认它们不属于必测场景。
  - React 已安装窗口的离线重载。
  - 恢复演练子记录（见第 6 项）。
- **下一步**：
  - [x] 以演练的 `releaseAttemptId` 按模板建一份证据记录：[`rehearsal-desktop-cloudflare-2026-09-22`](desktop-rehearsal-browser-evidence.md)（2026-09-22），逐格注明是 Cloudflare 现场证据还是本地自动化证据；结论**未通过**。
  - [x] 补 React 已安装窗口的离线重载，以及 N-1（Chrome 152）下 Vue 与 React 在 Cloudflare `main` 上的原生安装；同时补记 N 的完整版本与 display-mode 观察值。2026-09-23 完成：Claude 驱动浏览器，项目所有者点击安装确认框，四项全部通过（见证据记录"原生安装记录"）。
  - [x] 写明 N-1 两项 skip 的原因与判定：浏览器未自行触发真实 `beforeinstallprompt`，属安装资格场景，不计为通过（见证据记录"N-1 的两项跳过"）。
  - [x] 附已知 Android 问题清单：T14（React 在 Chrome Android 152 上未取得安装事件）与 Android N 从未取得，写入证据记录的发布上下文。
  - [x] 恢复演练子记录已由证据记录的"恢复演练"表引用（第 6 项）。

### 3. 机器发布门禁

- **要求**：外部发布系统按[发布编排协议](../../docs/operations/release-orchestration-protocol.md)采集公开产物路径、响应头、完整成功历史和当前可用资产路径，调用 `verifyRelease` 执行全部 `requiredChecks`，并且 `verifyReleaseGateCoverage(report, requiredChecks).ok` 与 `report.ok` 都为 `true`。报告、覆盖结果和必需集要随发布记录保存。
- **已有**：
  - `@pwa-platform/build-verifier` 已导出 `verifyRelease`、`verifyReleaseGateCoverage`。
  - 仓库里唯一调用 `verifyRelease` 的是浏览器测试 `packages/examples-browser-e2e/browser-tests/release.spec.ts`，它针对本地 fixture，不是线上站点。
  - `scripts/deploy-cloudflare-site.mjs --mode=check` 有自己的保留与部署 ID 检查，**但不调用 `verifyRelease`**，不能当作机器发布门禁。
  - 保留审计脚本 `scripts/audit-cloudflare-retention.mjs` 与 R2 部署索引，可以作为 `release-retention` 所需"完整成功历史"的数据来源。
- **缺口**：没有一个只读脚本从线上两站采集事实、调用 `verifyRelease` 与覆盖判定，并输出可附在记录里的报告。
- **下一步**：
  - [x] 规格与计划：作为 `cloudflare-test-deployment` 的修订"线上发布事实采集与机器发布门禁"，M1–M7 已完成。
  - [x] 工具只读：不上传、不改线上；报告存到仓库外，不含令牌与响应体。用法见 [Cloudflare 测试站手册](../../docs/operations/cloudflare-test-deployment.md#机器发布门禁上线后核验仅用于演练)。
  - [x] 2026-09-22 上线后核验：`artifacts`、`response-headers`、`identity-baseline` 通过；6 个历史部署的发布包没有计划，`release-retention` 未执行，结论未通过（[验证记录](../cloudflare-test-deployment/verification.md)）。
  - [ ] 等后续带计划的发布覆盖保留窗口后重跑，保留检查通过才算本项完成。
  - [x] 上线前核验：`cloudflare-test-deployment` 的修订"上线前核验"已完成（用法见 [Cloudflare 测试站手册](../../docs/operations/cloudflare-test-deployment.md#上线前核验预览部署)）。2026-09-22 两站各上传一次到 `candidate` 预览分支并核验：三项检查通过，保留检查因 7 个生产部署缺计划未执行，结论未通过（[验证记录](../cloudflare-test-deployment/verification.md)）。部署脚本暂不强制先做上线前核验，历史补齐后再改为强制。

### 4. 身份基线比较

- **要求**：按[身份发布基线](../../docs/operations/identity-release-baseline.md)比较候选身份与槽位基线，通过或附已批准的迁移记录；不得省略检查。
- **已有**：`react-main.json`、`vue-main.json` 在 T3/T4 首次部署后写入，均为 `test` 环境、`/app/` scope、`r1` 种子；2026-09-22 的显示名更新没有改身份字段。
- **缺口**：
  - 没有对本次候选身份跑过 `identity-baseline` 比较；它是第 3 项 `requiredChecks` 之一，随工具一起补。
  - 两份基线是在"首次部署"后直接写入的，没有找到[首次生产发布评审](../../docs/operations/identity-release-baseline.md)记录。演练阶段可以接受，但要在记录里写明"基线来源为测试站首次部署，未经首次发布评审"。
- **下一步**：
  - [x] 随第 3 项的工具一起跑比较：2026-09-22 两站 `identity-baseline` 均通过，与基线一致。
  - [x] 注明基线来源：`react-main.json` 与 `vue-main.json` 是 2026-09-21 测试站 T3/T4 首次部署成功后写入的 `test` 环境身份，**没有经过首次生产发布评审**；演练中身份比较结果为"与基线一致"，但这一结论只说明身份自那时起未漂移，不能替代首次发布评审。

### 5. 类生产环境核对

- **要求**：逐项核对计划、产物路径、响应头、机器事实记录、安装、离线应用壳、等待更新、浏览器证据闭合，结果写入验证记录（见[发布门禁](../../docs/operations/release-and-incident-runbook.md#发布门禁)的"类生产环境核对项"）。
- **已有素材**（均在 [cloudflare-test-deployment 验证记录](../cloudflare-test-deployment/verification.md)）：

  | 核对项 | 可引用的现场记录 | 状态 |
  |---|---|---|
  | 计划通过 `validatePlan` | T3/T4 节 | 有素材，需针对候选重跑 |
  | 产物路径 | T3/T4 节：10 个公开文件的 HTTP 200 与 SHA-256 比对 | 有素材，需针对候选重跑 |
  | 响应头 | T3/T4 节与"桌面 Chrome N-1 门禁"节 | 有素材，需按[响应头基线](../../docs/operations/release-and-incident-runbook.md#响应头基线)逐项核对 |
  | 机器事实记录 | R2 部署索引与保留审计 | **缺**：依赖第 3 项 |
  | 安装 | 原生安装节 | 见第 2 项的缺口 |
  | 离线应用壳 | "Vue 自动后置门禁…真实断网导航"节、"main v2 桌面受控更新与离线模拟补验"节 | 有素材 |
  | 等待更新 | "main v2 桌面受控更新与离线模拟补验"节 | 有素材 |
  | 浏览器证据闭合 | 第 2 项 | 依赖第 2、6 项 |

- **缺口**：没有一份针对本次候选的核对结果；机器事实一项依赖第 3 项。
- **下一步**：
  - [x] 以当前线上 v2（`e7458f3` 构建）为演练候选，逐项核对，结果见下表（2026-09-22）。
  - [ ] 正式发布时对真正的候选重做一遍。

  **演练候选的类生产环境核对结果**

  | 核对项 | 结果 | 依据 |
  |---|---|---|
  | 计划通过 `validatePlan` | 通过 | 候选构建记录中的计划在构建时校验（`cloudflare-test-deployment` 修订 M2），上线后与上线前核验均读取同一计划 |
  | 产物路径 | 通过 | 上线后核验（M7）与上线前核验（P5）的线上字节比对：候选全部文件与线上逐字节一致；`artifacts` 检查通过 |
  | 响应头 | 通过 | `response-headers` 检查通过（worker、manifest 为 `no-cache`，带指纹资源为长期 `immutable`）。公开 HTML 最初需人工核对；之后 build-verifier 新增 `html-headers`（[ADR-0032](../../docs/adr/0032-html-response-header-check.md)），核验工具开始采集，2026-09-22 两站上线后与上线前核验中 `html-headers` 均通过（三个 HTML 路径最终响应为 `no-cache`，见[验证记录](../cloudflare-test-deployment/verification.md)） |
  | 机器事实记录 | 通过 | M7 与 P5 的 `facts.json`、`report.json`、`coverage.json` 及历史导出，存于仓库外 `pwa-release-records/`，不含令牌与响应体 |
  | 安装 | 通过 | 2026-09-23 现场四项（N/N-1 × Vue/React）全部通过，含已安装窗口离线重载（页面与 Service Worker 同时断网） |
  | 离线应用壳 | 通过 | Cloudflare 现场断网访问与恢复演练第 4 步的断网重载 |
  | 等待更新 | 通过 | Cloudflare 现场受控更新（N）；恢复演练第 4 步中修复后 worker 经更新提示激活（N 与 N-1） |
  | 浏览器证据闭合 | 有条件通过 | 浏览器场景与原生安装已有条件通过，CI 证据为已签署的本地替代记录（2026-09-23）；条件见证据记录的"隐私与流式响应的判定" |

### 6. 恢复演练

- **要求**：在类生产环境按[恢复演练](../../docs/operations/recovery-drill.md)执行，使用被测应用与环境的真实身份，按子记录模板记录缓存删除与保留集合；子记录必须被浏览器证据记录的"恢复演练"行引用。
- **已有**：
  - "T5 隔离预览更新与恢复演练"节：两站在 `drill` 预览别名上部署了恢复 worker，验证接管与缓存清理。
  - sw-runtime 的自动化演练在 N 与 N-1 下通过（本目录 [verification.md](verification.md) 的 D5）。
  - 两份记录都明确写着"类生产环境恢复演练未执行"。
- **缺口**：~~没有按子记录模板完成的演练~~，已于 2026-09-22 补齐（见下）。
- **下一步**：
  - [x] 演练环境：`drill` 槽位。Cloudflare 模块规格部署契约第 7 条已规定恢复演练在隔离槽位进行，`drill` 与 `main` 身份隔离，不影响已安装 `main` 的用户。
  - [x] 协调：原负责这两个站点的会话已由项目所有者关闭，无需协调。
  - [x] 2026-09-22 按子记录模板在 React 与 Vue 的 `drill` 上执行，Chrome 153（N）与 152（N-1）**全部通过**：恢复 worker 无用户操作接管，在线请求不经 Service Worker，断网请求得到网络错误，删除集合恰为 `appCachePrefix` 下的缓存，保留集合不变，修复后 worker 经更新提示激活并可离线启动；结束后两站 `drill` 均恢复为正常 v2。React 第一次运行因驱动脚本缺陷无效，已如实记录后重做。详见 [验证记录](../cloudflare-test-deployment/verification.md)"`drill` 槽位按模板的恢复演练"一节；子记录在仓库外 `pwa-release-records/recovery-drill-2026-09-22/`。
  - [x] 子记录已被第 2 项的[浏览器证据记录](desktop-rehearsal-browser-evidence.md)"恢复演练"表引用（2026-09-22）。

## 建议顺序

1. **为第 3 项写规格与计划**。本地门禁工具已合入，第 1 项可在候选确定后随时补。
2. **实现第 3 项的只读采集与校验脚本**，一并完成第 4 项的比较和第 5 项的机器事实。
3. **定演练环境并执行恢复演练**（第 6 项）。
4. **整理浏览器证据记录与核对结果**（第 2、5 项），补 React 已安装窗口离线重载。
5. **用演练发布记录收口**：按[发布记录模板](../../docs/operations/release-record-template.md)填写，状态停在 `verified`，不执行 `deployed`；结论注明"演练"。

## 待项目所有者决定

- [x] 第 3 项的规格归属：`cloudflare-test-deployment` 的两次修订（上线后核验、上线前核验），均已完成。
- [x] 第 6 项的演练环境：`drill`（依据部署契约第 7 条，2026-09-22 执行）。
- [x] 演练记录是否需要签署人：需要。2026-09-23 由 hageer 签署本次本地门禁记录，签署流程随演练一并走通。
