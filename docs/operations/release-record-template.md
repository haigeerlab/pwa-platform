# 发布记录模板

每次生产发布尝试都复制本模板，作为
[发布编排协议](release-orchestration-protocol.md)规定的外部发布记录。记录应存于受访问控制的
外部系统；本模板不要求把生产数据、凭据或私有 URL 提交到 PWA 平台仓库。

## 填写规则

- `PwaPlan`、产物清单、可用资产清单和线上根计划可以作为不可变附件保存；记录须给出可审计
  的引用与摘要，使审计者能重放 build-verifier 输入。
- 只记录公开绝对路径和 `Cache-Control` 指令。不得写入令牌、Cookie、认证头、响应体、用户
  数据或私有资产 URL；私有 HTML/数据只记录人工核对的脱敏结论与证据引用。
- 每个状态转换追加一条时间线，不得修改既有条目。`recorded` 只用于生产成功且历史与基线都
  已完成写入的尝试；失败、取消和回滚也保留其原始记录。
- 引用可指向受访问控制的 CI、制品库、部署系统或审计系统，但必须能被授权审计者读取。

## 记录

```markdown
# 发布记录：<releaseAttemptId>

## 发布线

| 字段 | 值 |
|---|---|
| releaseAttemptId | <不可复用 ID> |
| slot | <稳定 kebab-case 槽位> |
| 候选身份键 | <appId / origin / environment> |
| 当前基线身份键 | <首次发布填“无”；迁移时填写旧键> |
| 拓扑 | <standalone-origin / shared-origin root / shared-origin child> |
| 当前状态 | <prepared / verified / deployed / recorded / failed / aborted> |

## 锁与候选构建

- 槽位锁引用：<锁或串行运行引用>
- 身份键锁：<候选键；迁移时列出旧键与候选键，并说明固定获取顺序>
- 构建提交 / 不可变构建标识：<引用>
- 构建完成时间（UTC）：<ISO 8601>
- 完整候选 `PwaPlan`：<不可变附件或受控记录引用；摘要/哈希>
- `validatePlan` 结果：<通过；或失败后转为 failed>

## 已采集机器事实

- 评估时刻（UTC epoch milliseconds）：<整数>
- 绝对产物路径清单：<公开路径附件引用；摘要/哈希>
- 公开路径的 `Cache-Control` 观测：<仅 worker、manifest 与带指纹资源；附件引用>
- 当前可用绝对资产路径：<公开路径附件引用；摘要/哈希>
- 完整成功历史（新到旧）：<每项的完整计划、生产发布时间与附件引用；首次发布为空>
- 共享源子应用的实际线上根计划：<不适用，或完整计划引用>
- 当前基线查找结果：<完整身份引用 / 明确的 missing；不得填“未查”>

## 机器门禁

- requiredChecks：<独立源/根：artifacts, response-headers, identity-baseline, release-retention, html-headers；子应用另加 release-order>
- `verifyRelease` 输入附件：<候选计划与上述事实的引用>
- `verifyRelease` 完整报告：<附件引用；记录 ok、已执行 checks、诊断码与路径，不记录敏感输入>
- `verifyReleaseGateCoverage` 结果：<ok 与 missing；附件引用>
- 普通发布结论：<仅当 report.ok 与 coverage.ok 均为 true 时填“通过”>

## 人工门禁与例外

| 项目 | 结论 | 证据或批准引用 |
|---|---|---|
| 发布通道 | <desktop / desktop+android>（发布尝试创建时确定，不可更改，ADR-0030） | <记录引用> |
| CI 与依赖审计 | <通过（CI 运行） / 通过（本地替代，ADR-0031） / 不通过> | <CI 运行链接，或本地门禁记录引用> |
| 浏览器矩阵与原生安装 | <通过 / 不通过> | <引用> |
| 类生产环境核对 | <通过 / 不通过> | <引用> |
| 恢复演练 | <通过 / 不通过> | <引用> |
| 首次发布评审 | <不适用 / 已批准 / 未批准> | <批准引用；须对应 baseline-missing> |
| 身份迁移 | <不适用 / 已批准 / 未批准> | <批准引用；须对应 baseline-mismatch> |

例外说明：<仅首次发布或已批准迁移可填写；保留原始报告事实，不得改写 report.ok 或诊断。>

## 部署、记录与状态时间线

| 时间（UTC） | 从 | 到 | 事件与证据 |
|---|---|---|---|
| <时间> | - | prepared | <已获取锁并完成事实采集> |
| <时间> | prepared | verified | <机器和人工门禁，或已批准例外> |
| <时间> | verified | deployed | <生产部署成功确认> |
| <时间> | deployed | recorded | <已追加成功历史、更新基线并释放锁> |

- 生产部署结果：<成功证据引用；失败时说明且转为 failed>
- 生产成功时间：<仅 deployed/recorded 填写>
- 历史写入结果：<仅 recorded 填写；引用>
- 基线写入结果：<仅 recorded 填写；引用>
- 失败或补偿动作：<不适用，或说明；失败不得新增成功历史或基线>
```

## 纸面核对示例

以下情形用于核对模板与协议，不是生产证据，也不应被标为 `recorded`：

| 情形 | 必需机器结论 | 状态结果 |
|---|---|---|
| 普通独立源发布 | 四项必需检查均在报告中，`report.ok` 与 coverage 均为 true，全部人工门禁通过 | `prepared → verified → deployed → recorded`；随后写历史与基线 |
| 首次发布 | 显式身份查找产生 `verify.baseline-missing`，覆盖完整，其他检查与人工门禁通过，平台负责人已批准 | 可按例外进入 `verified`；生产成功后才首次写基线与历史 |
| 同源子应用发布 | 五项必需检查均在报告中，`release-order` 使用实际线上根计划并通过 | 正常进入 `recorded`；根计划引用与子应用记录一起保存 |
| 失败发布 | 必需事实或报告检查缺失、coverage 为 false、部署失败或批准缺失 | 转为 `failed` 或 `aborted`；旧历史和基线保持不变 |
