# 验证记录：vite-adapter

> 模块质量门禁（T9）的可复现结果。本模块的任务以本地编号 T1–T9 记录在 `tasks/vite-adapter/plan.md`，GitHub 账号恢复后补建 issue 并回填编号。

## 环境与对象

- 日期：2026-09-16 / 17
- 分支：`feat/vite-adapter`，基线 `main` = `a5dc1f4`
- 环境：Node v24.18.0，pnpm 11.18.0（corepack），Darwin arm64，Google Chrome 152.0.7977.84（本机安装的稳定版）
- 被验证的提交：门禁在 `1450841`（T1–T8）上执行；独立评审之后的修复见"评审修复后的重新执行"

## 干净 worktree 门禁（`1450841`）

从 `1450841` 新建独立的 detached git worktree，依次执行：

| 命令 | 结果 |
|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0；8 个包 |
| `pnpm typecheck` | 退出 0；TS 错误 0。本包检查三个 project：主、`tsconfig.browser.json`（Playwright 侧）、`tsconfig.app.json`（fixture 应用，需要 DOM lib） |
| `pnpm test` | 退出 0；contracts 139、harness 61、core 94、engine-workbox 37、build-verifier 100、sw-runtime 87、client-runtime 80、**vite 91**，合计 **689** |
| `pnpm test:browser` | 退出 0；harness 22、engine-workbox 6、sw-runtime 13、client-runtime 12、**vite 11**，合计 **64**；日志打印 `chromium 152.0.7977.84 (configured channel)` |

执行结束后 worktree 没有任何改动（忽略 `browser-build/`、`test-results/`），随后删除。

## 独立评审

由新上下文的评审代理只读审阅本分支相对 `main` 的全部改动。它自行跑了 lint、单元测试、三个 project 的 typecheck、build 与浏览器自测，并写了多个探针脚本实测 Playwright 与 Vite 的行为。结论为 **REQUEST CHANGES**：2 个阻断项、3 个应修项、5 个可选项。

**每一条我都自己复现过**，不照单接受。

| 编号 | 发现 | 属实 | 处置 |
|---|---|---|---|
| B1 | `update.spec.ts` 中"控制权交接"的断言是空过的：`waitForFunction` 不 await async 谓词，返回的 Promise 恒为真值，首次轮询即通过 | 是 | 已修，见下 |
| B2 | 指纹正则 `-[A-Za-z0-9_-]{8,}` 把 `main-application.js`、`app-shell-styles.css` 等现实文件名判为带指纹，导致 `revision: null`、worker 永久服务旧字节 | 是 | 已修，见下 |
| M1 | `host-output-parity.test.ts` 的 `expect(key).toBe(decodedPathKey(path))` 是自比恒真；`TRICKY_SEGMENTS` 转义全大写，小写转义的分叉无人能抓 | 是 | 已修：改为字面量期望表，并补 `%c3%a9`、`%61`、`%zz`、`half%2` 等样本 |
| M2 | "`updateMode` 无法被证伪"的结论错误：区分硬编码与真实读取不需要第二个**合法**值，传**非法**值即可（`validateClientConfig` 会抛错） | 是 | 已修，见下 |
| M3 | 规格 6 处陈述已被实现推翻未同步；plan 架构决定一节仍写旧规矩 | 是 | 已修：规格 5 处 + plan 2 处 |
| L1 | 相对 `base`（如 `./`）不受支持，未记入"已知限制" | 是 | 已补进规格的"已知限制" |
| L2 | 自足性断言跑在注入之前，注入进去的内容不再受检 | 是 | 不改，记为已知取舍：注入的是计划里的 URL 与配置，均为平台自产，风险极低 |
| L3 | `SMUGGLED` 正则可被别名绕过（`const p = process`） | 是 | 不改：这是约定守卫不是沙箱，全仓包一致 |
| L4 | 校验读的是 `writeBundle` 的 bundle 对象（写盘后的镜像），不是磁盘 | 是 | 不改，措辞已在评审记录中澄清；"写盘之后被别的工具删掉"确实检测不到 |
| L5 | 插件实例跨构建复用会串 `planForCheck` / `publicPaths` | 是 | 不改，记为已知限制：`global-setup.ts` 每次构建新建实例，仓库内无此用法 |

评审同时确认 8 项无发现，并给出了判断依据：`node:fs` 豁免同时作用于两条检查且探针有真证伪力；两份组装逻辑在 `installEnabled` 上不会分叉（它逐行核对了 `compile.ts:75-128` 与 `client-config.ts:57`）；`writeBundle` 校验未发现绕过或误判（含多输出构建实跑）；fixture 站点确为插件产出；三处"等价变异"中两处站得住（`readdirSync("")` 抛 ENOENT、三种 root 产出 sha256 均为 `d079707d7ee882f1`）；ADR-0015 每条断言与实现相符；确无重新实现上游能力；诊断消息不回显输入原文。

