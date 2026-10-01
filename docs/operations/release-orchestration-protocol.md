# 发布编排协议

本协议规定外部发布系统如何为 PWA 生产发布采集事实、调用
`@pwa-platform/build-verifier`、保存完整发布线，并在成功后更新身份基线。它落实
[ADR-0014](../adr/0014-build-verification-boundary-and-report.md)、
[ADR-0024](../adr/0024-release-retention-verification.md) 与
[ADR-0025](../adr/0025-release-gate-completeness-and-external-orchestration.md)；
可移植部署另遵循 [ADR-0050](../adr/0050-portable-deployment.md)。本协议不替代
[发布与事故处置手册](release-and-incident-runbook.md)的门禁或
[职责与 RACI](../product/ownership-and-raci.md)。

## 边界

发布系统在自己的受控环境中持有网络权限、部署凭据、CI 证据和发布记录。本仓库只约定它
向 build-verifier 传入的事实、保留记录的语义与状态顺序；不提供部署 CLI、CDN/API 客户端、
数据库 schema、密钥或 CI 配置。

记录和日志不得含令牌、Cookie、认证头、响应体、用户数据或私有资产 URL。响应头记录只保留
此次校验需要的公开路径与 `Cache-Control` 指令；私有 HTML/数据的响应头检查保留脱敏结论和
证据引用，不把原始请求或响应写入发布记录。

## 发布线与互斥

每个稳定部署槽位是一条独立发布线。普通发布的身份互斥键至少为：

```text
appId + origin + environment + slot
```

固定模式的 `origin` 来自计划身份；可移植模式的 `origin` 是本次部署的实际目标
`deployment.targetOrigin`。同一构建发往两个域名时，分别取得锁、查基线、读完整历史、
收集证据并保存发布记录。不能把 A 域名的首次发布批准或历史记录复用到 B。

