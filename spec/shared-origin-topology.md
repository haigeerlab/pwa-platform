# 规格：shared-origin-topology

## 目标

让同一个源（Origin）下的**一个根应用**与**若干固定子路径应用**各自作为独立的 PWA 运行，互不干扰：每个应用有自己的 manifest、worker、scope 与缓存，平台在构建期和发布期保证它们不会相互侵占。典型场景是 `/` 下的桌面应用与 `/m/` 下的移动应用（[部署拓扑](../docs/architecture/deployment-topologies.md)）。

同源的应用共享源级的权限与存储配额，浏览器不在它们之间做隔离。本模块提供的是**平台层面的治理**，不是跨源隔离；需要真正隔离的应用应使用独立源。

成功的样子：

- 根应用与子应用在同一个源上各自注册 worker，子应用页面由子 worker 控制，根应用页面由根 worker 控制。
- 根 worker 对子路径下的任何请求（包括根页面发往子路径的子资源请求）完全不接管：不预缓存、不从缓存应答、不回退自己的离线页。
- 任一应用的恢复 worker 只删除本应用的缓存，不触及同源其他应用的缓存。
- 登记表中的身份冲突（scope 重叠、worker 地址或 manifest 重复、缓存前缀冲突）在编译期失败。
- 子应用发布前，平台能用根应用已部署的计划机器检查"根 worker 已排除该子路径"；未满足时发布校验失败。

## 已核实的现状（2026-09-18，读仓库代码）

| 事实 | 位置 |
|---|---|
| 拓扑类型目前只有 `standalone-origin`；其他取值编译报 `compile.unsupported-topology` | `packages/contracts/src/plan.ts`、`spec/policy-compiler.md` |
| `PwaPlan` v1 是字段固定的稳定契约（15 个字段）；`topology` 字段是对象，由编译器原样写入计划 | `packages/contracts/src/plan.ts`、`spec/policy-compiler.md` |
| 路径规则动作为 `deny` 或缓存策略；编译器把 `deny` 排在所有允许规则之前，允许规则落在 `deny` 前缀内时报 `compile.allow-under-deny` | `packages/contracts/src/plan.ts`、`packages/core/src/rules.ts` |
| worker 配置按白名单校验路径规则动作，未知动作直接拒绝 | `packages/sw-runtime/src/shared/config.ts` |
| 缓存命名空间按 `appId` 与环境划分，编码保证一个应用的前缀不会是另一个应用的前缀；恢复 worker 只删本应用前缀下的缓存 | `packages/contracts/src/cache-namespace.ts`、ADR-0008 |
| 平台 worker 对**拒绝类导航**在断网时回退离线页（2026-09-17 修订） | ADR-0012 增补、`packages/sw-runtime/src/worker/decide.ts` |
| 发布校验 `verifyRelease` 按"给了哪项输入才跑哪项检查"组织，可选输入之间互不影响 | `packages/build-verifier/src/release.ts` |
| 架构文档已预期计划会"在启用同源治理时记录登记表版本" | `docs/architecture/contracts.md` |

表中"路径规则动作"与"拒绝类导航离线回退"两行合起来说明：**子路径排除不能沿用 `deny`**。沿用的话，根 worker 会在断网时把自己的离线页返回给子应用，违反部署拓扑文档"不得为子路径返回自己的离线降级"的要求（ADR-0012 增补的影响中已登记这一约束）。

## 范围

### 本模块交付

- **登记表契约**：同源应用登记表的类型、校验与序列化（contracts）。
- **新拓扑类型 `shared-origin`**：拓扑对象携带登记表快照；编译器据此为根应用生成排除规则并做冲突检查（contracts、core）。
- **新路径规则动作 `exclude`**：平台 worker 对命中的请求一律不接管（contracts、core、sw-runtime）。
- **发布顺序校验**：`verifyRelease` 新增可选输入"已部署的根应用计划"，检查根计划已排除本子路径（build-verifier）。
- **Vite 接入**：`@pwa-platform/vite` 接受新拓扑类型（其选项已有 `topology` 字段，校验随契约扩展）。
- 新增 ADR 记录登记表与 `exclude` 的决定，并增补 ADR-0012。
- 运维手册补充同源拓扑的发布与移除顺序；部署拓扑文档更新为"已支持"。
- 真实浏览器验证：同一源上同时运行根 worker 与子 worker。

