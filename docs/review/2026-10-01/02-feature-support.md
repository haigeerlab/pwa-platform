# 02 · 当前功能支持矩阵

`0.2.5` 指十个已公开包；“工作区”指 `9662e6d`，消费者不能用 npm `0.2.5` 启用。配置字段的完整约束见[字段参考](../../../website/guide/configuration.md#field-reference)；逐功能证据见[03](03-feature-evidence.md)。

| 能力 | 发布/状态 | 默认与开启条件 | 开启后的准确行为 |
| --- | --- | --- | --- |
| manifest、安装元数据、图标验证 | 0.2.5 | `policy.install.enabled` + `install` 元数据；图标校验强制 | 构建生成 manifest 并检查主图标；浏览器是否出现安装入口由浏览器决定 |
| Vite manifest 链接注入 | 0.2.5 | 构建时自动；已有链接须唯一且一致 | 每个 HTML 入口有一个目标链接；不表示已安装 |
| Service Worker 注册 | 0.2.5 | 页面显式 `register()`；生产构建 | 首次打开页面通常未受控，重载后受控；`vite dev` 不生成 worker |
| 应用壳预缓存 | 0.2.5 | `resources` 的 `asset/cache-first` 规则 | 匹配的真实构建产物进入预缓存；`cache-first` 此处是预缓存准入标记 |
| 业务资源默认无缓存 | 0.2.5 | 无需配置 | 未分类、私有、跨源、非 GET 等不进平台缓存；**不等于浏览器 HTTP 缓存被禁用** |
| 静态公共导航 | 0.2.5 | `navigation-public-static/network-first` | 网络优先；失败只查请求路径、去查询串、该路径 `index.html`，然后可选离线页；成功响应不写运行时缓存 |
| 离线页 | 0.2.5 | `offlineFallback.enabled` + 文件或 `offlinePage:{}` + 导航规则 | 受控且匹配规则的导航网络失败/超时才显示；收到 4xx/5xx 响应不替换；未分类导航不回退 |
| 导航网络超时 | 0.2.5 | `networkTimeoutSeconds` 1–30 | 只作用于 worker 处理的导航和 `network-first` 公共读取；默认无限定超时 |
| 公共读取运行时缓存 | 0.2.5 | v3 + `runtimeCache.enabled:true` + 公共规则和限额 | 同源公共 GET 的 `network-first` 或 SWR；响应还须通过状态、MIME、Cache-Control、Vary、体积等准入 |
| 缓存来源事件 | 0.2.5 | 公共缓存启用后 | 页面可收到 `served-from-cache`，原因含网络失败、超时、SWR；不表示所有 fetch 有事件 |
| Range/Authorization 防护 | 0.2.5 | 结构性 | 非导航 Range 请求绕过预缓存/公共数据运行时缓存；授权公共读取不进运行时缓存；其余准入见安全模型 |
| 更新检测 | 0.2.5 | `checkForUpdate()` 手动；`updateCheck.intervalMs` 可选 | 定时检查默认关；浏览器自身可能仍检查；检查到新版本不自动接管 |
| 更新接管 | 0.2.5 | 仅 `updateMode:"prompt"`；用户调用 `applyUpdate()` | 等待新 worker 控制，旧页面不自动刷新；无强制自动更新模式 |
| Vue/React 默认提示 UI | 0.2.5 | 显式 import 样式并挂载 `PwaUpdateNotice` | 中文/英文内置、文案/颜色可覆盖；默认未挂载时仍可自绘 UI |
| 多标签页协调 | 0.2.5 | 不另配；各标签须注册/订阅 | 一个标签确认接管后，同 scope 受控标签各自收到 `controllerchange` 并更新状态；页面数据不自动同步 |
| 离线页联网恢复 | 0.2.5 | 只有平台离线页启用时 | `online` 事件和 `HEAD` 探针探测恢复后重载；业务页面不自动重试 API/刷新 |
| 恢复 worker | 0.2.5 | 构建生成，事故时按原 worker URL 部署 | 清理本应用前缀缓存等状态后退回网络；不能在旧 Origin 不可达时凭空加载 |
| 入口恢复页 | 0.2.5 | `entry-resilience` 插件、预缓存页面、业务清单与显式调用 | 有效的 `migrating`/`incident` 清单可直接展示；`normal` 清单在主入口不可达且备用入口可达时展示；都须用户确认后才跨 Origin 导航，不迁移登录态/缓存 |
| 离线/恢复/提示 UI 语言与主题 | 0.2.5 | 各界面单独配置 | 离线与恢复页构建时选 `zh-CN/en`；提示运行时选；主题 API/样式各不相同 |
| 登出清理 | 0.2.5 | 页面显式 `logout()` | 清理 worker 侧离线写/公共缓存握手并注销；应用其他存储仍由业务处理 |
| 同源多 PWA | 0.2.5 | `shared-origin` 注册表及发布顺序 | 根 worker 排除子路径；仍需逐应用身份、缓存和部署核对 |
| 构建/发布验证 | 0.2.5 | 发布系统显式调用 `verifyRelease` 和覆盖判定 | 校验产物、身份、响应头、旧资产留存；纯函数不采集网络，也不替外部编排器做发布决定 |
| 可移植多 Origin 构建 | 工作区，未发布 | `deployment:{kind:"portable"}`、v3 策略、无 `origin` 身份 | v4 计划；本地双源/同源子应用测试，专用 Pages [双真实 HTTPS 源 v1/v2 演练](a6-https-drill-result.md)通过；业务宿主与固定→portable 迁移未验 |
| worker 主脚本 MIME 门禁 | 工作区，未发布 | 发布系统提供 `workerMimeObserved`/逐源观测并要求覆盖 | 错误/缺失 JavaScript MIME 阻断；**省略观测时 `verifyRelease` 保持旧兼容行为** |
| Nuxt 适配 | 工作区私有 | 独立 Nuxt 包 | 有浏览器测试，包括部分真机；不可按公开包接入 |
| Push | 工作区私有 | Push 包与浏览器支持 | Chrome 有真实 FCM 套件；iPhone Safari 标签页不提供 PushManager，主屏幕形态未验 |
| 离线写队列 | 工作区私有 | v2/v3 显式目标、限额与 `flush` | 会话绑定、非静默后台重放；服务端必须保证幂等 |

## 特别容易误读的五点

1. “默认无缓存”针对平台的业务缓存：已声明 `asset` 仍可预缓存，浏览器 HTTP 缓存由响应头决定。
2. `network-first` 导航没有“成功就缓存页面”的承诺。只有显式 v3 `navigation-public-dynamic` 且打开 `runtimeCache` 才是运行时页面缓存。
3. 应用壳缓存只保证预缓存的 URL 可离线打开；history 路由深链没有根 `index.html` 通配回退，可能显示离线页或浏览器错误页。
4. 离线页解决**请求失败/超时**，不自动把 HTTP 500 改为离线页；恢复页解决**入口源故障/迁移**，恢复 worker 解决**同源 SW 事故**。
5. “L4 真机验证”须读具体设备、浏览器、场景和日期；它不覆盖所有形态，也不是业务站点上线通过。
