# 证据索引：production-readiness-documentation

核查日期：2026-09-27（Asia/Kuala_Lumpur）。本页固定本模块使用的事实，不替代各模块原始验证记录。

## 代码与发布基线

| 项目 | 固定事实 | 来源 |
|---|---|---|
| 审核提交 | `7f5d0f8a4eb93c7bd907a364d1f09f853bf01a99`，与核查时 `origin/main` 相同 | `git rev-parse HEAD`、提交 `Release PWA Platform 0.1.0 and qualify desktop PWA (#15)` |
| npm 发布源码 | `870bf93a3ac78e4593f0916192a34448fd09e270` | [0.1.0 发布记录](../stable-release-qualification/release-0.1.0.md) |
| npm 正式版本 | 十个公开包均为 `0.1.0`，2026-09-27 实时查询均为 `dist-tags.latest=0.1.0` | npm registry `npm view`；[发布记录](../stable-release-qualification/release-0.1.0.md) |
| 发布完整性 | 十包逐包读回、完整性摘要、文件清单和独立 registry 消费通过 | [0.1.0 发布记录](../stable-release-qualification/release-0.1.0.md) |
| 发布通道 | 仅 `desktop`；不得写成 `desktop+android` 或 Apple 移动端发布通道通过 | [正式版验收记录](../stable-release-qualification/verification.md)、[浏览器证据规则](../../docs/operations/browser-release-evidence.md) |

## 十个公开包

| 包 | 公开入口 | 业务直接使用 | README 现状（实施前） |
|---|---|---|---|
| `@pwa-platform/contracts` | `.` | 仅直接引用配置类型时 | 9 行，占位级 |
| `@pwa-platform/core` | `.` | 否，策略编译内部依赖 | 9 行，占位级 |
| `@pwa-platform/engine-workbox` | `.`、`./worker` | 否，Workbox 内部引擎 | 9 行，占位级 |
| `@pwa-platform/build-verifier` | `.` | 通常否，由构建/发布工具调用 | 9 行，占位级 |
| `@pwa-platform/sw-runtime` | `.`、`./worker`、`./recovery-worker`、`./messages`、`./push-payload`、两个 worker entry | 否，由适配器组装 | 9 行，占位级 |
| `@pwa-platform/client-runtime` | `.`、`./build` | 通常否，由框架绑定包装 | 9 行，占位级 |
| `@pwa-platform/vite` | `.`、`./virtual` 类型入口 | 是，构建期入口 | 13 行，缺 API 与完整配置 |
| `@pwa-platform/entry-resilience` | `.`、`./vite`、`./client` | 可选直接使用 | 87 行，已有主体但需统一结构 |
| `@pwa-platform/vue` | `.`、`./ui`、`./update-notice.css` | 是 | 18 行，缺完整状态/API/边界 |
| `@pwa-platform/react` | `.`、`./ui`、`./update-notice.css` | 是 | 23 行，缺完整状态/API/边界 |

公开入口以各包 `package.json` 的 `exports` 为准。`browser-test-harness`、`examples-browser-e2e`、`nuxt`、`push`、`offline-write` 与 `release-tools` 为私有工作区包，不计入十包。

## 证据等级

| 等级 | 含义 | 可以支持的公开表述 |
|---|---|---|
| E1 代码实现 | 当前源码和导出中存在能力 | “已实现”，不能写“测试通过” |
| E2 自动化通过 | 固定提交、环境和用例有结果 | “自动化通过”，不能替代真机 |
| E3 真机观察 | 设备、系统、浏览器、日期和入口形态有记录 | “在该设备/场景观察通过” |
| E4 发布门禁 | 满足既定通道的版本、设备数量和必测场景 | “该发布通道通过” |

页面状态使用：通过、部分通过、未验证、不适用、未提供、计划中。只有 E4 才能写“发布通道通过”。

## 平台证据摘要

