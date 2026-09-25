# 规格：policy-compiler

## 目标

把以下五类输入确定性地编译为能通过 contracts `validatePlan` 的 `PwaPlan v1`：

- 平台拥有的 `PwaIdentity`；
- 安装元数据；
- 业务 `PwaPolicy`；
- 部署拓扑；
- 宿主构建产物清单。

规则优先级只在编译器里实现（ADR-0007）。Service Worker 运行时、Workbox 引擎和构建校验器都只消费计划，不重新推导优先级。

成功标准：

- 同一输入在任意 Node 构建环境里产出逐字节相同的计划 JSON。
- 任何可能让业务允许规则绕过平台拒绝规则的配置，都在构建期以稳定的诊断失败。

## 范围

交付私有工作区包 `@pwa-platform/core`，它以 `workspace:*` 依赖 `@pwa-platform/contracts`，只提供纯函数编译和编译诊断。

本模块不做：

- 读写文件系统，或计算文件哈希；
- 生成 Service Worker 或 manifest 文件，或调用 Workbox；
- 同源多 PWA 拓扑（属于 `shared-origin-topology`）；
- 执行运行时缓存，或提供浏览器端代码。

本模块会修改 contracts 的公开诊断码枚举，见"诊断"一节。

## 公开契约

### 编译入口

`compilePlan(input: PwaCompileInput): PwaValidationResult<PwaPlan>`

- 对任何输入都不抛错。
- 成功时，`value` 一定能通过 `validatePlan`。
- 编译期 warning 同时出现在 `result.diagnostics` 和 `value.diagnostics` 中。

`PwaCompileInput` 由 core 定义，可以 JSON 序列化，各字段如下：

- **`identity`、`install`（`PwaInstallMetadata | null`）、`policy`**：传入时未经校验。编译器先调用 contracts 中对应的校验函数，任一校验失败则编译失败，诊断路径前面会加上所属字段，例如 `/policy/resources/0/cache`。
- **`topology`**：v1 只接受 `{ kind: "standalone-origin" }`。
- **`hostBuildOutput`**：包含 `publicPath`、`serviceWorkerFile`、`manifestFile` 和 `files`。`files` 的每一项是 `{ path, fingerprinted, contentHash }`：
  - `path` 是相对构建输出目录的 POSIX 路径；
  - `fingerprinted` 表示文件名是否已包含内容指纹；
  - `contentHash` 是宿主算好的哈希字符串，必须匹配 `^[A-Za-z0-9_-]{8,128}$`（URL 安全字符，长度 8–128），否则报 `compile.invalid-host-output`。它作为 revision 写进计划并参与缓存键，限定字符集避免 `/`、`%` 等字符进入缓存键。

### 归一化

- **策略前缀和离线降级路径**：相对 `mountPath` 解析为绝对路径。
  - `mountPath` 为 `/` 时，前缀原样使用；
  - 否则拼成 `<mountPath><prefix>`；前缀本身是 `/` 时，结果就是 `mountPath`。
- **前缀比较**：逐段按 URL 标准解码后比较，解码后相同的前缀视为同一个前缀，例如 `/%61pi` 和 `/api`。计划中保留声明时的写法。
  - 合法的 `%XX` 解码为字节，非法写法（如 `%zz`）保留原样，再按 UTF-8 解码，非法字节替换为 U+FFFD。
  - `%2F` 不解码，不会产生新的路径段。
  - 因此非法转义只会让冲突多报，不会漏报，也就无法绕过拒绝规则。
- **构建产物的 URL**：`<publicPath><path>`，其中 `publicPath` 必须位于 identity 的 scope 内。
  - `<publicPath><serviceWorkerFile>` 和 `<publicPath><manifestFile>` 解码后必须分别等于 identity 的 `serviceWorkerUrl` 和 `manifestUrl`，否则报 `compile.invalid-host-output`。
  - `files` 中的路径解码后必须唯一。
  - 编译器只读取每个输入字段一次；访问器属性和稀疏数组都会被拒绝。

### 规则与优先级

**动作映射**
- `session-data`、`mutation`、`stream`、`unclassified` 这四类规则编译为 `action: "deny"`。
- 其余分类的 `action` 就是声明的 `cache`，其中 `none` 表示只走网络、不缓存。
- v1 输出的路径规则 `source` 一律为 `policy`。平台自己的拒绝由 `requestBaselineDenials` 保证。

**`pathRules` 的排列顺序就是评估顺序，运行时取第一个匹配的规则：**
1. 所有拒绝规则排在所有允许规则之前；
2. 同一组内，前缀更长的排在前面；
3. 前缀一样长时，按解码后前缀的码点顺序排列。