### B1：一条从未验证过任何东西的断言

原断言是：

```ts
await page.waitForFunction(async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.waiting === null && registration?.active !== null;
});
```

我用隔离探针复现（Playwright 1.63.0 + Chrome stable，about:blank，不涉及 Service Worker）：

| 谓词形态 | 结果 |
|---|---|
| `() => false` | TIMEOUT after 1208 ms（正常） |
| `async () => false` | **RESOLVED in 4 ms** |
| `() => Promise.resolve(false)` | **RESOLVED in 1 ms** |
| `async () => { await …; return false; }` | **RESOLVED in 3 ms**（与本用例同形） |

`waitForFunction` 不 await 谓词返回的 Promise，Promise 对象本身是真值。所以这条断言从写下起就无条件通过——而它是**唯一**验证"控制权真的移交"的断言，`expect(await pageApplyUpdate(page)).toBe(true)` 只证明 facade 返回了 true。

这撞在我自己写进 plan 的规矩上：「一个从不报红的端到端测试没有意义」。

**已改用 harness 的 `waitForControllerChange`**——它在 `controllerchange` 事件与显式超时之间竞速，注释明写"只等待而不接管的新版本不会通过"，正是这条用例要证明的事。harness 早就提供了正确工具，我没用。

### B2：指纹误判，以及我第一次修错了方向

`-[A-Za-z0-9_-]{8,}` 中字符类含 `-` 且 `{8,}` 贪婪，任何"末段连字符后累计 ≥8 个字符"的普通名字都会命中。用真实 `collectHostOutput` 复现：

```
fingerprinted=TRUE  -> revision:null   main-application.js
fingerprinted=TRUE  -> revision:null   service-worker-registration.js
fingerprinted=TRUE  -> revision:null   app-shell-styles.css
fingerprinted=TRUE  -> revision:null   assets/my-long-component-name.css
```

后果在 `core/src/precache.ts:49`：`revision: file.fingerprinted ? null : file.contentHash`。误判文件的 revision 变 `null`，而 URL 永不变化——**worker 永久服务旧字节，没有任何可观察信号**。

我第一次的修法是把 `-` 移出字符类（`[A-Za-z0-9_]{8,}`），**两头都错**：`main-application.js` 的 `-application` 有 11 个合法字符，仍然命中；而 Vite 真实产出的 `Mefq-Q2Q`、`JYp-DHDg` 含连字符，反被漏判。是测试当场报出了这两个方向的失败，我才回头用判定矩阵重选：

| 候选 | 漏判真实哈希 | 误判普通文件 |
|---|---|---|
| A 原始 `{8,}` 含 `-` | 0 | **4** |
| B 去连字符 `{8,}` | **2** | **2** |
| **C 精确 8 位 `{8}`** | **0** | **0** |
| D/E 精确 8 位 + 须含数字 | 1 | 0 |

**采用 C**。依据是实测：Vite 8 的哈希是 base64url、**长度恒为 8**（本仓库历次构建的 8 个样本全为 8 位，其中 2 个含连字符）。该锚的是长度，不是字母表。

现有测试没抓到它，是因为三个反例（`service-worker.js`、`my-app.css`、`logo-2x.png`）末段都太短而恰好漏过——**样本让缺陷看不见**。已补 `main-application.js` 等 4 个现实名，并加一条"narrowing 后仍须认出真实哈希"的正向用例。

### M2：我把一个能证伪的断言写成了"契约支撑不了"

我原先在代码注释与 plan 里都写：`UPDATE_MODES` 只有一个成员，所以把 `updateMode` 换成硬编码 `"prompt"` 无法被任何测试区分。评审指出这是错的，并实测反驳——区分二者不需要第二个**合法**值，只需一个**非法**值：`validateClientConfig` 会抛错，硬编码变异则原样返回。

我复核后确认成立，已补一条传 `"silent"` 的用例，两处说法同步更正。这是一条我本可以写、却用"契约暂时支撑不了"搪塞过去的断言。

## 评审修复后的重新执行

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 退出 0 |
| `pnpm typecheck` | 退出 0（三个 project） |
| `pnpm test` | 退出 0；合计 **692**，本包 91 → **94** |
| `pnpm test:browser` | 退出 0；本包 **11**，合计 64 |
| `spec-guard verify` | 9 通过 / 0 警告 / 0 失败（GitHub 层因未认证跳过） |