### 不在范围

- 跨源部署与跨应用的客户端状态共享（路线图 v2 topology 行明确排除）。
- 多层嵌套：子应用下不能再有子应用。
- 没有根应用、只有若干并列子路径应用的形态。
- Nuxt 模块支持同源拓扑：`@pwa-platform/nuxt` 仍只支持 `standalone-origin`，写入已知限制。
- 运行时缓存（平台 v1 仍无运行时缓存能力）。
- 自动化的"移除子应用"流程：只提供运维手册中的顺序与检查项，见"已知限制"。

## 依赖

| 模块 | 本模块如何使用 |
|---|---|
| policy-compiler（能力图声明） | 新拓扑的编译、排除规则生成与冲突检查 |
| build-verifier（能力图声明） | 发布顺序校验 |
| contracts-foundation（经 policy-compiler 间接依赖） | 登记表契约、拓扑类型与规则动作的扩展 |
| sw-runtime（经 build-verifier 与 vite-adapter 间接依赖） | 执行 `exclude` 动作 |
| vite-adapter | 接受新拓扑类型 |

**修改已交付包**（每项均为只增不改，须经项目所有者批准；规格评审即视为批准方向，具体接口在计划中定稿）：contracts、core、sw-runtime、build-verifier、vite。

## 设计

### 1. 登记表

登记表描述**一个源、一个环境**上的全部应用：

```ts
type PwaOriginRegistry = {
  readonly schemaVersion: 1;
  /** 单调递增的整数；每次增删应用或修改任一条目时加 1。 */
  readonly registryVersion: number;
  readonly origin: string;
  readonly environment: string;
  readonly root: PwaRegistryEntry;
  /** 至少一个；彼此之间不重叠，也不嵌套。 */
  readonly children: readonly PwaRegistryEntry[];
};

type PwaRegistryEntry = {
  readonly appId: string;
  readonly scope: AbsolutePath;
  readonly serviceWorkerUrl: AbsolutePath;
  readonly manifestId: string;
  readonly manifestUrl: AbsolutePath;
};
```

- **受版本控制的共享文件**：同源的每个应用在各自构建中使用同一份登记表（同一 `registryVersion` 的相同内容）。登记表文件放在哪个仓库、如何在多个仓库间同步，见"开放问题"第 1 条。
- **校验**（contracts，编译期）：
  - 子应用的 scope 严格位于根 scope 之内（按路径段比较，`/m/` 在 `/` 内，`/` 本身不算"之内"）；
  - 子应用的 scope 两两不重叠，也不互相嵌套；
  - 所有条目的 `appId`、`serviceWorkerUrl`、`manifestId`、`manifestUrl` 两两不同；
  - 每个条目的 `serviceWorkerUrl` 与 `manifestUrl` 位于其自身 scope 之内，且不位于任何子应用 scope 之内（根应用条目）；
  - 由 `appId` 与环境推出的缓存前缀两两不同（现有命名规则已保证，编译期仍显式检查）。
- 错误只含诊断码与契约路径，不回显输入值（与现有校验一致）。

### 2. 拓扑类型 `shared-origin`

```ts
type PwaTopology =
  | { readonly kind: "standalone-origin" }
  | { readonly kind: "shared-origin"; readonly registry: PwaOriginRegistry };
```

- 编译器用正在构建的应用的身份，在登记表中找到**恰好一个**匹配条目（`appId`、`scope`、`serviceWorkerUrl`、`manifestId`、`manifestUrl` 全部相等）；找不到、找到多个或字段不一致，编译失败。登记表的 `origin` 与 `environment` 必须等于身份中的对应字段。
- 匹配到根条目即为**根应用**，匹配到子条目即为**子应用**。
- 计划的 `topology` 字段原样记录整个登记表快照，其中的 `registryVersion` 就是架构文档预期的"登记表版本"。**`PwaPlan` 不增加字段**，仍为 15 个。

### 3. 编译期规则（core）

