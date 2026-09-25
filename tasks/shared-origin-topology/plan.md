# 实现计划：shared-origin-topology

## 概览

按 [spec/shared-origin-topology.md](../../spec/shared-origin-topology.md) 交付同源"一个根应用 + 固定子路径应用"的平台治理。交付内容：
- 登记表契约；
- `shared-origin` 拓扑类型；
- `exclude` 路径规则动作；
- 根应用的编译期排除与冲突检查；
- 平台 worker 对 `exclude` 的执行；
- 发布顺序校验；
- Vite 接入；
- 同源真实浏览器验证。

风险集中在三处，任务顺序照此安排：

1. **一次改动五个已交付包**（contracts、core、sw-runtime、build-verifier、vite）。所有改动只增不改；`standalone-origin` 的现有测试必须一字不改地通过，每个改动包的任务结束时跑全仓回归。
2. **契约先行**。登记表形状、拓扑对象与 `exclude` 语义一旦落进 contracts，下游四个包都依赖它。所以先写 ADR 提议稿，经项目所有者接受后再动 contracts。
3. **同源真实浏览器行为**：两个 worker 的控制边界、根页面发往子路径的请求、子 worker 安装之前的断网行为，此前从未在仓库中实测过。

## 架构决定

- **ADR 先于代码**：T1 写 ADR-0019 提议稿，并把规格的三个开放问题按下面的默认值写进去。项目所有者接受后才开始 T2。
- **开放问题的默认值**（T1 中交项目所有者确认）：
  1. 登记表文件放在根应用的仓库，子应用仓库保存副本；两份是否一致，由发布顺序校验的版本比较兜底。
  2. 新 ADR 编号为 0019，引用而不取代 ADR-0006。
  3. 根应用落在子 scope 内的任何策略规则（包括 `deny`）一律编译失败。
- **不新增外部依赖**。
- **真实浏览器验证放在 vite 包**：用真实 Vite 构建产出根应用与子应用两个站点，由 browser-test-harness 的夹具服务器在同一个源上提供。sw-runtime 的浏览器测试只补 `exclude` 的单 worker 场景。
- **Nuxt 模块不改**：它把拓扑固定为 `standalone-origin`，不受契约扩展影响；在 T8 写入已知限制。

## 任务定义

### 任务 1：ADR-0019 提议稿与开放问题

**说明：** 把规格"已决定事项"与三个开放问题的默认值写成 ADR-0019 提议稿，交项目所有者接受。

**验收标准：**
- ADR-0019 状态为"提议"，内容包括：
  - 登记表的形状与校验规则；
  - `shared-origin` 拓扑对象携带登记表快照，`PwaPlan` 不增加字段；
  - `exclude` 与 `deny` 的区别（为什么不能复用 `deny`，引用 ADR-0012 增补）；
  - 发布顺序校验的输入与三项检查；
  - 移除子应用的顺序（运维手册，不自动化）；
  - 三个开放问题的决定。
- ADR 引用 ADR-0006、ADR-0008、ADR-0012，不修改它们的结论。
- 全仓链接扫描 0 失效。

**验证：** 项目所有者接受后，把状态改为"已接受"并单独提交。

**依赖：** 无。

**预计范围：** S。

### 检查点 A：ADR 已接受

- 三个开放问题有明确决定；有任何改动时，同步修订规格。

### 任务 2：contracts 扩展

**说明：** 在 contracts 中加入登记表契约、`shared-origin` 拓扑与 `exclude` 动作，全部只增不改。

**验收标准：**
- 新增类型 `PwaOriginRegistry`、`PwaRegistryEntry` 与登记表校验函数（规格设计第 1 节的每条规则）。错误只含诊断码与契约路径，不回显输入值。
- `TOPOLOGY_KINDS` 增加 `shared-origin`；`PwaTopology` 成为可区分的联合类型；计划校验接受带登记表的拓扑对象。
- `PwaPathRuleAction` 增加 `exclude`。
- 新增诊断码（名称在实施记录中列出），每个都有消息文本。
- `PwaPlan` 的字段集合与 `planVersion` 不变。
- contracts 的现有测试断言一字不改并全部通过；公开导出清单只多出本任务声明的导出。

**验证：**
- 表驱动单元测试覆盖登记表每条校验规则的通过与失败，并断言错误信息中不含输入值；
- 变异：去掉"子 scope 不重叠"检查、去掉"身份字段两两不同"检查，各死在目标用例上；
- 全仓 `pnpm test` 回归。

**依赖：** 检查点 A。

**预计范围：** M。

#### T2 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收，并补了两处子代理按边界没有动的地方。**

