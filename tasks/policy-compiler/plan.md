# 实现计划：policy-compiler

## 概览

交付私有工作区包 `@pwa-platform/core`。它提供纯函数 `compilePlan`，把 identity、安装元数据、策略、拓扑和宿主构建产物清单，确定性地编译为能通过 contracts `validatePlan` 的 `PwaPlan v1`。

规则优先级只在这里实现：拒绝规则排在允许规则之前，允许规则按最长前缀排序，冲突一律编译失败。本模块还会在 contracts 中追加 `compile.*` 诊断码。

> Tasks tracked in GitHub Issues #14

## 架构决定

- **包形态**：`@pwa-platform/core` 是私有 ESM 包，以 `workspace:*` 依赖 contracts，工具链与 contracts 相同（TypeScript、Vitest、ESLint）。它只在 Node 构建期运行，可以使用 contracts 的校验函数；不做 I/O，不依赖 Workbox 和浏览器全局对象。
- **根脚本**：当前根目录的 `build`、`test` 固定只跑 contracts，`pnpm test --filter @pwa-platform/core` 实际执行的仍是 contracts。任务 1 把根脚本改为按 `--filter` 转发；不带 filter 时，按依赖顺序运行所有工作区包。这属于脚本调整，不更换工具链。
- **契约归属**：编译诊断码追加到 contracts 的 `DIAGNOSTIC_CODES`（公开契约变更，同步更新 contracts 声明快照）。`PwaCompileInput` 及其校验归 core。
- **诊断路径**：沿用 contracts 的规则，路径只包含 core 输入的已知字段名和数组下标。contracts 内部的路径工具不对外导出，core 自己维护字段白名单，并用编译期检查守护。
- **规则比较**：前缀按 URL 标准逐段解码后比较，`%2F` 不解码为分隔符。`contentHash` 限定为 URL 安全字符，长度 8–128。这两项是 spec 开放问题的建议取值，评审没有提出异议，按此执行。
- **排序即语义**：`pathRules` 的排列顺序就是运行时的首个匹配顺序；预缓存条目按 URL 码点顺序排列。任何排序变化都视为编译器语义变更。

## 任务定义

### 任务 1：建立 core 包骨架并让根脚本支持多包

**说明：** 创建最小的 `@pwa-platform/core` 包，并把 `scripts/run-contracts.mjs` 改造成可以转发 `--filter` 的通用工作区脚本。不包含任何编译逻辑。

**验收标准：**

- `packages/core` 是私有 ESM 包，由 `exports` 控制入口，只依赖 `@pwa-platform/contracts`（`workspace:*`），声明 `"sideEffects": false`。
- `pnpm test --filter @pwa-platform/core` 和 `pnpm build --filter @pwa-platform/core` 只运行 core；不带 filter 的 `pnpm build` 和 `pnpm test` 按依赖顺序先 contracts、后 core。
- core 的 import-safety 测试证明：导入时不读取浏览器全局对象。

**验证：** 两个包分别运行定向命令，再运行不带 filter 的根命令，确认执行顺序和退出码；`pnpm lint` 通过。

**依赖：** 无。

**预计范围：** M（根脚本、根 package.json、core 的包配置与入口、lockfile）。

### 任务 2：在 contracts 追加编译诊断码

**说明：** 按 spec 的诊断表，把 9 个 `compile.*` 码及平台消息加入 contracts。这是有意识的公开契约变更。

**验收标准：**

- `DIAGNOSTIC_CODES` 按 spec 的顺序追加 9 个 `compile.*` 码，`MESSAGES` 为每个码提供一条不含输入原文的消息。
- contracts 的声明快照更新，其 diff 只包含新增的码。
- 已有的 v1 golden 文档仍然原样通过。

**验证：** 运行 `pnpm test --filter @pwa-platform/contracts` 和 contracts typecheck；逐行审阅快照 diff。

**依赖：** 任务 1。