匹配以完整路径段为边界，忽略 query 和 fragment。没有匹配到任何规则的请求不缓存。

**以下冲突直接导致编译失败：**
- 允许规则的前缀等于某条拒绝规则的前缀，或落在它之下：报 `compile.allow-under-deny`。
- 解码后相同的前缀被声明了多次：报 `compile.duplicate-path-prefix`。

### 预缓存

- 一个构建产物进入 `precache` 的条件：在上述优先级下，它的 URL 首先匹配到的规则是 `asset` 分类的允许规则，且该规则的缓存策略不是 `none`（`none` 表示只走网络）。
- 始终排除解码后等于 worker 或 manifest 的文件，以及以 `.map` 结尾（不区分大小写）的文件。
- 启用离线降级时：
  - 降级路径必须对应一个构建产物，否则报 `compile.offline-fallback-not-built`；
  - 该路径不能被拒绝规则覆盖，否则报 `compile.offline-fallback-denied`；
  - 满足以上条件时，它总会进入预缓存，与 asset 规则是否覆盖无关。
- `revision`：`fingerprinted` 为 true 时取 `null`，否则取 `contentHash`。
- 条目按 URL 码点顺序排列，并去重。
- 某条缓存策略不是 `none` 的 asset 规则一个构建产物都没覆盖到时，给出 warning `compile.asset-rule-unmatched`。

### 其余计划字段

- **`identity`**：使用校验后的值。
- **`install`**：`policy.install.enabled` 为 true 时，使用校验后的安装元数据；此时如果没有提供元数据，报 `compile.install-metadata-missing`。为 false 时取 `null`。
- **`hostBuildOutput.publicPath`、`artifacts`**：取自输入。
- **`topology`**：原样使用。
- **`cacheNamespace.prefix`**：取 contracts `cacheNamespacePrefix(identity)` 的结果。
- **`requestBaselineDenials`**：取 contracts 的 `REQUEST_BASELINE_DENIALS`。
- **`offlineFallback`**：使用解码后与之相同的构建文件的 URL，与对应的预缓存条目逐字一致。
- **`updateMode`**：沿用策略中的值。
- **三个版本字段**：都固定为 `1`。

### 诊断

以下诊断码追加到 contracts 的 `DIAGNOSTIC_CODES`。这属于 contracts 公开契约变更，随本模块交付，并同步更新声明快照：

| code | 严重度 |
|---|---|
| `compile.invalid-host-output` | error |
| `compile.unsupported-topology` | error |
| `compile.public-path-outside-scope` | error |
| `compile.duplicate-path-prefix` | error |
| `compile.allow-under-deny` | error |
| `compile.install-metadata-missing` | error |
| `compile.offline-fallback-not-built` | error |
| `compile.offline-fallback-denied` | error |
| `compile.asset-rule-unmatched` | warning |

与 contracts 一致：诊断路径只包含契约字段名和数组下标，消息由平台撰写，不回显任何输入原文。

## 兼容性

面向 Node 22+ 的构建环境，ESM，import 时不依赖浏览器全局对象，输出 `PwaPlan v1`。修改排序、预缓存选取或冲突语义都会改变计划的逐字节输出，属于编译器语义变更，需要兼容性评审（ADR-0007）。

## 命令

```text
pnpm lint
pnpm test --filter @pwa-platform/core
pnpm build --filter @pwa-platform/core
```

根目录的 `build` / `test` 脚本不带 `--filter` 时，按依赖顺序作用于所有工作区包。带 `--filter` 时，先构建目标包依赖的工作区包，再只在目标包中执行；包名不存在时以失败退出。

## 测试策略

- **表驱动单元测试**：覆盖归一化、各分类的动作、优先级排序、两类冲突、预缓存选取与 revision、离线降级、install 开关、不支持的拓扑和非法产物清单。
- **性质测试**：
  - 成功输出总能通过 `validatePlan`；
  - 打乱规则和产物的输入顺序，输出不变；
  - 允许规则永远不会先于拒绝规则匹配到拒绝前缀下的路径。
- **golden 测试**：代表性输入对应固定的计划 JSON，输出的任何变化都必须显式评审。
- **边界测试**：import 时不读取浏览器全局对象；不依赖文件系统和 Workbox。

## 边界

- **始终**：输出通过 `validatePlan`；排序稳定；诊断不回显输入原文；拒绝规则优先。
- **先询问**：改变优先级语义、预缓存选取规则、诊断码集合或 `PwaCompileInput` 的字段。
- **禁止**：I/O；Workbox；生成 worker 代码；让允许规则覆盖拒绝规则；在其他包里重新实现优先级。

## 验收标准