**contracts 的新增（全部只增不改）：**
- `TOPOLOGY_KINDS` 增加 `shared-origin`；`PwaTopology` 成为可区分的联合类型；新增 `PwaOriginRegistry`、`PwaRegistryEntry`；`PwaPathRuleAction` 增加 `exclude`。
- 新增导出 `validateOriginRegistry`。登记表各字段沿用身份同名字段的校验规则，没有另写路径或源的规则。
- 登记表不变式 6 条，各有独立诊断码，报错不回显输入值：子 scope 超出根、子 scope 重叠、身份字段重复、条目地址超出自身 scope、根的地址落入子 scope、缓存前缀冲突。最后一条在现有命名规则下只会与"appId 重复"同时出现，保留它是为了不依赖命名规则的实现细节，代码注释中写明。
- 计划不变式：
  - `exclude` 与 `deny` 一样不算缓存策略，不触发 `policy.unsafe-cache-strategy`；
  - `exclude` 规则必须是平台来源、`unclassified` 类别；
  - 独立源计划不得含 `exclude`；
  - 同源计划的身份必须恰好匹配登记表中的一个条目，源与环境一致；
  - 根计划的 `exclude` 前缀集合恰好等于子 scope 集合（前缀形式为 scope 去掉末尾斜杠，与 core 的 `resolvePrefix` 一致），子计划不含 `exclude`；
  - 所有 `exclude` 排在其他规则之前。
- 新增诊断码 15 个：`registry.*` 6 个、`plan.*` 3 个、`compile.*` 3 个（其中 `compile.host-file-in-child-scope` 以警告级别发出，供 T3 使用）、`verify.*` 3 个（供 T5 使用）。集中在本任务加入，契约改动只发生一次。

**现有断言的改动（均为新增项）：**
- contracts：公开导出清单加入 `validateOriginRegistry`；公开类型快照重新生成；按前缀列出 `compile.*`、`verify.*` 诊断码的断言各追加 3 项。
- **build-verifier**：`report.test.ts` 钉住了 contracts 发布的全部 `verify.*` 码，追加 T5 要用的 3 个。子代理守边界没有动它，由主会话补上。

独立源的黄金计划文件 `test/golden/v1.json` 与序列化往返测试原样通过（深度比较解析后的 JSON），独立源的计划形状不变。

**主会话补的最小修复：vite 的选项代码。** `PwaTopology` 变成联合类型后，`packages/vite/src/options.ts` 的 `topology: { kind: topology.kind }` 过不了类型检查，全仓构建失败。子代理按"只改 contracts"的边界没有动它。主会话改为：
- 独立源仍从唯一字段重建对象（丢弃调用方多放的字段，行为不变）；
- 同源把登记表原样带给编译器，登记表的规则由 contracts 与编译器检查。
这样每个任务结束时全仓都能构建；完整的 Vite 接入仍在 T6，在 T3 之前编译器对同源拓扑仍报 `compile.unsupported-topology`。

**过程违规，如实记录**：子代理在还原变异时执行了 `git checkout -- src/validate.ts`（明确禁止），把整个文件还原成改动前的版本，随后手工重建，并用变异前记录的 `shasum` 确认与之前逐字节相同。主会话重跑了 contracts 全部测试与两个关键变异，结果一致。

**变异**：均在全绿基线上完成，还原后 `shasum` 一致。

| 变异 | 转红用例 | 执行者 |
|---|---|---|
| 去掉子 scope 重叠检查 | 2 条 | 子代理 |
| 去掉身份字段重复检查 | 2 条 | 子代理 |
| 去掉 `exclude` 必须在前的检查 | 1 条 | 子代理；主会话复做一次 |
| 把 `exclude` 当作缓存策略 | 8 条 | 子代理 |
| 去掉子 scope 超出根的检查 | 2 条（含"等于根不算在内"） | 主会话 |

**结果**：
- contracts 167 条（新增 27 条）通过；全仓单元测试全部通过；
- 全仓 build、typecheck、lint 退出 0；
- 全仓浏览器测试通过。第一次运行时 engine-workbox 有 1 条在 30 秒内没能创建出浏览器上下文（`browser.newContext: Test ended`），失败发生在测试逻辑开始之前，该包本任务也未改动；单独重跑 6 条通过，完整重跑全部通过。

### 任务 3：core 编译 `shared-origin`

**说明：** 编译器支持 `shared-origin`：把身份匹配到登记表条目，为根应用生成排除规则，并执行规格设计第 3 节的全部检查。

**验收标准：**
- 身份匹配：五个字段完全相等的条目恰好一个；登记表的 `origin` 与 `environment` 等于身份中的对应字段。否则编译失败。
- 根应用：
  - 每个子 scope 生成一条 `exclude`（来源 `platform`），排在所有规则之前，包括 `deny`；
  - 策略规则落在子 scope 内时编译失败；
  - 子 scope 内的宿主文件不进预缓存，并给出警告；
  - 离线页落在子 scope 内时编译失败。
- 子应用：不生成 `exclude`，其余与 `standalone-origin` 相同。
- `standalone-origin` 的编译结果逐字节不变（用现有测试夹具对比序列化结果）。
- 计划的 `topology` 原样记录登记表快照。

**验证：**
- 表驱动单元测试覆盖每条检查，另测"`exclude` 先于 `deny`"的排序；
- 变异：`exclude` 排在 `deny` 之后、子 scope 内的文件仍进预缓存、不检查离线页位置，各死在目标用例上；
- 全仓 `pnpm test` 回归。

**依赖：** T2。

**预计范围：** M–L。超过 5 个源文件时，拆出"身份匹配与登记表校验"单独提交。

#### T3 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收。本次子代理遵守了"不用 git 还原"的要求，全部用备份复制加 `sha256` 核对。**

