# ADR-0012：平台 worker 的运行时配置与独立的恢复 worker

## 状态

已接受（2026-09-16）。落实 [ADR-0005](0005-update-prompt-and-recovery-worker.md) 的提示更新与恢复路径，沿用 [ADR-0011](0011-platform-injects-compiled-precache-manifest.md) 的注入方式。

2026-09-17 增补两处离线导航回退（见决策末条），由 [ssr-adapters](../../spec/ssr-adapters.md) 检查点 A 决定；原第三、四条决策中被修订的部分以删除线保留。

## 背景

[ADR-0011](0011-platform-injects-compiled-precache-manifest.md) 规定预缓存清单由平台在打包之后注入 worker，但平台 worker 在运行期还需要计划里的其他字段：缓存名、请求拒绝基线、路径规则、离线降级页与更新模式。清单之外这些字段怎么到达 worker，当时留给本模块决定。

[ADR-0005](0005-update-prompt-and-recovery-worker.md) 要求默认提示更新，并维护一个只清理平台缓存、不拦截请求的恢复 worker。它规定了行为，没有规定产物形态，也没有规定页面确认更新后 worker 侧如何响应；更新提示的界面归 client-runtime。

[V1 验收矩阵](../architecture/v1-acceptance-matrix.md)还要求断网重开应用壳不白屏，同时除离线降级页外不得返回其他路由的缓存内容。而编译出的预缓存条目是构建文件的 URL（如 `/app/index.html`），应用壳 URL 却是目录形式的 `/app/`。

## 决策

- **运行时配置在构建期生成并注入。** `@pwa-platform/sw-runtime` 的构建期入口从已校验的 `PwaPlan` 生成一份精简配置（scope、预缓存缓存名、拒绝基线、路径规则的前缀与动作、离线降级、更新模式），注入打包产物中的 `self.__PWA_WORKER_CONFIG`，规则与清单注入一致：打包后注入，注入点必须原样保留，恰好出现一次。不注入完整计划，也不在运行期请求计划文件。恢复 worker 的配置只有应用缓存前缀。
- **恢复 worker 是独立入口与独立产物。** 它只注册 `install` 与 `activate`，不导入 Workbox，不注册 `fetch`，由部署流程发布到同一 `serviceWorkerUrl`（[恢复演练](../operations/recovery-drill.md)第 2 步）。激活时先删除以应用缓存前缀开头的全部缓存，再接管已打开的客户端。
- **跳过等待由页面确认触发。** sw-runtime 导出常量 `{ type: "pwa:skip-waiting" }`；平台 worker 只在收到该消息、且来源是同源窗口客户端时调用 `skipWaiting`。contracts 不改动，提示界面与事件传输仍归 client-runtime。
- **离线导航的回退顺序固定为三步**：请求 URL 本身、~~以 `/` 结尾时的~~同一路由的 `index.html`（2026-09-17 起不论是否以 `/` 结尾）、离线降级页；都没有命中时返回网络错误。除降级页外不返回其他路由的缓存内容。
- **拒绝与未分类的请求，worker 一律不接手**，即不调用 `respondWith`：非 `GET`、跨源、命中 `deny` 规则、未匹配任何规则的请求，在线与断网的表现都与没有 worker 时相同。（2026-09-17 修订：命中 `deny` 规则的**导航**在有离线降级页时改由 worker 接手，见决策末条；其余不变。）
- **预缓存的成员判断用注入的清单。** `respondWith` 必须在事件派发时同步决定，而缓存是否命中是异步的；因此以清单成员关系（路径加查询串精确相同）作判断，语义仍是精确匹配。清单内但缓存缺失时回退网络。

- **两处离线导航回退修订（2026-09-17）。** 起因是 ssr-adapters 在 Nuxt 4.5 上的实测（其计划的 T1 实施记录）：
  - **不带尾斜杠的导航也尝试同一路由的 `index.html`。** 预渲染框架写出 `about/index.html`，链接却是 `/about`（Nuxt 默认如此），静态主机对两种写法返回同一个文件。原规则只认带斜杠的写法，离线打开 `/app/about` 只能得到降级页。候选仍只有这个路由自己的文件，查询串仍是键的一部分，不引入任何其他路由的内容。
  - **命中 `deny` 规则的导航，网络失败时回退到离线降级页。** 原规则下，私有页（如账户页）断网时显示浏览器的网络错误页，与"请求时渲染的页面离线显示离线页"的决定不一致。现在 worker 接手这类导航：网络有任何响应时原样返回；只有网络请求失败时，才以预缓存的降级页应答。**隐私边界不变**：这条路径不读、不写该路径的任何缓存，唯一可能读取的缓存条目是降级页本身；即使预缓存里意外存在该路径下的文件，也不会用它应答（单元测试钉住）。没有启用降级页、或降级页不在清单里时，保持原来的不接手。
  - **不变的部分**：非导航的拒绝类请求、未匹配任何规则的请求（包括导航）、非 `GET`、跨源请求，仍然一律不接手。
  - **构建期入口 `.` 新增导出 `createPathMatcher`**（ssr-adapters 任务 6，项目所有者批准）。`@pwa-platform/nuxt` 在构建期检查"预渲染 HTML 是否落在拒绝规则下"，必须与 worker 运行时的匹配结论一致；直接复用 worker 自己的匹配器，而不是再写第三份实现。匹配器不导入任何模块，行为不变。

## 影响

