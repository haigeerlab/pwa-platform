# 发布与事故处置手册

本手册规定生产发布前必须通过的门禁、响应头与缓存保留要求、worker 故障时的回滚流程，以及事故处置方式。职责沿用[职责与 RACI](../product/ownership-and-raci.md)，不做调整。

## 发布门禁

生产发布前，下表各项必须全部通过，任一项未通过都不得发布：

| 门禁项 | 通过标准 | 证据 |
|---|---|---|
| CI | 发布提交的 CI 运行已完成并通过；若该运行因后续推送被取消，先对发布提交重新运行 CI。依赖审计报告按[依赖变更流程](dependency-changes.md#依赖审计)处理。GitHub 仓库或 Actions 不可用期间，可按 [ADR-0031](../adr/0031-local-gate-substitute-for-ci.md) 以[本地门禁记录](local-ci-record-template.md)代替，证据中必须写明"本地替代"，并在 GitHub 恢复后补跑 | CI 运行链接，或本地门禁记录 |
| 验证记录 | 本次发布有[生产发布浏览器证据](browser-release-evidence.md)记录；[V1 验收矩阵](../architecture/v1-acceptance-matrix.md)中需要真实浏览器证据的场景，已在[浏览器矩阵](../architecture/browser-matrix.md)中本次发布通道的必测范围内通过。本通道内任一必测环境、版本、场景或原生安装为未执行即不通过 | 证据记录链接 |
| 机器发布门禁 | `verifyRelease` 已执行本拓扑的全部必需检查，且 `verifyReleaseGateCoverage(report, requiredChecks).ok` 与 `report.ok` 均为 `true`；首次发布和身份迁移仅能按下文保留诊断并附批准 | 报告、覆盖结果、必需集和外部发布记录引用 |
| 身份基线比较 | 按[身份发布基线规则](identity-release-baseline.md)比较通过，或附有已批准的首次发布/迁移记录；不得通过省略检查隐藏基线缺失 | 比较结果；如有例外，附批准记录链接 |
| 类生产环境核对 | 在类生产环境中逐项核对下文列出的内容 | 核对结果写入验证记录 |
| 恢复演练 | 在类生产环境中按[恢复演练](recovery-drill.md)完成并通过；其子记录已被同次[生产发布浏览器证据](browser-release-evidence.md)引用 | 证据记录中的子记录引用 |

机器发布门禁由外部受控发布系统按[发布编排协议](release-orchestration-protocol.md)执行，不是 Vite
单次构建的结论。`verifyReleaseGateCoverage` 只证明所需检查实际出现，`report.ok` 才说明执行的
检查通过；两者必须合取，不能用空报告、部分报告或覆盖结果替代另一方。

| 拓扑 | `requiredChecks` |
|---|---|
| 独立源，或同源根应用 | `artifacts`、`response-headers`、`identity-baseline`、`release-retention`、`html-headers` |
| 同源子应用 | 上述五项，加 `release-order`；必须传入实际线上根计划 |

调用方采集公开产物路径、响应头（含公开 HTML 的响应头，`htmlObserved`）、完整成功历史和当前可用资产路径，再显式传给
build-verifier。采集公开 HTML 的响应头时跟随同源重定向，记录最终响应的头（[ADR-0032](../adr/0032-html-response-header-check.md)）。
直接拿 build-verifier 导出的 `VERIFICATION_CHECKS` 当必需集的调用方，升级到包含 `html-headers` 的版本后会要求该检查。`release-retention` 的历史必须是同一发布线完整的新到旧记录；Vite 构建不持有
这些生产事实，不能声称该检查已通过。

**首次发布与身份迁移例外。** 首次发布必须显式运行身份基线检查并保留
`verify.baseline-missing`，迁移必须保留 `verify.baseline-mismatch`；二者都仍要求覆盖完整、其余
机器检查与全部人工门禁通过。只有平台负责人已批准的首次发布评审或迁移记录，才可使外部
发布系统按协议继续；批准不改写原始报告，也不允许省略 `baseline` 属性来规避事实。

类生产环境核对项：

- **计划**：`PwaPlan` 来自本次发布的构建，通过 contracts 的 `validatePlan`。
- **产物路径**：worker 与 manifest 分别位于身份的 `serviceWorkerUrl` 与 `manifestUrl`；`PwaPlan.precache` 列出的每个条目都能成功获取。
- **响应头**：符合下文的响应头基线。
- **机器事实记录**：公开产物和响应头观测、完整历史、可用资产路径、报告与覆盖结果已按发布编排协议保存；记录不含令牌、响应体、用户数据或私有资产 URL。
- **安装**：符合 V1 验收矩阵"Vue 与 React 示例"一节中的安装判定。
- **离线应用壳**：符合 V1 验收矩阵"后续离线启动"的通过标准。
- **等待更新**：符合 V1 验收矩阵"发现更新"的通过标准。
- **浏览器证据闭合**：本次[生产发布浏览器证据](browser-release-evidence.md)声明了发布通道，并完整覆盖该通道的必测范围（`desktop`：Chrome 桌面端 N/N-1；`desktop+android`：另加 Chrome Android N/N-1）、原生安装和恢复演练；不得以 CI 或桌面单一版本补足缺失项。

## 响应头基线

沿用[生命周期](../architecture/lifecycle.md)中的缓存响应头要求：

| 资源 | `Cache-Control` 必须包含 | 不得包含 |
|---|---|---|
| worker 脚本（`serviceWorkerUrl`） | `no-cache` | `immutable` |
| manifest（`manifestUrl`） | `no-cache` | `immutable` |
| 公开 HTML（`html-headers` 机器检查） | `no-cache` | `immutable` |
| 带指纹的资源 | `immutable`，以及长 `max-age`（具体值由基础设施团队确定并写入部署配置） | `no-cache`、`no-store` |
| 私有 HTML 与数据（人工核对） | `private`、`no-store` | `public`、`immutable` |

- **判定方式。** 逐个指令比较：必须包含的指令都在、不得包含的指令都不在，即为符合；其他不冲突的指令不影响结果。
- **私有优先。** 私有 HTML 按"私有 HTML 与数据"一行判定，不按"公开 HTML"一行。
- 核对时逐类抽取实际响应头，写入验证记录。
- **worker 脚本的请求量。** 应用启用 client-runtime 的自动检查更新（`updateCheck`，[ADR-0020](../adr/0020-client-update-check.md)）后，每个可见标签页每隔 `intervalMs` 请求一次 `serviceWorkerUrl`，且绕过 HTTP 缓存；以 60 秒下限计，每个可见标签页每小时最多 60 次，隐藏的标签页不请求。评估源站或 CDN 容量时计入这部分请求。

## 缓存保留

带指纹资源的兼容窗口，是"前两次发布"和"7 天"两者中更长的一个：

- 当前发布为 R 时，R、R-1、R-2 三次发布的带指纹资源都必须可用；
- 更早发布的带指纹资源，要从被下一次发布取代之日起满 7 天，才能删除。

缩短兼容窗口需要新增 ADR，并由发布负责人批准。

## 回滚

1. **只回滚 HTML 不够。** 已安装的 worker 仍会继续生效，回滚 HTML 不会移除它。
2. **先发布恢复 worker。**
   - worker 出现故障时，经平台负责人批准后发布恢复 worker，批准人与批准时间记入事故时间线。安全事故与 worker 故障都按这一步执行。
   - 发布前，用一个受控浏览器配置访问生产应用，确认它装上了故障 worker，并记录 `caches.keys()` 的结果（只记缓存名）。
   - 恢复 worker 总是立即激活并接管已打开的客户端，不等待用户刷新。它不提供任何资源，页面请求直接走网络；带指纹资源由兼容窗口保证仍可获取。
   - **静态主机**：在同一 `serviceWorkerUrl` 用恢复 worker 的产物改名覆盖发布。
   - **Nuxt Nitro `node-server` 部署（`@pwa-platform/nuxt`）不能用改名覆盖发布。** Nitro 在构建时把 `.output/public` 每个文件的大小固化进服务端打包代码；构建后改名覆盖的文件，服务器仍按旧文件的 `Content-Length` 响应，返回的是被截断的响应体（ssr-adapters T7 实测：66464 字节 vs 磁盘上新文件的 66507 字节）。发布恢复 worker 须改为：把应用的 `pwaPlatform.recoveryRelease` 设为 `true`，重新构建并部署这个构建——该构建在同一钩子里把恢复 worker 的字节写到身份的 `serviceWorkerUrl`，不写平台 worker。恢复完成、要发布修复后的 worker 时，把 `recoveryRelease` 改回 `false` 再重新构建部署，即回到第 4 步。
3. **确认恢复范围。**
   - 恢复 worker 的同一构建，必须已在类生产环境通过[恢复演练](recovery-drill.md)。
   - 上线后，在第 2 步的受控浏览器配置中核对：恢复 worker 已激活并控制页面；页面请求未经 Service Worker 处理；`caches.keys()` 与发布前的记录相比，只少了名称以本应用 `appCachePrefix` 开头的缓存。
   - 核对结果记入事故时间线。
4. **再发布修复后的 worker。** 修复后的 worker 同样要通过发布门禁。

### 回滚到不认识运行时缓存的旧平台版本

适用于已启用 `PwaPolicy v3` 公共读取缓存（[public-read-cache](../../spec/public-read-cache.md)、[ADR-0035](../adr/0035-explicit-public-read-runtime-cache.md)）的应用。旧平台版本的 worker 不认识 `runtime-pages`、`runtime-data` 两个缓存 kind，激活时不会清理它们：这些缓存不会被旧 worker 或新 worker 之外的任何代码读取，但会一直占用浏览器存储空间，直到下一次事件把它们清掉。

- **它们不是安全问题**：内容仍是当初准入的公共数据，不会被回滚后的 worker 读出或提供给页面。
- **清理时机**：下一次 v3 且 `runtimeCache.enabled: true` 的 worker 激活会按 `configDigest` 清理；或者按上文步骤发布恢复 worker，它按 `appCachePrefix` 删除全部平台缓存（含两个运行时 kind）与它们的 `workbox-expiration` 记录，覆盖面比单纯回滚更彻底。
- **不需要额外操作**：不必为了清理这些残留单独发布恢复 worker；只有在事故处置本身就需要恢复 worker时，才会顺带清掉它们。

## 同源拓扑的发布与移除顺序

适用于同一源上一个根应用与若干固定子路径应用共存的部署（[部署拓扑](../architecture/deployment-topologies.md)、[ADR-0019](../adr/0019-shared-origin-registry-and-exclude.md)）。登记表放在根应用的仓库，子应用仓库保存副本。

**新增或修改子应用：**
1. 在根应用仓库修改登记表，`registryVersion` 加 1，同步副本到子应用仓库。
2. **先发布根应用。** 新的根计划中会出现该子 scope 的 `exclude` 规则。保留这次发布的计划作为发布记录。
3. **再发布子应用。** 发布门禁中运行 `verifyRelease({ plan: 子应用计划, deployedRootPlan: 线上根应用计划 })`，`release-order` 检查必须通过：线上根计划是同一源、同一环境的根应用，已排除该子 scope，且登记表版本不低于子应用的。
4. 子应用的 `requiredChecks` 包含 `release-order`，且报告通过与覆盖完整都不可缺少。检查失败时不得发布子应用：`verify.root-plan-missing-exclude` 表示根应用还没排除该子路径；`verify.root-registry-older` 表示子应用用了比线上根应用更新的登记表，先发布根应用。

**服务器不得规范化路径**：浏览器与平台 worker 按路径原样判断 scope（`/M/`、`//m/` 不在 `/m/` 之内）。若服务器对路径大小写不敏感，或像部分反向代理默认那样合并连续斜杠，这些地址会返回子应用的内容，却由根 worker 接管、断网时给出根应用的离线页。同源部署须关闭这类规范化，或在服务器上把它们重定向到规范写法。

**移除子应用**（没有自动化检查，按顺序执行并记录）：
1. **子应用先发布恢复 worker**（见上文"回滚"），在受控浏览器配置中确认其缓存已清空、注册已由恢复 worker 接管。
2. **再从登记表中移除该子应用**，`registryVersion` 加 1。
3. **最后重新发布根应用**，根 worker 停止排除该路径。
顺序反过来时，根 worker 会在子应用仍然存在时开始接管子路径。

## 入口清单的配置、迁移与撤回

适用于接入入口恢复（[pwa-entry-resilience](../../spec/pwa-entry-resilience.md)）的应用。清单由业务应用自己的后端提供，平台不再验签（[ADR-0033](../adr/0033-entry-manifest-supplied-by-the-application.md)，取代 [ADR-0017](../adr/0017-entry-manifest-trust-model.md)），演练见[入口恢复演练](entry-recovery-drill.md)。

**入口清单决定已安装用户会被引导到哪个地址，改动它等同于发布一次跳转。** 每次改动都须经平台负责人批准，批准人与批准时间记入变更台账。

### 谁保证真实性

- **平台不验签，也不再持有信任根。** 清单的可信度来自"谁能控制这个接口"：能改后端返回值的人，就能把全体已安装用户引向任意域名。
- **因此该接口按写操作级别保护**：变更需要审批与审计，接口本身要求鉴权，返回值的改动进变更台账。
- 业务方自有的传输加密提供机密性，**不提供真实性**：对称密钥必须打进前端包，可被取出并用于伪造密文。不要把它当成签名的替代品。
- 仍然生效的唯一平台侧防线：**用户必须亲自点击**才会跳转，且入口地址不经页面侧 API 交给应用代码。

### 变更台账

每个应用、每个环境维护一份台账，逐次记录：序号、`status`、`expiresAt`、备用主机名、批准人与批准时间。**台账是序号的唯一来源。**

- **序号严格递增，每次加一。** 不复用。序号不大于客户端已存记录时，客户端会拒绝接受这份清单（`entry.sequence-not-greater`）。
- **同一时间只允许一条变更路径**，避免两人各自发出同一序号。

### 变更步骤

1. 按规格"修订：入口清单由业务应用提供"一节组装清单对象：
   - 序号取台账最新值加一；
   - `expiresAt` 为将来时刻，且距变更时刻不超过构建配置的 `maxValidityDays`（默认 30 天，上限 90 天）；
   - `status` 与 `reason.code` 取值符合规格；`entries` 至多 5 条，`origin` 为 HTTPS，`startPath` 以 `/` 开头且不含 `..` 段；
   - 如带 `appId`、`environment`，必须与身份一致。
2. 由后端接口返回该对象（可按业务既有方式加密传输）。
3. **发布前自查，两步。**
   - **先在后端或 CI 里**用 `parseEntryManifest`（`@pwa-platform/entry-resilience` 的包根导出）校验，结果必须 `ok: true`。这一步不需要浏览器，可以直接做成流水线检查：

     ```js
     import { parseEntryManifest } from "@pwa-platform/entry-resilience";
     const result = parseEntryManifest(manifest, { appId, environment, maxValidityDays: 30, now: Date.now() });
     if (!result.ok) { console.error(result.diagnostics); process.exit(1); }
     ```

     `maxValidityDays` 必须与该应用构建配置里的值一致——校验器不读构建配置，填错会拿错误的上限去判断。
   - **再在受控客户端**调用一次 `updateEntryManifest(data)`，确认返回 `accepted: true`。被拒时按诊断码修正，不要把被拒的清单留在接口上。

   **为什么两步都要**：运行时的拒绝只体现为页面上的一个诊断码，应用按契约会吞掉它，因此没有自查就等于没有反馈。
4. 写入台账。

**平台不提供签发或组装清单的命令行工具**：清单是业务后端的返回值，由业务侧生成。

### 有效期与续期

- 清单会过期。长期有效的迁移公告需要在过期前以更高序号重新下发。
- **客户端只保存最后一份被接受的清单，没有构建期兜底。** 应用必须在在线时调用 `updateEntryManifest`，否则客户端上没有任何可用记录。建议在应用启动时调用一次，并在主接口请求失败时再调用一次。
- 离线超过有效期的已安装客户端，已存清单会过期，此时不再展示任何入口。这是有效期上限的取舍，不是故障。

### 计划迁移

1. 新 Origin 已作为独立身份完成部署，并通过其自身的发布门禁。
2. 按[入口恢复演练](entry-recovery-drill.md)在类生产环境演练。
3. 下发 `migrating` 清单，`entries` 指向新 Origin。**不再需要预先把新 Origin 写进构建**：批准列表已随 ADR-0033 取消，因此临时启用的新域名也能立即生效。
4. 迁移结束后下发更高序号的 `normal` 清单，撤回公告。

### 故障时

- 当前 Origin 故障时，客户端用的是**之前在线时已存下的清单**：故障当时接口也连不上，此时下发新清单对已经离线的客户端无效。
- 因此**运营上要在平时保持清单可用**：即使一切正常，也下发 `status: "normal"` 且列出备用入口的清单，让客户端提前存好；`normal` 状态下平台会探测主入口，只有探测不通才以 `unconfirmed-outage` 展示。
- 旧域名若被他人接管，本机制无法防御：接管者返回的任何 HTTP 响应都不会触发入口提示。此时按事故处置流程上报。

### 撤回

下发一份序号更高、`status` 为 `normal` 且 `entries` 为空的清单。由于序号单调，旧的迁移或故障清单此后不会被重新接受。**已经离线的客户端不会收到撤回**，直到它再次联网并调用 `updateEntryManifest`；这是取消签名与发现源之后的既有取舍。

### 接口被攻破

1. 按事故处置流程定级并上报，立即停止该接口的对外返回（改为固定的 `normal`、空 `entries`，或直接下线）。
2. 排查已下发过的清单内容与序号，评估有多少客户端可能已存入被篡改的记录。
3. 下发序号更高的 `normal` 清单覆盖。**注意：已存入篡改记录且尚未联网的客户端不会被覆盖**，平台没有远程失效手段。
4. 复核该接口的鉴权与审批链路后再恢复正常使用。

## 事故处置

### 职责

| 角色 | 事故中的职责 | RACI 依据 |
|---|---|---|
| 平台负责人 | 统筹 worker 恢复；批准每一次在生产发布恢复 worker | Core runtime and adapters：平台团队 accountable |
| 基础设施团队 | 响应头、CDN 与 worker 部署 | CDN headers and worker deployment：基础设施 accountable |
| 产品负责人 | 决定是否接受面向用户的更新或中断；负责对用户的沟通内容 | RACI 表中没有对应行，沿用本手册原有的分工 |
| 产品团队与基础设施团队 | 判断私有数据与鉴权语义是否受影响 | Private-data and auth semantics：两者 accountable |

### 分级与响应动作

| 级别 | 判定条件 | 响应动作 |
|---|---|---|
| 一级 | 安全或隐私事故：私有数据进入缓存、scope 被劫持、凭据暴露；或 worker 故障导致已安装用户普遍无法使用应用，例如白屏或持续返回错误内容 | 平台负责人立即统筹处置；按回滚流程发布恢复 worker；基础设施核对响应头与部署；产品负责人决定对用户的中断与沟通；对外沟通；必须复盘 |
| 二级 | 功能降级但应用仍可用：离线启动失败、更新提示不出现或更新卡住、离线降级异常、响应头配置错误但没有泄露私有数据 | 平台负责人评估是否需要恢复 worker；优先通过发布门禁发布修复；由产品负责人决定是否对外沟通；必须复盘 |
| 三级 | 没有明显用户影响：渐进兼容档浏览器的已知差异、非阻塞问题 | 登记 Issue，在后续发布中修复；不需要对外沟通；复盘可选 |

- **安全事故。** 回滚第 2 步中平台负责人的批准，就是 [ADR-0005](../adr/0005-update-prompt-and-recovery-worker.md) 所要求的有记录的运维审批。漏洞细节按 [SECURITY.md](../../SECURITY.md) 私下处理，修复发布前不在公开 Issue 或对外沟通中披露。
- **级别调整。** 处置过程中发现影响扩大或缩小时，由平台负责人调整级别，并记录在时间线中。

### 对外沟通模板

```markdown
**[应用名称] 服务状态：[处理中 / 已缓解 / 已恢复]**

- 影响范围：受影响的应用与环境；受影响的用户与浏览器
- 开始时间：
- 当前状态：
- 用户需要做什么：例如重新打开应用；不需要操作时写"无需操作"
- 下一次更新时间：
```

对外沟通不写漏洞细节、内部系统信息或任何用户数据。

### 复盘模板

复盘记录不写令牌、Push endpoint、明文用户标识、缓存响应体或通知 payload（[可观测性](../product/observability.md)）。

```markdown
## 事故复盘：[名称]

- 级别：
- 开始 / 发现 / 缓解 / 恢复时间：
- 负责人：

### 影响
受影响的应用、环境、用户规模与浏览器；是否涉及私有数据。

### 时间线
按时间顺序记录检测、判断、处置与沟通；包括级别调整，以及恢复 worker 的批准人与批准时间。

### 检测方式
通过什么信号发现，例如生命周期信号、校验失败或用户反馈。

### 根因

### 处置过程
是否发布恢复 worker；恢复范围的核对结果；修复后 worker 的发布门禁记录链接。

### 做得好的与需要改进的

### 改进项
| 改进项 | 负责人 | Issue 链接 | 截止时间 |
|---|---|---|---|
```

## 相关文档

- [恢复演练](recovery-drill.md)
- [入口恢复演练](entry-recovery-drill.md)
- [身份发布基线规则](identity-release-baseline.md)
- [依赖变更流程](dependency-changes.md)
- [浏览器矩阵](../architecture/browser-matrix.md)
- [V1 验收矩阵](../architecture/v1-acceptance-matrix.md)