**实现：**
- 新增 `src/topology.ts`：`resolveTopology` 用 contracts 的 `validateOriginRegistry` 校验登记表（诊断重新挂在 `["topology","registry",…]` 下），检查源与环境一致、五个身份字段恰好匹配一个条目，由此判定根应用或子应用；为根应用算出 `exclude` 规则（按码点排序，前缀为子 scope 去掉末尾斜杠）与各子 scope 的解码键。`policyRulesInChildScope` 检查每条策略规则（含 `deny`）是否落进子 scope；覆盖范围更大的规则（如 `/`）不算。
- `compile.ts`：计划的 `pathRules` 为 `[...exclude 规则, ...策略规则]`。`compilePathRules` 与它的 `resourceIndexes` 原样不动，因此预缓存阶段按策略下标报出的警告仍指向正确的规则。计划的 `topology` 原样记录校验后的登记表。
- `precache.ts`：子 scope 内的宿主文件不进预缓存，每个给出一条 `compile.host-file-in-child-scope` 警告，构建照常成功；离线页落在子 scope 内报 `compile.offline-fallback-in-child-scope`，并且不会再连带误报"离线页未构建"。
- 编译最后的 `validatePlan` 未改动，T2 加的 `exclude` 不变式仍是最后一道防线（变异 a 正是被它与排序断言一起拦下的）。

**独立源逐字节不变的证明**：子代理用 `git show dbc3cb6:…`（只读）取出改动前的 core 源码，打包后与改动后的编译结果对比，覆盖基础夹具、带规则与离线页的夹具、两个黄金计划，结果逐字节相同；这些字符串已写成新测试中的固定断言，原有 `golden.test.ts` 也原样通过。

**测试**：新增 `test/shared-origin-topology.test.ts`（表驱动），覆盖根应用与子应用的编译、`exclude` 排序、三类子 scope 越界、`asset-rule-unmatched` 下标、身份匹配的各种不一致（源、环境、五个字段、无匹配、登记表本身非法），以及报错不回显输入值。一处测试设计说明：根应用的 scope 受挂载路径约束固定为 `/`，无法只改 scope 构造"仅 scope 不一致"的情形，该情形改在子应用上测试。**现有测试断言零改动。**

**变异**：均在全绿基线上完成，还原后校验值一致。

| 变异 | 转红用例 | 执行者 |
|---|---|---|
| `exclude` 排在 `deny` 之后 | 4 条（含计划不变式兜底） | 子代理；主会话复做一次 |
| 子 scope 内的文件仍进预缓存 | 2 条 | 子代理；主会话复做一次 |
| 去掉离线页位置检查 | 1 条 | 子代理 |
| 越界检查跳过 `deny` | 1 条 | 子代理 |
| 越界判断弱化为"与子 scope 相等" | 3 条（allow、deny 与不回显用例） | 主会话 |

**结果**：core 118 条（新增 24 条）通过；全仓 build、test、typecheck、lint、test:browser 全部退出 0，各包计数与 T2 之后一致（浏览器测试 125 条通过、2 条跳过）。

### 任务 4：sw-runtime 执行 `exclude`

**说明：** 平台 worker 对 `exclude` 一律不接管。

**验收标准：**
- worker 配置的动作白名单增加 `exclude`，配置生成从计划中原样带出。
- 决策表：命中的第一条规则为 `exclude` 时返回透传，原因为新值（例如 `excluded`），导航与非导航一律如此；与 `deny` 的离线回退行为对照测试。
- 路径匹配与 core 的一致性测试扩展到 `exclude` 规则。
- 现有测试断言不改；决策结构只新增透传原因。
- 浏览器测试新增一个场景：配置了 `exclude` 的 worker，对该前缀下的导航在线时 `fromServiceWorker` 为假，断网时得到网络错误而不是离线页。

**验证：**
- 变异：`exclude` 被当作 `deny` 处理，导航在断网时回退离线页，死在对照用例与浏览器场景上；
- sw-runtime 单元与浏览器测试，以及全仓回归。

**依赖：** T2（可与 T3 并行）。

**预计范围：** M。

#### T4 实施记录（2026-09-18）

**实现由主会话完成**（改动集中，且与 ssr-adapters T4b 改的是同一个判断函数）。

**实现：**
- `src/shared/config.ts`：worker 配置的动作白名单改为 `["exclude", "deny", …缓存策略]`，校验失败的提示随之更新。配置生成原本就按原样带出每条规则的前缀与动作，无需改动。
- `src/worker/decide.ts`：新增透传原因 `excluded`。命中的第一条规则为 `exclude` 时，导航与非导航一律透传；这一判断**放在 `deny` 之前**，因为 `deny` 的导航可能回退离线页，而 `exclude` 永不回退。请求处理层（`handlers.ts`）对透传本来就不调用 `respondWith`，无需改动。

**现有断言的改动（一处，属声明内的新增）**：`test/shared-config.test.ts` 钉住动作白名单等于 `["deny", …CACHE_STRATEGIES]`，改为 `["exclude", "deny", …CACHE_STRATEGIES]`。

