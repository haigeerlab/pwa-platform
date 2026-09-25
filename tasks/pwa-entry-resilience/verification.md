# 验证记录：pwa-entry-resilience

> 模块质量门禁（T9）的可复现结果。本模块的任务以本地编号 T1–T9 记录在 [plan.md](plan.md)，GitHub 账号恢复后补建 issue 并回填编号。各任务的实施细节与逐次变异记录见计划中的实施记录，本文汇总门禁层面的证据。

## 环境与对象

- 日期：2026-09-17
- 分支：`feat/pwa-entry-resilience`，基线 `main` = `2f24fc5`（能力图行、规格与计划已在 main 上）
- 环境：Node v24.18.0，pnpm 11.18.0，macOS 15.7.3（24G419）arm64，Google Chrome 152.0.7977.84（本机安装的稳定版），Playwright 1.63.0
- 被验证的提交：门禁先在 `4bfa549`（T1–T8）上执行；处置独立评审之后，在 `b5e1872` 上重新执行

本分支相对 `main`：14 条提交、87 个文件、6794 行新增 19 行删除，每条提交都带 `Task:` 标记。

| 提交 | 标记 | 内容 |
|---|---|---|
| `670ef54` | T1 | 包骨架、清单契约与验签 |
| `2021d72` | T2 | 多 Origin 真实浏览器前提 |
| `24fc00a` | T3 | 返回路径校验 |
| `0cd2a39` | T3 | 选择规则、展示判定与页面侧查询函数 |
| `12f3a00` | T3 | 序号下限随签名密钥失效（项目所有者决定） |
| `df5c6d7` | T4 | vite-adapter 的只读计划 API（修改已交付包，已获批准） |
| `1634c0d` | T5 | ADR-0017、ADR-0018 提议稿 |
| `92e5621` | T5 | 两份 ADR 接受 |
| `7d5dcc9` | T5 | Vite 插件 |
| `27e8581` | T6 | 入口恢复页 |
| `06b1e96` | T7 | 六个真实浏览器场景 |
| `4bfa549` | T8 | 演练文档与签发、轮换、撤回 Runbook |
| `79e9743` | T9 | 独立评审发现的代码与测试修复 |
| `b5e1872` | T9 | 规格、ADR-0017、Runbook 与包边界的同步 |

## 干净 worktree 门禁

从被验证的提交新建独立的 detached git worktree（位于会话临时目录，不在仓库内），依次执行。两轮之间只有被检出的提交不同：

| 命令 | `4bfa549`（评审前） | `b5e1872`（评审后） |
|---|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0 | 退出 0 |
| `pnpm lint` | 退出 0 | 退出 0 |
| `pnpm build` | 退出 0 | 退出 0 |
| `pnpm test` | 退出 0，994 通过 | 退出 0，**1016** 通过 |
| `pnpm typecheck` | 退出 0 | 退出 0 |
| `pnpm test:browser` | 退出 0，109 通过、2 跳过 | 退出 0，**110** 通过、2 跳过 |

评审后一轮的逐包计数：

- **`pnpm test`**：contracts 139、browser-test-harness 61、core 94、build-verifier 100、engine-workbox 37、sw-runtime 87、client-runtime 80、vue 36、**vite 97**、react 60、**entry-resilience 225**。
- **`pnpm test:browser`**：browser-test-harness 22、engine-workbox 6、sw-runtime 13、client-runtime 12、vite 11、**entry-resilience 13**，以及 examples-browser-e2e 33 通过、2 跳过（与该模块交付时一致）。所有包日志均打印 `chromium 152.0.7977.84 (configured channel)`。

两轮都没有出现"只在主工作区成立"的问题：本包从 T1 起就显式声明所需的 `@types/*`，`tsconfig` 覆盖全部文件扩展名。这是 examples-browser-e2e 模块质量门禁的教训。

## 依赖与供应链

- 相对 `main`，lockfile **+22 行、0 行删除**，**没有新增任何外部包**。新增内容只是本包的 importer 段与三条 workspace link（vite、browser-test-harness、contracts）；`@playwright/test@1.63.0`、`vite@8.3.0`、`@types/node@24.13.4` 都是 lockfile 中已有的版本。
- 评审修复（`4bfa549..b5e1872`）没有改动 lockfile。
- 非 registry 来源的 `resolution`：无。`pnpm-workspace.yaml` 与根 `package.json` 未被本分支触碰。
- `src/` 没有任何第三方运行时依赖，验签只用 WebCrypto。

## 私钥扫描

- **仓库**（清单取自 `git ls-files`，排除未跟踪的私有文档）：没有完整的 PEM 私钥块，没有"PKCS#8 前缀后接密钥主体"，也没有 base64 形态的 PKCS#8 私钥。
  - `PRIVATE KEY` 字样与 PKCS#8 前缀出现在 6 个文件中：规格、ADR-0017、Runbook、计划、`src/vite/options.ts` 的检测常量，以及 `test/vite/options.test.ts`。它们都是检测规则本身，不是密钥。
  - 测试中原有一段形似 PEM 私钥块的截断假串，已改为运行时拼接，仓库中不再有完整的 PEM 私钥头字面量，避免推送时触发密钥扫描。
- **构建产物**（`b5e1872` 干净 worktree 的 `packages/entry-resilience/dist`）：无密钥材料；`PRIVATE KEY` 字样只出现在 `dist/vite/options.js` 的检测常量中。
- **测试密钥**全部在测试运行时生成。
- **32 字节原始私钥无法按形态扫描**，如实登记于规格、ADR-0017 与 Runbook；Runbook 以"私钥只以 PKCS#8 PEM 形态保存与传递"作为补偿规程。
- 规格验收第 4 条原写"扫描不到 `PRIVATE KEY` 字样"，但检测代码本身必须包含它；T9 已把措辞修正为"扫描不到私钥材料"。

## 独立评审

由新上下文的 `code-reviewer` 代理审阅 `4bfa549`。代理：
- 自行复跑了基线：单测 203、浏览器 12、vite 97；
- 做了 10 组探针与 5 次变异，全部还原，并以 `shasum -c`、`git status` 与 `git diff --stat` 证明工作区回到原状；
- 没有读取仓库中未跟踪的私有文档。

**结论：尚不可进入交付**。没有阻断项，有 7 个应修项与 8 个建议项。主会话先亲自复现了"返回路径 `..` 绕过"，再逐项处置。代码修复落在 `79e9743`，文档同步落在 `b5e1872`。

