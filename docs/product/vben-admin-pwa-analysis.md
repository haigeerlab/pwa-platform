# vue-vben-admin PWA 实现分析与平台接入评估

> 分析对象：[vbenjs/vue-vben-admin](https://github.com/vbenjs/vue-vben-admin) `main` 分支，提交 `df014ae`（2026-09-13）。
> 平台基线：本仓库 `feat/ssr-adapters` 分支，提交 `4e1676d`。
> 方法：只读源码分析，结论均附文件位置；标注“需实测”的条目未在真实浏览器中验证。
> 更新（2026-09-18）：已补做真实接入试验，结果见[第七节](#七真实接入试验结果2026-09-18)。
> 日期：2026-09-18
> 发布状态提示（2026-09-20）：本文关于“所有包 private”的判断是当时快照；当前首批九包已发布 npm `0.1.0-beta.0`，业务生产门禁仍未完成，见 [发布记录](../../tasks/package-distribution/release-2026-09-20.md)。

## 一、结论

1. **vben 的 PWA 基本是“空壳”。** 它接入了 `vite-plugin-pwa`，但默认关闭；即使开启，也**不预缓存任何文件、没有运行时缓存、没有注册 Service Worker 的代码**。实际效果只有一份 manifest（可能带来可安装性），没有离线、没有缓存、没有 SW 驱动的更新。
2. **vben 真正有价值的是一个与 SW 无关的“新版本检测”组件**：定时 `HEAD` 请求首页，比较 `ETag`/`Last-Modified`，变化即弹窗提示刷新。这是后台类应用的刚需，值得平台参考。
3. **vben 可以接入我们的平台，技术栈完全匹配**（Vite 8、Vue 3.5、配置合并支持追加插件），接入后能拿到：安装、静态资源预缓存、离线页、受控更新、默认拒绝缓存私有接口、事故恢复 worker。这比 vben 现状强很多。
4. **但“快速接入 + PWA 全功能”目前做不到。**
   - **快速**：平台包全部是 `private`、未发布到 npm，外部项目无法直接安装；这是第一阻断项。
   - **全功能**：运行时缓存（公共 API、图片、字体）、Push、后台同步、角标、分享目标、manifest 高级字段均未实现，分别在 v1.1 / v2 路线图或尚未规划。

## 二、PWA 全功能清单（对比基准）

| 类别 | 能力 | 说明 |
|---|---|---|
| 可安装 | Web App Manifest | `id`、`name`、`icons`、`start_url`、`scope`、`display`、`theme_color` 等基础字段 |
| 可安装 | manifest 增强字段 | `shortcuts`、`screenshots`、`display_override`、`share_target`、`file_handlers`、`protocol_handlers` |
| 可安装 | 安装引导 | 拦截 `beforeinstallprompt`，由应用决定何时提示安装 |
| 生命周期 | SW 注册 | 注册时机、作用域、子路径部署 |
| 生命周期 | 更新检测与提示 | 新 worker 等待、提示用户、`skipWaiting` 后切换 |
| 缓存 | 预缓存 | 构建产物带版本、激活时清理旧条目、缓存命名空间隔离 |
| 缓存 | 运行时缓存 | 按资源类别选择 cache-first / network-first / SWR，配额与过期控制 |
| 缓存 | 安全边界 | 私有数据、写操作、流媒体、未分类请求默认不缓存 |
| 离线 | 离线导航降级 | 断网时返回应用外壳或离线页，SPA 路由可用 |
| 离线 | 离线写入 | Background Sync / 写入队列，需业务定义幂等 |
| 互动 | Push 通知 | 订阅、SW 内展示通知、点击跳转 |
| 互动 | Periodic Background Sync | 周期性后台刷新 |
| 系统集成 | Badging、分享目标、文件处理、协议处理 | 与操作系统的深度集成 |
| 运维 | 登出清理 | 登出时清理与会话相关的缓存 |
| 运维 | 紧急下线 / 回滚 | 发布恢复 worker，注销或清空缓存 |
| 运维 | 可观测性 | 注册、更新、离线降级等事件上报 |

## 三、vben 实际实现了什么

### 3.1 接入方式

- 插件：`vite-plugin-pwa ^1.3.0`（`pnpm-workspace.yaml:196`），集中定义在 `internal/vite-config/src/plugins/index.ts:174-188`。
- 默认配置：`injectRegister: false`、`workbox.globPatterns: []`，manifest 默认 `display: 'standalone'`、`start_url: '/'`、`theme_color: '#ffffff'`；名称、描述和图标来自 `internal/vite-config/src/options.ts:7-26`，图标是 unpkg 上的外链。
- 开关：环境变量 `VITE_PWA`（`internal/vite-config/src/utils/env.ts:87,105`）。所有应用的 `.env.production` 都是 `VITE_PWA=false`；只有 CI 部署脚本 `.github/workflows/deploy.yml` 用 `sed` 为 playground、web-antd、web-ele、web-naive 改成 `true`（第 23、78、109、140 行）。
- 路由：生产环境 `VITE_ROUTER_HISTORY=hash`（如 `apps/web-antd/.env.production:13`）。
- 文档站（VitePress）另有一套独立的 PWA 配置（`docs/.vitepress/config/shared.mts:157-186`，`registerType: 'autoUpdate'`，真实的 `globPatterns`），和后台应用无关。

### 3.2 能力对照

| 能力 | vben 状态 | 依据 |
|---|---|---|
| Manifest 基础字段 | **部分**：有 name、icons、display、start_url、theme_color；无 `id`、`scope`；`start_url` 写死为 `/`，不跟随 `VITE_BASE` | `plugins/index.ts:182-187`、`options.ts:8-25` |
| Manifest 增强字段 | 无 | 全仓搜索无结果 |
| 安装引导 | 无 | 搜索 `beforeinstallprompt` 无结果 |
| SW 注册 | **无**：`injectRegister: false`，且全仓无 `serviceWorker.register` / `virtual:pwa-register`；按插件源码，此时只注入 manifest 链接，不注入注册脚本 | `plugins/index.ts:177`；vite-plugin-pwa `src/html.ts` |
| SW 更新提示 | 无 | 搜索 `useRegisterSW`、`needRefresh` 无结果 |
| 预缓存 | **无**：`globPatterns: []`，应用侧从不覆盖 | `plugins/index.ts:178-180` |
| 运行时缓存 | 无 | 无 `runtimeCaching` |
| 私有接口保护 | 无显式规则（因为本来什么都不缓存） | 无 `NetworkOnly` / denylist |
| 离线导航降级 | 无：`views/_core/fallback/offline.vue` 只是演示用的错误页路由，不由 SW 驱动 | `playground/src/router/routes/modules/demos.ts:363-368` |
| Push / Sync / Badging / 分享 | 无 | 搜索无结果（“notification”命中的都是站内消息组件） |
| 登出清理 / 紧急下线 | 无 | — |
| **新版本检测（非 SW）** | **有，默认开启** | 见 3.3 |

### 3.3 值得关注的“新版本检测”组件

- 位置：`packages/effects/layouts/src/widgets/check-updates/check-updates.vue`，在 `packages/effects/layouts/src/basic/layout.vue:481-483` 挂载。
- 机制：每隔 `checkUpdatesInterval` 分钟（默认 1），用 `HEAD` + `cache: 'no-cache'` 请求首页，比较 `ETag` 或 `Last-Modified`；页面切回前台时立即检查；`localhost` 跳过。发现变化弹出不可关闭的对话框，确认后 `location.reload()`。
- 开关：偏好设置 `enableCheckUpdates: true`（`packages/@core/preferences/src/config.ts:22`），用户可在偏好面板关闭。

## 四、对平台值得学习与参考的地方

| 参考点 | vben 的做法 | 对平台的启示 |
|---|---|---|
| 与 SW 无关的版本探测 | HEAD 请求比对 ETag，前台可见时检查 | 平台 `updateMode: "prompt"` 依赖浏览器自行检查新 worker，主要发生在导航到作用域内页面时；单页后台长时间不刷新就发现不了新版本。可以在 client-runtime 提供可选的“主动检查更新”（调用 `registration.update()`，按间隔并在 `visibilitychange` 时触发），长时间不刷新页面的后台应用尤其需要 |
| 更新提示 UI 归应用 | 对话框、文案、间隔由布局组件和偏好设置控制 | 与 ADR-0013“状态与方法归适配器，界面归应用”一致；可在示例或文档里给出一个后台布局风格的提示组件参考 |
| 用户可关闭 | 偏好面板开关 | 平台不必提供，但文档应说明应用可按用户偏好决定是否提示 |
| 环境变量开关 | `VITE_PWA` 控制是否启用插件 | 平台可考虑支持“构建时关闭”的官方方式（如 `pwa({ enabled })`），便于灰度与排障；关闭时需要能发布恢复 worker，不能简单删掉 |

**需要避开的坑（反面参考）**

- **半开启**：生成了 `sw.js`，却没有注册也不预缓存，团队会误以为“已经有 PWA”。平台的 build-verifier 和“注册必须由应用显式调用”在一定程度上避免了这个问题，建议在接入文档里明确“未调用 `register()` 即无 PWA”。
- **`start_url` 不跟随部署路径**：子路径部署时会装出错误入口。平台由 `PwaIdentity` 统一推导，已规避。
- **图标外链到第三方 CDN**：安装依赖外部可用性。平台要求图标随构建产物发布，已规避。
- **靠 CI 用 `sed` 改环境变量开 PWA**：开关不在版本库里，行为难以追溯。平台身份与策略写在 TS 代码中，更好。

## 五、vben 能否接入我们的平台

### 5.1 匹配度

| 条件 | 平台要求 | vben 现状 | 结论 |
|---|---|---|---|
| Vite 版本 | `^8.0.0`（`packages/vite/package.json:24`） | `^8.2.2` | 满足 |
| Vue 版本 | `^3.4.0` | `^3.5.40` | 满足 |
| 追加插件 | 需把 `pwa()` 加入 Vite 插件 | `defineConfig` 用 `mergeConfig` 合并应用的 `vite` 字段，插件会拼接（`internal/vite-config/src/config/application.ts:93-97`） | 满足 |
| `base` | 同源绝对路径，以 `/` 开头结尾（`spec/vite-adapter.md:169`） | `VITE_BASE=/` | 满足；子路径部署须写成 `/admin/` 形式 |
| 部署拓扑 | 只支持单应用 `standalone-origin` | 每个应用独立部署 | 满足；多个 vben 应用共用一个域名的子路径需等 v2 topology |
| 路由模式 | 导航网络优先，断网时依次尝试同 URL、`index.html`、离线页 | hash 路由，所有导航都是首页文档 | **已实测可用**（第七节） |
| 与现有版本检测共存 | 平台 SW 不接手非 GET 请求；导航网络优先 | check-updates 使用 HEAD，确认后 `reload()` | 不冲突：HEAD 直达网络，刷新拿到新首页；但会出现“页面已刷新、新 worker 仍在等待”的双轨状态，需在应用层统一提示 |
| 包获取 | 所有包 `private: true`、版本 `0.0.0`、未发布 | 外部独立仓库 | **阻断**：需先发布，或以 git 子模块 / 私有仓库形式引入 |

### 5.2 接入步骤（按平台现有能力）

1. 关闭原插件：各应用 `.env.production` 保持 `VITE_PWA=false`，并删除 CI 中对 `VITE_PWA` 的 `sed`。
2. 安装 `@pwa-platform/vite` 与 `@pwa-platform/vue`（前提：平台已提供可安装的包）。
3. 在应用 `vite.config.ts` 的 `vite.plugins` 中加入 `pwa({ identity, policy, install, topology: { kind: "standalone-origin" } })`：
   - `identity.scope` 与 `VITE_BASE` 一致；
   - `policy.resources` 为 vben 的产物目录声明 `asset` 规则（vben 把产物输出到 `js/`、`jse/`、`css/` 等按扩展名划分的目录，见 `application.ts` 中的 `assetFileNames`），并把 `/api` 等接口前缀显式声明为 `session-data` / `mutation`；
   - `offlineFallback` 指向应用自备的离线页。
4. 图标放进 `public/`，不再使用 unpkg 外链。
5. 在 `bootstrap.ts` 中 `app.use(createPwa({ config }))`，在布局中调用 `usePwa().register()`。
6. 把 `applyUpdate()` 和 check-updates 的对话框合并成一个“有新版本”提示；登出流程调用 `logout()`。
7. 用 `vite build` + `vite preview` 验证（`vite dev` 下没有 worker），并在 Chrome 桌面端和 Chrome Android 上验收。

### 5.3 接入后能获得的能力

| 能力 | 平台状态 | 接入后 vben 相对现状 |
|---|---|---|
| Manifest 基础字段 + 安装引导 | 已实现（`promptInstall()`） | 新增 `id`/`scope`、正确的 `start_url`、安装按钮 |
| SW 注册与受控更新 | 已实现（仅 `prompt` 模式，`applyUpdate()` 需用户确认） | 从无到有 |
| 静态资源预缓存 | 已实现（带版本、清理旧条目、命名空间隔离） | 从无到有，二次打开不再依赖网络下载静态资源 |
| 离线导航降级 | 已实现（网络优先 + 离线页） | 断网不再白屏 |
| 私有数据默认拒绝缓存 | 已实现（未分类与私有请求不接手） | 安全边界明确 |
| 紧急恢复 worker | 已实现 | 从无到有 |
| 登出清理 | 已实现，但当前只注销 worker（v1 不缓存私有数据，故无缓存可清） | 接口就位 |
| 生命周期事件 | 部分（页面侧 4 个事件；worker 侧 3 个事件已定义未发出） | 可接入埋点 |

### 5.4 “全功能”的缺口

| 能力 | 平台状态 | 对 vben 的影响 |
|---|---|---|
| 运行时缓存（公共 API、图片、字体） | 类型已接受 `cache-first` 等策略，但 worker **不执行**（`spec/sw-runtime.md:38`）；路线图 v1.1 | 字典、菜单等公共只读数据无法离线 |
| manifest 增强字段 | 未实现 | 无快捷方式、截图、分享目标 |
| Push 通知 | 未实现，路线图 v2 engagement | 后台的工单、审批提醒无法推送 |
| 后台同步 / 离线写入 | 未实现，路线图 v3 | 表单无法离线提交 |
| 周期同步、Badging | 未规划 | 无未读数角标 |
| 自动更新模式 | 只有 `prompt` | 无法静默升级 |
| 主动检查更新 | 未提供 | 长时间不刷新的后台可能长期停在旧版本 |
| 同源多应用子路径 | 未实现，路线图 v2 topology | 多个 vben 应用挂同一域名子路径时无法接入 |
| npm 发布 | 未发布 | 外部项目无法“快速”安装 |

## 六、建议

1. **把 vben 作为第二个接入样本，但先发布平台包。** 没有可安装的包，“快速接入”无从谈起；建议定义最小发布形式（私有 registry 或 git tag）。
2. **（已完成，[ADR-0020](../adr/0020-client-update-check.md)）在 client-runtime 增加“主动检查更新”的能力。** 这是 vben 实践证明后台应用真正需要的；实现上调用 `registration.update()`，不改变 `prompt` 更新语义，不涉及身份与缓存命名空间。需要写规格。
3. **（已完成，[迁移指南](../guides/migrate-from-vite-plugin-pwa.md)）接入文档补一节“从 vite-plugin-pwa 迁移”。** 覆盖：关闭原插件、产物目录对应的 `asset` 规则、hash 路由、与已有版本检测组件的合并。
4. **（已完成，见第七节）用 vben 做一次真实浏览器验收，确认三项“需实测”：** hash 路由的离线降级；vben 产物体积下预缓存安装的耗时和成功率（任一条目失败即安装失败）；check-updates 与 `updateWaiting` 同时出现时的交互。
5. **“全功能”按路线图推进，对外说明分期。** 当前能承诺的是“安全的 PWA 基线”；公共数据缓存要到 v1.1，Push 要到 v2。

## 七、真实接入试验结果（2026-09-18）

在仓库外的临时目录中，把 vben（`df014ae`）的 `apps/web-antd` 接入平台 `main`（`25d927d`）构建出的 `@pwa-platform/vite` 与 `@pwa-platform/vue`，用本机 Google Chrome 153.0.8010.50 验证。vben 依赖按其 lockfile 安装、不执行安装脚本，只手动运行了构建所需的 `stub`。平台代码未做任何修改。

| 场景 | 结果 | 要点 |
|---|---|---|
| A. 按源码现状接入，断网启动 | **失败** | 根目录的 `_app-config-<版本>-<哈希>.js` 没有被预缓存，断网时加载失败，页面一直停在启动动画 |
| B. 按迁移指南把配置文件移到 `config/` 并加 `/config` 规则 | **通过** | 断网时首页与 hash 路由（`#/analytics`）都能完整渲染登录页；hash 路由的离线降级由此确认 |
| C. 更新 | **通过** | 不刷新页面：手动 `checkForUpdate()` 与 60 秒自动检查都让 `updateWaiting` 变为真；`applyUpdate()` 后新 worker 接管，页面未被重新加载 |
| D. 私有数据 | **通过** | 只有一个平台缓存，里面全是静态资源；跨源接口与同源 `/api` 请求都没有被 worker 接管 |
| E. 可安装性 | **发现缺口** | `@pwa-platform/vite` 不会向 `index.html` 注入 `<link rel="manifest">`，要由应用手写（示例应用也是手写的）；补上之后 manifest 与图标满足安装条件 |

- **预缓存规模**：215 个条目，约 3.77 MB；在本机回环地址上，首个 worker 激活用时约 1.3–3.4 秒。真实网络下的耗时与成功率仍需在目标环境中测量。
- **测试方法上的坑**：带指纹的资源按基线返回 `immutable`，浏览器的 HTTP 缓存会在断网测试中“救活”没有被预缓存的文件，掩盖场景 A 的缺陷。离线验证前必须先清空 HTTP 缓存，而不仅仅是 Cache Storage。
- **仍未验证**：真实的安装流程（无头 Chrome 不会弹出安装提示。2026-09-22 补注：真正原因是 Playwright 默认创建的是无痕上下文，Chrome 报告 `in-incognito`，与是否无头无关，见 `tasks/platform-governance/plan.md` 的 D3）、迁移时旧 vite-plugin-pwa 缓存的残留（vben 的旧 worker 从未注册过，本次无从验证）、Chrome Android。

由此对平台的两点输入，待项目所有者决定是否立项：

1. **Vite 插件是否自动注入 manifest 链接**：现在完全靠应用手写，漏写就永远不可安装，而且构建不会报错。（已实现，见 [ADR-0022](../adr/0022-vite-injects-manifest-link.md)。）
2. **是否支持“根目录下带哈希的单个文件”这类产物**：vben 的绕法要求接入方修改自己的构建插件。