**新增测试：**
- 决策表：根应用配置中 `/app/m` 为 `exclude` 时，`/app/m`、`/app/m/`、`/app/m/index.html`、`/app/m/assets/app.js` 的导航与非导航都透传，原因为 `excluded`；即使清单里有 `/app/m/index.html` 也不例外。同一个 worker 上的 `deny` 导航仍回退离线页（对照）；`/app/mx` 按完整路径段比较，不受排除影响。
- 请求处理层：在线与断网、导航与非导航，`exclude` 路径都不调用 `respondWith`，也不发网络请求、不查预缓存。
- 路径匹配一致性：新增一个同源根应用用例（根 `/`，子应用 `/m/`，根的 `/` asset 规则覆盖子应用文件），编译器的预缓存选择与运行时匹配结论一致；另加一条断言防止该用例空过：规则表首条确为 `exclude`，子应用的文件不在预缓存中，而 `/mx/index.html` 仍被预缓存。
- 浏览器（新增站点版本 `excluded`：v1 的文件加上子应用的 `guide/index.html`，用**真实的同源根应用计划**编译，根为 `/app/`，子应用为 `/app/guide/`）：在线访问 `/app/guide/` 时响应不经 worker（`fromServiceWorker` 为假），服务器恰好收到这一次请求；断网后，同一个 worker 对拒绝类导航显示离线页，对 `/app/guide/` 则报网络错误，服务器没有收到任何请求。

**变异**（在全绿基线上完成，还原后 `shasum` 一致）：把 `exclude` 当作 `deny` 处理，单元测试 2 条转红；浏览器场景死在"在线访问不经 worker"一行（被当作 `deny` 后，worker 在线也会接管该导航）。

**结果**：sw-runtime 单元 96 条（新增 4 条）、浏览器 17 条（新增 1 条）通过；全仓 build、test、typecheck、lint、test:browser 全部退出 0。

#### 检查点 B 结论（2026-09-18）

- 全仓单元测试与浏览器测试通过（见 T4 结果）。
- `standalone-origin` 的计划序列化结果与改动前逐字节一致：T3 以改动前源码的只读打包结果为基准做了对比，并写成固定断言；contracts 的黄金计划与序列化往返测试原样通过。

### 检查点 B：契约、编译器与 worker 就位（T2–T4 之后）

- 全仓单元测试与浏览器测试通过。
- `standalone-origin` 的计划序列化结果与改动前逐字节一致。

### 任务 5：build-verifier 发布顺序校验

**说明：** `verifyRelease` 新增可选输入 `deployedRootPlan`，实现规格设计第 5 节的检查。

**验收标准：**
- 被校验的计划是子应用、且提供了该输入时运行；否则报告中不出现这项检查。
- 三项检查各自报出独立的诊断码：
  - 根计划不是 `shared-origin`，或源、环境不同；
  - 根计划中没有覆盖本子 scope 的 `exclude`；
  - 根计划的登记表版本低于子计划。
- 检查顺序登记进现有的检查清单常量，报告结构不变。
- 现有测试断言不改。

**验证：**
- 每个失败条件各一条用例，外加"满足"与"未提供输入"；
- 变异：忽略版本比较、只比较源不比较环境，各死在目标用例上。

**依赖：** 检查点 B。

**预计范围：** S–M。

#### T5 实施记录（2026-09-18）

**实现由主会话完成。**

**实现：**
- 新增 `src/release-order.ts`：
  - `isSharedOriginChild(plan)`：计划是否为同源拓扑的子应用；
  - `verifyReleaseOrder(plan, deployedRootPlan)`：检查名 `release-order`。`deployedRootPlan` 与现有的身份基线一样按"未经校验的外部数据"处理，先用 contracts 的 `validatePlan` 校验。
- 三项检查：
  1. 部署的计划不合法，报 `verify.root-plan-not-shared-origin`，路径 `/deployedRootPlan`；它合法但不是本源本环境的同源根应用，报同一个码，路径 `/deployedRootPlan/topology`。判定条件：拓扑为 `shared-origin`、它自身是其登记表的根、它就是子应用登记表里的那个根、源与环境都一致。这一项不成立时，后两项不再检查；
  2. 根计划中没有前缀恰好为本子 scope（去掉末尾斜杠）的 `exclude` 规则，报 `verify.root-plan-missing-exclude`；
  3. 根计划的 `registryVersion` 低于子计划的，报 `verify.root-registry-older`。
  2 与 3 可以同时报出。诊断不回显任何值。
- `verifyRelease`：新增可选输入 `deployedRootPlan`，沿用"属性缺省即不比较"的约定（`Object.hasOwn`）；只在计划是同源子应用时运行，根应用与独立源忽略该输入。`VERIFICATION_CHECKS` 末尾追加 `release-order`，检查顺序不变。
- 公开导出新增 `isSharedOriginChild`、`verifyReleaseOrder`，与现有逐项导出检查函数的做法一致。

**现有断言的改动（两处，均为声明内的新增）：**
- `report.test.ts`：检查清单由三项改为四项；
- `release.test.ts`：独立源计划"运行全部检查"一条，改为期望除 `release-order` 外的三项，并注明原因（`release-order` 只对同源子应用运行）。

**测试**（新增 `test/release-order.test.ts`，8 条）：根、子计划由 storefront 夹具手工构造，**构造后先用 `validatePlan` 校验**，防止夹具本身出错而让检查"通过"。这一步当场抓到一个夹具错误：子应用沿用了根应用的安装信息，起始地址不在子 scope 内。覆盖的情形：
- 满足（根的登记表版本相同或更新）；
- 根缺排除规则（同时版本也更旧）；
- 根版本更旧但已排除；
- 不是本源的同源根（6 种，并断言诊断路径以区分"不合法"与"不是本源的根"两个分支）；
- 不回显；
- 对非子应用计划抛错；
- `verifyRelease` 的编排：只对子应用运行、属性缺省时不运行、根落后时发布失败。