**根应用：**
- 为每个子应用 scope 生成一条 `exclude` 规则（来源标为 `platform`），排在**所有规则之前**，包括 `deny`。
- 应用自己的策略规则落在子 scope 内时编译失败（新增诊断码），不允许在排除范围内声明任何意图。
- 预缓存永不收录子 scope 内的文件，即使宿主产物中存在它们（例如根应用的构建产物里意外包含子应用的文件）；出现这种文件时给出警告。
- 离线页不得位于子 scope 内，否则编译失败。

**子应用：**
- 不生成 `exclude` 规则（子 scope 已比根 scope 更具体，浏览器只会把子 scope 内的页面交给子 worker）。
- 其余编译规则与 `standalone-origin` 相同。

**`standalone-origin`**：行为完全不变。

### 4. 平台 worker 执行 `exclude`（sw-runtime）

- 请求路径命中的第一条规则动作为 `exclude` 时，worker **不调用 `respondWith`**：导航与非导航一律如此，在线与断网的表现都与没有 worker 时相同。
- 这是与 `deny` 唯一的区别：`deny` 的导航在断网时回退离线页（ADR-0012 增补），`exclude` 永不回退。
- worker 配置的动作白名单增加 `exclude`。
- 根 worker 的 `activate` 只清理自身预缓存中的过期条目，本来就不触及其他缓存；恢复 worker 只删本应用前缀下的缓存。这两点现有实现已满足，本模块只补测试证明它们在同源拓扑下成立。

### 5. 发布顺序校验（build-verifier）

部署顺序是**先让根 worker 排除子路径，再部署子应用**（部署拓扑文档）。本模块把"先后"变成可检查的条件：

- `verifyRelease` 新增可选输入 `deployedRootPlan`：当前线上根应用的计划（取自根应用该次发布的发布记录）。
- 只在被校验的计划是**子应用**且提供了该输入时运行，检查：
  - 根计划的拓扑为 `shared-origin`，且与子计划属于同一个源与环境；
  - 根计划中存在覆盖本子应用 scope 的 `exclude` 规则；
  - 根计划的 `registryVersion` 不低于子计划的 `registryVersion`。
- 未提供该输入时不运行，报告中不出现这项检查（与现有检查的约定一致）。
- 根应用的发布不需要这项检查。

### 6. Vite 接入

`@pwa-platform/vite` 的选项本来就有 `topology`，校验按契约中的拓扑类型进行。本模块只需确保新类型能通过选项校验、正确传给编译器，并在真实构建中验证根应用与子应用两种角色。不新增 Vite 选项。

## 命令

```bash
pnpm test --filter @pwa-platform/contracts
pnpm test --filter @pwa-platform/core
pnpm test --filter @pwa-platform/sw-runtime
pnpm test --filter @pwa-platform/build-verifier
pnpm test --filter @pwa-platform/vite
pnpm test:browser --filter @pwa-platform/sw-runtime
pnpm test:browser --filter @pwa-platform/vite
```

改动已交付包后，全仓的 `pnpm test` 与 `pnpm test:browser` 都要作为回归运行。

## 测试策略

- **单元测试（表驱动）**：
  - 登记表校验的每条规则各有通过与失败用例，错误中不回显输入值；
  - 身份与登记表的匹配：恰好一个、零个、多个、字段不一致；
  - 根应用的 `exclude` 生成、排序（先于 `deny`）、策略规则落入子 scope、子 scope 内的文件不进预缓存、离线页落入子 scope；
  - `standalone-origin` 的全部现有测试不变且通过；
  - worker 决策表：`exclude` 命中的导航与非导航、在线与断网都不接管；与 `deny` 的离线行为对照；
  - 发布顺序校验：满足、缺排除规则、源或环境不同、根的登记表版本更低、未提供输入时不运行。
- **一致性**：sw-runtime 的路径匹配与 core 的现有一致性测试扩展到 `exclude` 规则。
- **真实浏览器测试**（Chrome 桌面端，沿用 browser-test-harness，同一个源上两个站点目录）：
  - 根 worker 与子 worker 同时注册，各自控制自己的页面；
  - 子应用页面在断网时由子 worker 应答，根 worker 不介入；
  - 根页面发往子路径的请求不经根 worker（`fromServiceWorker` 为假）；
  - 子 worker 尚未安装时，断网访问子路径得到网络错误，**不是**根应用的离线页；
  - 根应用的恢复 worker 只删根应用的缓存，子应用缓存原样保留；反之亦然。