- vite-adapter 打包两个 worker 入口脚本，并按顺序调用两处注入：先注入清单，再注入配置；打包不得改写或压缩两个注入点。
- client-runtime 使用 sw-runtime 导出的消息常量发送更新确认，并继续负责提示界面与生命周期事件的传输；worker 侧只记录触发点。
- 宿主需要让应用壳 `index.html` 进入预缓存（由资源规则归为 `asset`），否则断网重开应用壳无法命中。
- 运行时缓存仍不在本模块范围内（能力图：运行时缓存留待后续能力）。路径规则中的缓存策略动作，平台 worker 暂不执行。
- 拒绝基线中针对响应的三项（`no-store`、`opaque-response`、`redirect`）约束的是运行时缓存的写入。安装阶段写预缓存由引擎经 Workbox 下载，本模块不检查，靠构建产物与部署响应头保证，记为已知限制（[ADR-0011](0011-platform-injects-compiled-precache-manifest.md) 的同类限制）。
- 配置格式、注入点与确认消息一旦被 vite-adapter 与 client-runtime 依赖，改动就会跨模块。改变它们需要新的 ADR。
- **2026-09-17 增补的影响：**
  - 使用平台 worker 的静态应用同样受影响：不带斜杠的子页面离线可用；拒绝类导航断网时显示降级页，而不再是浏览器错误页。
  - 拒绝类导航现在经过 worker 的网络请求。在线时响应原样返回，但它不再是"与没有 worker 完全相同"：例如开发者工具会显示该响应来自 service worker。
  - **对未来部署拓扑的约束**：[部署拓扑](../architecture/deployment-topologies.md)要求根 worker 不得为子路径返回自己的离线降级页。v1 只支持独立源拓扑，不受影响；将来实现根路径与子路径共存时，子路径排除**不得**建模为普通的 `deny` 规则，或者必须让这类排除不走降级页，否则会违反该约束。
- **2026-09-18 增补：`exclude` 动作（[ADR-0019](0019-shared-origin-registry-and-exclude.md)）。** 上一条中"对未来部署拓扑的约束"由新的路径规则动作 `exclude` 落实，而不是复用 `deny`：
  - 命中的第一条规则为 `exclude` 时，平台 worker 不调用 `respondWith`，透传原因为 `excluded`；导航与非导航、在线与断网一律如此，**永不回退离线降级页**。这一判断排在 `deny` 之前。
  - `exclude` 只出现在同源拓扑根应用的计划中，每个子应用 scope 一条，排在所有规则之前（contracts 的计划不变式钉住）。独立源计划不含 `exclude`，行为不变。
  - 平台 v1 没有运行时缓存，所以对不在预缓存中的非导航请求，`exclude` 与允许规则、无规则的结果相同（都透传）；它的可观察区别只在导航与离线回退上。根应用对子应用子资源的保护来自编译期"子 scope 内的文件不进根应用预缓存"。
- **2026-09-18 增补：平台 worker 的 Push 处理（[ADR-0021](0021-push-handling-in-the-platform-worker.md)）。** 平台 worker 的固定监听集合由 `install`、`activate`、`fetch`、`message` 四个扩为再加 `push` 与 `notificationclick` 两个；两个新监听不读写缓存，也不改变 `fetch` 的判断表或配置格式。恢复 worker 的激活步骤由"删除本应用缓存，再接管客户端"修订为"删除本应用缓存、取消本注册的推送订阅（失败不阻断）、再接管客户端"。恢复 worker 仍只注册 `install` 与 `activate`，不处理 Push。其余结论不变。
- 规格见 [spec/sw-runtime.md](../../spec/sw-runtime.md)，依赖边界见[包边界](../architecture/package-boundaries.md)。

## 增补：v3 且启用时进入运行时缓存判断（2026-09-24，[ADR-0035](0035-explicit-public-read-runtime-cache.md)）

上文"拒绝与未分类的请求，worker 一律不接手"与请求判断表中"平台没有运行时缓存，未预缓存的允许请求透传"的结论，只对 v1、v2 策略以及 v3 且 `runtimeCache.enabled: false` 成立。v3 且 `runtimeCache.enabled: true` 时，命中可执行规则（`public-data` 或 `navigation-public-dynamic`）的请求，在拒绝基线 → `exclude` / `deny` → 预缓存 → `Range` 透传判断之后，才进入运行时缓存判断；带 `Authorization` 请求头的请求透传。详见 [public-read-cache 规格](../../spec/public-read-cache.md)"请求判断"一节。平台 worker 的固定监听集合不变，仍是 `install`、`activate`、`fetch`、`message`、`push`、`notificationclick` 六个。

恢复 worker 的删除范围在"本应用的全部缓存与离线写数据库"之外，增加对 `workbox-expiration` 库中本应用前缀记录的删除（尽力而为，失败不阻断接管）；它删除的缓存已经覆盖新增的 `runtime-pages`、`runtime-data` 两个 kind，不需要改动删除逻辑本身。

## 增补：导航的网络超时（2026-09-24，[ADR-0038](0038-network-timeout.md)）

worker 配置新增可选字段 `networkTimeoutSeconds`，只在计划中存在时写入。设置了它时，导航判断在"网络响应"与"网络失败"之外增加一种使用回退的条件：N 秒内没有收到响应，且回退列表中有可用项。回退列表与顺序不变；没有可用回退时继续等网络。未设置时导航判断不变。