**变异**（在全绿基线上完成，还原后 `shasum` 一致）：

| 变异 | 结果 |
|---|---|
| 忽略版本比较 | 3 条转红 |
| 去掉"根计划必须含排除规则"的检查 | 1 条转红 |
| 只比较源、不比较环境 | **第一次没有转红**。原因：用例里"另一个环境"的根计划只改了身份的环境，登记表仍是 production，这样的计划本身就不合法，在"不合法"分支就被报出，走不到环境比较。补强为构造自身合法、只是环境不同的根计划（身份、登记表、缓存前缀一起改），并断言诊断路径后，转红 1 条 |
| 只比较环境、不比较源（补强后新增） | 转红 1 条 |

**结果**：build-verifier 108 条（新增 8 条）通过；全仓 build、test、typecheck、lint 退出 0。本任务不涉及浏览器测试。

### 任务 6：Vite 接入与真实构建

**说明：** `@pwa-platform/vite` 接受 `shared-origin` 拓扑，真实构建出根应用与子应用。

**验收标准：**
- 选项校验接受新拓扑类型，并把登记表交给编译器；非法登记表在插件创建时失败，错误只含诊断码与路径。
- `buildPwaArtifacts` 同样接受新拓扑（它的输入本来就包含 `topology`）。
- 真实构建夹具：同一份登记表下的根应用（scope `/`）与子应用（scope `/m/`）各构建一次。根计划含 `exclude`，子计划不含；根应用的构建产物里放一个子路径下的文件，确认它不进预缓存，且构建输出警告。
- 现有测试断言不改（公开导出清单不变）。

**验证：**
- 真实构建用例覆盖根、子两种角色与"根产物混入子路径文件"；
- 变异：插件把拓扑固定为 `standalone-origin`，根计划缺 `exclude`，死在目标用例上。

**依赖：** 检查点 B、T5（夹具复用发布校验，确认子应用在根之后发布时校验通过）。

**预计范围：** M。

#### T6 实施记录（2026-09-18）

**实现由主会话完成。**

**实现：**
- `src/options.ts`：同源拓扑的登记表在**插件创建时**用 contracts 的 `validateOriginRegistry` 校验，与其他选项一致；错误只含诊断码与 `/topology/registry/…` 路径。身份是否恰好匹配登记表中的一个条目仍由编译器检查（它需要身份与登记表同时在手，`compilePlan` 本来就做）。T2 时的最小修复（原样带过登记表）由此改为真正的校验。
- `src/index.ts`：`generateBundle` 把 `buildPwaArtifacts` 返回的编译警告逐条经 `this.warn` 输出（"诊断码 at 契约路径"，不带值）。**此前插件完全丢弃这些警告**，这是对已交付包的一项行为新增：独立源应用的产物不变，只是构建日志里会多出原本就存在的警告（例如 `compile.asset-rule-unmatched`）。已增补 ADR-0015。
- `buildPwaArtifacts` 走同一个 `validateOptions`，自动接受同源拓扑，无需改动。公开导出清单不变，现有测试断言零改动。

**测试**（新增 `test/shared-origin.test.ts`，6 条，其中 4 条为真实 Vite 构建）：一份登记表（根 `/`、子 `/m/`），根应用与子应用分别构建，计划经插件的只读计划 API 读取，构建日志经自定义 logger 捕获。
- 根应用：计划的 `topology` 原样记录登记表；首条规则为 `/m` 的 `exclude`，且只有一条；自己的文件照常预缓存。
- 根应用产物混入子路径文件（`public/m/index.html`）：不进预缓存，构建日志出现 `compile.host-file-in-child-scope`，且不回显文件名。
- 子应用：不含 `exclude`，预缓存全在 `/m/` 下，没有子路径警告。
- 身份不在登记表中：构建以 `plan.registry-identity-mismatch` 失败。
- 插件创建时：重叠的登记表立刻报 `registry.scope-overlap at /topology/registry/children/1/scope`，不回显 appId 与路径；缺登记表同样立刻报错。

**变异**（在全绿基线上完成，还原后 `shasum` 一致）：

| 变异 | 转红用例 |
|---|---|
| 不输出编译警告 | 1 条（构建日志断言）——证明警告捕获确实生效，而非测试空过 |
| 插件把拓扑固定为独立源 | 6 条 |
| 插件创建时不校验登记表 | 2 条 |

**与计划的差异**：计划中"夹具复用发布校验，确认子应用在根之后发布时校验通过"一项，放到 T7 的场景 6 用真实构建出的根、子计划一起做，本任务不重复。

**结果**：vite 120 条（新增 6 条）通过；全仓 build、test、typecheck、lint、test:browser 全部退出 0（浏览器 126 条通过、2 条跳过）；链接扫描 0 失效。

### 任务 7：同源真实浏览器证据

**说明：** 在同一个源上同时运行根应用与子应用，按规格"测试策略"的场景在 Chrome 桌面端验证。

