# 02 · 当前功能支持矩阵

这是给开发者看的一页纸，回答四个问题：**有什么、怎么开、默认会怎样、在哪验证过**。每项的完整证据（代码行号、测试断言、真机记录）见[功能证据台账](../../operations/feature-evidence-ledger.md)；最小配置和各种情况下的精确行为见[场景配置示例](05-scenario-recipes.md)。

- 发布状态：✅ 已在 npm `0.1.0` / 🧪 仅在工作区，未发布
- 验证等级：L2 自动化断言 / L3 真实桌面浏览器（目前**只有 Chrome**）/ L4 真实手机
- 手机一栏：A = Android 16 + Chrome 153；i = iPhone 16 Pro + iOS 27 Safari（记录见 `tasks/stable-release-qualification/verification.md`）

> **2026-09-28 更新**：审查修复（PR #27–#42）已随 npm `0.2.0` 发布（[发布记录](../../../tasks/package-distribution/release-0.2.0.md)）。“发布”列中的 ✅ 指 `0.1.0` 起即提供，标“✅ 0.2.0 起”的行为从 `0.2.0` 开始提供。

## 核心能力

| 能力 | 发布 | 默认 | 怎么开 | 默认会怎样 / 开了会怎样 | 桌面 | 手机 |
|---|---|---|---|---|---|---|
| manifest 生成与链接注入 | ✅ | 开 | 提供 `identity` 和 `install` | 构建时为每个 HTML 入口注入唯一的 `<link rel="manifest">` | L3 | 间接 |
| 可安装（安装提示） | ✅ | `install.enabled` 决定 | `policy.install.enabled: true`，再加安装元数据 | 浏览器给出安装事件时，页面暴露 `promptInstall()`；iOS 只能手动“添加到主屏幕” | L3（只验证事件接线） | A、i，另有 Mac Safari |
| 图标构建期校验 | 🧪 | 开 | 无需配置 | 图标缺失、类型不符、尺寸不符时构建失败 | L2 | A（它要修复的那个故障） |
| SW 注册 | ✅ | 需手动调用 | 页面调用 `register()` | 以 `identity.scope` 注册。**首次打开的页面不受 SW 控制**（平台从不 `clients.claim`），刷新后才受控 | L3 | A、i |
| 应用壳预缓存 | ✅ | 关（`resources` 为空时） | 为 `index.html`、`/assets` 添加 `asset` + `cache-first` 规则 | 安装时预缓存；断网时打开**应用壳 URL** 不白屏。`cache-first` 只是“加入预缓存”的标记，不是运行时策略 | L3 | A、i |
| 导航离线回退 | ✅ | 开（不可配置） | 无 | 断网时依次尝试：原 URL → 去掉查询串 → 同目录 `index.html` → 离线页。**没有“回退到根应用壳”这一步**，单页应用的深层路由断网会得到网络错误 | L2 | —（ADR-0034 源自真实部署故障） |
| 离线页 | ✅ | 关 | `offlineFallback: { enabled: true, path }`，加上资产规则，加上 `pwa({ offlinePage })` 或自带 HTML | 网络失败或超时时显示；**服务器返回 4xx/5xx 时不显示**；页面在线后自动探测并重试 | L3 | A、i（联网恢复通过，ADR-0041） |
| 导航网络超时 | ✅ | 关 | `networkTimeoutSeconds: 1–30` | 在 N 秒内没有响应且有可用回退时，提前显示回退页；iPhone 实测把约 60 秒白屏缩短到约 5 秒 | L3 | i |
| 默认拒绝缓存 | ✅ | 开（不可关闭） | 无 | 非 GET、跨源、`deny` 规则、未分类的请求都不进缓存；被拒绝的导航断网时显示离线页，未分类导航断网时得到网络错误 | L3（导航与非导航五类请求） | — |
| Range 请求 | ✅ | 开 | 无 | 带 `Range` 头的请求绕过预缓存，直接走网络，因此能正常返回 206 | L3 | — |
| 公共读取运行时缓存 | ✅ | 关 | 策略升级到 v3，设置 `runtimeCache.enabled: true` 和三项上限，再加 `public-data` 或 `navigation-public-dynamic` 规则 | 策略可选 `network-first`（支持超时）或 `stale-while-revalidate`；**`Vary` 只能为空或 `Accept`/`Accept-Encoding`，否则静默不写入**（`vite preview` 默认就会触发）。✅ 0.2.0 起：被拒绝时 worker 以 `console.warn` 报告原因；带 `Authorization` 的导航不再缓存；配额错误清空全部运行时缓存 | L3 | — |
| 更新检测 | ✅ | 手动 | 调用 `checkForUpdate()`，或设置 `updateCheck.intervalMs ≥ 60000` 定时检测 | 定时检测只在页面可见时运行，页面回到可见时补做一次 | L3 | A、i |
| 更新提示与接管 | ✅ | 开（`updateMode` 只能是 `"prompt"`） | 自绘 UI：读取 `updateWaiting`，确认时调用 `applyUpdate()` | 新 worker **一直等待**，直到用户确认；确认后接管，但**不刷新页面**；何时刷新由业务决定 | L3 | A、i（iPhone 安装窗口含断网已下载后接管） |
| 默认更新提示 UI | ✅ | 关 | 导入 `@pwa-platform/{vue,react}/ui` 和对应 CSS | 可选 4 个位置；文案通过 `messages` 覆盖（默认只有中文）；主题通过 `colors` 属性或 CSS 变量设置，否则跟随系统深浅色；30 分钟后再次提醒。✅ 0.2.0 起：新增 `locale: "zh-CN" \| "en"`，内置英文文案 | L3 | A、i（英文文案） |
| 多标签页 | ✅ | 开（无需配置） | 无 | 一个标签页确认后，所有同 scope 标签页的提示都会清除，各自收到 `update-applied`；页面都不会被刷新 | L3 | 桌面 Chrome 与 iPhone Safari 双标签页实测 |
| 断网与联网恢复 | ✅ | — | 无 | 平台**不提供**在线/离线状态 API；只有默认离线页自带重连探测；应用内的请求需要业务自己重试 | —（确认不提供） | — |
| 登出 | ✅ | 手动 | 调用 `logout()` | 清空离线写入队列并注销 SW，**缓存保留**；当前页面在被替换前仍受旧 SW 控制 | L3 | — |
| 恢复 worker | ✅ | 发布流程的一部分 | 事故时把构建产物中的恢复 worker 部署到**同一个 SW URL** | 删除本应用前缀下的全部缓存、离线写入库和推送订阅，然后接管页面，不拦截任何请求 | L3 + 演练 | — |
| 入口恢复页 | ✅ | 关 | 安装 `@pwa-platform/entry-resilience`，由业务下发入口清单 | 源站迁移或不可达时，引导用户**手动点击**跳转到备用源；平台不校验清单的来源 | L3 | A、i（迁移场景；单源真实故障未测） |
| 同源多应用 | ✅ | 关 | 提供 `topology` 注册表 | 根应用生成 `exclude` 规则，从不接管子应用的路径 | L3 | — |
| 构建与发布校验 | ✅ | 调用方决定 | 调用 build-verifier 的 `verifyRelease`，并做门禁覆盖检查 | 输入缺省的检查项会被跳过，**报告为空也返回 `ok`**（风险 R4）。✅ 0.2.0 起：`requiredReleaseChecks(plan)` 按拓扑给出必需检查集，直接交给覆盖检查 | L2（部分 L3） | — |

