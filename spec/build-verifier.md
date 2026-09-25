# 规格：build-verifier

## 目标

在发布之前，用可审计的方式回答平台自己回答不了的问题：**构建产物与计划是否一致**、**部署的响应头是否符合基线**、**本次身份与上一次生产发布是否相同**，以及**部署是否仍保留运行手册要求的带指纹资源兼容窗口**。

这些事的共同点是：编译器看不到它们。`compilePlan` 只消费配置与构建清单，既读不到磁盘上真实存在哪些文件，也读不到 CDN 返回什么响应头，更不知道上一次发布用的是哪个身份或历史资产是否仍可用。build-verifier 补上这一层，并把结果汇成一份结构化报告，供 CI、vite-adapter 与发布门禁消费。它还提供独立的报告覆盖校验，使发布方能证明所需检查没有被遗漏；覆盖校验不产生新的部署事实，也不替代各项检查的通过结论。

成功标准：[发布门禁](../docs/operations/release-and-incident-runbook.md#发布门禁)中"身份基线比较"与"类生产环境核对"两项，从人工核对变为工具强制执行；[V1 验收矩阵](../docs/architecture/v1-acceptance-matrix.md)"首次在线访问"所要求的 build-verifier 报告可以产出。

## 范围

**交付物：**

- 私有工作区包 `packages/build-verifier`，包名 `@pwa-platform/build-verifier`：
  - 入口 `.`：`verifyArtifacts`、`verifyResponseHeaders`、`compareIdentityBaseline`、`verifyReleaseRetention`、`verifyRelease`、`verifyReleaseGateCoverage`、`readIdentityBaseline` 与报告类型。
- contracts 追加本模块所需的 `verify.*` 诊断码（见"诊断"及后续修订）。这是对已交付包公开契约的修改，随本模块交付，并同步更新声明快照。
- 单元测试（Vitest）。本模块不含浏览器行为，不需要浏览器自测。
- `docs/adr/0014-build-verification-boundary-and-report.md`：记录职责边界、纯函数取向、基线存放约定与报告形态。
- 同步 `docs/operations/identity-release-baseline.md`（补上"基线的具体路径在 build-verifier 交付时确定"这一悬念）、`docs/architecture/package-boundaries.md`、`README.md`、`docs/DOCUMENTATION-BASELINE.md`。

**不做的事：**

- **不重新实现 core 已有的任何校验。** 计划合法性直接调用 contracts 的 `validatePlan`；`compile.*` 系列诊断（`allow-under-deny`、`offline-fallback-not-built` 等）由编译器负责，本模块不重算，也不重新编译计划去比对。
- **不发任何网络请求。** 响应头由调用方采集后传入（见"公开契约"）。
- **不写入基线。** 基线只在生产发布成功后更新，那是发布流程的动作；本模块只读取与比较。
- 不校验安装元数据、不判定浏览器行为、不生成 Markdown 报告（调用方决定如何呈现）。
- 不修改 core、sw-runtime、client-runtime 或 engine-workbox。
- 不推断某个发布环境必须执行的检查集合，也不将报告覆盖完整本身判定为发布通过；这两项由发布编排协议负责（[ADR-0025](../docs/adr/0025-release-gate-completeness-and-external-orchestration.md)）。

## 依赖

- **运行时依赖**：`@pwa-platform/contracts`（`workspace:*`）。不新增第三方依赖。
- **开发依赖**：`@pwa-platform/browser-test-harness`、`@types/node`，均已在 lockfile 中。harness 仅用于响应头解析的一致性测试（见"测试策略"），生产代码不导入它。

### 能力图已修订：依赖由 policy-compiler 改为 contracts-foundation

能力图原先把 `policy-compiler` 列为本模块的依赖。但按上文的职责边界，本模块消费的是 **`PwaPlan`**，而该类型与 `validatePlan` 都来自 contracts，不来自 `@pwa-platform/core`；core 的公开导出只有 `compilePlan` 与三个编译输入类型，本模块一个都用不到。

这与 client-runtime 那次的情况正好相反：那次是**用了却没声明**（导入 sw-runtime 的消息常量），这次是**声明了却用不上**。声明一个用不到的依赖会让依赖边界测试失去意义，因此能力图改为 `contracts-foundation`，与实际导入一致。

build order 不受影响：`contracts-foundation` 是第一组，本模块排在其后，依赖偏序仍然成立。

## 公开契约

### 产物一致性

```ts
function verifyArtifacts(plan: PwaPlan, published: readonly string[]): PwaVerificationCheck;
```

- `published` 是本次构建实际发布出的路径清单，均为以 `/` 开头的绝对路径，按站点根解释（与 `PwaPlan.precache[].url` 同一形态）。
- 检查项：
  - `plan.precache` 的每个 `url` 都出现在 `published` 中，否则每条缺失报 `verify.artifact-missing`，路径指向该条目在计划中的位置；
  - `plan.identity.serviceWorkerUrl` 与 `plan.identity.manifestUrl` 都出现在 `published` 中，否则报 `verify.artifact-path-mismatch`。
- 比较按字符串逐字进行，不做百分号编码归一化——计划里的路径已是规范形态，产物清单若拼写不同，就是真实的不一致。
- `published` 中多出的文件不报告：构建产出计划之外的文件是正常的。

### 响应头基线

```ts
function verifyResponseHeaders(plan: PwaPlan, observed: PwaObservedResponses): PwaVerificationCheck;

/** 路径 → 该响应的头部（头名小写）。由调用方采集，本模块不发请求。 */
type PwaObservedResponses = Readonly<Record<string, Readonly<Record<string, string>>>>;
```

- 按[响应头基线](../docs/operations/release-and-incident-runbook.md#响应头基线)判定 `Cache-Control`：worker 脚本与 manifest 必须含 `no-cache`、不得含 `immutable`；带指纹的资源必须含 `immutable` 与取正整数的 `max-age`、不得含 `no-cache` 与 `no-store`。
- 逐指令比较：必须包含的都在、不得包含的都不在即为符合，其他指令不影响结果。
- 缺失的指令报 `verify.header-missing-directive`，出现的禁用指令报 `verify.header-forbidden-directive`；`observed` 中没有某个必须检查的路径时报 `verify.header-unreadable`。
- 诊断的 `path` 指向计划中对应的字段或条目，消息不回显响应头原文。
- **公开 HTML 与私有 HTML/数据两类本期不判定**：计划不记录哪些路由是 HTML、哪些是私有，判定所需的信息不在 `PwaPlan` 里。见"已知限制"。

### 身份基线比较

```ts
function compareIdentityBaseline(candidate: PwaIdentity, baseline: unknown): PwaVerificationCheck;
function readIdentityBaseline(options: { readonly directory: string; readonly slot: string }): unknown;
```

- `compareIdentityBaseline` 是纯函数：候选身份先过 `validateIdentity`，基线也先过 `validateIdentity`（不通过报 `verify.baseline-invalid`），再按[身份发布基线规则](../docs/operations/identity-release-baseline.md#比较规则)逐字段比较 9 个字段（8 个不可变字段加 `environment`）。
- 任一字段不同报 `verify.baseline-mismatch`，`path` 指向该字段；**不做任何归一化**，大小写、结尾斜杠、百分号编码写法的差异都算变更。
- `readIdentityBaseline` 是唯一读盘的函数：从 `<directory>/<slot>.json` 读取并解析 JSON；文件不存在时抛错，由调用方决定这是首次发布还是门禁失败——**本模块不替发布流程判断"是否首次发布"**，那需要人工评审记录（ADR-0004）。
- 槽位名约定：`^[a-z0-9]+(-[a-z0-9]+)*$`，与 module id 同一形态；不合法时抛错。

### 汇总

```ts
function verifyRelease(input: PwaVerifyReleaseInput): PwaVerificationReport;

type PwaVerificationReport = {
  /** 所有执行过的检查都通过。 */
  readonly ok: boolean;
  readonly checks: readonly PwaVerificationCheck[];
  /** 所有检查的诊断，按检查顺序拼接。 */
  readonly diagnostics: readonly PwaDiagnostic[];
};

type PwaVerificationCheck = {
  readonly name: "artifacts" | "response-headers" | "identity-baseline" | "release-order" | "release-retention";
  readonly ok: boolean;
  readonly diagnostics: readonly PwaDiagnostic[];
};
```

- `verifyRelease` 按 `VERIFICATION_CHECKS` 的固定顺序执行所有已提供的检查并汇总；输入中省略某项（例如尚未采集响应头）时跳过它，报告中不出现该项，`ok` 只反映执行过的检查。
- **省略 `baseline` 与显式传 `undefined` 语义不同**：省略该属性表示本次不做基线比较（报告中没有这一项）；显式传 `undefined` 或 `null` 表示查过了、没有基线，报 `verify.baseline-missing`。"没查" 与 "查了没有" 是两个事实，发布门禁必须能区分。实现用 `Object.hasOwn` 判定，而非值是否为 `undefined`。
- **全部检查都省略时 `checks` 为空、`ok` 为 `true`**：没有执行任何检查也就无从失败。因此 `ok` 单独一项不能证明发布被验证过，调用方必须确认 `checks` 覆盖了它要求的项。
- 报告可 JSON 序列化，字段顺序确定，便于写入验证记录与 diff。

### 发布门禁覆盖

```ts
type PwaReleaseGateCoverage = {
  /** 调用方声明的每个必需检查均出现在报告中。 */
  readonly ok: boolean;
  /** 缺失的检查名，保持 `required` 的声明顺序。 */
  readonly missing: readonly PwaVerificationCheckName[];
};

function verifyReleaseGateCoverage(
  report: PwaVerificationReport,
  required: readonly PwaVerificationCheckName[],
): PwaReleaseGateCoverage;
```

- 此函数只证明 `report.checks` 覆盖了调用方声明的 `required` 集合。`coverage.ok` 与 `report.ok` 是两个独立结论：发布方只有在两者均为 `true` 时，才能得出所有已要求机器检查都通过的结论。
- `required` 必须只含既有检查名且不得重复；报告中的检查名也必须是既有且唯一。调用方传入不符合该契约的数据时抛出不回显输入内容的 `TypeError`，不把宿主错误伪装成缺失检查。
- 空的 `required` 合法，结果为 `ok: true` 且 `missing: []`。函数不访问网络、文件或部署历史，不重新执行 `verifyRelease` 的任何检查，也不新增 `verify.*` 诊断码。
- 哪些检查属于某个发布线的必需集合，是发布编排协议的职责；独立源与共享源的集合可以不同。决定与外部编排边界见 [ADR-0025](../docs/adr/0025-release-gate-completeness-and-external-orchestration.md)。

### 诊断

以下诊断码追加到 contracts 的 `DIAGNOSTIC_CODES`，全部为 `error`：

| 码 | 含义 |
|---|---|
| `verify.artifact-missing` | 计划中的预缓存条目在发布产物中不存在 |
| `verify.artifact-path-mismatch` | worker 或 manifest 不在身份规定的路径上 |
| `verify.header-missing-directive` | 响应头缺少基线要求的指令 |
| `verify.header-forbidden-directive` | 响应头出现基线禁止的指令 |
| `verify.header-unreadable` | 需要检查的路径没有对应的响应头 |
| `verify.baseline-invalid` | 基线文件本身不通过 `validateIdentity` |
| `verify.baseline-missing` | 比较所需的基线不存在 |
| `verify.baseline-mismatch` | 候选身份与基线的某个字段不同 |

与 contracts 一致：诊断路径只包含契约字段名与数组下标，消息由平台撰写，不回显任何输入原文。

## 命令

```bash
pnpm --filter @pwa-platform/build-verifier build
pnpm --filter @pwa-platform/build-verifier test
pnpm --filter @pwa-platform/build-verifier typecheck
```

## 测试策略

- **产物一致性**：缺一条、缺多条、worker/manifest 路径不符、产物多出文件（不报告）、路径大小写与编码差异（报告为不一致）。
- **响应头**：三类资源各自的通过与失败；多行头与带引号的指令；缺失路径；不冲突的额外指令不影响结果。
  - **一致性测试**：本包自带 `Cache-Control` 解析（不能依赖 harness，[包边界](../docs/architecture/package-boundaries.md)规定生产代码不得导入测试包）。用 harness **公开的 `expectCacheControl`** 作为对照：对同一组头部与同一条指令期望，断言两者的判定结果一致——与 sw-runtime 用 core 的 `compilePlan` 守护路径匹配是同一手法。
    - 对照的是可观察行为而非内部结构：harness 只导出 `expectCacheControl`，其解析函数不在公开面上，而两份实现本也只需在判定上一致。
    - 含重复指令的样本不参与对照：harness 的断言另外禁止指令重复，那是它的断言语义，发布门禁的响应头基线并无此要求；照抄会让工具比它所执行的规范更严。
- **身份基线**：9 个字段逐个不同各一例；基线本身不合法；候选不合法；完全相同则通过；归一化差异（结尾斜杠、大小写、`%2F`）均判为不同。
- **读盘**：文件存在、不存在、JSON 非法、槽位名不合法。
- **报告**：字段顺序确定、可 JSON 往返、跳过的检查不出现在报告中、`ok` 与各项一致。
- **发布门禁覆盖**：全覆盖、单项与多项遗漏、额外报告检查、空报告、空必需集、重复或未知必需名称、伪造或重复报告检查名；覆盖完整而某一执行检查失败时，覆盖结果仍为通过，调用方必须同时判断 `report.ok`。
- **诊断码**：本模块追加的全部 `verify.*` 码按规格顺序出现在 `DIAGNOSTIC_CODES` 中，且每个都有非空消息（照 `compile.*` 的既有断言）。
- **依赖边界**：包内**每个源文件**的导入说明符只含 contracts 与相对路径；不含 Node 内建模块，`baseline-file.ts` 除外（它是唯一允许 `node:fs` 的模块，由测试钉死）。守卫按文件扫描而非只看入口的导入闭包——`index.ts` 再导出 `readIdentityBaseline`，入口闭包本就包含 `node:fs`。另有一条检查禁止绕过导入图取用内建模块（`process.getBuiltinModule`、`createRequire`），否则前面的说明符检查形同虚设。
- **变异检查**：逐个破坏已实现检查的核心判断与报告汇总，确认对应测试失败。

## 边界

- **始终**：只消费 `PwaPlan` 与调用方传入的观测数据；诊断不回显输入原文；比较不做归一化；报告可 JSON 序列化。
- **先询问**：新增依赖；发起网络请求；写入或更新基线文件；改变 `verify.*` 诊断码集合；重新实现任何 `compile.*` 的判断；扩大到公开/私有 HTML 的响应头判定；让覆盖函数推断环境默认必需集。
- **禁止**：替发布流程判断"是否首次发布"；在比较前归一化身份字段；把 core 的编译逻辑复制进本模块；把覆盖完整等同于发布通过。

## 验收标准

1. `@pwa-platform/build-verifier` 提供上文的公开契约，依赖边界由测试守护。
2. 已实现检查的判断与诊断符合上文；报告确定、可序列化。
3. contracts 追加本模块所需的 `verify.*` 码，声明快照与既有断言同步更新，`pnpm --filter @pwa-platform/contracts test` 通过。
4. 单元测试与变异检查覆盖以上行为。
5. ADR-0014 记录本模块的决定；身份基线文档的"路径待定"悬念已消除；包边界、README 与文档基线已同步。
6. `verifyReleaseGateCoverage` 使调用方能证明报告覆盖其显式必需集；它不重算检查、不改变 `verifyRelease` 的可选输入语义，且文档明确要求将其结果与 `report.ok` 合取。

## 已决定事项（项目所有者，2026-09-16）

- **只做 core 拿不到的事**：产物一致性、响应头基线、身份基线比较。计划合法性直接调 `validatePlan`，不重算 `compile.*`。
- **不发网络请求**：响应头由调用方采集后传入，本模块是纯函数，可在 CI 中离线运行。
- **基线按约定目录存放**：`<directory>/<slot>.json`，路径可配置；`readIdentityBaseline` 是包内唯一读盘的函数。
- **报告是结构化对象**，诊断复用 contracts 的 `PwaDiagnostic`，不另造一套诊断体系，也不在包内生成 Markdown。
- **`verify.*` 诊断码追加到 contracts**，与 policy-compiler 当初追加 `compile.*` 的做法一致，使报告能与平台其余诊断统一消费。

## 已知限制

- **公开/私有 HTML 的响应头未判定**：`PwaPlan` 不记录哪些路由是 HTML、哪些属于私有数据，判定所需信息不在计划里。这两类继续按发布门禁人工核对，直到计划能表达该信息为止。
- **"是否首次发布"不由工具判断**：找不到基线时本模块只报告事实，是否按首次发布处理取决于人工评审记录（ADR-0004、身份发布基线规则）。
- **`max-age` 的具体时长不校验**：多长才算"长"由基础设施团队在部署配置中确定，本模块只要求它是正整数。`max-age=0` 判为失败——它不是该团队可能选的某个时长，而是让这行基线失效的退化值（`max-age=0, immutable` 是常见的 CDN 误配）。
- **不校验产物内容**：只比较路径是否存在，不比较文件内容或哈希；内容一致性由构建工具与 `__WB_REVISION__` 机制保证。

## 修订：发布保留窗口校验（已接受，2026-09-19）

本修订已由 [ADR-0024](../docs/adr/0024-release-retention-verification.md) 接受。它把[发布与事故处置手册的缓存保留规则](../docs/operations/release-and-incident-runbook.md#缓存保留)变成调用方可执行的离线门禁，但不改变该规则。

### 公开契约

```ts
type PwaReleaseRetentionSnapshot = {
  /** 此历史发布被部署的 UTC epoch milliseconds。 */
  readonly releasedAtMs: number;
  /** 发布记录保存的原始计划；实现先调用 validatePlan。 */
  readonly plan: unknown;
};

type PwaReleaseRetentionInput = {
  /** 评估时刻的 UTC epoch milliseconds。 */
  readonly asOfMs: number;
  /** 候选计划之前的完整发布记录，严格按新到旧排列。 */
  readonly previous: readonly PwaReleaseRetentionSnapshot[];
  /** 当前部署在评估时刻可提供的绝对资源路径。 */
  readonly available: readonly string[];
};

function verifyReleaseRetention(
  plan: PwaPlan,
  input: PwaReleaseRetentionInput,
): PwaVerificationCheck;
```

`PwaVerifyReleaseInput` 新增可选 `retention?: PwaReleaseRetentionInput | undefined`。与 `baseline` 相同，**属性省略**表示不执行检查；显式传 `undefined` 或不完整值表示尝试过检查但记录无效，报 `verify.retention-history-invalid`，不得静默跳过。报告的 `name` 联合类型新增 `"release-retention"`，固定排在既有四项之后。

### 判断规则

- 所有 `available` 条目必须是以 `/` 开头的字符串；否则抛 `TypeError`。这是宿主调用错误，不能伪装成资产缺失。
- `asOfMs`、每个 `releasedAtMs` 都必须是有限、非负整数；历史快照必须严格新到旧，且都不得晚于 `asOfMs`。历史计划先过 `validatePlan`，并且其 `appId`、`origin`、`environment` 与候选计划相同。任一历史前提不成立，`release-retention` 失败并报告 `verify.retention-history-invalid`；实现不得基于不可信快照继续计算保留集。
- 带指纹条目仅指 `precache[].revision === null`。候选计划、`previous[0]`、`previous[1]` 中的这些路径始终需要出现在 `available`。
- 对 `previous[2]` 及更早的快照，若其直接后继（即 `previous[index - 1]`）的 `releasedAtMs + 604_800_000` 晚于 `asOfMs`，该快照中的带指纹路径仍必须存在；到达或越过该时刻后，本检查不再要求它。
- 同一路径由多次发布引用时只产生一条 `verify.retention-missing`。诊断的 `path` 使用首次要求该路径的候选/历史计划数组位置；消息不得含 URL、时间戳或任何宿主输入。
- 调用方必须提供该发布线的完整历史记录。若调用方省略实际存在的旧发布，验证器没有独立状态可发现该事实；发布系统因此须把完整记录作为门禁输入的来源。

### 诊断

以下码在实施时追加到 `DIAGNOSTIC_CODES`，均为 `error`：

| 码 | 含义 |
|---|---|
| `verify.retention-history-invalid` | 历史发布记录不能作为同一发布线的可信保留依据 |
| `verify.retention-missing` | 兼容窗口要求保留的带指纹资源当前不可用 |

### 测试策略与验收补充

- 覆盖首次发布、第二和第三次发布、仅 R/R-1/R-2 规则、七天窗口的前一毫秒/恰好到期/后一毫秒、重复路径去重、带 revision 条目排除、历史计划非法、时间乱序、跨发布线与可用路径形态错误。
- `verifyRelease` 覆盖 `retention` 省略、存在、与其他检查并存时的固定顺序、`ok` 和诊断拼接；真实 Vite 产出的计划作为跨包输入，确认不需要在 Vite 生产构建中触发网络或保留检查。
- 对保留集选择、七天边界、R-2 无条件保留、诊断去重和 `Object.hasOwn` 语义分别进行变异检查。
- 实施完成后，ADR-0014、README、包边界与发布运行手册的交叉链接必须复核，确保不把“调用方提供完整发布记录”误写成 Vite 自动保证。

## 修订：公开 HTML 响应头检查（2026-09-22，已评审通过）

### 起因

[发布与事故处置手册的响应头基线](../docs/operations/release-and-incident-runbook.md#响应头基线)要求公开 HTML 的 `Cache-Control` 必须包含 `no-cache`、不得包含 `immutable`，但 `verifyResponseHeaders` 只判断 worker、manifest 与带指纹资源，公开 HTML 一直只能人工核对（[桌面发布演练清单](../tasks/platform-governance/desktop-release-rehearsal.md)第 5 项与 Cloudflare 测试站两次核验都记录了这一缺口）。HTML 被长期缓存时，用户会停留在引用旧指纹资源的旧应用壳上，页面新旧判断也随之失效。

本包是公开发布的 npm 包（`@pwa-platform/build-verifier`），业务发布系统通过 `verifyRelease` 使用它；因此这项改动影响所有调用方，必须保持向后兼容。

### 已确认的前提（项目所有者，2026-09-22）

- **新增独立检查 `html-headers`，不扩展现有的 `response-headers`。** 扩展现有检查会让尚未采集 HTML 响应头的调用方升级后立即报 `verify.header-unreadable`，等于静默收紧所有人的门禁。
- **按输入是否存在决定是否执行**，与 `baseline`、`retention` 相同：调用方省略新属性即不执行；是否"必须执行"由发布协议的必需检查清单与 `verifyReleaseGateCoverage` 判定。
- **发布手册的必需检查清单加入 `html-headers`**（所有拓扑）。这是发布协议的变更，记录为 [ADR-0032](../docs/adr/0032-html-response-header-check.md)。
- **公开 HTML 路径由计划推导**：`identity.mountPath`、`install.startUrl`（`install` 非空时）、`offlineFallback.path`（启用时），以及 `precache` 中 `revision` 非空且以 `.html` 结尾的条目；去重。
- **不检查私有 HTML。** 平台的资源分类没有"私有 HTML"，计划无法判断哪个页面是私有的；该行仍需人工核对。
- **不新增诊断码**，复用 `verify.header-missing-directive`、`verify.header-forbidden-directive`、`verify.header-unreadable`；诊断路径指向计划字段。

### 公开契约

```ts
// VERIFICATION_CHECKS 在末尾追加 "html-headers"；已有元素的顺序不变。
function verifyHtmlHeaders(plan: PwaPlan, observed: PwaObservedResponses): PwaVerificationCheck;

type PwaVerifyReleaseInput = {
  // ……既有属性不变……
  /**
   * 公开 HTML 路径的已观测响应头。省略属性表示不执行 html-headers 检查。
   * 调用方对 HTML 应跟随同源重定向（例如 `/app/offline.html` → `/app/offline`），记录最终响应的头；
   * 本包只判断传入的头，不关心采集方式。
   */
  readonly htmlObserved?: PwaObservedResponses;
};
```

`verifyRelease` 在其余检查之后执行 `html-headers`，报告中的检查顺序与 `VERIFICATION_CHECKS` 一致。

### 判断规则

- 路径集合按上文推导并去重；每个路径按"必须包含 `no-cache`、不得包含 `immutable`"判断，指令解析复用本包的 `Cache-Control` 解析器，规则与 `response-headers` 中 `REVALIDATED` 一行相同。
- 路径没有观测记录时报 `verify.header-unreadable`，不跳过。
- 诊断路径：`/identity/mountPath`、`/install/startUrl`、`/offlineFallback/path`、`/precache/<index>/url`；同一路径由多个字段推导出时，只按第一个字段报一次。

### 不变的部分

- `verifyResponseHeaders`、`response-headers` 的行为与报告内容；既有调用方不传 `htmlObserved` 时，`verifyRelease` 的输出逐字节不变。
- 诊断码表、包的依赖与导入边界（仍只依赖 `contracts`，零网络、零写盘）。

### 本修订不做的事

- 不检查私有 HTML；不采集响应头（仍由调用方传入）。
- 不改 Cloudflare 测试站工具：它接入 `htmlObserved` 另行修订 `cloudflare-test-deployment`。
- 不发布新的 npm 版本：发布走 `package-distribution` 的流程。
- 不新增文档基线关注项（因此不需要改动各规格的 Documentation impact 表）。

### 交付物增量

- `packages/build-verifier`：`verifyHtmlHeaders`、`htmlObserved` 输入、`VERIFICATION_CHECKS` 追加，以及测试。
- [ADR-0032](../docs/adr/0032-html-response-header-check.md)。
- [发布与事故处置手册](../docs/operations/release-and-incident-runbook.md)：必需检查清单加入 `html-headers`，响应头基线表注明公开 HTML 已有机器检查、私有 HTML 仍需人工核对；[发布编排协议](../docs/operations/release-orchestration-protocol.md)与[包边界](../docs/architecture/package-boundaries.md)中列举检查名称的地方同步更新。

### 测试策略增量

- **单元测试**：路径推导（`install` 为空、离线页关闭、预缓存无 HTML、`mountPath` 与 `startUrl` 相同时去重）；`no-cache` 缺失、`immutable` 存在、两者同时出错、无观测记录；诊断路径指向正确字段。
- **`verifyRelease`**：省略 `htmlObserved` 时输出与修订前逐字节相同（以既有测试的期望值固定）；提供时 `html-headers` 出现在报告末尾，`ok` 正确合取；`verifyReleaseGateCoverage` 对缺少 `html-headers` 的报告判不完整。
- **兼容性**：`VERIFICATION_CHECKS` 的前五个元素与修订前相同；包边界与导入闭包测试不变。
- **变异检查**：去掉任一推导来源、把 `include`／`exclude` 互换、省略"无观测即报错"，测试都应失败。

### 验收标准增量

- 公开 HTML 的 `no-cache` 可由 `verifyRelease` 机器判断；缺失观测会报错而不是跳过。
- 不传 `htmlObserved` 的既有调用方升级后行为不变。
- 发布手册的必需检查清单与 ADR-0032 一致。

## 修订：manifest 引用的截图与快捷方式图标必须存在（2026-09-24，已评审通过）

主体见 [contracts-foundation 的"安装元数据的扩展字段"](contracts-foundation.md)。本节只记录产物检查。

- `verifyArtifacts` 在既有检查之外，要求 `plan.install.screenshots[].src` 与 `plan.install.shortcuts[].icons[].src` 都出现在已发布路径中。缺失时报 `verify.manifest-asset-missing`（错误），路径指向字段，例如 `/install/screenshots/0/src`，不回显路径值。
- `plan.install` 为 `null` 或未写这些字段时，检查结果与修订前相同。
- Vite 与 Nuxt 都经 `assertPwaArtifacts` 调用本检查，因此缺文件时两者的构建都失败。

**已知限制**：既有的 `icons` 不做同样的检查。有的应用的图标由后端提供、不在构建产物中，突然开始检查会让这些应用的构建失败。是否对 `icons` 也做检查，另行评估。

**测试**：每个来源缺失各一例（截图、快捷方式图标）；全部存在时通过；未写字段时与修订前相同；诊断不含路径值；变异证明检查会变红。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不改变首期交付结果与排除项。 |
| architecture | follow | 不新增分层，纯函数包不引入运行时依赖。 |
| developer-entry | update | README 的包清单与状态一节列出本包。 |
| capability-map | update | 本模块与其依赖登记在能力图中。 |
| decisions | create | ADR-0014（校验边界与报告）、ADR-0024（保留窗口校验）、ADR-0032（公开 HTML 响应头检查）。 |
| lifecycle-and-recovery | follow | 不参与运行时生命周期。 |
| ci-baseline | follow | 不改变 CI 工作流。 |
| supply-chain | follow | 只依赖 contracts，不引入第三方包。 |
| browser-matrix | follow | 不执行浏览器检查；矩阵中对本模块的引用由该文档维护。 |
| v1-acceptance | follow | 矩阵中的发布检查项由本模块提供实现，验收口径本身不变。 |
| identity-release-baseline | follow | 读取基线做比较，不改变其规则与存放方式。 |
| release-and-incident | update | 手册的发布门禁必需检查表与响应头基线由本模块的检查集决定，2026-09-23 随 ADR-0032 更新。 |
| recovery-drill | follow | 不改变恢复演练流程。 |
| browser-release-evidence | follow | 机器检查与浏览器证据是两类证据，互不替代。 |
| package-distribution | follow | 本包在首批分发范围内，分发决定由该模块维护。 |
| cloudflare-test-deployment | follow | 测试站核验工具是本模块的调用方，其修订记在该模块。 |
| browser-test-harness | follow | 不使用 harness。 |
| workbox-engine | follow | 不触及引擎端口。 |
| sw-runtime | follow | 不改变 worker 行为。 |
| offline-write-extension | follow | 不校验离线写队列。 |
| build-verifier | create | 本模块自身的事实源：规格、三份 ADR 与验证记录。 |
| release-gate-contract | follow | 覆盖判定是该模块的契约，本模块只提供其输入与实现位置。 |
| local-ci-record | follow | 不改变本地门禁记录模板。 |
| release-orchestration-protocol | follow | 必需集由外部协议决定；本模块只提供检查与覆盖判定。 |
| vite-adapter | follow | Vite 适配是调用方，不改变其插件契约。 |
| client-runtime | follow | 不参与页面侧协议。 |
| vue-react-adapters | follow | 不参与框架绑定。 |
| examples-browser-e2e | follow | 示例是调用方，其证据记在该模块。 |
| pwa-entry-resilience | follow | 不校验入口清单。 |
| ssr-adapters | follow | 不区分 SSR 与 CSR 产物。 |
| shared-origin-topology | follow | 同源子应用的发布顺序检查由本模块实现，拓扑规则由该模块定义。 |
| push-module | follow | 不校验 Push 配置。 |
| public-read-cache | follow | 本模块不改变该基线的权威文档或验收结论。 |
