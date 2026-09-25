# ADR-0019：同源登记表与 `exclude` 规则动作

## 状态

已接受（2026-09-18，项目所有者）。服务 [shared-origin-topology](../../spec/shared-origin-topology.md)；落实 [ADR-0006](0006-optional-shared-origin-and-push-modules.md) "同源治理作为可选模块"的决定，不取代它。

## 背景

[部署拓扑](../architecture/deployment-topologies.md)允许同一个源上有一个根应用（例如 `/` 下的桌面应用）和若干固定子路径应用（例如 `/m/` 下的移动应用），各自拥有 manifest 与 worker。浏览器按 scope 的具体程度决定哪个 worker 控制哪个页面，但**不在同源应用之间做任何隔离**：它们共享源级的权限、存储配额与 cookie，一个应用的脚本可以打开另一个应用的缓存。

因此平台要保证的不是隔离，而是**平台自己的 worker 不越界**。部署拓扑文档列出了根 worker 不得做的四件事：
- 预缓存子路径；
- 运行时缓存子路径；
- 为子路径返回自己的离线降级页；
- 删除子路径所属的缓存。

部署顺序为先让根 worker 排除子路径、再部署子应用，移除时反向。

其中两件事现有机制已经做到：
- 平台 v1 没有运行时缓存；
- 缓存命名空间按 `appId` 与环境划分，编码保证一个应用的前缀不会是另一个应用的前缀，恢复 worker 只删本应用前缀下的缓存（[ADR-0008](0008-cache-namespace-and-identity-baseline.md)）。

剩下两件事需要新机制，而且其中一件与现有决定直接冲突：[ADR-0012](0012-platform-worker-runtime-config-and-recovery-worker.md) 的 2026-09-17 增补让平台 worker 对命中 `deny` 规则的**导航**在断网时回退离线页。如果子路径排除沿用 `deny`，根 worker 就会把自己的离线页返回给子应用的地址。那份增补在"影响"中已预先登记了这个约束。

## 决策

- **登记表描述一个源、一个环境上的全部应用**：一个根条目与至少一个子条目。每个条目包含 `appId`、`scope`、`serviceWorkerUrl`、`manifestId`、`manifestUrl`；登记表另有 `schemaVersion`、单调递增的 `registryVersion`、`origin` 与 `environment`。

- **登记表在编译期校验**，错误只含诊断码与契约路径，不回显输入值：
  - 子 scope 严格位于根 scope 之内（按路径段比较，与 core 的路径解码与整段比较规则一致）；
  - 子 scope 两两不重叠，也不互相嵌套；
  - 全部条目的 `appId`、`serviceWorkerUrl`、`manifestId`、`manifestUrl` 两两不同；
  - 每个条目的 `serviceWorkerUrl` 与 `manifestUrl` 位于其自身 scope 之内，根条目的这两个地址还不得位于任何子 scope 之内；
  - 缓存前缀两两不同（现有命名规则已保证，仍显式检查）。

- **登记表经拓扑对象进入构建，`PwaPlan` 不增加字段。** 新增拓扑类型 `{ kind: "shared-origin", registry }`。编译器用正在构建的应用身份，在登记表中找到五个字段全部相等的**恰好一个**条目，由此判定它是根应用还是子应用；登记表的 `origin` 与 `environment` 必须等于身份中的对应字段。计划的 `topology` 原样记录整个登记表快照，`registryVersion` 就是[契约文档](../architecture/contracts.md)预期的"登记表版本"。`PwaPlan` 仍是 15 个字段，`planVersion` 不变。

- **新增路径规则动作 `exclude`，不复用 `deny`。**
  - 编译器为根应用的每个子 scope 生成一条 `exclude` 规则（来源为 `platform`），排在所有规则之前，包括 `deny`。
  - 平台 worker 对命中 `exclude` 的请求**一律不调用 `respondWith`**：导航与非导航、在线与断网都与没有 worker 时相同，**永不回退离线页**。这是它与 `deny` 唯一的行为区别，也正是不能复用 `deny` 的原因。
  - 单独的动作类型让区别体现在契约里，而不是藏在"某个 `deny` 来自登记表"这类来源字段中；后来者读决策表就能看出二者不同。