本包新增 3 条：指纹正则的现实文件名反例、"仍认得出 Vite 真实哈希"、`updateMode` 的非法值用例。

### 四项修复逐一证伪

补了断言不等于断言有效。每项都做变异，先确认锚点唯一命中与文件确已改变，跑完逐字节还原：

| 变异 | 结果 |
|---|---|
| B1：`applyUpdate` 不发 skipWaiting（新 worker 只等待不接管） | **被抓到**：`No controllerchange within 10000 ms`，11 条剩 10 条 |
| B2：指纹正则退回 `{8,}` | 被抓到（1 failed / 94） |
| M1：`percentDecode` 拒收小写转义（与 core 分叉） | 被抓到（1 failed / 94） |
| M2：`updateMode` 硬编码为 `"prompt"` | 被抓到（1 failed / 94） |

B1 那条尤其要紧：修复前它 4ms 无条件通过，修复后在同样的破坏下等满 10 秒并报红——这才是它本该有的行为。

## 各任务的变异检查（T1–T7）

每项注入前确认锚点在源码中唯一命中、注入后确认文件确已改变，随后运行测试、逐字节还原（md5 比对）。

| 任务 | 变异 | 结果 |
|---|---|---|
| T1 包骨架与插件工厂 | 7 项（去掉 `apply: "build"`、去掉选项校验、topology 成员检查失效、install 不对照 identity、消息回显输入、源文件引入 `node:fs`、`getBuiltinModule` 绕过） | 全部被抓到 |
| T2 宿主产物采集 | 5 项（asset 内容不参与哈希、哈希取常量、`fingerprinted` 恒真、base64 保留填充、编码差异消息合并） | 全部被抓到（首轮 2 项存活，见下） |
| T3 计划编译与 manifest | 8 项（`id`/`scope` 取错来源、`start_url` 写串、`install` 为 null 仍生成、public 不采集、两个开关各自失效、public 误判指纹、同名冲突检测失效） | 7 项被抓到，1 项实证等价 |
| T4 worker 打包与注入 | 7 项（恢复 worker 也注入清单、去掉 `NODE_ENV`、写到 `serviceWorkerUrl`、去掉自足性断言、漏注入清单、子构建 root、注入顺序对调） | 5 项被抓到，2 项实证等价 |
| T5 虚拟模块 | 7 项（`installEnabled` 只看元数据、整份 plan 送页面、去掉 `Object.freeze`、改注入全局变量、不加 NUL 前缀、子路径守卫放宽、`updateMode` 硬编码） | 6 项被抓到，1 项当时误判为"契约支撑不了"，评审后已补断言 |
| T6 构建期产物校验 | 5 项（忽略校验结果、`published` 漏 public、漏 bundle、路径不拼 base、`planForCheck` 不赋值） | 全部被抓到 |
| T7 浏览器自测 | 2 项（漏注入预缓存清单 → 5/11 通过；注入后改坏缓存名 → 1/11 通过） | 全部被抓到 |

### 三处等价变异（实证，非搪塞）

- **`public-files.ts` 的 `publicDir === ""`**：实测 `readdirSync("")` 抛 ENOENT，被 `collect` 的 catch 吞成同样的空数组，可观察行为一致。保留显式判断只为不依赖"空串恰好抛错"这一隐式行为。
- **注入顺序对调**：两个注入点是彼此独立的字符串，先后替换产出字节完全相同。ADR-0012 的顺序是约定，代码强制不了。
- **子构建 `root`**：三种 root（sw-runtime 包根、入口所在目录、无关临时目录）产出**逐字节相同**，sha256 均为 `d079707d7ee882f1`、均 63701 字节。

### 一次失效的变异脚本，与三次误判

T2 首轮有 2 项"存活"，查证后一项是真缺口（asset 内容从未被钉住），另一项（解码自检）是**我写了一段永远为假的死代码**——`base + fileName` 与 `url` 本就是同一个字符串。死代码已删，换成实测发现的真问题（base 与 identity 转义写法不一致时，core 接受而字面剥离失败）。

T7 的变异卡了两次：第一次把错误的缓存名展开进配置对象，被 `validateWorkerConfig` 在**构建期**挡下（`Build failed in 174ms`，浏览器根本没启动）——那验证的是配置校验有效，不是端到端测试有证伪力。改成对**注入之后**的 worker 文本动手才算数。plan 里已补下这条规矩。

## 依赖与供应链