## 未发布能力（只在工作区）

| 能力 | 状态 | 证据 | 主要缺口 |
|---|---|---|---|
| 离线写入队列 `@pwa-platform/offline-write` | 私有包 | L3 | 并发 `flush` 已单飞（#30）；仍未发布，依赖服务端幂等 |
| Web Push `@pwa-platform/push` | 私有包 | L3（只用合成事件） | 没有走通真实推送服务的投递 |
| Nuxt 绑定 `@pwa-platform/nuxt` | 私有包 | L3（7 个 spec） | v3 策略开启 `runtimeCache` 时构建报错（[artifacts.ts:143](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/nuxt/src/artifacts.ts#L143)）；拓扑固定为 `standalone-origin`，不支持同源多应用（[options.ts:4](https://github.com/haigeerlab/pwa-platform/blob/eb5836e13ab1a0e5d218758f155004894cde8ebc/packages/nuxt/src/options.ts#L4)） |
| 发布 CLI `@pwa-platform/release-tools` | 私有包 | L2 | 集成测试在负载下偶发超时（风险 R7） |
| 构建期图标校验（ADR-0040） | 已合入，未发版 | L2 + A | 等待下一次发布 |

## 明确不提供的能力（有意取舍）

| 能力 | 为什么不提供 | 依据 |
|---|---|---|
| 自动更新（`autoUpdate`、主动 `skipWaiting`） | 不在用户不知情时替换正在运行的版本 | ADR-0005 |
| 单页应用通配导航回退 | 除离线页外，不返回其他路由的缓存内容 | ADR-0012 |
| 缓存私有数据、写请求、流媒体 | 平台的安全底线 | ADR-0002、ADR-0035 |
| 后台同步式的离线写入重放 | 离线写入必须显式触发、按会话绑定，不做静默重放 | ADR-0027 |
| 注入任意 SW 代码或原始 Workbox 配置 | Workbox 是实现引擎，不是公开 API | ADR-0003、CLAUDE.md |