- **根应用的其他编译约束：**
  - 应用自己的策略规则落在子 scope 内时编译失败，**包括 `deny`**。`exclude` 先于一切规则匹配，写在那里的规则永远不会生效，允许它们只会让人误以为有效。
  - 子 scope 内的宿主文件永不进入根应用的预缓存，出现时给出警告；
  - 离线降级页不得位于子 scope 内。
  - 子应用不生成 `exclude`：它的 scope 比根更具体，浏览器只会把子 scope 内的页面交给子 worker。

- **发布顺序由机器检查。** `verifyRelease` 新增可选输入"当前线上根应用的计划"。只在被校验的是子应用、且提供了该输入时运行，检查：
  - 根计划为 `shared-origin`，且与子计划属于同一个源与环境；
  - 根计划中有覆盖本子 scope 的 `exclude`；
  - 根计划的 `registryVersion` 不低于子计划的。
  未提供该输入时，报告中不出现这项检查，与现有检查的约定一致。

- **登记表文件放在根应用的仓库，子应用仓库保存副本。** 两份是否一致，由发布顺序校验的版本比较兜底：子应用用了比线上根应用更新的登记表发布时，校验失败。

- **移除子应用只在运维手册中规定顺序，不做自动化检查**：
  1. 子应用先发布恢复 worker，确认其缓存已清空、注册已由恢复 worker 接管；
  2. 再从登记表中移除该子应用，`registryVersion` 加 1；
  3. 最后重新发布根应用，根 worker 停止排除该路径。
  顺序反过来时，根 worker 会在子应用仍然存在时开始接管子路径。

## 影响

- **修改五个已交付包，全部只增不改**：
  - contracts：登记表契约、拓扑类型、`exclude` 动作、新诊断码；
  - core：`shared-origin` 的编译与检查；
  - sw-runtime：配置白名单与决策表增加 `exclude`，新增透传原因；
  - build-verifier：发布顺序校验；
  - vite：选项校验接受新拓扑。
  `standalone-origin` 的行为、测试与计划序列化结果必须逐字节不变。
- **"只增不改"只在运行时成立，对 TypeScript 使用方是破坏性扩展**（2026-09-18，模块质量门禁的独立评审指出）：`PwaTopology` 由单一对象变为可区分联合，`PwaPathRuleAction`、sw-runtime 的透传原因、build-verifier 的检查名与 contracts 的诊断码集合都扩大了取值范围。仓库自己的 vite 就因此需要改动。下游若写了"不是 `deny` 就当缓存策略"这类判断，会把 `exclude` 当成缓存策略；仓库内的这类写法已改为显式列出允许的动作。各包是私有工作区包、不发布到 npm，当前不涉及版本号；一旦开始发布，这类扩展应按主版本变更处理。
- **登记表、计划与发布记录三处都做同源检查**：登记表的路径比较与 core、sw-runtime 使用同一种解码后的整段比较；计划校验另外约束根应用的预缓存、离线页与安装起始地址不在子 scope 内；发布顺序校验除版本外，还比对根应用登记表中本子应用的条目，版本相同时要求两份登记表完全一致（均为模块质量门禁中按独立评审补齐）。
- **ADR-0012 将增补 `exclude`**，写明它与 `deny` 的离线行为区别，以及这是对该文档 2026-09-17 增补中"未来拓扑约束"的落实。
- **`@pwa-platform/nuxt` 不支持同源拓扑**：它把拓扑固定为 `standalone-origin`，不受契约扩展影响，写入已知限制。
- **子 worker 安装之前**，断网访问子路径得到浏览器的网络错误，而不是任何离线页：根 worker 不接管，子 worker 尚不存在。这是有意的取舍，宁可不给离线页，也不让根应用的内容出现在子应用的地址下。
- **同源不是隔离**：本决定只约束平台 worker 与恢复 worker 的行为，不约束应用代码。需要隔离的应用应使用独立源。
- 平台 v1.1 若引入运行时缓存，其写入路径必须同样遵守 `exclude`。