### 应修项

| 编号 | 问题 | 处置 | 证据 |
|---|---|---|---|
| 1 | 返回路径的 `..` 检查只看解码后 `?`/`#` 之前的部分，`/app/x%3f/../y` 被接受；删掉该检查，全部测试照样通过 | 原始值与解码值都按 `/`、`?`、`#` 切段检查；补根 scope 的隔离用例 | 评审变异 M1 现在让隔离用例转红 |
| 2 | 恢复页若在渲染后**延时**自动导航，现有测试全部通过 | 源码扫描禁止 `src/page/` 使用任何定时器 API；浏览器场景在按钮出现后**不点击、等待 3 秒**，断言主 frame 没有发生任何导航 | M4（延时 1.5 秒导航）让源码扫描转红；主会话另外复做了一次，**只跑浏览器场景**，两个场景均转红 |
| 3 | 序号下限取自存储里未验签的字段，同源写入一份伪造记录就能钉死下限 | 只有已存信封能用现行密钥验签通过（不检查过期），且签名内容中的应用、环境、序号与记录一致，才采用下限。ADR-0017 补一句落实方式，决定本身不变 | 伪造记录用例；去掉验签要求的变异让 3 条用例转红 |
| 4 | 时钟或有效期上限为 `NaN` 时判断被放行 | `verifyEnvelope` 要求二者为有限数；编排层在任何存储与网络访问之前失败即关闭 | 去掉有限性检查的变异转红 |
| 5 | "预缓存确认覆盖脚本的传递导入"没有测试 | 新增真实构建用例：入口 chunk 在预缓存内，它导入的 chunk 在规则之外。用例先断言传递导入确实存在，再断言构建失败 | M3（闭包只留入口 chunk）现在转红 |
| 6 | IndexedDB 读取失败一律返回 null，读取失败的诊断永远不会出现 | 打开失败、请求出错、事务中止时 reject，只有没有记录才返回 null。新增浏览器用例，用更高版本的同名库制造打开失败 | `loadStored` 出错返回 null 的变异让浏览器用例转红 |
| 7a | 规格写的诊断类型是码数组，实际是 `{code, path}` 对象 | 改规格 | — |
| 7b | 规格写的 `pwa-return` 编码与实现不同，且规格公式在 `startPath` 含 `?` 时本身有误 | 改规格：以 `URLSearchParams` 写入与解析 | — |
| 7c | 规格说展示"探测确认可达的入口"，实现展示全部入口 | **改代码**：`unconfirmed-outage` 时探测全部入口，只展示可达的入口 | 模型退回展示全部入口的变异转红 |

### 建议项

| 编号 | 问题 | 处置 |
|---|---|---|
| 1 | 发现源读取响应体出错时抛出，与"从不抛出"不符 | 已修，补用例与变异 |
| 2 | `startPath` 能通过的形态比规格宽（控制字符、`%2e%2e`） | 已修：拒绝控制字符，解码一次后复查；规格同步 |
| 3 | 严格时间解析对 0000–0099 年会滚动 | 已修：年份早于 1970 即非法（只会偏向失败即关闭） |
| 4 | 64 字节签名误填进 `publicKey` 时，诊断报的是"私钥形态" | **不改**。构建本来就应失败，只是提示措辞不够准确；已记录 |
| 5 | `src/index.ts` 头注释与包边界文档对 `.` 入口的描述过时 | 已修 |
| 6 | Runbook 参考脚本用 ES 模块语法，需存为 `.mjs` | 已在 Runbook 注明 |
| 7 | 虚拟模块只做浅冻结；`writeBundle` 抛错时产物已经写到磁盘上 | 浅冻结**不改**（配置对象只供页面读取）；"构建失败时的输出目录不得发布"写入规格与 Runbook |
| 8 | 未证实：`loadStored` 在事务中止而请求不报错时可能挂起 | 随应修 6 一并补上 `onabort` |

另有评审变异 **M2**：`select.test.ts` 中"负数序号视为没有下限"的用例，其信封为 `null`，下限本来就不会生效，因此测不到目标。已改用合法签名的信封，并补一条隔离用例；M2 现在转红。

**评审指出的四处测试空过（M1–M4），修复后全部转红。** 评审修复共改动 24 个文件，其中现有用例的断言只在两处按新设计修改：`select.test.ts` 的那条负数序号用例，以及 G 项涉及的 `decide.test.ts` 与 `page/model.test.ts`。

## 变异检查汇总

各任务的逐次变异见计划中的实施记录，每次都在全绿基线上执行，还原后逐字节一致：

| 任务 | 变异数 | 主会话复做 |
|---|---|---|
| T1 契约与验签 | 5 | 验签恒真 |
| T2 浏览器前提 | 2 | 两次均为主会话执行 |
| T3 选择、判定、返回路径 | 8 | 同序号冲突 |
| T3 下限随密钥失效 | 3 | 三次均为主会话执行 |
| T4 只读计划 API | 3，其中 1 次在结构上无法转红 | 去掉 `buildStart` 重置 |
| T5 Vite 插件 | 5 | 只确认 HTML、不确认脚本 |
| T6 恢复页 | 5 | 去掉 origin 断言 |
| T7 六个场景 | 6 | 去掉序号下限 |
| T9 评审修复 | 4 个评审变异加 7 个新增 | 延时自动导航（只跑浏览器） |

**两个无法或不能计入的结论，如实列出：**
- T4 中"暴露内部原对象而非冻结副本"在今天的代码里不可观测：`compilePlan` 的结果已被 contracts 的 Zod `.readonly()` 深度冻结。
- T3 与 T7 各有过一次在红基线上跑出的"变异转红"，已记录为无效，不计入结论。

## 浏览器矩阵记录