- **每项真实浏览器测试配一次变异**，死在目标断言上；等待条件以状态为准；`--repeat-each 10` 无失败。
- **按浏览器矩阵如实登记**未取得的范围。

## 边界

- **始终**：
  - `standalone-origin` 的行为与测试保持不变；
  - 错误信息不回显输入值；
  - 对已交付包只增不改；
  - 未取得的证据如实登记。
- **先询问**：
  - 新增任何依赖；
  - 超出本规格"修改已交付包"清单的改动；
  - 改动 `PwaPlan` 的字段集合或 `planVersion`；
  - 改动浏览器矩阵或 V1 验收矩阵。
- **禁止**：
  - 用 `deny` 表达子路径排除；
  - 根 worker 以任何方式应答子 scope 内的请求；
  - 删除或读取其他应用的缓存；
  - 把同源治理描述为跨源隔离。

## 验收标准

1. 登记表契约、`shared-origin` 拓扑与 `exclude` 动作落在 contracts 中，有校验与测试；`standalone-origin` 的现有测试全部不变且通过。
2. 编译器为根应用生成排在最前的 `exclude` 规则，设计第 3 节的每条检查都有测试与变异证明。
3. 平台 worker 对 `exclude` 一律不接管，单元测试与真实浏览器测试都证明它与 `deny` 的离线行为不同。
4. 发布顺序校验按设计第 5 节工作，每个失败条件有测试。
5. Vite 真实构建产出根应用与子应用两种计划，真实浏览器测试的各场景在 Chrome 桌面端 N 通过，各配变异。
6. 新 ADR 已接受，ADR-0012 已增补；部署拓扑文档、运维手册、包边界与文档基线已同步。
7. 未取得的范围逐条登记：浏览器矩阵中的其余档位、Nuxt 支持、移除流程的自动化、CI 证据。
8. 模块质量门禁：干净 worktree 冻结安装后全部门禁通过、独立评审完成；CI 证据待账号恢复后补取。

## 已决定事项

**项目所有者，2026-09-18，经选项确认：**

1. **拓扑范围**：一个根应用加若干固定子路径应用；子应用不嵌套。
2. **排除语义**：新增路径规则动作 `exclude`，平台 worker 完全不接管；不复用 `deny`。
3. **登记表**：同源共用一份受版本控制的登记表，作为 `shared-origin` 拓扑的数据进入构建；计划随之记录登记表快照与版本，不给 `PwaPlan` 加字段。
4. **适配器范围**：只做 Vite；Nuxt 模块仍只支持 `standalone-origin`。

**本规格提出、列为假设时项目所有者未提出异议，随规格评审一并确认：**

5. 只治理同一个源，不涉及跨源，也不做跨应用的客户端状态共享。
6. 子应用 scope 严格位于根 scope 之内且互不重叠；身份字段与缓存前缀两两不同，由编译期检查。
7. 发布顺序由机器检查（用根应用已部署的计划），而不只写进运维手册。
8. 真实浏览器验证用现有测试夹具，在同一个源上同时运行根 worker 与子 worker。

## 已知限制

- **同源不是隔离**：同源应用共享源级权限、存储配额与 cookie，一个应用的脚本可以读写另一个应用的缓存。本模块保证的是平台 worker 与恢复 worker 的行为，不保证应用代码的行为。
- **移除子应用没有自动化检查**：顺序为先让子应用发布恢复 worker 并确认其缓存已清空、再从登记表中移除该子应用并重新发布根应用。只在运维手册中登记，发布校验不覆盖。
- **Nuxt 模块不支持同源拓扑**。
- **子 worker 安装之前**，子路径的页面在断网时得到浏览器的网络错误（根 worker 不接管，子 worker 尚不存在）。这是有意的取舍：宁可不给离线页，也不让根应用的内容出现在子应用的地址下。

## 开放问题

原三个开放问题已由 [ADR-0019](../docs/adr/0019-shared-origin-registry-and-exclude.md)（2026-09-18 接受）决定：登记表放在根应用的仓库、子应用保存副本并由发布校验的版本比较兜底；新 ADR 编号 0019，引用而不取代 ADR-0006；根应用落在子 scope 内的任何策略规则（包括 `deny`）一律编译失败。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。
