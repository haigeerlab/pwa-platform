# 验证记录：policy-compiler

> 模块质量门禁（#31）的可复现结果。任务事实源仍是 GitHub Issues #14。

## 环境与对象

- 日期：2026-09-15
- 分支：`feat/policy-compiler`，基线 `origin/main` = `bf13cfe`
- 被验证的代码提交：`1b6c95d`（此后的提交只包含文档）
- 环境：Node v24.18.0，pnpm 11.18.0，Darwin arm64
- 方式：从该提交新建独立的 git worktree，`pnpm install --frozen-lockfile` 后依次执行下表命令；执行结束后 worktree 没有任何改动

## 仓库命令

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 退出 0，lockfile 无需解析 |
| `pnpm test --filter @pwa-platform/core`（尚无构建产物） | 退出 0；根脚本先构建 contracts，再只运行 core：7 个测试文件、94 条测试通过 |
| `pnpm test --filter @pwa-platform/coer`（包名拼错） | 退出 1，No projects matched |
| `pnpm lint` | 退出 0，没有告警 |
| `pnpm test` | 退出 0；contracts 8 个文件、138 条测试通过，类型测试 0 错误；core 7 个文件、94 条测试通过 |
| `pnpm build` | 退出 0，按 contracts → core 的顺序构建 |
| `pnpm --filter @pwa-platform/contracts typecheck` | 退出 0 |
| `pnpm --filter @pwa-platform/core typecheck` | 退出 0 |
| `git diff --check origin/main...HEAD` | 没有空白错误 |

## 回归面与变异验证

| 回归面 | 位置 |
|---|---|
| 公开导出（只有 `compilePlan`） | `test/public-api.test.ts` |
| package.json（单一入口、`sideEffects: false`、只依赖 contracts） | `test/public-api.test.ts` |
| 公开声明快照 | `test/__snapshots__/public-api.d.ts.snap` |
| 依赖边界（只允许相对导入与 contracts，禁止动态加载） | `test/public-api.test.ts` |
| 两份逐字节一致的 golden 计划 | `test/golden/` |
| 规则与预缓存语义 | `test/rules.test.ts`、`test/precache.test.ts` |
| 评审补充的加固测试 | `test/review-hardening.test.ts` |

每项守护都用变异测试确认过：修改一处实现后对应测试失败，恢复后源码逐字节一致。

| 任务 | 变异 | 失败的测试 |
|---|---|---|
| #28 | 去掉排序；去掉"允许规则落在拒绝前缀下"的检查；不解码 | 优先级、洗牌不变性、冲突、编码绕过 |
| #29 | 把 network-only 的 asset 规则也当作预缓存来源；去掉 worker/manifest/`.map` 排除；去掉离线页的拒绝检查；把"第一条匹配"改成"最后一条匹配" | 对应的选取与离线测试 |
| #30 | 前缀短的排在前面；index 泄漏实现模块；静态导入 `node:fs`；动态加载模块 | golden、导出列表、声明快照、依赖边界 |
| 评审修复 | 不解码转义；worker/manifest 不再与 identity 对齐；文件路径不按解码后判重；离线页保留策略写法；接受访问器字段；拒绝类别漏掉 unclassified；不去掉 mountPath 结尾的 `/`；排序按 UTF-16 码元长度；排序按原始写法长度 | 均有对应测试失败 |

## 独立评审

由一个全新上下文的只读代理对整个模块 diff 做了评审。结论是没有阻断项，有 5 条应修、2 条小问题和一组测试缺口。所有问题都先用构建产物复现，再修复并补测试，修复提交为 `1b6c95d`。

**需要语义决定、由项目所有者确认的四项（已写入 spec）：**

1. 路径段按 URL 标准解码；非法转义保留原样，非 UTF-8 字节替换为 U+FFFD。解码后相同的前缀一律视为冲突，所以只会多报、不会漏报。
2. 宿主清单里的 worker 和 manifest 文件，挂在 publicPath 下之后，必须分别等于 identity 的 `serviceWorkerUrl` 和 `manifestUrl`。
3. 计划中离线页的路径使用构建文件的写法，与对应的预缓存条目逐字一致。
4. 从 contracts 复制的路径工具和拒绝类别列表保留副本，另加一致性测试防止两边漂移。

**直接修复的四项：**

- 构建文件路径解码后必须唯一；
- 每个输入字段只读取一次，拒绝访问器字段和稀疏数组；
- 按解码后的形式排除 worker 和 manifest，`.map` 排除不区分大小写；
- 根脚本在包名不存在或 filter 为空时失败，并报告子进程启动错误。

**评审确认没有问题的方面：** 十六进制大小写、`%2F`、双重编码、`%2e` 段、整段匹配、带编码的 publicPath、恶意 Proxy 与深层嵌套输入、诊断不泄漏输入原文、性能（3000 条规则 × 20000 个文件约 0.8 秒）、根脚本不会递归调用自身。

## 模块审阅清单

- [x] core 不包含 I/O、Workbox、Service Worker 注册、运行时缓存或框架代码：依赖边界测试已守护，源码中只有相对导入和 `@pwa-platform/contracts`。
- [x] 规则优先级只在 core 中实现，计划里的 `pathRules` 顺序就是运行时的首个匹配顺序。
- [x] 任何成功的编译结果都能通过 contracts 的 `validatePlan`；任何输入都不会让 `compilePlan` 抛错。
- [x] 输出与规则和构建文件的声明顺序无关，只有 warning 路径中的资源下标例外。已由洗牌属性测试和 golden 反序测试覆盖。
- [x] 独立评审已完成，所有应修项已修复并补测试。

## 与 spec、ADR 和能力图的边界核对

- **ADR-0002**：业务只提交声明式的 `PwaPolicy`，由编译器生成可审计的 `PwaPlan`，Workbox 不作为公开 API。一致。
- **ADR-0007**：contracts 负责结构、校验和诊断，`@pwa-platform/core` 负责编译和规则优先级。一致。
- **ADR-0008**：缓存命名空间前缀由 contracts 的 `cacheNamespacePrefix` 从 identity 推导，`validatePlan` 会校验两者一致。一致。
- **能力图 `policy-compiler`**：归一化配置、合并平台安全基线（完整的 `requestBaselineDenials`）、定义规则优先级、编译 Identity、Install 和 Policy。一致。
- **contracts 的公开契约变化**：新增 9 个 `compile.*` 诊断码和 `DIAGNOSTIC_MESSAGES` 导出，均已同步声明快照，v1 golden 原样通过。

## 已知限制（移交后续模块）

- **`pathRules` 保留声明时的写法**（例如 `/%61ssets`）：sw-runtime 在匹配时必须按 spec 的解码规则比较，并按 `pathRules` 顺序取第一条匹配，不能按字面匹配。
- **worker 必须位于 publicPath 之下**：vite-adapter 等宿主适配器需要保证 worker 与构建产物使用同一个 publicPath。
- **revision 直接取宿主给出的 `contentHash`**：编译器不读取文件，哈希是否可信由适配器负责。
- **v1 不生成 `source: "platform"` 的路径规则**：平台基线拒绝只通过 `requestBaselineDenials` 表达，运行时必须强制执行它。
- **core 保留了从 contracts 复制的路径工具**：由一致性测试和最终的 `validatePlan` 兜底；如果以后 contracts 公开这些工具，可以改为直接复用。