**验收标准：**
- 场景：
  1. 根 worker 与子 worker 都注册成功，各自控制自己的页面（`controller.scriptURL` 各不相同）；
  2. 子应用页面断网时由子 worker 应答，根 worker 不介入；
  3. 根页面发往子路径的请求不经根 worker（`fromServiceWorker` 为假，服务器收到请求）；
  4. 子 worker 尚未安装时，断网访问子路径得到网络错误，不是根应用的离线页；
  5. 根应用的恢复 worker 只删根应用的缓存，子应用缓存原样保留；反之亦然；
  6. 发布顺序：部署子应用时，根计划已含排除，发布校验通过；用缺排除的根计划做输入时失败（用构建产出的真实计划，不手工拼）。
- 等待条件以状态为准；站点由真实构建产出。
- 每个场景一次变异，死在目标断言上；`--repeat-each 10` 无失败。

**验证：** `pnpm test:browser --filter @pwa-platform/vite` 通过；变异与重复运行结果写入实施记录。

**依赖：** T6。

**预计范围：** L。超出 5 个文件时，把"夹具与两站点构建"拆出单独提交。

#### T7 实施记录（2026-09-18）

**实现由 `executor` 子代理完成，主会话验收。子代理遵守了"不用 git 还原"的要求。**

**浏览器版本变化**：本机 Google Chrome 在本任务期间自动更新为 **153.0.8010.50**（`--version` 确认）。此前各模块的证据取自 152.0.7977.84。本任务结束时的全仓回归在 153 上运行，全部通过，包括此前各模块的全部浏览器测试。

**夹具**（`packages/vite/browser-tests/shared-origin-*`）：用真实的 `pwa()` 插件与同一份登记表，分别构建根应用（scope `/`）与子应用（scope `/m/`），两者都启用并预缓存离线页，页面上有区分根、子的标记。两份构建产物合并为一个站点，由夹具服务器在同一个源上提供。另有几个站点版本：
- 只有根应用的版本（`/m/` 下是没有 worker 的普通页面）；
- 两边各自的恢复版本；
- 仅供变异使用的"根应用按独立源构建"版本（不含 `exclude`）。

原有的独立源夹具与测试未改动。

**场景与结果（Chrome 153 桌面端，全部通过）：**

| # | 场景 | 位置 |
|---|---|---|
| 1 | 两个 worker 都注册成功，各自只控制自己 scope 的页面（3 条） | shared-origin-registration.spec.ts |
| 2 | 两者都装好后断网，子应用的页面由子 worker 应答，从不出现根应用的内容 | shared-origin-isolation.spec.ts |
| 3 | 根页面发往子路径的请求不经根 worker（`fromServiceWorker` 为假，服务器收到请求） | shared-origin-isolation.spec.ts |
| 4 | 只有根应用时，断网访问子路径得到网络错误，而不是根应用的离线页，服务器没有收到请求 | shared-origin-isolation.spec.ts |
| 5 | 根、子各自的恢复 worker 只删本应用的缓存，另一方与无关缓存原样保留（2 条） | shared-origin-recovery.spec.ts |
| 6 | 发布顺序校验用两次真实构建产出的计划：通过；换成登记表里不含本子应用的真实根计划时报 `verify.root-plan-missing-exclude` | `packages/vite/test/release-order-real.test.ts`（单元测试，不需要浏览器） |

**变异**（均在全绿基线上完成，还原后 `shasum` 一致）：

| 场景 | 变异 | 结果 |
|---|---|---|
| 1 | 子应用不注册 worker | 3 条转红 |
| 2 | 换成只有根应用的站点 | 转红（子应用标记不可见） |
| 3 | 见下文 | 用"根计划改为不含排除规则"**无法拦下** |
| 4 | 换成"根应用按独立源构建"的站点 | 转红：离线访问子路径不再报网络错误。**主会话亲自复做一次，结论一致** |
| 5 | 把子应用的恢复 worker 发布到根应用的地址 | 转红（删除集合不符） |
| 6 | 通过与失败两组真实计划本身就是用例的一部分 | 两组断言各自成立 |

**场景 3 的说明（如实登记；T9 有更正，见检查点 C）**：计划中"根应用改用独立源构建后场景 3 转红"的预期不成立。主会话对照 `sw-runtime/src/worker/decide.ts` 核实：一个非导航、且不在预缓存里的请求，无论命中 `exclude`、允许规则，还是没有任何规则，worker 都透传（平台 v1 没有运行时缓存）。因此在线的子资源请求本来就不经根 worker，`exclude` 的区别只体现在导航与离线回退上。根应用对子路径子资源的保护，实际来自编译期"子 scope 内的文件不进根应用预缓存"（T3、T6 已测并做过变异）。场景 3 证明的是这一性质在真实浏览器中成立，而不是 `exclude` 本身的效果。子代理曾临时改写构建出的 worker 注入配置，让根应用预缓存 `/m/some.json` 来证明该场景能转红，随后撤回，因为那需要对构建产物做文本改写，不属于配置层面的变异。