- 本分支相对 `main` **新增第三方包解析条目 0 个**（216 → 216）；lockfile 只增加 `packages/vite` 这一个 workspace importer，六条运行时依赖全是 `link:` 本地链接，开发依赖 `@playwright/test@1.63.0`、`@types/node@24.13.4`、`vite@8.3.0` 与 harness 均已在 lockfile 中。
- `pnpm-workspace.yaml`、`.github/workflows/ci.yml`、根 `package.json`、`eslint.config.js`、`tsconfig.base.json` **五处全部未改动**。
- **已交付的七个包零改动**：contracts、core、browser-test-harness、engine-workbox、sw-runtime、client-runtime、build-verifier。本模块接了所有上游，没有为实现自己而修改其中任何一个。
- `node:` 内建模块：全包可用 `crypto`、`path`、`url`（纯函数）；**读盘只允许出现在 `public-files.ts`**，由按文件的导入守卫加一条"禁止绕过导入图"的检查共同钉死。

## 与 spec、ADR 和能力图的边界核对

- 能力图 `vite-adapter`：将 Vite 构建输出与 PwaPlan 编译、Worker 注入、产物验证连接起来。一致。依赖 `client-runtime, build-verifier, workbox-engine` 与实际导入相符（另加 contracts、core、sw-runtime，均在能力图的传递依赖内）。
- ADR-0011：清单注入发生在打包之后、注入点原样保留、平台 worker 打包归本模块。一致。
- ADR-0012：两处注入的顺序、恢复 worker 独立产物、配置只含 worker 所需字段。一致；顺序为约定这一点已在 ADR-0015 与规格中写明。
- ADR-0013：页面配置由构建期生成并送进页面。一致，经虚拟模块交付。
- ADR-0014：产物一致性在构建一侧调用，响应头与身份基线留给发布流程。一致。
- ADR-0015：记录本模块的七项决定，每条均与实现对照核验过。
- **T1 的 `node:fs` 禁令已修订**，理由记在 ADR-0015、规格与 plan 三处：规则改了，目的没变。

## 已知限制（移交后续模块）

- **`install` 为 `null` 时 manifest 无人生成**：`policy.install.enabled` 为 false 时 `plan.install` 为 `null`，插件没有元数据可映射，但 `hostBuildOutput.manifestFile` 仍是必填。当前由"应用自备该文件、缺失即构建失败"兜住（项目所有者 2026-09-16 决定）。另两条出路（生成最小 manifest、改 contracts 契约）须另立 ADR。
- **`vite dev` 下不提供 worker**：开发服务不经 `generateBundle`，没有产物清单可采集。开发期验证 PWA 行为须用 `vite build` + `vite preview`。
- **`base` 必须是同源绝对路径**：相对 `base`（如 `./`）与完整 URL 不受支持，构建在采集阶段即失败。
- **自足性断言跑在注入之前**：注入进去的内容（计划里的 URL 与配置）不再受检。风险极低，记录在案（评审 L2）。
- **产物校验读的是内存 bundle**：`writeBundle` 的 bundle 是写盘后的镜像，"写盘之后被别的工具删掉"这类漂移检测不到（评审 L4）。
- **插件实例不可跨构建复用**：`planForCheck` 与 `publicPaths` 是实例级可变状态（评审 L5）。
- **`SMUGGLED` 守卫可被别名绕过**：这是约定守卫不是沙箱，与仓库其他包一致（评审 L3）。
- **只支持 `standalone-origin` 拓扑**：多槽位与子路径拓扑归 `shared-origin-topology`。

## CI 实跑证据：**未取得**

本模块的质量门禁**没有完成**。T9 的验收标准要求：

> 经项目所有者授权推送后：模块 PR 上 quality 与 browser job 均通过；临时让本模块测试失败的提交使 job 报红，撤销后恢复为绿，证据在合并前取得。

2026-09-16 起，项目所有者的 GitHub 账号不可用（`gh auth status` 显示活跃账号 token 失效，另一有效账号对本仓库无写权限）。因此推送、开 PR、取红绿证据三项**一次都没有尝试**。

本分支至 HEAD 共 10 条提交，全部留在本地，未推送。`main` 亦领先 `origin/main` 11 条（build-verifier 的本地合并）。

账号恢复后需补做，顺序不变：推送分支 → 开 PR（`Closes #7`）→ quality 与 browser job 转绿 → 临时提交制造报红 → `git revert` 恢复 → 把 run 链接与结论写回本节 → 把 `docs/DOCUMENTATION-BASELINE.md` 的 vite-adapter 行由 `target` 翻 `verified`。

