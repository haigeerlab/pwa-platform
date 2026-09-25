# 入口恢复演练

入口恢复（[pwa-entry-resilience](../../spec/pwa-entry-resilience.md)）在应用当前的 Origin 迁移或无法访问时，为已安装的用户提供经用户确认的备用入口。清单由业务应用用自己的请求层取得并交入平台（[ADR-0033](../adr/0033-entry-manifest-supplied-by-the-application.md)，取代 [ADR-0017](../adr/0017-entry-manifest-trust-model.md) 的信任模型），交付边界见 [ADR-0018](../adr/0018-entry-resilience-delivery-boundary.md)。本演练证明它在真实浏览器中按预期工作：

- 只展示形状合法、未过期的入口，且序号必须比已存记录更大；
- 用户点击之前绝不导航，导航时只携带经过校验的返回路径；
- 设备离线时不展示入口，不把离线误报为域名故障；
- 应用在线时交入的清单存得下来，当前 Origin 不可达时仍能用。

**本演练不验证清单的真实性。** 平台不再验签：谁能控制应用后端，谁就能把已安装用户引向任意域名（见 ADR-0033 的安全边界）。演练要证明的是"存得下、判得准、只在用户点击后跳转"，不是"伪造的清单会被拒"。

本演练与 ADR-0005 的[恢复演练](recovery-drill.md)是两件事：那一份处理的是故障 worker，这一份处理的是入口地址。二者可以在同一次准备中先后执行。

## 触发时机

以下情况各做一次：

- **本模块及其依赖模块的质量门禁。** 在验证记录中附上演练记录。
- **每次计划迁移之前。** 在类生产环境中演练，演练记录作为迁移批准的证据。
- **清单接口或其数据格式变更之后。** 确认应用交入的新格式仍被接受，且序号仍然递增。

## 范围与准备

- **浏览器。** 在[浏览器矩阵](../architecture/browser-matrix.md)的必测范围内执行。平台侧不再有密码学校验，因此没有额外的浏览器版本下限。
- **构建。** 被测应用使用 `pwa()` 与 `pwaEntryResilience({ identity, maxValidityDays })` 构建。记录构建标识与 `maxValidityDays`。
- **Origin。** 准备两个彼此独立的 Origin：当前 Origin，以及至少一个备用 Origin。发现源那一台已不再需要。
- **清单来源。** 演练用的清单由应用侧准备：走业务自己的接口，或在受控客户端上直接调用 `updateEntryManifest(data)` 交入。序号从该应用该环境已存记录的序号往上递增。
- **先自查每一份演练清单。** 在 Node 侧用 `parseEntryManifest` 校验后再交入，结果必须为 `ok: true`：

  ```js
  import { parseEntryManifest } from "@pwa-platform/entry-resilience";
  const result = parseEntryManifest(manifest, { appId, environment, maxValidityDays: 30, now: Date.now() });
  if (!result.ok) throw new Error(result.diagnostics.map(({ code, path }) => `${path || "(manifest)"}: ${code}`).join(", "));
  ```

  `maxValidityDays` 必须与构建配置一致，校验器不读构建配置。**本步不是形式**：2026-09-23 的演练中，示例的种子清单因时间戳带毫秒被静默拒绝，而"基线无入口"与"种子失效"表现相同，按当时的步骤演练不会发现。
- **受控客户端。** 一个受控浏览器配置：先在线打开应用，等待平台 worker 激活并控制页面，并至少成功交入一次清单。另准备一种**只让当前 Origin 在网络层不可达**的手段（例如该客户端的 hosts 或防火墙规则），不能用"整机断网"代替，因为那会同时阻断备用 Origin。

## 演练步骤

1. **基线。**
   - 交入 `normal` 清单（序号 N，`entries` 为空），调用 `checkEntryRecovery()`，结果为 `none`；
   - 打开恢复页，显示"当前没有可用的备用入口"，页面上没有按钮。

2. **计划迁移。**
   - 交入 `migrating` 清单（序号 N+1，含备用入口），`updateEntryManifest` 返回 `accepted: true`；
   - 应用调用 `checkEntryRecovery({ returnPath })`，结果为 `available` 且状态为 `migrating`，**结果中不含任何备用 Origin**；
   - 打开结果中的恢复页链接：页面展示目标主机、原因与有效期，**按钮出现后页面停留在恢复页，没有自动跳转**；
   - 点击按钮，浏览器顶层导航到备用 Origin，`pwa-return` 等于传入的返回路径；
   - 另用一个 scope 之外或以 `//` 开头的返回路径调用，恢复页链接中不带返回路径参数。

3. **序号与形状。**
   - 交入序号更小的清单（序号 N-1）：返回 `accepted: false`，诊断为 `entry.sequence-not-greater`，存储中的记录不变，`checkEntryRecovery()` 仍返回第 2 步的结果；
   - 交入一份形状非法的清单（例如 `startPath` 含 `..` 段，或 `entries` 超过 5 条）：整份被拒，诊断指出字段路径，存储不变；
   - 交入一份 `expiresAt` 已过期、或距今超过 `maxValidityDays` 的清单：被拒。