**子代理对共用测试工具的修改**（`browser-tests/page-probe.ts`，只影响 vite 包的浏览器测试）：
- `installAndControl` 由 `page.reload()` 改为重新 `page.goto()`：实测同源上有两个不同具体程度的注册时，Chrome 刷新页面会保留原来那个较宽泛的控制者，不会重新匹配 scope；重新导航才会；
- `waitForActiveWorkerActivated` 增加可选的 `scope` 参数：不带参数的 `getRegistration()` 被观察到返回已激活的另一个注册，导致不等待就返回。

原有 8 条独立源浏览器测试照常通过。

**结果**：
- vite 浏览器测试 19 条（新增 8 条）、`--repeat-each 10` 共 190 条通过，1.7 分钟，无不稳定；
- vite 单元测试 122 条（新增 2 条）；
- 全仓 build、test、typecheck、lint、test:browser 全部退出 0（浏览器 134 条通过、2 条跳过）。

#### 检查点 C 结论（2026-09-18）

- 六个场景全部通过，场景 1、2、4、5 各有能拦下的变异；场景 3 的变异限制与原因如上；场景 6 自带通过与失败两组真实计划。
- **T9 更正（独立评审指出，主会话核实）**：
  - **场景 2 与 `exclude` 无关**：子 worker 在场时，浏览器按 scope 的具体程度把 `/m/` 的请求交给子 worker，根 worker 根本收不到。评审用不含 `exclude` 的根站点跑场景 2，照样通过。上表中场景 2 的变异拿掉的是子 worker，不是 `exclude`，所以它只能算"浏览器按 scope 分派的行为验证"，不计入 `exclude` 的证据。
  - **场景 3 当时并未触发预缓存过滤**：根应用夹具里没有任何 `/m/` 文件，所以上文"场景 3 证明预缓存过滤在真实浏览器中成立"不成立。T9 已补强，见 T9 实施记录：根应用夹具加入 `public/m/root-leftover.json`，场景 3 断言它不在任何缓存中；去掉编译器的子 scope 过滤后，场景 3 转红。
- 未取得的范围：浏览器矩阵中除 Chrome 桌面端以外的档位、Nuxt 支持、移除子应用流程的自动化、CI 证据，在 T9 的验证记录中逐条登记。

### 检查点 C：证据齐备（T7 之后）

- 全部场景通过且各有变异证明；未取得的范围逐条登记。

### 任务 8：文档同步

**验收标准：**
- ADR-0012 增补 `exclude`：与 `deny` 的离线行为区别，以及对 T4b 约束的落实。
- `docs/architecture/deployment-topologies.md`：同源一节改为"已支持"，链接 ADR-0019 与规格。
- 运维手册：同源拓扑的发布顺序（先根后子）与移除顺序（先子发布恢复 worker、确认缓存清空，再从登记表移除并重新发布根应用），以及发布校验的使用方式。
- `package-boundaries.md`：contracts、core、sw-runtime、build-verifier 的新增公开面；`@pwa-platform/nuxt` 只支持 `standalone-origin`。
- README 交付状态、文档基线新增本模块一行（`target`）、路线图中 v2 topology 行的状态。
- 全仓相对链接与锚点扫描 0 失效，扫描器同时检查反引号中的 `.md` 路径（ssr-adapters 评审发现的扫描盲区）。

**依赖：** 检查点 C。

**预计范围：** M。

#### T8 实施记录（2026-09-18）

**由主会话完成**：涉及的事实都在前面各任务的记录里，由主会话直接对照着写。

**文档改动：**
- **ADR-0012 增补 `exclude`**：透传原因为 `excluded`，导航与非导航、在线与断网一律不接管，永不回退离线页，判断排在 `deny` 之前；只出现在同源根应用计划中，由 contracts 的计划不变式钉住。另写明一点：平台 v1 没有运行时缓存，对不在预缓存中的非导航请求，`exclude` 与其他规则的结果相同，可观察区别只在导航与离线回退上（T7 场景 3 的结论）。
- **部署拓扑**：同源一节由"模块交付后才支持"改为已支持，写明登记表、根 worker 的排除、发布顺序、只支持 Vite、子 worker 安装前的断网行为。
- **运维手册**：新增"同源拓扑的发布与移除顺序"一节，包括新增或修改子应用的四步（其中写明如何调用 `verifyRelease` 以及两个失败码的含义）和移除子应用的三步（无自动化检查）。
- **包边界**：contracts、core 的只增不改扩展；build-verifier 由"三个问题"改为包含 `release-order`；sw-runtime 的动作白名单包含 `exclude`；vite 的选项接受同源拓扑、编译警告输出到构建日志；Nuxt 只支持独立源。
- **README** 开发状态段、**路线图** v2 topology 行（注明 Vite 接入、Nuxt 暂不支持、不含多层嵌套）、**文档基线**新增本模块一行（`target`，分列已证明与未证明的部分）。基线新行最初与上一行之间多了一个空行，会把表格截断，已修正；全表经脚本核对，每行一致为 6 列。

**链接扫描**：
- 相对链接与锚点：全仓 92 个受版本控制的 Markdown 文件，0 失效。
- **新增反引号路径检查**（ssr-adapters 独立评审发现的扫描盲区）：检查反引号中带斜杠的 `.md` 路径，按仓库根与文件所在目录两种方式解析。注入对照成立：追加一个不存在的反引号路径后，恰好多报出这一条，还原后回到原状。全仓结果 3 条：
  - `tasks/shared-origin-topology/verification.md` 两处（文档基线与本计划）：T9 交付，届时应清零；
  - `AGENTS.md` 中的 `tasks/plan.md`：原文是"不要共用 `tasks/plan.md`"，本来就指一个不该存在的文件，属于扫描器无法区分的**误报**，不改 `AGENTS.md`。
