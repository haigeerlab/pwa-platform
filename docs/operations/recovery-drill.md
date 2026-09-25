# 恢复演练

恢复 worker 是生产 worker 异常时的恢复路径（[ADR-0005](../adr/0005-update-prompt-and-recovery-worker.md)、[生命周期](../architecture/lifecycle.md)）。本演练证明它在真实浏览器中按预期工作：

- 激活后接管客户端；
- 不拦截 fetch；
- 只删除当前应用在当前环境下的缓存。

恢复 worker 由 sw-runtime 实现。sw-runtime 交付之前没有可演练的恢复 worker，本演练从 sw-runtime 的质量门禁开始执行。

## 触发时机

以下两种情况各做一次：

- **运行时模块的质量门禁。** sw-runtime 及相关运行时模块提交 PR 时，在 PR 的验证记录中附上演练记录。
- **每次生产发布之前。** 在类生产环境中演练，演练子记录作为[生产发布浏览器证据](browser-release-evidence.md)的一部分，并作为[发布门禁](release-and-incident-runbook.md#发布门禁)的一项证据。

## 范围与准备

- **浏览器。** 在[浏览器矩阵](../architecture/browser-matrix.md)的必测范围内执行，与 [V1 验收矩阵](../architecture/v1-acceptance-matrix.md)的"异常 worker 恢复"场景一致。
- **身份。** 使用本次被测应用与环境的 `PwaIdentity`。下文的缓存名一律用 contracts 的 `appCachePrefix` 和 `cacheName` 计算，不手写。
- **对照缓存。** 在同一 origin 中，由测试页面预先创建以下缓存，每个至少写入一个条目：

| 对照缓存 | 缓存名 | 预期 |
|---|---|---|
| 同应用、同环境的旧 revision | `cacheName` 使用一个不同于当前值的 `cacheNamespaceSeed` 计算 | 删除 |
| 同应用、其他环境 | 使用另一个 `environment` 计算 | 保留 |
| 其他应用、同环境 | 使用另一个 `appId` 计算，其中至少一个 `appId` 以当前 `appId` 开头 | 保留 |
| 非平台缓存 | 不以 `pwa:` 开头的名称 | 保留 |

旧 revision 缓存会被删除，是因为它位于当前应用前缀之下（[ADR-0009](../adr/0009-identity-migration-bumps-cache-namespace-seed.md)）。

## 演练步骤

1. **安装当前 worker 并填充缓存。**
   - 在线打开应用，等待当前 worker 激活并控制页面。
   - 确认 `cacheName(identity, "precache")` 中已有 `PwaPlan.precache` 列出的条目。
   - 创建上表中的对照缓存。
   - 记录 `caches.keys()` 的结果（只记缓存名），以及每个缓存的条目数。
2. **部署恢复 worker。** 按[回滚流程](release-and-incident-runbook.md#回滚)在同一 `serviceWorkerUrl` 发布恢复 worker，保持应用页面打开。恢复 worker 应立即激活，不等待用户刷新。
   - **静态主机**：把恢复 worker 的产物改名覆盖到 `serviceWorkerUrl` 发布。
   - **Nuxt Nitro `node-server` 部署**：改名覆盖不可用（`serviceWorkerUrl` 的响应会被 Nitro 固化的 `Content-Length` 截断，见[回滚流程](release-and-incident-runbook.md#回滚)）。改为把应用的 `pwaPlatform.recoveryRelease` 设为 `true` 重新构建并部署，该构建在同一路径下发布的就是恢复 worker。
   - 两种部署方式发布后的验证步骤相同，从下面的步骤 3 开始。
3. **验证恢复行为。**
   - **接管客户端**：所有已打开的应用页面都由恢复 worker 控制，期间没有任何用户操作。
   - **不拦截 fetch**：
     - 在线时，页面请求直接到达服务器，开发者工具中显示请求未经 Service Worker 处理；
     - 断网时，请求一个此前已预缓存的资源，得到网络错误，而不是缓存响应；
     - sw-runtime 的单元测试证明，恢复 worker 产物没有注册 `fetch` 事件监听。断网检查无法区分"没有拦截"和"拦截了但缓存已删"，这一项用来排除后者。
   - **只删除当前应用前缀下的缓存**：再次记录 `caches.keys()`，与步骤 1 的记录比较：
     - 被删除的缓存，正好是名称以 `appCachePrefix(identity)` 开头的全部缓存；
     - 其余缓存全部保留，名称与条目数都没有变化。
   - **运行时缓存与过期记录被清除**（应用启用了 `PwaPolicy v3` 公共读取缓存时，[public-read-cache](../../spec/public-read-cache.md)、[ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)）：
     - 步骤 1 先访问一个执行运行时缓存的路径，确认 `runtime-pages` 或 `runtime-data` 缓存中已有至少一个条目；
     - 恢复后，`caches.keys()` 中不再出现这两个缓存 kind；
     - 恢复后，浏览器的 `workbox-expiration` IndexedDB 库中不再有 `cacheName` 以当前应用 `appCachePrefix` 开头的记录（用真实 Workbox 写入的记录做校验，不新建该库）；其他应用前缀下的记录保持不变。
4. **部署修复后的 worker。**
   - 修复后的 worker 按正常更新流程激活；Nuxt 部署须先把 `recoveryRelease` 改回 `false` 再重新构建，才能恢复发布平台 worker。
   - **Nuxt 部署收尾必查**：确认应用配置中的 `pwaPlatform.recoveryRelease` 已改回 `false`（或已移除），且线上 `serviceWorkerUrl` 返回的是平台 worker 而不是恢复 worker。开关被误留在生产配置里时，站点会持续发布一个只删缓存、不提供任何响应的 worker，构建日志中只有一条警告。
   - 预缓存重新填充到 `PwaPlan.cacheNamespace.prefix` 之下。
   - 断网后重新打开应用壳，页面正常渲染，符合 V1 验收矩阵"后续离线启动"的通过标准。

## 通过标准

- 必测范围内的每个浏览器，都通过步骤 3 的全部检查和步骤 4 的恢复检查。
- 删除集合与保留集合都和预期完全一致：多删一个或少删一个，都算失败。
- 任一项失败，演练即失败：质量门禁不通过；发生在生产发布前时，本次发布不得进行。失败项登记 Issue。

## 恢复演练子记录模板

质量门禁可直接使用本子记录。生产发布时，它必须被[生产发布浏览器证据](browser-release-evidence.md)中的“恢复演练”行引用；该总记录不得以摘要替代下面的缓存与逐浏览器检查。演练记录只写缓存名和条目数，不写缓存响应体、令牌或用户数据（[可观测性](../product/observability.md)）。

```markdown
## 恢复演练记录

- 触发：质量门禁（PR 链接）/ 生产发布前（发布名称）
- 日期：
- 执行人：
- 环境：
- 应用与环境：appId、environment、appCachePrefix 的值
- 被测 worker 构建标识：
- 恢复 worker 构建标识：
- 修复后 worker 构建标识：

### 浏览器

按浏览器矩阵的"版本号"字段逐个记录。

### 缓存清单

| 缓存名 | 步骤 1 条目数 | 步骤 3 结果（删除 / 保留且条目数） | 预期 | 是否一致 |
|---|---|---|---|---|

### 检查结果

| 检查项 | 浏览器 | 结果 | 证据（日志、截图或 Issue 链接） |
|---|---|---|---|
| 接管客户端，无用户操作 | | | |
| 在线请求未经 Service Worker | | | |
| 断网请求得到网络错误 | | | |
| 恢复 worker 未注册 fetch 监听 | 不适用 | | 单元测试链接 |
| 删除集合与预期一致 | | | |
| 保留集合与预期一致 | | | |
| 运行时缓存与过期记录被清除（未启用运行时缓存时填"不适用"） | | | |
| 修复后 worker 激活，离线启动恢复 | | | |

### 结论

通过 / 失败 / 未执行；失败或未执行项与 Issue 链接。生产发布前“未执行”视为失败。
```