在此之前基线行保持 `target`。**本地门禁全绿不能代替 CI 证据**：CI 跑 Node 22.23.2 与 24.21.0 两个版本、冻结 lockfile、runner 预装的 Chrome，本机三者都不同；更要紧的是**缺红绿对照**——一个从未报过红的门禁，绿色是没有意义的。这一点本模块有切身证据：B1 那条断言绿了整整一轮，直到有人去证明它能红。

## M1–M4：构建期 manifest 链接修订（2026-09-19）

### 已确认的契约与范围

- S1：手写链接只接受与 `identity.manifestUrl` **字节相等**的根路径，或同一 `identity.origin`、相同 pathname 且无 query/hash 的完整 URL；相对路径（含 `./`）与任何活跃 `<base>` 都在构建期失败。这样链接不会随页面地址或 base 语义漂移。
- S2：`transformIndexHtml` 的 `post` 阶段决定注入或保留；`writeBundle` 再读取最终 bundle 中**实际经过该钩子处理的 HTML entry**，确认其仍恰有一个合格链接。它覆盖之后的 HTML 转换，但不把别的插件独立 emit 的 `pwa-entry.html`/恢复页误当 Vite entry；后者由 entry-resilience 自己的契约负责。
- S3：完整 URL 与真实 `identity.origin` 比较，不再使用占位 origin。S4：先用 `URL.canParse` 判定，再构造 URL；诊断只含 Vite 的 entry 路径和固定前缀，不回显 href、origin 或 manifest URL。
- 解析限于这一受控属性面：支持单/双引号、无引号和带引号 `>`，首个重复属性按浏览器语义获胜；先剥离 script/style/template/noscript/textarea 与注释，再找 live `<link>`。这不是通用 HTML sanitizer。

### 变异证据

每项先确认锚点唯一、运行目标回归，再逐字节还原源码。下列破坏均被相应测试抓到：`URL.canParse` 恒真（相对/非法 URL）、origin 比较错误（同路径异源）、旧 `[^>]*` tag 截断（引号内 `>`）、后写重复属性覆盖首值、忽略 inert 内容、移除 `pwa-platform:` 前缀、停用最终 entry 复核、停用 `<base>` 拒绝。另用真实 build 覆盖后置插件加入冲突链接，以及插件 emit 非 entry 恢复页不会误报。

### 最终干净 worktree 门禁