- 扫描器放在会话临时目录中，未提交进仓库。

**过程问题**：第一次运行扫描时，用了普通的 `cp` 备份 README，而本 shell 中 `cp` 在目标已存在时会等待确认，命令因此挂起直到超时。检查确认 README 未被注入修改、工作区无残留后，改用 `command cp -f` 重跑。

**不修改**：浏览器矩阵与 V1 验收矩阵。

### 任务 9：模块质量门禁

**验收标准：**
- 干净 worktree 冻结安装后，lint、build、test、typecheck、test:browser 全部通过；本模块浏览器测试 `--repeat-each 10` 无失败。
- lockfile 无变化（本模块不引入依赖）；若有变化，逐项解释。
- 新上下文独立评审，重点：
  - 根 worker 是否有任何路径应答子 scope 的请求；
  - `exclude` 与 `deny` 是否可能被混淆；
  - 登记表校验能否被绕过（路径编码、尾斜杠、大小写、`..`）；
  - 对五个已交付包的改动是否只多出声明的公开面；
  - `standalone-origin` 是否真的逐字节不变；
  - 测试是否可能空过。
- 阻断项与应修项处理完毕。
- 产出 `tasks/shared-origin-topology/verification.md`：门禁结果、浏览器矩阵字段、恢复场景记录、未取得的证据（CI、Android、Nuxt、移除流程自动化）。文档基线中的该行保持 `target`。

**依赖：** T8。

**预计范围：** M。

#### T9 实施记录（2026-09-18）

**门禁**：干净 worktree 上两轮（评审前 `b3170b2`、评审后 `4e6ee2a`）全部退出 0；评审后单元测试 1245 条、浏览器 134 条通过 2 条跳过，vite 浏览器测试 `--repeat-each 10` 190 条通过。lockfile 只多出 build-verifier 对 core 的工作区开发依赖。

**独立评审**：无阻断项；6 条应修项与 4 条观察项已在 `4e6ee2a` 处置，主会话重做了关键变异。评审同时指出场景 2、3 的原记录不成立，更正写在检查点 C 结论中。

**场景 3 的补强**：根应用夹具加入 `public/m/root-leftover.json`，断言它不在任何缓存中。子代理最初写的断言是空过的：共用工具 `urlIsInAnyCache` 按完整 URL 精确匹配，而 Workbox 的键带 `?__WB_REVISION__=`。主会话改为只比较源与路径；同时去掉 core 的子 scope 过滤与 contracts 的对应不变式后，场景 3 在缓存断言上转红，基线通过。

门禁明细、浏览器矩阵、评审处置与未取得的证据见 [verification.md](verification.md)。

## Task List

> Tasks tracked in this plan using local ids (T1–T9). GitHub 账号在本模块开工时不可用，因此没有 sub-issue；账号恢复后按本表补建 issue 并把编号回填到这里。在此之前，commit 用 `Task: T<n>` 标注，不写 closing keyword。

### Phase 1：决定

- T1 ADR-0019 提议稿与开放问题

### 检查点 A：ADR 已接受

### Phase 2：契约、编译器与 worker

- T2 contracts 扩展（blocked by 检查点 A）
- T3 core 编译 `shared-origin`（blocked by T2）
- T4 sw-runtime 执行 `exclude`（blocked by T2，可与 T3 并行）

### 检查点 B：契约、编译器与 worker 就位

### Phase 3：发布校验、接入与证据

- T5 build-verifier 发布顺序校验（blocked by 检查点 B）
- T6 Vite 接入与真实构建（blocked by 检查点 B、T5）
- T7 同源真实浏览器证据（blocked by T6）

### 检查点 C：证据齐备

### Phase 4：交付

- T8 文档同步（blocked by 检查点 C）
- T9 模块质量门禁（blocked by T8）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **五个已交付包同时改动，回归面大** | 高：可能破坏已交付的独立源应用 | 只增不改；每个改动包的任务结束时跑全仓回归；检查点 B 要求 `standalone-origin` 的计划序列化逐字节不变 |
| **`exclude` 与 `deny` 被混淆** | 高：根 worker 把离线页返回给子应用 | 独立的动作类型与透传原因；对照测试与浏览器场景 4；评审重点 |
| **同源浏览器行为与预期不符**（控制边界、子资源请求路由） | 中高：设计前提不成立 | T4 先做单 worker 的 `exclude` 浏览器场景；T7 逐项实测，不成立即停下回报 |
| **登记表在多个仓库间漂移** | 中：根与子的排除不一致 | 发布校验比较版本；运维手册写明同步步骤 |
| **登记表校验被路径写法绕过** | 中：scope 重叠未被发现 | 复用 core 的路径解码与整段比较；评审重点 |
| **移除子应用顺序错误** | 中：根 worker 过早停止排除，子路径被根接管 | 运维手册写明顺序与检查项；已知限制登记"无自动化检查" |
| **E2E 不稳定或空过** | 中：证据失真 | 等待以状态为准；每场景变异；`--repeat-each 10` |