| 平台 | 最高证据 | 已证明 | 未证明或限制 |
|---|---|---|---|
| PC / Chrome 桌面 | E4 | Chrome 154/153 全仓各 228/228；Vue/React 原生安装；更新、离线恢复、单 Origin 故障；正式包独立消费 | 发布方仍须在真实业务 Origin 验证响应头、旧资源保留和回滚 |
| PC / Safari 18.6 | E3 | Vue/React 添加到程序坞、在线启动和基础交互 | 安装窗口更新、断网冷启动矩阵未完成；属于渐进兼容观察 |
| Android / Chrome 153 | E3 | Vue/React WebAPK 安装与断网冷启动；Vue 安装窗口 v1→v2；英文离线页自动恢复；入口迁移展示/跳转 | 只有一台设备；无 Chrome N；部分中文、独立 Origin 故障和 React 旧 DOM 隔离未覆盖；不满足 N/N-1 门禁 |
| iPhone / Safari，iOS 27 | E3 | Vue/React 主屏幕安装与断网冷启动；标签页两步更新；英文离线页最终自动恢复；入口迁移展示/跳转 | 安装窗口完整更新矩阵、单 Origin 故障未覆盖；断网恢复后曾短暂 `not registered`，结束应用重开才恢复 |

详细逐场景证据见 [正式版验收记录](../stable-release-qualification/verification.md)。首页只能压缩展示，不得改变上述限制。

## 能力事实

| 能力 | 当前事实 | 主要来源 |
|---|---|---|
| 稳定 manifest identity | 已发布；生产登记后不可当普通配置修改 | `CLAUDE.md`、ADR-0004、contracts |
| 安装与自定义引导 | manifest 与安装状态已发布；原生安装入口由浏览器决定，业务实现按钮 | client-runtime、Vue/React facade、验收记录 |
| 应用壳预缓存与离线兜底 | 已发布；首次在线取得资源后才可离线；默认离线页可选 | sw-runtime、Vite、ADR-0036 |
| 公共读取运行时缓存 | 已发布；仅 PwaPolicy v3 显式开启的同源公共 GET | ADR-0035、public-read-cache 规格 |
| 私有/写入/流式/未分类请求 | 默认拒绝缓存，允许规则不可覆盖 | 安全模型、contracts、core、sw-runtime |
| 用户确认更新 | 已发布；接管与页面刷新是两个动作 | client-runtime、ADR-0005、Vue/React UI |
| 主动检查更新 | 已发布；页面检查，不是 Periodic Sync | ADR-0020、client-runtime |
| 恢复 worker | 已发布；只清理当前应用命名空间，不是通用开关 | sw-runtime、恢复演练 |
| 入口恢复 | 可选正式包已发布；业务提供清单并负责真实性，平台做形状/时效/序号与展示 | entry-resilience、ADR-0033 |
| Push、离线写、Nuxt | 工作区实现但未公开分发 | 对应模块 spec、包元数据 |
| Background/Periodic Sync、Share Target、File Handlers、Launch Handler | 未提供 | 当前 contracts 与公开 exports |

## 审核中发现的事实冲突

1. 根 README 的“默认 v1 不提供公共 API 缓存”与 `0.1.0` 已交付 PwaPolicy v3 公共读取缓存的事实冲突，实施阶段必须修订。
2. 文档基线中的 package distribution 和 capability comparison 仍描述 beta 阶段，与 `0.1.0 latest` 冲突，最终交付时更新。
3. 旧能力对比规格禁止对截图中的应用项目评分、且首页只放入口；本模块已按用户新要求显式取代该限制，但仍要求逐项官方来源和“未确认”状态。
4. 十个 README 文件存在，但多数内容不足，问题是“接近占位”而不是“文件缺失”。

## 不能升级为通过的缺口

- 没有 Android N/N-1 两机证据，`desktop+android` 不通过。
- 没有 Apple 移动端发布通道定义，iPhone 只能作为渐进兼容真机观察。
- iOS 断网恢复后的注册状态短暂异常尚未定性。
- 没有系统性的 Lighthouse/性能预算或长期运行基线。
- 没有完整的 WCAG/axe 自动化门禁；现有证据以窄屏可读和部分交互为主。
- 可观测性契约存在，但 worker 侧 `activated`、`offline-fallback`、`cache-cleaned` 事件尚未接入，且仓库不提供业务 SLO。