1. `@pwa-platform/core` 导出 `compilePlan` 和 `PwaCompileInput` 类型，对任何输入都返回结果、不抛错。
2. 合法输入编译出的计划通过 `validatePlan`，而且与输入顺序无关、逐字节确定。
3. 拒绝规则总是排在允许规则之前；允许规则落在拒绝前缀下，或前缀解码后重复，都会以稳定诊断失败。
4. 预缓存只包含 asset 规则覆盖的产物和离线降级页，并排除 worker、manifest 和 source map；revision 按是否带指纹确定。
5. contracts 追加 `compile.*` 诊断码，公开导出和声明快照同步更新。
6. 测试在 Node 中运行，不依赖浏览器、文件系统或 Workbox。

## 开放问题

无。原两条已由项目所有者于 2026-09-24 按建议裁决，写入契约正文：路径逐段解码、`%2F` 不解码（"归一化"一节，实现见 `packages/core/src/internal/path-key.ts`）；`contentHash` 限定为 URL 安全字符、长度 8–128（"公开契约"的 `hostBuildOutput`，实现见 `packages/core/src/host-output.ts`）。两者在裁决前已按建议实现并有测试覆盖，裁决只使规格与代码一致，行为不变。

## 文档影响表未回填（2026-09-23）

本模块**没有** `Documentation impact` 表，因此 spec-guard 的文档核验对它报 `invalid`。**这是预期结果，不表示文档缺失或有错。**

项目所有者 2026-09-23 决定：只为仍在演进的模块（`pwa-entry-resilience`、`examples-browser-e2e`）补这张表，已交付的模块不回填。理由是该表的作用在于**动工前**想清楚会波及哪些事实源；对早已交付的模块事后补填，只能从文档现状反推当时的判断，得到的是形式合规而非新的事实。

本模块的文档交付情况以[文档基线](../docs/DOCUMENTATION-BASELINE.md)中对应关注项那一行为准。若本模块日后再次进入修订，应在那次修订中补齐该表。

**2026-09-24 补齐**：本模块当天再次进入修订，按上述约定补齐了该表，见下方 Documentation impact；表只针对那次修订。

## Documentation impact

本表回填于 2026-09-24，针对当天的修订：关闭两条开放问题，把 `contentHash` 格式与路径解码写入契约正文，行为不变（见上文"开放问题"）。依据 2026-09-23 的决定，本模块再次进入修订，因此补齐该表；此前交付的部分不据此反推。基线中没有本模块自己的关注项，本表只表达这次修订是否波及其他事实源。

| Concern | Decision | Rationale |
|---|---|---|
| product-direction | follow | 不涉及。 |
| architecture | follow | 不涉及。 |
| developer-entry | follow | 不涉及。 |
| capability-map | follow | 模块职责与依赖不变。 |
| decisions | follow | 裁决的是既有行为，不新增或修订 ADR；裁决记在本规格的开放问题一节。 |
| lifecycle-and-recovery | follow | 不涉及。 |
| ci-baseline | follow | 不涉及。 |
| supply-chain | follow | 不涉及。 |
| browser-matrix | follow | 不涉及。 |
| v1-acceptance | follow | 不涉及。 |
| identity-release-baseline | follow | 不涉及。 |
| release-and-incident | follow | 不涉及。 |
| recovery-drill | follow | 不涉及。 |
| browser-release-evidence | follow | 不涉及。 |
| package-distribution | follow | 不涉及。 |
| cloudflare-test-deployment | follow | 不涉及。 |
| browser-test-harness | follow | 不涉及。 |
| workbox-engine | follow | 引擎只接收计划中的 revision，其取值来源不变。 |
| sw-runtime | follow | 预缓存 revision 的取值与缓存键不变。 |
| offline-write-extension | follow | 不涉及。 |
| build-verifier | follow | 产物校验不读取 `contentHash` 格式。 |
| release-gate-contract | follow | 不涉及。 |
| local-ci-record | follow | 不涉及。 |
| release-orchestration-protocol | follow | 不涉及。 |
| vite-adapter | follow | 插件算出的 `contentHash` 为 sha256 的 base64url 截断到 43 字符，本就落在 8–128 之内（vite-adapter 规格），不需改动。 |
| client-runtime | follow | 不涉及。 |
| vue-react-adapters | follow | 不涉及。 |
| examples-browser-e2e | follow | 不涉及。 |
| pwa-entry-resilience | follow | 不涉及。 |
| ssr-adapters | follow | Nuxt 逐文件求出的哈希与 vite 的形式相同，同样满足格式，不需改动。 |
| shared-origin-topology | follow | 不涉及。 |
| push-module | follow | 不涉及。 |
| public-read-cache | follow | 不涉及。 |