- 基线：`main` `cd40ed0377dd2b51ab6b75127f5e6b0709c17f80`；本分支唯一一次 rebase 无冲突，受测提交为 `e5905989a8103ece0cd2737e9afa107e0b9a378d`。
- 在 detached `/private/tmp/pwa-vite-m4.wlR2PO` 中执行；临时目录仅含依赖与构建产物，已在门禁后删除。

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --offline` | 退出 0 |
| `pnpm -r --filter './packages/*' build` | 退出 0；12 个 packages |
| `pnpm lint` | 退出 0 |
| `pnpm test` | 退出 0；Vite 17 文件 / 147 项，entry-resilience 17 / 225，push 10 / 121，sw-runtime 13 / 192；其余包也全部通过 |
| `pnpm typecheck` | 退出 0；所有 packages（含 Vite 三个 project）通过 |
| `pnpm --filter @pwa-platform/vite test:browser` × 3 | 三次均退出 0，均 22/22 |
| `pnpm --filter @pwa-platform/nuxt test:browser` | 退出 0，12/12 |
| `pnpm --filter @pwa-platform/examples-browser-e2e test:browser` | 退出 0，33/33 |

浏览器均为项目配置的 Google Chrome `153.0.8010.50`。最终离线安装没有访问网络；它证明已有本地 pnpm store 时冻结解析可复现，不证明一台缓存为空的新机器也能离线安装。运行 `pnpm test`/浏览器门禁需本机 loopback 权限，受限 sandbox 的 `listen` 会报 EPERM，故在临时本机工作树中执行。

### 仍未证明项

- 未 push、未建 PR、未跑 CI，也未制造 CI 红绿对照；上文的 CI 未取得结论仍然有效，本地通过不替代它。
- Nuxt adapter 不负责注入此链接；需要显式 `crossorigin` 的应用仍应自行保留该属性。完整 HTML 语义也不是本模块解析器的目标，只承诺此处列出的 manifest-link 属性面。

## 修订：平台默认离线页（2026-09-24）

规格见[模块规格](../../spec/vite-adapter.md)"修订：平台默认离线页"，决定见 [ADR-0036](../../docs/adr/0036-platform-default-offline-page.md)，任务 OP1–OP6 见[计划](plan.md)。

| 提交 | 任务 | 内容 |
|---|---|---|
| `805b05c`、`bdcfafe`、`816fc06` | OP1 | 规格、计划、ADR-0036 |
| `248e21e` | OP2 | 离线页渲染函数 |
| `9c66bb4`、`c486cf3` | OP3 | 插件选项与接线；去掉复制自 core 的路径换算 |
| `b8eb573` | OP3 | 背景铺满视口（检查点 A 截图评审发现） |
| `1500740` | OP4 | 真实浏览器场景 |

### 已取得的证据

- **单元与构建**：vite 包 208 项通过。文案逐字对照、HTML 转义、class 与样式双向对齐、五个诊断码与不回显、预缓存包含生成的页面、`this.info` 输出的三段哈希与页面中标签之间的完整内容一致。
- **未开启时逐字节不变**：改动前（`816fc06`）在干净 worktree 中构建 vite 浏览器夹具，记录 110 个产物文件的 SHA-256，并重复构建一次确认构建确定性；OP3 后同样构建，diff 为空。
- **真实浏览器**（Chrome 153.0.8010.53）：断网导航显示生成的页面（zh-CN，含应用名称、`lang` 与标题）；en 与 `messages` 覆盖只替换对应键；页面本身被预缓存；暗色背景铺满视口四角；恢复联网后由 `online` 事件自动刷新。`--repeat-each 5` 25/25；vite 浏览器场景共 27 项通过，既有 22 项无回归。
- **变异**（均转红，恢复后通过）：去掉转义（5 项）；样式删掉一个 class（2 项）；哈希不含开头换行（1 项）；跳过冲突检查（2 项）；页面在编译之后才加入（6 项）；页面放错目录（8 项）；脚本不监听 `online`（1 个浏览器场景）；默认语言改为 en（1 个浏览器场景）。
- **一处存活的变异及处理**："路径换算忽略挂载路径"最初存活：复制自 core 的换算加上兜底分支，在 `base` 等于 `mountPath` 时等价于直接去掉路径开头的斜杠。已删除复制的换算，文件名直接取自策略路径，位置由 core 编译时裁定（子目录构建用例）。

### 实现中的发现

- **CSP 哈希必须覆盖标签之间的完整内容**：HTML 解析器保留 `<style>`、`<script>` 之后的换行（只对 `<pre>`、`<listing>`、`<textarea>` 丢弃）。Chrome 实测：只对文本本身取哈希时，样式与脚本在仅哈希的 CSP 下都被拦截。离线页按完整内容计算；入口恢复页的同一缺陷另行修复，见其验证记录。
- **暗色背景**：最初的根容器是居中限宽栏，截图评审发现暗色下四周露白；改为铺满视口、以内边距限宽。

### 未取得的证据

- Chrome Android、桌面端 N-1、CI。
- 严格 CSP 下的端到端运行（哈希规则已用浏览器实测，但未以构建日志中的哈希配置 CSP 头跑整页场景）。
- Nuxt 不支持该选项。

### 合并门禁与独立评审（OP6／EL4，2026-09-24）

**干净 worktree 门禁**（检出 `25cacee`，已含 main `9234b02`）：`pnpm install --frozen-lockfile --offline`、`lint`、`build`、`typecheck` 退出 0；`pnpm test` 全仓 2236 项通过；`pnpm test:browser` 9 个包共 212 项通过（vite 27、entry-resilience 17、examples-browser-e2e 47、sw-runtime 44、nuxt 12、browser-test-harness 22、client-runtime 21、engine-workbox 14、push 8）；运行后 `git status` 无改动。`git diff 9234b02...25cacee` 对 contracts、core、sw-runtime、client-runtime 为空。

**独立评审**（新上下文，审阅 `9234b02...25cacee`）：阻断 0，应修 4，均在 `890e193` 处理并各以变异证明：

1. `</style` 防护区分大小写，`</STYLE>` 可绕过（两个包；恢复页为既有问题）→ 改为不区分大小写；变异改回区分大小写，2 项转红。
2. 未知 `messages` 键名进入诊断路径，违反"诊断不含输入"的约定（两个包）→ 在 `messages` 对象自身的路径报告，不再写出键名；原先把键名写进路径当作预期的两项断言随之改正。
3. 宿主 `css` 含 CRLF 时打印的哈希与浏览器按规范化文本计算的不一致（两个包）→ 写入与取哈希前统一为 LF；变异去掉规范化，1 项转红。
4. 离线页 flex 居中在内容超出视口时顶部不可达（WCAG 1.4.10）→ `justify-content: safe center`；新增小视口浏览器场景，变异改回 `center` 转红。

同时采纳的建议：恢复页 `{host}`、`{expiresAt}` 以函数替换，主机名含 `$&` 时原样显示（新增单元测试，变异转红）；离线页 `messages` 在插件创建时复制（新增测试，变异转红）；构建测试从 `dist` 中的页面提取每段内联内容比对日志哈希；两个页面在打印时取消固定定位。

复跑（`890e193`）：vite 单元 213 项、entry-resilience 单元 274 项、离线页浏览器 6 项、恢复页浏览器 17 项通过；typecheck、lint 干净。

**未采纳、登记为已知限制**：`offlineFallback.path` 含百分号编码时文件按字面写出（服务器解码后可能找不到）；`base` 与 `mountPath` 不一致且业务恰好在对应位置放了文件时，core 会选中业务页面而平台页面闲置；路径以 `/` 结尾时的产物行为未验证。三者都需要不常见的配置，接入说明要求 `base` 与 `scope`/`mountPath` 一致。

## 修订：manifest 扩展字段的输出（2026-09-24）

规格见[模块规格](../../spec/vite-adapter.md)同名修订，任务 MX4、MX5 见 [contracts-foundation 的计划](../contracts-foundation/plan.md)。

- **生成**（`9435b8b`）：字段只在写了时输出，键名 `display_override`、`form_factor`、`short_name`，顺序固定；vite 224 项、nuxt 85 项通过。真实 Vite 与 Nuxt 构建中，新字段出现在 manifest 中，缺失截图时构建以 `verify.manifest-asset-missing` 失败；截图警告经构建输出，只含诊断码与路径。
- **未写时逐字节不变**：MX2 开工前在干净 worktree 中从 `f72ceb8` 构建 vite 浏览器夹具，记录 134 个产物文件的 SHA-256 并确认构建确定性；MX4 后同法构建，diff 为空。
- **真实浏览器**（`07031c8`，Chrome 153.0.8010.53）：`Page.getAppManifest` 对带全部扩展字段的构建报告 0 个解析错误，Chrome 解析后的 manifest 含说明、方向（`PORTRAIT`）、显示覆盖（`kWindowControlsOverlay`、`kStandalone`）、宽截图（`kWide`，带标签）与快捷方式。`--repeat-each 5` 5/5；vite 浏览器场景共 29 项通过。`categories` 不在 Chrome 的解析结果中（浏览器只透传），未作断言。
- **变异**：`form_factor` 键写成 `formFactor`（3 项转红）；不输出截图（4 项转红）；截图 `sizes` 写坏（Chrome 报 "found icon with no valid size."，浏览器场景转红）。

## 修订：Vite 5 业务接入兼容（2026-09-26）

规格与计划见本模块同名修订。本次检查使用 Node 22.22.0；所有消费方均安装本工作树 `pnpm pack` 生成的本地 tarball，**不是** npm 上仍只声明 Vite 8 peer 的 `0.1.0-beta.1`。可复现的最小消费方保存在 [`compatibility/vite5-consumer`](../../packages/vite/compatibility/vite5-consumer/README.md)；其实际安装在隔离临时目录完成，不会让平台自身的 Vite 8 开发依赖掩盖宿主版本。

| 消费方 | 安装与类型 | 构建、开发服务 |
|---|---|---|
| Vite 5.0.0、TypeScript 5.2.2、`@types/node` 18.17.17、pnpm 8.6.5 | 安装、冻结离线重装、`tsc --noEmit` 均通过 | 本地包生成 manifest、平台与恢复 worker；`vite dev` 解析 `virtual:pwa-config`，不编译计划 |
| Vite 5.4.21、其余同上 | 安装、`tsc --noEmit` 通过 | 构建与开发模式检查通过 |
| Vite 8.3.0、TypeScript 6.0.3、`@types/node` 24.13.4 | 独立消费方安装、`tsc --noEmit` 通过 | 构建与开发模式检查通过；现有工作区 Vite 8 测试与 Chrome 场景另行回归 |

已发布 beta.1 在 Vite 5.0.0 下的生产构建本来就能完成，但 `apply: "build"` 使 `vite dev` 的虚拟模块解析失败；去掉该限制后两个模式均通过。另发现 beta.1 的 tarball 没有 `virtual:pwa-config` 的声明：新包把它作为 `@pwa-platform/vite/virtual` 类型子路径交付，在 TypeScript 5.2 的 `Bundler` 与 `Node` 模块解析方式下分别实测通过。`writeBundle` 新增对生成计划时和最终 bundle 中同名文件的 SHA-256 比对；后置插件改写 chunk 的测试按预期使构建失败，既有 226 项单元/构建测试与类型检查通过。

**首个项目版本组合的隔离复刻：** Vite 5.0.0、Vue 3.4.0、Vue Router 4.2.4、Vuex 4.0.2、`@vitejs/plugin-vue` 5.0.0、JSX 插件 3.1.0、Terser 5.24.0、`vite-plugin-bundle-obfuscator` 1.8.0 与平台 Vue 绑定能构建。`vue-tsc` 1.8.11 在 TypeScript 5.2.2 的 `moduleResolution: "Node"` 下通过；使用 `Bundler` 时，Vuex 4.0.2 的旧 `exports`/声明组合会报找不到类型，这是该版 Vuex 自身的解析问题，实际项目的 `tsconfig` 尚未提供。Chrome 中，业务样式在没有 PurgeCSS 的构建中保留，生产页面注册并离线加载；开发页面显示 Vue 内容且无 worker。

**混淆插件的发布条件：** 未设置 `options.seed` 时，同一源码连续两次构建出现同名 `index-LE1P-Awj.js`，但 SHA-256 分别为 `8f4384dd…` 与 `55694dad…`，`sw.js` 的 SHA-256 两次均为 `59632c79…`。这是漏更新风险；把所有文件改成非指纹虽能改变 worker，却会破坏旧资产保留和缓存响应头判定，故没有采用。固定 `options.seed: 12345` 的夹具中，相同源码连续构建的 JS 与 worker 哈希一致；改动业务源码后，JS 文件名由 `index-LE1P-Awj.js` 变为 `index-_KXOGX2p.js`，worker 哈希也变化。首个项目须在真实配置中设置稳定种子并重复构建比对；当前只验证了隔离夹具。

**真实浏览器：** Vite 5.0.0 的最小构建在 Chrome 中注册 `/app/sw.js` 并离线加载应用壳；业务复刻在两标签页中观察到新 worker 等待，发送 `pwa:skip-waiting` 确认后两页均换控制器，页面均未自动刷新。Vite 5 与 Vite 8 的开发页面在 Chrome 中均未注册 worker。工作区 Vite 8 浏览器套件在 Chrome 153.0.8010.53 下 29/29 通过，包含注册、离线、更新和同源多 scope 场景。Chrome 在默认沙箱中启动时 `SIGABRT`，浏览器命令经本机浏览器权限运行。

**尚未完成的业务验收：** 提供的附件是配置与锁文件，不含业务源码、`src/sw.ts`、注册调用、`tsconfig`、真实域名和部署响应头；不能宣称已经在 `example-vite-app` 仓库接入或上线。简化夹具里的 `rollup-plugin-purgecss@6.0.0` 把 `.css` 产物写成了 `export default ...`，即使完全移除平台插件也会出现；这属于需要在实际项目中核实的宿主构建链问题。默认更新 UI、竞品对照与 npm 新版发布不属于本修订的已交付项。

**最终工作树门禁：** `pnpm install --frozen-lockfile --offline`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm docs:build`、`pnpm check:publish` 与 `pnpm --filter @pwa-platform/vite test:browser` 均退出 0；Vite 包 226 项、Chrome 29 项通过。`pnpm test` 第一次在沙箱内因 browser-test-harness 的本地端口监听返回 `EPERM`，在允许 loopback 的环境重跑全仓通过。Spec Guard 的产物检查为 2 通过、0 警告，文档影响为 `valid`、交付为 `ready`。最终 tarball 再次安装到 Vite 5.0.0 夹具：固定种子同源重复构建的 worker SHA-256 一致，改动源码后 worker SHA-256 变化，两标签页 Chrome 更新场景通过。尚未在真实业务仓库、CI 或生产环境运行。

## 业务侧实施交接（2026-09-26）

项目所有者明确内部业务仓库不供平台侧操作，只要求准备接入文档与 AI Skill。已新增[业务项目接入作业单](../../docs/guides/vite5-vue34-host-integration.md)和可复制的[项目 Skill](../../.agents/skills/pwa-vite5-vue-integration/SKILL.md)，并从通用迁移指南链接。内容使用通用占位值，没有复制内部包清单和配置原文；明确已发布 beta.1 不能作为 Vite 5 + 默认 UI 的正式依赖、真实业务构建未验证。手册额外标出附件中按构建时钟生成版本码、`static/assets`、混淆随机种子及 PurgeCSS 类名保留等业务检查点。

`skill-creator` 的 `quick_validate.py` 对仓库内及本机 Codex 用户技能目录中的副本均返回 `Skill is valid!`；两份 `SKILL.md` 的 SHA-256 一致，`git diff --check` 通过。业务仓库的实际修改、浏览器验收及生产响应头证据由其执行者按 Skill 完成；本记录不将这些步骤标为通过。