字段按[浏览器矩阵](../../docs/architecture/browser-matrix.md#版本号)。场景为规格"测试策略"列出的六个，另加 T9 新增的存储读取失败用例。

| 浏览器与档位 | N / N-1 | 完整版本号 | 操作系统 | 日期 | 结果 |
|---|---|---|---|---|---|
| Chrome 桌面端（必测） | N | 152.0.7977.84 | macOS 15.7.3（24G419）arm64 | 2026-09-17 | 六个场景与存储读取失败用例全部通过；场景文件 `--repeat-each 5` 为 35/35 |
| Chrome 桌面端（必测） | N-1 | — | — | — | **未执行**：本机只安装了当前稳定版，取得 N-1 需要下载浏览器，须先经项目所有者批准 |
| Chrome Android（必测） | N 与 N-1 | — | — | — | **未执行**：无测试设备；Chrome Android 的运行方式尚未确定（ADR-0010） |
| Edge 桌面端（参考） | N | — | — | — | 未执行 |
| Safari、Firefox（渐进兼容） | 当前稳定版 | — | — | — | 未执行。这两者支持 Ed25519 验签的起始版本分别为 17 与 129（MDN browser-compat-data），均未实测 |

"N"按本机稳定版渠道自动更新到的当前版本判定，未对照 Chrome 官方发布页核实当天的最新主版本。

**按浏览器矩阵的规则，本模块在必测范围上没有通过**：Chrome Android 与桌面端 N-1 未取得即计为未通过。本模块是 v1 之后的可选能力，不进入 V1 验收矩阵，但它自己的[入口恢复演练](../../docs/operations/entry-recovery-drill.md)要求在必测范围内执行。本记录不把本机 Chrome 桌面端 N 的结果外推为模块通过。

## 入口恢复演练记录

按[入口恢复演练](../../docs/operations/entry-recovery-drill.md#记录模板)的模板填写。**本次是在本机 fixture 服务器上的自动化执行，不是类生产环境演练**：
- 三个 Origin 是 `http://localhost` 的三个端口；
- "当前 Origin 在网络层不可达"用关闭服务器（连接被拒）模拟，不是 hosts、防火墙或 DNS 故障；
- 清单在测试运行时用临时密钥签发，没有经过 Runbook 的离线签发与台账。

- 触发：质量门禁。本模块的 PR 尚未创建（GitHub 账号不可用），被验证的提交为 `b5e1872`。
- 日期：2026-09-17
- 执行人：自动化执行（`packages/entry-resilience/browser-tests/scenarios.spec.ts`）
- 环境：本机干净 worktree，fixture 服务器
- 应用与环境：appId `entryfixture`，environment `production`
- 被测构建标识：每条测试由 `pwa()` 与 `pwaEntryResilience()` 现场构建
- 公钥集 keyId：`entry-fixture`；另有一把不在公钥集中的密钥，用于未知密钥检查
- 当前 Origin、批准的备用 Origin、发现源主机名：均为 `localhost`，端口由系统分配，三者互不相同

### 浏览器

Chrome 桌面端 N，152.0.7977.84，macOS 15.7.3 arm64。其余必测范围未执行，见上一节。

### 签发清单

| 步骤 | status | sequence | keyId | 结果 | 诊断码 |
|---|---|---|---|---|---|
| 种子（每条测试） | normal | 1 | entry-fixture | 主入口可达时为 none | — |
| 计划迁移 | migrating | 2 | entry-fixture | available / migrating | — |
| 撤回 | normal | 3 | entry-fixture | none | — |
| 重放 | migrating | 2（原始字节） | entry-fixture | none | `entry.sequence-rollback` |
| 篡改（全新设备） | migrating | 2 | entry-fixture | none，不写入存储 | 签名不符 |
| 未知密钥 | migrating | 2 | 公钥集之外 | none | `entry.unknown-key` |
| 篡改（已有合法记录） | migrating | 9 | entry-fixture | available / migrating（来自已存清单） | 签名不符 |

### 检查结果

| 检查项 | 浏览器 | 结果 | 证据 |
|---|---|---|---|
| 基线无入口 | Chrome 152 桌面 | 部分 | 撤回场景中主入口可达、清单为 normal 时结果为 none；"恢复页没有按钮"只在离线场景中验证 |
| 迁移公告展示目标主机 | Chrome 152 桌面 | 通过 | 计划迁移场景 |
| 未点击不导航 | Chrome 152 桌面 | 通过 | 按钮出现后不点击、等待 3 秒，主 frame 无导航；源码扫描禁止定时器 |
| 点击后到达备用 Origin，返回路径一致 | Chrome 152 桌面 | 通过 | 计划迁移场景的 `pwa-return` 断言 |
| 非法返回路径被丢弃 | 不适用 | 通过（单元测试） | `check.test.ts` 与 `return-path.test.ts`；浏览器中未单独验证 |
| 撤回后回到无入口 | Chrome 152 桌面 | 通过 | 撤回场景 |
| 重放旧清单被拒绝 | Chrome 152 桌面 | 通过 | 撤回场景；已存序号 3 本来就胜过重放的 2，序号下限独有的作用由单元测试覆盖 |
| 网络层不可达时出现未经确认的故障提示 | Chrome 152 桌面 | 通过 | 网络层不可达场景（关闭服务器） |
| 离线时无入口 | Chrome 152 桌面 | 通过 | 设备离线场景 |
| 篡改信封不被采用 | Chrome 152 桌面 | 通过 | 篡改场景，翻转的是文本字段内的字节，只有验签能拒绝 |
| 未知密钥被拒绝 | Chrome 152 桌面 | 通过 | 篡改场景 |
| 与恢复 worker 共存 | Chrome 152 桌面 | 通过 | 共存场景：应用缓存被删，IndexedDB 记录保留 |
| 存储读取失败被报告 | Chrome 152 桌面 | 通过 | T9 新增用例：打开失败时诊断含 `entry.storage-unavailable` |
| 收尾清单已发布 | 不适用 | 不适用 | 每条测试使用独立站点，结束即销毁 |

### 结论

**Chrome 152 桌面端的自动化演练通过；本次不构成演练通过。** 演练文档要求在必测范围内的每个浏览器、在类生产环境中执行，这两项都未满足。

## 规格验收标准逐条核对

| 验收标准 | 状态 |
|---|---|
| 1. 每条拒绝规则与返回路径绕过用例有测试，且有变异证明 | 满足。评审发现的 `..` 空过已修，M1 转红 |
| 2. 真实浏览器六个场景在 Chrome 桌面端 N 通过，各配变异 | 满足，另加存储读取失败用例 |
| 3. 构建期失败条件逐条有测试，含私钥拦截 | 满足。评审发现的"传递导入"空过已修，M3 转红 |
| 4. 仓库、构建产物、测试夹具中无可识别形态的私钥材料 | 满足。措辞已修正，见"私钥扫描" |
| 5. ADR-0017、ADR-0018 已接受；演练文档与 Runbook 一节已评审 | 满足。ADR 已接受；演练文档与 Runbook 一节经独立评审核对（参考脚本实跑可用），并由项目所有者于 2026-09-23 按摘要评审通过（见下文"项目所有者评审（2026-09-23）"） |
| 6. 入口恢复演练按模板在本机执行一次并记录 | 满足，限定为本机自动化执行，见上一节 |
| 7. 未取得的范围逐条登记 | 满足，见浏览器矩阵记录与下文 |
| 8. 模块质量门禁 | 干净 worktree、独立评审、lockfile 审阅已完成；**CI 证据未取得** |

## 项目所有者评审（2026-09-23）

**结论：通过。** 按摘要评审 [`docs/operations/entry-recovery-drill.md`](../../docs/operations/entry-recovery-drill.md) 与发布与事故处置手册当时的"入口清单签发、密钥轮换与撤回"一节，未提出修改意见。（该节与演练文档已于 2026-09-23 随 [ADR-0033](../../docs/adr/0033-entry-manifest-supplied-by-the-application.md) 重写，现为[入口清单的配置、迁移与撤回](../../docs/operations/release-and-incident-runbook.md#入口清单的配置迁移与撤回)；本次评审记录的是重写前的版本。）评审覆盖：

- 演练的三种触发时机（模块质量门禁、每次计划迁移之前、每次签名密钥轮换之后）；三个互相独立的 Origin 与"只让当前 Origin 在网络层不可达"的准备条件。
- 通过标准与四种立即判失败的情形：未点击即导航、展示未批准或被篡改的入口、撤回后旧清单仍被接受、离线时展示入口。
- 记录模板只记状态、序号、`keyId`、主机名与诊断码，不记清单全文、签名、返回路径的值、令牌或用户数据。
- 签发把关方式：签发等同于发布一次跳转，每次须经平台负责人批准并记入台账；序号严格递增、不复用、不跳号；发布前以 `verifyEnvelope` 校验须为 `ok: true`。这是制度约束，代码层面不强制，项目所有者确认可接受。

**评审时确认的限制（不改变本次结论）：** 现有演练记录是本机 fixture 上的自动化执行——三个 Origin 是 `localhost` 的三个端口，故障用关闭服务器模拟，清单用临时密钥签发，未走离线签发与台账。类生产环境的入口恢复演练留到真实迁移之前按文档执行，届时另出记录。

## 未执行、未交付与已知限制

- **必测浏览器范围**：Chrome Android 的 N 与 N-1、桌面端 N-1 未执行，按矩阵计为未通过；参考档与渐进兼容档未执行。
- **真实故障形态**：真实域名、DNS 故障、证书错误与"域名被接管"均未演练；网络层不可达只用关闭本机服务器模拟。
- **签名命令行工具未交付**，Runbook 给出经过实跑的参考脚本。
- **"未点击不导航"的浏览器断言只覆盖 3 秒窗口**。更长延时，或由其他事件（例如 `visibilitychange`）触发的导航，靠源码扫描与代码审阅保证，没有浏览器层的直接证据。
- **64 字节签名误填进公钥时，诊断措辞不准确**（评审建议 4，未改）。
- **需要 GitHub 的 spec-guard 失败项**：`mcp__spec-guard__verify` 为 7 通过、3 失败，GitHub 层因 `gh` 未认证而跳过。三项失败都依赖远端，本地无法处理：
  - `pwa-entry-resilience` 尚无 issue；
  - 能力图目标段改动后，Epic 正文摘要已过期；
  - vue-react-adapters 的 `rowDigest` 分歧是上一模块**有意保留**的。

  另外，正式的 Proposal 晋升证明要求 Proposal 为 `v2` 标记并读取远端评审证明，当前无法执行（见计划"落地方式"）。

## CI 实跑证据：**未取得**

GitHub 账号在本模块开发期间不可用，因此本模块没有 PR、没有 CI 运行记录，也没有"有意制造失败→报红→撤销→恢复为绿"的对照。

上面的干净 worktree 门禁**不替代 CI 证据**：它证明这份代码在本机的干净环境中通过冻结安装与全部门禁，但没有证明 CI 工作流在 Node 22 与 24 两条矩阵线上、在 runner 预装的 Chrome 上同样通过。`docs/DOCUMENTATION-BASELINE.md` 中本模块一行因此保持 `target`。

账号恢复后本模块待办：
1. 推送 `main` 与本分支；
2. 建立模块 PR；
3. 为 T1–T9 补建 sub-issue 并回填计划的 Task List；
4. 取得 CI 红绿证据；
5. 以 `v2` 形态重新发布 Proposal，走晋升证明；
6. 运行 `/spec-guard:sync-map` 刷新 Epic 与模块 issue；
7. 翻转文档基线行。

Chrome Android 与桌面端 N-1 不随 CI 一并取得，另需设备，以及项目所有者的批准。

## 修订：入口清单由业务应用提供（2026-09-23）

### 对象与范围

规格见[模块规格](../../spec/pwa-entry-resilience.md)的同名修订，决定见 [ADR-0033](../../docs/adr/0033-entry-manifest-supplied-by-the-application.md)（取代 [ADR-0017](../../docs/adr/0017-entry-manifest-trust-model.md) 的信任模型）。分支 `claude/entry-manifest-push`，基于 `main` 的 `f57fbbb`。提交：规格与 ADR `ddf92d0`、计划 `47ab5c6`、EM2 `dcf9bc1`、EM3 `bd307f5`、EM4 `69d3954`。

### 安全边界（如实登记）

**平台不再验证入口清单的真实性。** 谁能控制应用后端，谁就能把全体已安装用户引向任意域名。项目所有者 2026-09-23 判定可接受：在同源前提下，这与"谁能改前端代码"等价。仍然保留的平台侧防线只有一条——用户必须亲自点击才会跳转，且入口地址不经页面侧 API 交给应用代码。

由此产生的两条运营后果已写入[发布与事故处置手册](../../docs/operations/release-and-incident-runbook.md#入口清单的配置迁移与撤回)：清单接口须按写操作级别保护；已存入篡改记录且尚未联网的客户端无法被远程覆盖。

### 实现与验收

| 任务 | 提交 | 主会话验收 |
|---|---|---|
| EM2 清单契约与存储 | `dcf9bc1` | 五处变异转红（序号严格大于、已过期、有效期上限、`..` 路径段、`entries` 上限）；包源码中已无验签、公钥与信封代码 |
| EM3 页面侧 API 与构建插件 | `bd307f5` | 四处变异转红（已移除选项守卫、读取时重新判过期、写入存储、两个公开函数共用端口）；发现源实现、测试与诊断码全部删除 |
| EM4 浏览器证据 | `69d3954` | `src/` 与 EM3 逐字节相同；两处 `as string` 转换消除；签名辅助代码在 `browser-tests/` 中清空 |

**两个设计判断由主会话确认**：读取时重新判断过期（签名取消后没有别的机制会让过期清单停止展示，而规格要求"过期不展示"）；`currentOrigin` 守卫保留（不再过滤入口，但仍是访问存储前的端口可用性检查，取值随后用于返回路径校验）。

### 本地质量门禁

| 命令 | 结果 |
|---|---|
| `pnpm --dir packages/entry-resilience test` | 185 项通过，连续两次一致 |
| `pnpm --dir packages/entry-resilience typecheck` | 三个 tsconfig 工程均无错误 |
| `pnpm --dir packages/entry-resilience test:browser` | 7 个场景通过，Chrome 153.0.8010.53 |
| `pnpm lint`（worktree 根） | 退出 0 |

浏览器场景：迁移后展示并只在点击后跳转；`normal` 且主入口可达时不展示；设备离线时不展示；更小序号不覆盖已存记录；形状非法的清单整份被拒；IndexedDB 打不开时报 `entry.storage-unavailable` 且结果不变；恢复 worker 清缓存后已存清单仍在。

### 全仓质量门禁（EM6，2026-09-23）

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm -r --no-bail test` | 退出 0；16 个包全部通过，其中 contracts 187、sw-runtime 213、examples-browser-e2e 192、entry-resilience 185、build-verifier 146、vite 149 |
| Spec Guard 只读核验 | 与 `main` 相同：6 通过 / 4 失败，4 项均为 main 上已有（未落成 issue、能力图摘要过期、cloudflare-test-deployment 的 todo.md 与外部 tracker 并存） |

### 与既有验收标准的关系

- 本模块原验收标准第 1–4 条中关于签名、公钥与批准列表的部分由 ADR-0033 取消，不再适用；对应的实现与测试已删除，未保留为跳过用例。
- 第 5 条（ADR 与文档评审）已于 2026-09-23 由项目所有者按摘要通过，评审对象是**重写前**的演练文档与手册章节；重写后的两份文档属本次修订的交付物，[入口恢复演练](../../docs/operations/entry-recovery-drill.md)的通过标准与记录模板已随之更新。
- 第 8 条的远端 CI 证据仍未取得（GitHub 不可用）；浏览器矩阵中 Chrome Android 与桌面 N-1 仍未执行，本次修订未改变这一状态。

### 未取得与不宣称

- 未在类生产环境演练新流程：本次只有本机 fixture 上的自动化证据。真实迁移之前须按重写后的演练文档另做一次。
- 未验证业务方的加解密链路：那属于接入方的请求层，平台不接触。
- 未发布 npm 版本；包仍为 `private`、`0.0.0`。

## 入口恢复演练记录（类生产环境，2026-09-23）

按[入口恢复演练](../../docs/operations/entry-recovery-drill.md)的记录模板填写。**本次是 Cloudflare `drill` 槽位上的真实站点演练**，不是本机 fixture；"当前 Origin 不可达"为客户端级模拟，见下。

- 触发：质量门禁（[examples-browser-e2e 的"修订：示例接入入口恢复"](../../spec/examples-browser-e2e.md)）
- 日期：2026-09-23
- 执行人：Claude（驱动脚本），项目所有者授权部署与执行
- 环境：Cloudflare Pages `drill` 预览槽位；`main` 槽位与生产站未发生任何写操作
- 应用与环境：appId `pwareactdrill`，environment `test`
- 被测构建标识与 maxValidityDays：React `drill` 部署 `901c061f-6d02-400e-8b92-22f620caf576`，发布包 SHA-256 `1a1d0b25004f9239bb97ed5b971edb88d15e0d1eb7988223e3e29680f45ef48d`，`maxValidityDays: 30`
- 当前 Origin：`drill.pwa-platform-react-demo.pages.dev`
- 备用 Origin：`drill.pwa-platform-vue-demo.pages.dev`（Vue 的 `drill` 站未重新部署，仅作为跳转目标）
- 清单来源：受控客户端直接交入（`window.__entryUpdate`）；站点同时发布一份 `normal`、无入口的种子清单，由应用启动时 fetch

### 浏览器

| 层级 | 版本 | 结果 |
|---|---|---|
| N | Chrome 153.0.8010.53 | 17 项检查全部通过 |
| N-1 | Chrome for Testing 152.0.7977.82 | 17 项检查全部通过 |

### 检查结果（两个浏览器相同）

| 步骤 | 检查项 | 结果 |
|---|---|---|
| 1 | 基线 `checkEntryRecovery()` 为 `none`；恢复页显示"当前没有可用的备用入口"且无按钮 | 通过 |
| 2 | 交入序号 2 的 `migrating` 清单被接受；结果为 `available`／`migrating` 且**不含备用 Origin** | 通过 |
| 2 | 恢复页出现按钮后停留 1.5 秒未发生导航 | 通过 |
| 2 | 点击后顶层导航到备用 Origin，`pwa-return` 等于传入的 `/app/deep/page` | 通过 |
| 2 | 传入 `//evil.example.com` 时恢复页链接不带返回路径参数 | 通过 |
| 3 | 更小序号被拒（`entry.sequence-not-greater`）且不覆盖已存记录 | 通过 |
| 3 | `startPath` 含 `..` 整份被拒（`entry.entry-start-path-invalid`） | 通过 |
| 3 | 已过期清单被拒（`entry.expired`） | 通过 |
| 3 | 超出 `maxValidityDays` 被拒（`entry.validity-period-too-long`） | 通过 |
| 4 | 当前 Origin 不可达时应用壳仍从缓存启动，已存 `migrating` 清单仍被展示 | 通过 |
| 5 | 回到 `normal` 后在线不展示；整机离线仍不展示 | 通过 |
| 6 | `migrating` 清单在过期前展示；时钟推过 `expiresAt` 后不再展示，诊断含 `entry.expired` | 通过 |

**结论：通过。** 两个浏览器各 17 项检查、0 失败。

### 本次演练发现的两个缺陷（均已修复）

1. **示例的种子清单用了带毫秒的时间戳**（`2026-10-23T00:00:00.000Z`），而平台的严格语法只接受 `YYYY-MM-DDTHH:mm:ssZ`，于是每次启动都被静默丢弃。由于"基线无入口"与"种子失效"表现完全相同，**按原步骤演练会假通过**。修复见 `0b0a897`，并新增测试钉住两份已发布种子的语法与有效期。这也促成了"导出清单校验函数"的后续事项（见 [plan.md](plan.md) 的后续事项第 3 项）。
2. **演练文档第 5 步本身有误**：它要求"离线时不展示入口"，却没说明此时应存的是哪份清单。按规格 `migrating` 与 `incident` 不探测、直接展示，所以紧接第 4 步执行必然与设计冲突。首次真实运行即暴露此问题，文档已改为"先交回 `normal` 再离线"，修复见 `dde9a23`。

### 如实登记的限制

- **"当前 Origin 不可达"是客户端级模拟**：驱动脚本用 Playwright 路由拦截该 Origin 的请求，等效于改 hosts；**不是真实的域名故障、DNS 故障或证书错误**，这些仍未演练。
- 第 7 步"与恢复 worker 共存"本次未执行，留待下次恢复演练同场进行。
- 演练客户端均为临时浏览器配置，跑完即销毁；站点上的种子清单仍为 `normal`、无入口，因此无需额外清场。
- 证据在仓库外 `~/Documents/haigeer-labs/pwa-release-records/entry-drill-2026-09-23/`：`drill-react-N.json`（SHA-256 前 16 位 `bc1418ccc170b01a`）、`drill-react-N-1.json`（`4b65a4777a301d8f`）；驱动脚本 `tools/entry-recovery-drill-driver.mjs`（`13c48727e315ef86`）。

## 修订：导出清单校验函数（2026-09-23）

### 对象与范围

规格见[模块规格](../../spec/pwa-entry-resilience.md)的同名修订。起因是 2026-09-23 类生产演练发现的种子缺陷：接入方在清单进入浏览器之前无法校验它，而运行时的拒绝被应用按契约吞掉。分支 `claude/export-manifest-validator`，提交：规格 `e4f5125`、计划 `dcd184f`、导出与测试 `d9ac482`、实时钟用例 `cef9e87`。

### 只扩大导出面，不改判定

包根新增三个名字：`parseEntryManifest`、`EntryManifestParseResult`（内部 `ManifestResult` 的别名）、`EntryManifestValidationContext`。

**`src/manifest.ts` 对分支起点的 diff 为空**，判定逻辑与诊断一行未动——这是本次修订的验收硬标准，由主会话逐字核对。结果类型未在原文件改名，正是为了保持这份空 diff。

### 验收

| 检查 | 结果 |
|---|---|
| `packages/entry-resilience` 测试 | 195 项，连续两次一致（较修订前 185 项，新增 10 项公开面测试） |
| `packages/examples-browser-e2e` 测试 | 205 项通过 |
| 两包 typecheck、`pnpm lint` | 全部退出 0 |
| 变异：示例种子回到带毫秒的时间戳 | 转红 |
| 变异：示例种子已过期 | 转红 |

**示例的种子测试改调真函数**，删除了上一轮临时镜像的严格 ISO 正则；该文件此后不再重新实现任何平台规则。主会话另加一条按 `Date.now()` 判定的用例：子代理原本只用固定时刻，确定但会让**已过期的种子永远通过**，而"种子临期"正是部署前最该收到的提醒。

**等价测试目前恒真**：公开导出与内部导出是同一个函数对象，9 个用例必然相等；真正的约束是那条身份断言。保留等价用例是为将来——若有人给导出加包装，身份断言先失败，等价用例继续守住行为。

### 文档

- 包 README 新增"发布前校验清单"一节，含可直接抄用的 Node 代码。
- [入口恢复演练](../../docs/operations/entry-recovery-drill.md)的"范围与准备"增加自查一步，并写明这一步不是形式：本次演练正是被这个缺陷骗过的。
- [发布与事故处置手册](../../docs/operations/release-and-incident-runbook.md)的"变更步骤"第 3 步拆成两步：先在后端或 CI 自查（可进流水线，不需要浏览器），再在受控客户端确认。
- [包边界](../../docs/architecture/package-boundaries.md)的入口描述更新。

### 全仓质量门禁（MV4，2026-09-23）

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm -r --no-bail test` | 退出 0；16 个包全部通过，其中 entry-resilience 195、examples-browser-e2e 205、sw-runtime 213 |
| Spec Guard 只读核验 | 与 `main` 相同：6 通过 / 4 失败，4 项均为 main 上已有 |

### 如实登记

- **`maxValidityDays` 由调用方传入，可能与构建配置漂移**：自查通过、运行时仍被拒。这是项目所有者 2026-09-23 的取舍（替代方案是从产物读取，需新增公开契约与一次网络往返）。README、演练文档与手册三处都写明必须一致。
- 本次未发布 npm 版本；接入方仍需等[后续事项](plan.md)第 2 项。

## 2026-09-23：演练遗漏的一步，以及它掩盖的缺陷

### 怎么发现的

项目所有者要求在浏览器里演示入口恢复。"迁移中"的展示正常：恢复页列出备用主机、不点不跳转、点击后带 `pwa-return` 到达备用 Origin。随后演示"当前 Origin 不可达"时，**恢复页显示的是"You are offline"，没有任何入口**。

### 缺陷

平台 worker 的导航兜底按"请求 URL 去掉片段、**保留查询串**"匹配预缓存。应用按接入文档传 `returnPath`，恢复页链接因此一定带 `?return=…`，与预缓存中的 `/app/pwa-entry.html` 匹配不上，于是跳过恢复页、落到离线降级页。**这个功能唯一有用的时刻，正是它失效的时刻。**

同一次断网下的对照实验（`scratchpad/query-proof.mjs` 的两次导航，除查询串外完全相同）：

| 地址 | 结果 |
|---|---|
| `pwa-entry.html` | 标题"应用正在迁移到新地址"，入口按钮可见 |
| `pwa-entry.html?return=/app/orders` | 标题 "You are offline"，无按钮 |

修复见 [ADR-0034](../../docs/adr/0034-navigation-fallback-ignores-the-query-string.md) 与 [sw-runtime 规格](../../spec/sw-runtime.md)的"修订：导航兜底忽略查询串"：精确匹配仍优先，落空后丢弃查询串再试同路径。

### 为什么演练没发现

演练文档第 4 步原文写着"恢复页可从缓存打开并完成导航"，但**驱动脚本只验证了应用壳能从缓存启动、以及 `checkEntryRecovery()` 仍返回 `available`**，从未在断网状态下真的打开恢复页。这是写驱动时的遗漏，不是文档没写。

已补齐：
- 演练文档第 4 步拆出独立一条，写明"带着返回路径打开恢复页，必须显示入口按钮而非降级页"，并标注本步不可省略及其缘由；检查结果表新增对应行。
- 驱动脚本 `entry-recovery-drill-driver.mjs`（SHA-256 前 16 位 `12dd5132a67b472c`）新增该检查。
- `packages/entry-resilience/browser-tests/scenarios.spec.ts` 新增回归："断网后带查询串打开恢复页必须显示入口"。

### 差分证据

| 环境 | 结果 |
|---|---|
| 本机浏览器测试，修订前的 `decide.ts` | 新回归**失败**，其余 7 项通过 |
| 本机浏览器测试，修订后 | 8 项全部通过 |
| **线上 drill 站（部署 `901c061f`，仍是修订前的 worker）** | 新增检查**失败**：`{"buttons":[],"offlineFallbackShown":true}`，记录 `drill-react-N-prefix-check.json`（`b3484c0dbb09a288`） |

线上那次运行是只读的，没有任何写操作。**该站点要等下一次部署才会带上修复**；在那之前，线上 drill 站的入口恢复在"域名不可达"场景下仍然不可用，本记录如实登记这一状态。


## 恢复页样式与主题跟随（2026-09-23）

对应[模块规格](../../spec/pwa-entry-resilience.md)的"修订：恢复页的默认样式与宿主定制"与 [ADR-0018](../../docs/adr/0018-entry-resilience-delivery-boundary.md) 的同日两条增补。实现 `ea87a85`，观感复核 `7e5004d`，示例接入 `ba9f180`。

### 本机测试

| 项 | 结果 |
|---|---|
| 包内单元测试 | 19 个文件、216 项通过 |
| 包内浏览器测试 | 14 项通过（`scenarios.spec.ts` 8 项 + `styling.spec.ts` 6 项） |
| 全仓 `typecheck` / `lint` / `test` / `build` | 通过 |

### 变异检查

样式与主题共 8 条变异，全部被测试抓到：

| 变异 | 被抓 |
|---|---|
| 多声明一个没人读的变量 | 单元 2 条失败 |
| 两个暗色块给出不同值 | 单元 1 条失败 |
| 渲染用的 class 与样式表不再对应 | 单元 4 条失败 |
| 停用 `@media (prefers-color-scheme: dark)` | 浏览器 1 条失败 |
| 宿主 `css` 不再追加 | 浏览器 1 条失败 |
| 恢复页读错主题存储键 | 浏览器 2 条失败 |
| 删除 `[data-theme="dark"]` 覆盖块 | 浏览器 1 条失败 |
| 把文档里的暗色覆盖配方换成规格原先那份坏写法 | 浏览器 1 条失败（且仅该条） |

首轮变异里有两条是**无效的**：一条 `sed` 的目标串在源码中并不存在，另一条针对的行为只有浏览器测试覆盖而当时只跑了单元测试。两者都表现成"测试没抓到"。**没落地的变异会伪装成覆盖缺口**，脚本现已在跑测试前断言变异确实改到了文件。

### 类生产演练（Cloudflare `drill`，部署 `f822a276-9272-40f7-8bc0-aea9cd126002`）

- 日期：2026-09-23；执行人：Claude（驱动脚本），项目所有者授权部署与执行
- 环境：Cloudflare Pages `drill` 预览槽位；发布包 SHA-256 `c50e8ac4b3a611fab9960e059ae9d91008bc47bcb1916e34ede124e82cf1054c`，release `v2`
- 应用与环境：appId `pwareactdrill`，environment `test`；`maxValidityDays: 30`
- 当前 Origin `drill.pwa-platform-react-demo.pages.dev`，备用 Origin `drill.pwa-platform-vue-demo.pages.dev`

| 层级 | 版本 | 结果 |
|---|---|---|
| N | Chrome 153.0.8010.53 | 18 项检查全部通过 |
| N-1 | Chrome for Testing 152.0.7977.82 | 18 项检查全部通过 |

线上恢复页核对：两段内联 `<style>`，默认在前、宿主 CSS 在后，哈希 `sha256-wS6EGtPzNaxJzgMXqZT0CUfBF49byXIGnCFPT4AtUis=` 与 `sha256-rqI8wuCAaOG4szQIAjzmrwFFzo3/da+jPfl4pm3MOyA=` 与构建日志逐字一致；页面仍无内联脚本。

断网状态下从预缓存打开恢复页，三条主题路径的实测计算样式：

| 情形 | `data-theme` | 页面背景 | 按钮底色 |
|---|---|---|---|
| 系统亮色 | 未设置 | `rgb(251, 250, 247)` | `rgb(15, 118, 110)` |
| 系统暗色 | 未设置 | `rgb(12, 20, 19)` | `rgb(94, 234, 212)` |
| 系统亮色 + `setPwaTheme("dark")` | `dark` | `rgb(12, 20, 19)` | `rgb(94, 234, 212)` |

三者均为 React 示例宿主 CSS 的色值，不是平台默认的蓝色，证明 `css` 选项在真实站点上生效。

### 本次发现并修复的缺陷

1. **`:active` 的对比度缺陷。** 按下时底色换成 `--pwa-entry-surface`，文字仍用 `--pwa-entry-accent-fg`，亮色主题下是白字压近白底。改为 `filter: brightness(0.92)`，与宿主设成什么强调色无关。自动化测试不会发现这类问题——它是看截图时发现的。
2. **两个变量成了空承诺。** 去掉列表项自带的边框与底色后，`--pwa-entry-surface` 与 `--pwa-entry-border` 再无读者，但仍列在规格色值表里对外承诺可覆盖。已从样式表与色值表一并删除，并新增测试：声明的每个 `--pwa-entry-*` 必须被 `var()` 读回，反向亦然。
3. **规格给宿主的暗色覆盖配方是错的。** 规格让宿主写 `@media (prefers-color-scheme: dark) { .pwa-entry { … } }`，但平台自己的暗色块是 `.pwa-entry:not([data-theme="light"])`——特异度 `(0,2,0)` 高于 `(0,1,0)`，与书写顺序无关，因此**宿主的暗色覆盖完全不生效**，而亮色照常生效。这是 ST1 引入主题跟随、改了平台选择器却没同步示例留下的。已实测确认（坏写法下按钮停在平台蓝 `rgb(76,147,255)`），规格与接入说明均已修正，并由一条按文档配方逐字书写的浏览器测试守住。

### 如实登记的限制

- **"当前 Origin 不可达"仍是客户端级模拟**（Playwright 路由拦截），不是真实的域名、DNS 或证书故障。
- **两张暗色截图字节完全相同**，因为 `data-theme="dark"` 不可见。**截图本身证明不了"应用显式要求暗色"这条路径**；证据是脚本读到的计算样式（`data-theme` 为 `dark`，且系统偏好为亮色时仍取暗色值）。
- **部署链中途失败过一次。** `--mode=deploy` 报 `Drill deployment f822a276… is live but r2:cloudflare:index failed`：部署已上线，上传后的 R2 索引步骤失败。按手册手工补跑 `r2:cloudflare:index --mode=record`（写入并读回核验，23 个线上文件）与 `archive:cloudflare:site`（归档 12 个指纹资源），均成功。**失败原因未被捕获**——包装层只透出 "failed"，原始错误被吞掉；重试即通过，因此无法断言是瞬时故障还是其他原因，此处不做推测。
- **观感由项目所有者确认**，2026-09-23 看过三张截图后通过。
- `main` 槽位与两个生产站无任何写操作：两站的 `app/index.html`、`app/sw.js`、`app/manifest.webmanifest` 字节与各自上一次 `main` 部署回执完全一致。
- 证据在仓库外 `~/Documents/haigeer-labs/pwa-release-records/entry-styling-2026-09-23/`：`drill-st3-N.json`（SHA-256 前 16 位 `6a73ad5108d1c26f`）、`drill-st3-N-1.json`（`290a03860be4ced5`）、`shot-light.png`（`bb9af6951a73d784`）、`shot-dark.png` 与 `shot-forced-dark.png`（同为 `d6557f83aee843fa`）、截图脚本 `st3-shots.mjs`（`d5bb1139b957c29e`）。

## 修订：恢复页的构建期语言与文案覆盖，及同批两项缺陷修复（2026-09-24）

规格见[模块规格](../../spec/pwa-entry-resilience.md)同名修订，任务 EL1–EL4 见[计划](plan.md)。

| 提交 | 内容 |
|---|---|
| `805b05c`、`bdcfafe` | 规格与计划（EL1） |
| `5b6f60e` | 更正规格中"未设置时产物逐字节相同"的说法 |
| `9122488` | `locale` 与 `messages`（EL2） |
| `6c6c88a` | 缺陷修复：CSP 哈希漏算换行 |
| `f33e6b0` | 缺陷修复：暗色背景只覆盖内容栏 |
| `42e091e` | 英文恢复页的真实浏览器场景（EL3） |

### 已取得的证据

- **单元**：270 项通过。两个诊断码（含占位符缺失与重复）、不回显、en 各状态文案、`messages` 覆盖、占位符替换、外壳 `lang` 与转义后的 `<title>`、`zh-CN` 表与修订前硬编码文案逐字相同。`class-alignment` 与 `source-scan` 断言未改。
- **真实浏览器**（Chrome 153.0.8010.53）：`locale: "en"` 加一处 `go` 覆盖的构建，迁移与故障两种标题、有效期、按钮文案、`lang` 与标题正确；`--repeat-each 5` 10/10。暗色模式下视口四角与内容下方均为根容器的暗色背景。恢复页浏览器场景共 17 项通过。
- **变异**（均转红，恢复后通过）：有效期占位符不替换（3 项）；按钮占位符不替换（3 项）；`zh-CN` 文案改一字（4 项）；页面忽略配置的文案（2 个浏览器场景）；哈希改回旧算法（2 项）；根容器改回居中限宽栏（1 个浏览器场景）。

### 既有断言的变更（如实登记）

- `test/vite/plugin.test.ts`"页面脚本含空状态文案"：文案改走虚拟模块配置后，该文案在配置脚本中而非页面脚本本身，断言改为在页面脚本的静态导入闭包中查找，并要求闭包内每个脚本都不含 `innerHTML`。意图不变，项目所有者确认。
- 同文件两项样式哈希断言：原先用 `<style>\n(...)` 取样式文本，把开头的换行排除在外，与有缺陷的实现互相吻合；改为取标签之间的完整内容。

### 默认构建的产物对照

改动前后各构建一次夹具应用：语言修订本身只使外壳 HTML 中的脚本指纹变化（页面脚本与配置脚本字节必然变化，`zh-CN` 文案逐字不变）。同批的暗色修复改变了默认样式文本，因此外壳中的内联样式与其 CSP 哈希也随之变化。

### 两项缺陷对已发布版本的影响

- **CSP 哈希**：2026-09-24 之前的构建打印的样式哈希漏算换行。照抄进仅哈希 `style-src` 的站点，恢复页样式被拦截，页面仍可用（入口按钮是无样式按钮）。
- **暗色背景**：暗色模式下只有内容栏为暗色。
- ~~两项都可能随 2026-09-20 的 `0.1.0-beta.0` 发布~~ **更正（2026-09-24，准备 `0.1.0-beta.1` 时核对）**：`@pwa-platform/entry-resilience` 是私有包，从未发布到 npm（已发布的只有 contracts、core、engine-workbox、build-verifier、sw-runtime、client-runtime、vite、vue、react），两项缺陷只存在于仓库中的代码，未随任何已发布版本分发。接入说明中"升级后重新取哈希"的提示仍适用于从本仓库构建恢复页的使用方。

### 未取得的证据

Chrome Android、桌面端 N-1、CI；以构建日志中的哈希配置 CSP 头的整页场景。

### 合并门禁与独立评审（2026-09-24）

与 vite-adapter 的离线页修订合并进行，完整结果见 [vite-adapter 验证记录](../vite-adapter/verification.md)"合并门禁与独立评审"。本模块相关：评审应修 1（`</style` 大小写）、2（未知键名不进诊断）、3（CRLF 规范化）均在 `890e193` 修复；`{host}`、`{expiresAt}` 改为函数替换；打印时取消固定定位。单元 274 项、浏览器 17 项通过。