4. **网络层不可达。**
   - 在受控客户端上让当前 Origin 不可达，重新打开应用：应用壳从缓存启动；
   - 已存清单为 `migrating` 或 `incident` 时，`checkEntryRecovery()` 仍返回 `available`；
   - **带着返回路径打开恢复页**（即 `checkEntryRecovery({ returnPath })` 返回的那个链接，它一定带 `?return=…`）：页面必须显示入口按钮，**不能是离线降级页**。2026-09-23 之前这一步会失败——导航兜底按带查询串的地址匹配预缓存，恢复页因此被跳过（[ADR-0034](../adr/0034-navigation-fallback-ignores-the-query-string.md)）。**本步不可省略**：此前演练只验证到"应用壳能启动"，缺陷因此没有被发现；
   - 点击入口，确认能完成跳转；
   - 已存清单为 `normal` 且备用 Origin 可达时，结果为 `unconfirmed-outage`；
   - 解除限制。

5. **设备离线不被误报为故障。**
   - **先交入一份序号更高的 `normal` 清单**（`entries` 可以保留），使已存状态回到"一切正常"。`migrating` 与 `incident` 按规格**不探测、直接展示**，因此本步必须在 `normal` 状态下进行；否则展示入口是正确行为，不是失败。
   - 在线时调用 `checkEntryRecovery()`：主入口可达，结果为 `none`；
   - 让受控客户端整机离线，重新打开应用：结果仍为 `none`，恢复页没有按钮——离线的是用户自己，不是域名；
   - 恢复在线。

6. **过期。**
   - 交入一份序号更高、状态为 `migrating` 的清单，确认展示；
   - 把受控客户端的时钟推到该清单的 `expiresAt` 之后（或交入一份有效期很短的清单并等它过期），`checkEntryRecovery()` 返回 `none`，诊断中含 `entry.expired`；
   - 恢复时钟。

7. **与恢复 worker 共存**（与[恢复演练](recovery-drill.md)同场执行时）。
   - 交入一份合法的 `migrating` 清单后部署恢复 worker；
   - 应用前缀下的缓存被删除，而 IndexedDB 库 `pwa-entry:<appId>:<environment>` 中的记录保留；
   - 此时即使清单接口不可读，`checkEntryRecovery()` 仍返回 `migrating`。

8. **收尾。** 交入一份序号更高的 `normal` 清单（`entries` 为空），使演练用的迁移公告不会残留在任何客户端上。

## 通过标准

- 必测范围内的每个浏览器，都通过第 1–6 步的全部检查；同场执行时还需通过第 7 步。
- 任一步出现"未点击即导航""展示了形状非法或已过期的入口""更小序号覆盖了已存记录""`normal` 状态下离线却展示入口"之一，演练即失败。
- 失败时：质量门禁不通过；发生在计划迁移前时，本次迁移不得进行。失败项登记待办。

## 记录模板

演练记录只写状态、序号、主机名与诊断码。**不写清单全文、返回路径的值、令牌或用户数据**：返回路径可能含用户的页面位置，只记录"是否与传入值一致"。

```markdown
## 入口恢复演练记录

- 触发：质量门禁 / 计划迁移前（迁移名称）/ 清单格式变更后（变更说明）
- 日期：
- 执行人：
- 环境：
- 应用与环境：appId、environment
- 被测构建标识与 maxValidityDays：
- 当前 Origin 主机名：
- 备用 Origin 主机名：
- 清单来源：业务接口 / 受控客户端直接交入

### 浏览器

按浏览器矩阵的"版本号"字段逐个记录。

### 交入的清单

| 步骤 | status | sequence | updateEntryManifest 结果 | checkEntryRecovery 结果 | 诊断码 |
|---|---|---|---|---|---|

### 检查结果

| 检查项 | 浏览器 | 结果 | 证据（日志、截图或待办链接） |
|---|---|---|---|
| 基线无入口 | | | |
| 迁移公告展示目标主机 | | | |
| 未点击不导航 | | | |
| 点击后到达备用 Origin，返回路径一致 | | | |
| 非法返回路径被丢弃 | | | |
| 更小序号不覆盖已存记录 | | | |
| 形状非法的清单整份被拒 | | | |
| 超出有效期上限的清单被拒 | | | |
| 网络层不可达时仍可用已存清单 | | | |
| 网络层不可达时带返回路径打开恢复页，显示入口而非降级页 | | | |
| `normal` 状态下离线仍无入口 | | | |
| 过期后不再展示 | | | |
| 与恢复 worker 共存 | | | |
| 收尾清单已交入 | | | |

### 结论

通过 / 失败；失败项与待办链接。
```