**预计范围：** S（contracts 的 `diagnostics.ts`、`internal/diagnostic.ts`、声明快照）。

### 任务 3：输入校验与最小可编译计划

**说明：** 定义 `PwaCompileInput`，实现 `compilePlan` 的输入校验和计划组装，覆盖不涉及规则与预缓存的字段。

**验收标准：**

- 调用 contracts 的函数校验 identity、install、policy，失败诊断的路径加上字段前缀。宿主产物清单（路径、`contentHash` 格式、`publicPath` 位于 scope 内）和拓扑按 spec 校验，分别报 `compile.invalid-host-output`、`compile.public-path-outside-scope`、`compile.unsupported-topology`。
- 策略的 resources 为空、未启用离线降级时，能编译出通过 `validatePlan` 的计划，其中 `cacheNamespace`、基线拒绝项、版本号和 `updateMode` 都正确。
- install 开关生效：`policy.install.enabled` 为 true 但缺少元数据时报 `compile.install-metadata-missing`；为 false 时计划中的 `install` 为 `null`。
- 对任何输入（包括恶意输入）都返回结果、不抛错。

**验证：** 运行 `pnpm test --filter @pwa-platform/core`（表驱动测试覆盖每条失败路径，并断言成功输出通过 `validatePlan`）；运行 core typecheck。

**依赖：** 任务 2。

**预计范围：** M（`src/input.ts`、`src/compile.ts`、`src/index.ts`、测试与 fixture）。

### 检查点：基础

- lint、两个包的测试、构建、typecheck 全部通过。
- 最小计划可以编译并通过 contracts 校验；contracts 的回归测试没有意外变化。

### 任务 4：路径规则归一化与优先级

**说明：** 把策略资源规则编译为 `pathRules`。

**验收标准：**

- 前缀相对 `mountPath` 解析为绝对路径。session-data、mutation、stream、unclassified 四类编译为 `deny`，其余分类的 `action` 等于声明的 `cache`，`source` 为 `policy`。
- 输出顺序：拒绝规则全部排在允许规则之前；同组内前缀长的在前；前缀等长时按解码后的码点顺序。
- 允许规则等于或落在拒绝前缀之下时，报 `compile.allow-under-deny`；前缀解码后重复时，报 `compile.duplicate-path-prefix`（例如 `/%61pi` 与 `/api`）。两者都以稳定的诊断失败。

**验证：** core 的表驱动测试覆盖解析、每个分类、排序与各类冲突；属性测试断言打乱规则的输入顺序不改变输出，且没有允许规则会先于拒绝规则匹配到拒绝前缀下的路径。

**依赖：** 任务 3。

**预计范围：** M（`src/rules.ts`、`src/compile.ts`、测试）。

### 任务 5：预缓存选取与离线降级

**说明：** 根据规则和宿主产物清单生成 `precache` 与 `offlineFallback`。

**验收标准：**

- 只有 URL 首个匹配的规则是缓存策略不为 `none` 的 asset 允许规则的产物才进入预缓存；worker、manifest 和 `.map` 文件始终排除。
- revision 按 `fingerprinted` 决定：带指纹为 `null`，否则取 `contentHash`。条目按 URL 码点顺序排列并去重。某条 asset 规则一个产物都没覆盖时，给出 warning `compile.asset-rule-unmatched`，该 warning 同时出现在结果和计划中。
- 启用离线降级时，降级路径必须是构建产物且不能被拒绝规则覆盖（否则分别报 `compile.offline-fallback-not-built`、`compile.offline-fallback-denied`），满足条件时总会进入预缓存。

**验证：** core 表驱动测试；属性测试断言打乱产物的输入顺序不改变输出。

**依赖：** 任务 4。

**预计范围：** M（`src/precache.ts`、`src/compile.ts`、测试）。

### 检查点：核心编译