- `slot` 是应用登记的稳定 kebab-case 名称，不是 `PwaIdentity` 字段，不改名也不复用；其
  语义见[身份发布基线规则](identity-release-baseline.md#基线是什么)。外部系统还须持有该稳定
  槽位锁，作为身份迁移前后的共同串行点。
- 外部系统在读取当前基线、历史与线上根计划之前取得候选身份键和槽位锁，并一直持有到发布
  记录与基线都写完或本次尝试终止。
- 身份迁移可能改变 `appId`、`origin` 或 `environment`。此时还必须取得当前基线身份键，并以
  固定排序同时持有“旧身份键、候选身份键、稳定槽位锁”；只锁候选键会让另一次仍使用旧身份的
  发布绕过串行约束。
- 同一槽位不得有两个候选同时处于 `prepared`、`verified` 或 `deployed`。不同槽位的发布线
  相互独立；共享源的根、子应用仍各有自己的锁。

锁、记录和基线的具体实现由基础设施团队选择，但必须使“检查所见的历史”和“成功后追加的
历史”位于同一临界区；否则两次发布会用同一份旧历史通过保留窗口检查。

## 最小发布记录

外部系统为每一次尝试分配不可复用的 `releaseAttemptId`，并保存下列字段。相对链接、运行
标识或经访问控制的记录地址都可作为“引用”，但引用必须能由审计者取得。

| 类别 | 必须保存的字段 | 约束 |
|---|---|---|
| 标识与状态 | `releaseAttemptId`、发布线四元组、状态、状态时间线、操作者或自动化运行引用 | 失败、撤销和成功均保留；不得把失败尝试改写为成功。 |
| 候选构建 | 完整候选 `PwaPlan`、构建提交或不可变构建标识、构建完成时间 | 候选计划须来自本次构建并能通过 `validatePlan`。 |
| 机器事实 | 绝对产物路径清单、公开路径的观测 `Cache-Control`、评估时刻、当前可用绝对资产路径 | 路径形态与 build-verifier 输入一致；不存原始响应体或私有 URL。 |
| 可移植部署事实 | 本次实际目标 origin、每个必需平台路径跟随重定向后的最终响应 URL、HTTP 状态码和响应头、采集时间与采集运行引用 | 编排器必须请求该域名取得事实；只填 `targetOrigin` 字符串不是部署证据。最终响应须为 200。目标域名须是 HTTPS（本地演练允许 loopback HTTP）。 |
| 历史与拓扑 | 本发布线全部先前成功发布的计划与生产发布时间（新到旧）；共享源子应用的实际线上根计划 | 历史不能截断；根计划须来自同源、同环境的已部署根应用。 |
| 门禁结论 | `verifyRelease` 报告、`verifyReleaseGateCoverage` 结果、必需检查集合 | 覆盖完整与报告通过分开保存，不能只保留布尔汇总。 |
| 人工证据 | 发布通道；CI、浏览器矩阵、原生安装、恢复演练、类生产环境核对的引用 | 证据须满足运行手册；不能以本地构建结果替代，唯一例外是 GitHub 不可用期间按 [ADR-0031](../adr/0031-local-gate-substitute-for-ci.md) 取得的本地门禁记录，并标注"本地替代"。浏览器证据按 [ADR-0030](../adr/0030-desktop-release-channel.md) 的发布通道判定，通道在发布尝试创建时确定。 |
| 例外与结果 | 首次发布或身份迁移的批准引用、生产部署结果、生产成功时间 | 例外仍保留原始诊断；只在生产成功后写基线与历史。 |

发布记录的计划、时间和可用路径是
`verifyReleaseRetention` 的完整 `previous` 与 `available` 事实来源；它不是可按保留窗口
截断的审计摘要。

## 状态机

```text
prepared -> verified -> deployed -> recorded
    |           |           |
    +-----------+-----------+
                |
                v
       failed or aborted (terminal)
```

| 状态 | 进入条件 | 不可变要求 |
|---|---|---|
| `prepared` | 已取得锁，候选计划、构建标识和门禁所需事实已采集 | 尚未写身份基线或成功历史，尚未声称生产成功。 |
| `verified` | 机器门禁与所需人工证据均已判定；普通发布满足报告通过和覆盖完整 | 记录所有输入、报告、覆盖结果与例外批准；不部署也不写基线。 |
| `deployed` | 外部部署系统确认候选已在目标生产槽位成功生效 | 仍持有锁；记录实际成功时间和部署证据，尚未完成最终记录写入。 |
| `recorded` | 成功发布已追加到完整历史，且身份基线已按规则更新 | 这是唯一可作为后续发布历史与基线来源的成功状态。 |
| `failed` / `aborted` | 任一检查、审批、部署或记录写入失败，或人工取消 | 永不写入成功历史或基线；保留失败原因与已执行的补偿动作。 |

只能沿图中的箭头转换。`recorded` 是终态；若记录写入中断，保持 `deployed` 并在持锁恢复时
完成同一次记录，或转为 `failed`，绝不以新的尝试覆盖它。回滚或恢复 worker 是另一份发布
尝试，仍须按[回滚流程](release-and-incident-runbook.md#回滚)记录。

## 门禁执行顺序

1. 取得发布线锁，分配 `releaseAttemptId`；读取该槽位当前基线、完整成功历史和（如适用）实际
   线上根计划。尝试尚未采齐事实前不进入状态机。
2. 验证候选计划，并采集本次构建的绝对产物路径。向受控类生产环境部署候选或等价不可变
   产物后，采集公开资源的响应头与当前可用资产路径；采集不应携带用户会话。事实齐全后写入
   `prepared` 记录。对 v4 可移植计划，每个目标域名分别请求计划要求的 HTML、worker、恢复
   worker、manifest、预缓存及旧资源，跟随重定向后保存最终 URL、HTTP 状态码与响应头。`deployment.responses`
   以计划中的根绝对路径为键，每项形如 `{ finalUrl, status, headers }`；最终 URL 必须仍在目标 origin 且保留该路径，状态码须为 200。编排器必须保证
   这些响应来自本次实际部署，验证器无法证明调用方是否真的发起过网络请求。
3. 调用 `verifyRelease(candidatePlan, collectedFacts)`。独立源与共享源根应用的机器必需集是
   `artifacts`、`response-headers`、`identity-baseline`、`release-retention`、`html-headers`；共享源子应用额外
   要求 `release-order`，并传入线上根计划。v4 还必须执行 `deployment-origin`，并传入本次
   `deployment: { targetOrigin, responses }`；v4 共享子应用传入该域名实际线上根应用的
   `deployedRoot: { origin, plan, workerFinalUrl }`。根计划与根 worker 最终 URL 均须属于本域名。
4. 调用 `verifyReleaseGateCoverage(report, requiredReleaseChecks(candidatePlan))`（`requiredReleaseChecks` 由 build-verifier 按上一步的规则从计划推导，不要手写清单；ADR-0025 增补）。正常发布只有在 `report.ok` 与
   覆盖结果的 `ok` 都为 `true` 时，机器门禁才通过；二者缺一不可。
5. 将 CI、浏览器矩阵、原生安装、恢复演练和类生产环境核对的证据引用附入记录。它们是
   发布门禁的一部分，不由覆盖函数代替。
6. 满足全部条件后转为 `verified`，再执行生产部署。部署系统确认成功后转为 `deployed`。
7. 在同一锁内追加成功历史、按身份规则更新基线、写入生产成功时间，再转为 `recorded` 并
   释放锁。

## 首次发布与身份迁移

首次生产发布不得通过省略 `baseline` 属性来绕过比较。外部系统必须显式传入查找结果，使报告
保留 `verify.baseline-missing`；同时仍要求必需检查集合被覆盖。只有
[身份发布基线规则](identity-release-baseline.md#首次生产发布)要求的评审已获平台负责人批准，
该事实才可作为首次发布例外进入 `verified`。记录须保存报告、批准引用和“首次发布”判定，
不能把报告改写为通过。

可移植计划的基线记录为 `{ origin, identity }`，其中 `origin` 为目标域名；历史记录和可用
旧资源也只取该域名的发布线。域名 B 不能使用域名 A 的基线、历史或根应用记录。迁入可移植
模式属于身份迁移，须保留原诊断及批准记录；旧 v1–v3 计划始终按固定 origin 校验。

身份迁移同样保留 `verify.baseline-mismatch` 的原始事实，并附上已批准的迁移记录。发布系统
只可按[身份迁移](identity-release-baseline.md#身份迁移)的审批结论继续；成功后才用新身份更新
同一槽位基线。没有批准的缺失基线或身份差异一律转为 `failed`。

## 失败与恢复

- 任一必需事实缺失、报告检查缺失、覆盖不完整、普通发布报告失败、人工证据缺失或审批拒绝，
  都不得进入 `verified`。
- 部署失败、确认超时或记录/基线写入失败，都不得留下部分成功历史；系统必须保留失败记录并
  由持锁恢复或显式补偿处理。
- 已发布 worker 的故障不通过删除历史或覆盖 baseline 来“修复”。按运行手册发布恢复 worker，
  将其作为新尝试记录，并保留原尝试的证据与时间线。

## 外部实现验收

外部系统至少以合约测试证明：缺一个必需事实、缺一个报告检查、基线缺失无批准、乱序或截断
历史、并发同槽位发布，以及生产失败后误写基线，均不能产生 `recorded` 记录。每个生产环境
首次接入时还须完成一次受控演练，保存门禁输出与回滚记录。
