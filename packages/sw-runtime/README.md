# @pwa-platform/sw-runtime

PWA Platform 的 Service Worker 运行时与恢复 worker。它把编译后的 `PwaPlan` 落成请求路由、预缓存、离线回退、公共读取缓存、更新接管和本应用数据清理行为。

## 谁会使用

业务应用通常不直接注册本包的 worker entry。`@pwa-platform/vite` 会生成、注入并发布正确的 worker 文件，Vue／React 包负责页面生命周期。只有开发构建适配器、worker 集成或发布恢复工具时才直接依赖本包。

```sh
npm install @pwa-platform/sw-runtime
```

要求 Node.js 22 或更高版本。

## 公开入口

| 入口 | 环境 | 作用 |
| --- | --- | --- |
| `@pwa-platform/sw-runtime` | Node／构建期 | 从计划创建平台／恢复配置，并注入 worker 源码；也导出路径匹配器 |
| `@pwa-platform/sw-runtime/worker` | Service Worker | `registerPlatformWorker()` 与请求判定类型 |
| `@pwa-platform/sw-runtime/recovery-worker` | Service Worker | `registerRecoveryWorker()`，只清理本应用命名空间并接管客户端 |
| `@pwa-platform/sw-runtime/messages` | 页面与 worker | 更新确认、离线写和运行时缓存信号的消息类型与守卫 |
| `@pwa-platform/sw-runtime/push-payload` | 环境中立 | Push payload 大小、版本、形状检查；公开 Push 产品能力仍未交付 |
| `./platform-worker-entry` | 构建适配器 | 平台 worker 模板入口，不供页面直接 import |
| `./recovery-worker-entry` | 构建适配器 | 恢复 worker 模板入口，不供页面直接 import |

## 平台 worker 行为

`registerPlatformWorker()` 会：

- 安装计划中的精确预缓存条目并清理过时预缓存；
- 对导航执行网络优先，并在网络失败或配置的超时后使用已声明离线页；
- 仅对 PwaPolicy v3 明确允许的同源公共 GET 使用运行时缓存；
- 对非 GET、跨 Origin、`no-store`、opaque、重定向、WebSocket 与未分类请求保持基础拒绝；
- 在页面发送 `pwa:skip-waiting` 后才跳过等待；
- 向页面发送“从运行时缓存提供”的结构化信号；
- 对工作区离线写扩展使用显式消息协议，不自动拦截业务写请求。

它不会把所有 API 自动缓存，也不会自动重放任意 POST。

## 恢复 worker 行为

`registerRecoveryWorker()` 是事故／演练产物，不是日常开关。它只注册 `install` 和 `activate`：

1. 立即接管；
2. 删除以当前应用前缀命名的 Cache Storage 条目；
3. 清理对应 Workbox expiration 记录和 identity 派生的离线写数据库；
4. 尝试取消当前 registration 的 Push subscription；
5. 不注册 fetch、push 或 notification click 处理器，让请求回到网络。

它不会删除其他应用的缓存，也不会跨 Origin 清理数据。发布方必须先生成并演练恢复产物，再在事故中把它部署到原 worker URL。

## 构建期 API

```ts
import {
  createPlatformWorkerConfig,
  createRecoveryWorkerConfig,
  injectWorkerConfig,
} from "@pwa-platform/sw-runtime";

const platformConfig = createPlatformWorkerConfig(plan);
const worker = injectWorkerConfig(workerTemplate, platformConfig);
```

`createPathMatcher()` 可让构建适配器按与 worker 相同的完整路径段语义匹配规则。

## 消息与 Push payload

`SKIP_WAITING_MESSAGE` 是页面确认更新时发送的唯一接管消息。`isSkipWaitingMessage()`、`isOfflineWriteMessage()`、`isRuntimeCacheServedMessage()` 等守卫只接受闭合的纯数据对象，避免调用不可信 accessor。

`checkPushPayload()`／`checkPushPayloadText()`／`validatePushPayload()` 只验证 payload 契约；它们不代表 `@pwa-platform/push` 已公开。当前正式版（0.3.0）的公开接入面不包含 Push 订阅与后端发送服务。

## 安全边界

- 不要绕过 `@pwa-platform/core` 自行构造 worker 配置。
- 不要把 entry 文件当成通用 Service Worker 模板直接注册。
- 公共读取缓存需要业务证明响应与身份无关，并正确设置 `Cache-Control`；worker 看不到的 `Set-Cookie` 风险不能只靠运行时解决。
- 更新接管不等于页面刷新，刷新时机由宿主应用决定。

接入应用请从[Vite + 框架指南](https://github.com/haigeerlab/pwa-platform/blob/main/website/start/choose.md)开始；事故流程见[部署与发布](https://github.com/haigeerlab/pwa-platform/blob/main/website/operations/release.md)。

License: MIT.
