# V1 验收矩阵

| 场景 | 必要结果 | 负责模块 | 证据类型 |
|---|---|---|---|
| 首次在线访问 | Manifest 与 worker 注册；静态应用壳完成预缓存。 | sw-runtime、client-runtime、vite-adapter | 真实浏览器 E2E；build-verifier 报告 |
| 后续离线启动 | 缓存的应用壳无白屏启动；未缓存导航得到明确降级。 | sw-runtime | 真实浏览器 E2E |
| 未缓存/私有/流式请求 | 不得有响应进入平台缓存；UI 收到明确网络或离线结果。 | policy-compiler、sw-runtime | 单元测试与 golden 测试；真实浏览器 E2E |
| 发现更新 | 新 worker 等待；客户端显示更新提示；不得全局强制刷新。 | client-runtime、sw-runtime | 真实浏览器 E2E |
| 异常 worker 恢复 | 恢复 worker 只移除平台缓存命名空间并停止 fetch 拦截。 | sw-runtime | 恢复演练记录；真实浏览器 E2E |
| Vue 与 React 示例 | 构建、安装、离线启动、更新提示和恢复路径通过真实浏览器 E2E。 | examples-browser-e2e | 真实浏览器 E2E |

模块名取自[能力图](../../spec/CAPABILITY-MAP.md)。负责模块在自己的质量门禁中产出对应证据，并写入该模块的验证记录；V1 发布前，6 个场景的证据都必须齐全。

## 浏览器范围

证据类型为真实浏览器 E2E 的场景，都在[浏览器矩阵](browser-matrix.md)的必测范围内执行：Chrome 桌面端与 Chrome Android，各自的 N 与 N-1。具体要求哪些平台，由本次发布的通道决定：`desktop` 通道只要求 Chrome 桌面端，`desktop+android` 通道两者都要求（[ADR-0030](../adr/0030-desktop-release-channel.md)）。下文的通过标准指本通道的必测范围内全部通过；参考档和渐进兼容档的结果按浏览器矩阵记录，不影响是否通过。生产发布将通道、完整版本、设备、场景和原生安装结果记录在[生产发布浏览器证据](../operations/browser-release-evidence.md)中；本通道内任一必测环境或场景未执行时，V1 发布证据不通过。

Safari 的安装与通知行为属于渐进兼容性说明，不构成 V1 的通用保证。

## 通过标准

### 首次在线访问

- 页面引用的 manifest 位于身份的 `manifestUrl`，可以成功获取。
- worker 以身份的 `serviceWorkerUrl` 注册，注册的 scope 等于身份的 `scope`。
- worker 安装完成后，`PwaPlan` 的 `precache` 列出的每个条目都已进入平台预缓存；平台缓存命名空间中没有清单以外的条目。
- build-verifier 对同一次构建的计划与产物校验通过。

### 后续离线启动

- 首次在线访问已完成安装与缓存填充后，断开网络并重新打开应用壳 URL，页面正常渲染，不出现白屏。
- 断网时导航到未缓存的路由：`PwaPlan` 启用了 `offlineFallback` 时显示离线降级页。无论是否启用，除 `offlineFallback.path` 指向的降级页外，都不得返回其他路由的缓存内容。

### 未缓存、私有或流式请求

- policy-compiler 的单元测试与 golden 测试证明：
  - `session-data`、`mutation`、`stream` 与 `unclassified` 四类规则编译为 `action: "deny"`，并排在所有允许规则之前；
  - 允许规则落在拒绝前缀之下时，编译以 `compile.allow-under-deny` 失败；
  - 编译出的 `PwaPlan` 带有完整的 `requestBaselineDenials`。
- 在线时页面发起这四类请求后，平台缓存命名空间中不出现对应条目。
- 断网时页面发起这四类请求，得到网络错误，而不是缓存响应。

### 发现更新

- 部署新版本 worker 后，已打开的客户端中，新 worker 保持等待状态，不自行激活。
- 客户端显示更新提示。
- 用户确认之前，任何已打开的页面都不会被刷新或重新加载。
- 用户确认后，新 worker 激活并控制页面。

### 异常 worker 恢复

- 恢复 worker 激活后接管已打开的客户端。
- 恢复 worker 不拦截 fetch：页面请求直接走网络。
- 只删除名称以当前应用 `appCachePrefix` 开头的缓存（[ADR-0008](../adr/0008-cache-namespace-and-identity-baseline.md)、[ADR-0009](../adr/0009-identity-migration-bumps-cache-namespace-seed.md)）；其他应用、其他环境的平台缓存，以及非平台缓存，全部保持不变。
- 恢复演练按[恢复演练](../operations/recovery-drill.md)的步骤完成，并通过其通过标准。

### Vue 与 React 示例

- Vue 示例与 React 示例分别执行，两者都要通过。
- 每个示例的构建通过，且 build-verifier 校验通过。
- 每个示例在必测范围内，都通过安装、离线启动、更新提示和恢复路径 4 项 E2E；离线启动、更新提示和恢复路径按上文对应场景的通过标准判定。
- **安装判定**：示例的 `PwaPlan.install` 不为 `null`，并且：
  - 页面收到 `beforeinstallprompt` 事件，说明浏览器判定应用满足安装条件；
  - 完成安装后，应用从 `PwaPlan.install.startUrl` 启动，`matchMedia("(display-mode: <值>)")` 对 `PwaPlan.install.display` 的值成立；
  - client-runtime 依次发出 `install-eligible` 与 `installed` 事件。