- 所有 spec 验收标准都有测试覆盖；成功输出总能通过 `validatePlan`。
- 与人确认规则和预缓存语义之后，再锁定回归面。

### 任务 6：锁定 core 公开导出与编译回归面

**说明：** 为 core 建立与 contracts 同等强度的回归保护。

**验收标准：**

- 运行时导出列表和 package.json（单一入口、`sideEffects: false`、只依赖 contracts）由测试锁定；公开声明快照中不出现 zod 或 core 的内部模块。
- 代表性输入的 golden 计划 JSON 已提交，要求逐字节一致，任何输出变化都必须显式评审。
- 依赖边界测试证明 core 不导入 `node:fs` 等 I/O 模块，也不导入 Workbox 或框架代码。

**验证：** 运行 core 测试；做变异测试，确认改变排序、放开冲突检查、导出内部符号时，对应检查都会失败。

**依赖：** 任务 5。

**预计范围：** M（`test/public-api.test.ts`、golden 与快照文件）。

### 任务 7：执行 policy-compiler 模块质量门禁

**说明：** 做模块级完整验证、独立评审和文档对齐，并记录可复现的结果。

**验收标准：**

- 在干净 worktree 中冻结 lockfile 安装后，lint、两个包的测试、构建和 typecheck 全部通过。
- 由独立上下文的评审确认 core 不包含 I/O、Workbox、Service Worker 或运行时逻辑；阻断项和应修项都已修复并补测试。
- 实现、spec、ADR-0002/0007/0008 与能力图一致；README 的开发命令和状态已更新；结果写入 `tasks/policy-compiler/verification.md`。

**验证：** 执行仓库命令并保存摘要；运行 spec-guard 产物校验；做 diff 检查。

**依赖：** 任务 6。

**预计范围：** S（验证记录、README 与必要的文档对齐）。

## Task List

### Phase 1：基础

- #25 建立 core 包骨架并让根脚本支持多包
- #26 在 contracts 追加编译诊断码（blocked by #25）
- #27 输入校验与最小可编译计划（blocked by #26）

### Phase 2：核心编译

- #28 路径规则归一化与优先级（blocked by #27）
- #29 预缓存选取与离线降级（blocked by #28）

### Phase 3：回归面与交付

- #30 锁定 core 公开导出与编译回归面（blocked by #29）
- #31 执行 policy-compiler 模块质量门禁（blocked by #30）

## 风险与缓解

| 风险 | 影响 | 缓解方式 |
|---|---|---|
| 解码后比较的规则与运行时匹配不一致 | 高 | 计划中保留声明时的写法，并以排序作为唯一语义；由运行时模块基于同一份计划做浏览器验证（browser-test-harness）。 |
| 允许规则通过编码变体绕过拒绝规则 | 高 | 冲突检测一律基于解码后的前缀；用属性测试覆盖编码变体。 |
| 根脚本改造影响 contracts 现有命令 | 中 | 任务 1 同时验证两个包的定向命令和不带 filter 的命令。 |
| 修改 contracts 诊断码波及已合入的回归面 | 中 | 追加独立成任务，逐行审阅快照 diff，已有 golden 必须原样通过。 |
| 计划的逐字节输出受插入顺序影响 | 中 | 所有集合在输出前显式排序；用属性测试打乱输入顺序并比较输出。 |

## 执行顺序

任务 1 → 任务 2 → 任务 3 → 任务 4 → 任务 5 → 任务 6 → 任务 7，每个任务单独提交。

任务 2 本身可以与任务 1 并行，但任务 3 同时依赖两者，而且两者都会改动 lockfile 和工作区配置，所以仍串行执行。全部完成后开一条模块 PR，正文写 `Closes #14`。

## 完成条件

- 模块 #14 下的所有任务按顺序完成，并随模块 PR 合并后关闭。
- spec 的全部验收标准、确定性属性测试和回归面检查通过。
- 编译器之外的包不重新实现规则优先级。
