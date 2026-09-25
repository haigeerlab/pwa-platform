# 验证记录：browser-test-harness

> 模块质量门禁（#46）的可复现结果。任务事实源仍是 GitHub Issues #16。

## 环境与对象

- 日期：2026-09-15
- 分支：`feat/browser-test-harness`，基线 `origin/main` = `30c6aa3`
- 环境：Node v24.18.0，pnpm 11.18.0（corepack），Darwin arm64，Google Chrome 152.0.7977.84（本机安装的稳定版）
- 被验证的提交：第一次门禁在 `12f66cd`（#40–#45）上执行；独立评审之后的修复在 #46 提交中，重新执行的结果见"#46 提交上的重新执行"

## 干净 worktree 门禁（`12f66cd`）

从 `12f66cd` 新建独立的 git worktree，依次执行：

| 命令 | 结果 |
|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略，无需解析 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm test` | 退出 0；contracts 8 个文件 138 条，类型测试 0 错误；harness 7 个文件 59 条；core 7 个文件 94 条，全部通过 |
| `pnpm typecheck` | 退出 0 |
| `pnpm test:browser` | 退出 0；harness 浏览器自测 18 个全部通过（本机 Chrome 152.0.7977.84） |

执行结束后 worktree 没有任何改动（忽略的构建与测试输出除外），随后删除。

## #46 提交上的重新执行

从 `9c3300d`（#46，包含独立评审后的全部修复）新建独立 worktree，执行结果：

| 命令 | 结果 |
|---|---|
| `CI=true pnpm install --frozen-lockfile` | 退出 0；lockfile 通过供应链策略 |
| `pnpm lint` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm test` | 退出 0；contracts 138 条（类型测试 0 错误）、harness 61 条、core 94 条，全部通过 |
| `pnpm typecheck` | 退出 0 |
| `pnpm test:browser` | 退出 0；浏览器自测 22 个全部通过，日志打印 `[browser-test-harness] chromium 152.0.7977.84 (configured channel)` |

执行结束后 worktree 没有任何改动，随后删除。此后的提交只包含验证记录。

## 依赖与供应链

| 任务 | lockfile 新增 | 核对 |
|---|---|---|
| #40 | `@playwright/test`、`playwright`、`playwright-core`，均为 `1.63.0` | 均来自 registry，没有安装脚本，带 provenance 与 trusted publisher；冻结安装通过 |
| #41 | `@types/node@24.13.4`、`undici-types@7.18.2`；vite、vitest 与 @vitest/mocker 的解析条目随之带上 `@types/node`，版本不变 | 来自 registry，没有安装脚本；没有登记任何豁免，`pnpm-workspace.yaml` 未改动 |

- `@types/node` 22.x 被拒绝：它依赖的 `undici-types@6.21.0` 没有 provenance，而更早发布的版本带 provenance，安装以 `ERR_PNPM_TRUST_DOWNGRADE` 失败。项目所有者决定改用 24.13.4，其依赖 `undici-types` 7.18.x 均带 provenance。
- `@playwright/test` 同时声明为 `peerDependencies` 与 `devDependencies`，版本精确为 `1.63.0`；运行时依赖只有 `@pwa-platform/contracts`。依赖边界由 `test/public-api.test.ts` 守护。
- #46 移除 Android 目标后，lockfile 没有变化（`_android` 本就来自 `@playwright/test`）。

## 独立评审

由一个全新上下文的只读评审代理审阅了 `origin/main...HEAD`（#40–#45），在临时 worktree 中复现问题后删除，主工作区没有改动。结论为"修改后再合并"：2 项阻断、6 项应修、10 项小问题。评审确认的无问题项包括：只监听 `127.0.0.1`、越界请求与符号链接返回 404、`readRegistration` 的精确 scope 匹配、对照缓存的前缀边界、`expectLifecycleSequence` 不泄露事件值、`PWA_HARNESS_CHROME_PATH` 覆盖生效且保留使用方的 `launchOptions`、lockfile 新增项与精确版本、CI 权限与 action SHA（用 `gh api` 核对）、文档链接与模块名。

**阻断（均已修复）：**

| # | 问题 | 处理 |
|---|---|---|
| 1 | Playwright 的 `Response.headers()` 用换行合并同名的多行响应头，而 `expectCacheControl` 只按逗号切分：`Cache-Control: no-cache` 与 `Cache-Control: immutable` 两行时，`exclude: ["immutable"]` 误报通过 | 引号外的换行也作为分隔符；服务器响应头规则支持数组值以发送多行；新增单元测试与浏览器自测 |
| 2 | `waitForController` 与 `waitForWorkerState` 只比较脚本 URL，而平台的 worker URL 不可变：部署 v2 后页面仍由 v1 控制时，它们立即返回 | 项目所有者决定新增 `waitForControllerChange`：等待 `controllerchange` 并确认新的 controller 是 registration 的 active worker；新增同一 URL 的接管 worker fixture，自测覆盖"只等待时失败"与"接管后成立"；原有工具保留并在注释与 README 中写明限制 |

**应修：**

| # | 问题 | 处理 |
|---|---|---|
| 3 | `include` 比浏览器宽松：`no-cache="set-cookie"` 满足 `no-cache`；`max-age=60, max-age=0` 满足 `max-age=0`；`max-age = 0` 被接受 | 项目所有者决定严格匹配：只写指令名只匹配不带值的指令，`name=*` 匹配任意值，重复指令失败，等号两侧带空白的指令无效 |
| 4 | 响应头规则按未规范化的路径匹配：`/sub/..%2fsw.js` 返回 sw.js 却套用 `/sub/` 的规则，`/SW.JS` 在不区分大小写的文件系统上绕过规则 | 服务器只按原始写法提供文件：`.`、`..`、空段、反斜杠返回 404，真实路径必须与请求写法逐字一致（已实测 Node 的 `realpath` 在 macOS 上规范化大小写），因此符号链接与大小写别名一律 404 |
| 5 | Android 目标首次连接需要下载 Playwright 驱动 APK，与规格"不下载"冲突，且会在所有已连接设备上重装驱动 | 项目所有者决定本模块移除 Android 目标，由第一个具备测试设备的运行时模块决定运行方式 |
| 6 | Android 下 `launchBrowser` 忽略 `offline` 等上下文选项，设备配置持久，可能误报通过 | 随 Android 目标一并移除 |
| 7 | `snapshotCaches` 用 `caches.open` 计数，会把刚被删除的缓存重建为空缓存 | 打开前用 `caches.has` 确认存在，计数后再次列出缓存名，变化则重试，三次仍变化即失败；剩余的极小竞态写入已知限制 |
| 8 | `list` reporter 不打印注解，CI 日志看不到测试所用的浏览器版本 | 项目所有者决定在日志中打印：每个 Playwright worker 启动浏览器后输出 `[browser-test-harness] chromium <版本> (...)`，已在本地 `pnpm test:browser` 输出中确认可见 |

**小问题：**

| 问题 | 处理 |
|---|---|
| 越界测试没有覆盖同名前缀的兄弟目录 | 新增指向兄弟目录 `v1x` 的符号链接用例；越界判断已由"逐字一致"取代 |
| `requestFromPage` 对带片段的 URL 等满超时、同一 URL 并发请求可能混淆、fetch 不受超时约束 | 去掉片段；请求带唯一的 `x-pwa-harness-request` 请求头并据此匹配响应；fetch 使用 `AbortSignal.timeout`，超时时报错而不是报告网络错误；新增片段自测 |
| `waitForWorkerState` 遇到导航时直接报错，轮询可能错过短暂的 installing | 导航导致的执行上下文销毁会继续轮询；轮询限制写入注释与 README |
| `//evil/sw.js` 被记录为 `/sw.js`；目录不带结尾斜杠时直接返回 index | 请求记录保留原始路径（去掉查询串）；空段请求返回 404；目录不带结尾斜杠时 301 重定向并保留查询串 |
| 引号内的转义引号会被解析出不存在的指令 | 解析时处理引号内的反斜杠转义，新增单元测试 |
| `expectDeletedExactlyUnderPrefix` 任何新增缓存都判失败 | 行为保留（对应恢复演练第 3 步），注释与 README 写明适用场景 |
| `sideEffects: false` 不准确 | 从 `package.json` 移除，测试断言该字段不存在 |
| 包边界只靠文档约束 | 本模块暂无运行时包可检查，写入已知限制 |
| 规格没有列出实际导出的 `fixtureSite`、`fixturePath`、`MINIMAL_PAGE_MARKER`、`BROWSER_VERSION_ANNOTATION` 与环境变量常量 | 规格新增导出总表；Android 相关常量随目标移除 |
| Android 细节（无限等待、缺少 adb 时的提示）；服务器不校验 Host 头 | Android 部分随目标移除；服务器只接受 `localhost:<端口>` 与 `127.0.0.1:<端口>` 的 Host，其他返回 403 |

## 变异检查

每项都是修改一处实现后运行对应测试，确认失败，再恢复并确认源码逐字节一致。

| 任务 | 变异 | 失败的测试 |
|---|---|---|
| #40 | 去掉 Playwright 配置中的 `channel: "chrome"` | 冒烟自测（改用未下载的内置浏览器，启动失败） |
| #41 | 路径越界判断恒为真 | `never serves anything outside the site directory` |
| #41 | 响应头规则倒序应用 | `applies matching rules in order, later rules overriding header names case-insensitively` |
| #41 | 监听所有网卡（`::`） | `does not listen on the IPv6 loopback or other addresses` |
| #42 | `waitForWorkerState` 固定读取 active 位置 | `a deployed v2 waits while v1 keeps controlling the page` |
| #42 | `requestFromPage` 固定返回 `fromServiceWorker: false` | `responses produced by a fetch handler are reported as coming from the service worker` |
| #42 | 最小页面去掉内联空图标 | `loading the minimal page makes no incidental requests such as /favicon.ico`（3 次重复均失败） |
| #43 | 前缀比较由 `startsWith` 改为 `includes` | 3 条单元测试与浏览器自测 `a worker that deletes the app prefix passes` |
| #43 | 去掉条目数比较 | 单元测试与浏览器自测 `changing the entry count of a kept cache fails` |
| #43 | `Cache-Control` 匹配忽略指令值 | `matches a bare name against any value and a name=value entry against that value only` |
| #44 | 生命周期校验跳过无效事件 | 2 条生命周期单元测试 |
| #46 | 换行不再分隔指令 | 2 条单元测试与浏览器自测 `a directive sent on a second header line is not missed` |
| #46 | 只写指令名时匹配任意值 | `matches a bare name only against a directive without a value` |
| #46 | 允许重复指令 | `fails when a directive repeats, whatever the expectation` |
| #46 | 去掉"真实路径与请求写法逐字一致"的检查 | `serves files only under their exact spelling, never outside the site or through aliases` |
| #46 | 去掉 Host 校验 | `rejects other hosts, such as a DNS-rebound name, with 403` |
| #46 | `waitForControllerChange` 不等待 `controllerchange` | `waitForControllerChange fails while a deployed v2 only waits at the same URL` |

#41 的越界判断在 #46 中被"逐字一致"检查取代，对应的变异改由 #46 的行覆盖。

## 稳定性

- **favicon 请求**：Chrome 在页面加载后异步请求 `/favicon.ico`，偶尔在清空请求记录之后到达，导致请求记录断言不稳定（10 次重复中出现 2 次失败，失败内容为多出的 `GET /favicon.ico`）。最小页面改为声明内联空图标，并新增自测。
- **并行启动**：默认 4 个 worker 并行重复运行时，偶发"创建浏览器上下文超时"（每次落在不同的测试上）；单 worker 串行重复没有复现。harness 自测改为 `workers: 1`，整套串行约 7–12 秒。
- **重复运行结果**：#42 修复后整套 10 次重复 110/110 通过；#43 为 5 次重复 90/90；#44 为 3 次重复 54/54；#46 评审修复后为 3 次重复 66/66。

## 桌面端运行

| 检查 | 结果 |
|---|---|
| `PWA_HARNESS_CHROME_PATH` 指向本机 Chrome | 冒烟自测通过，注解 `browser-version` 为 `152.0.7977.84` |
| `PWA_HARNESS_CHROME_PATH` 指向不存在的文件 | 启动失败：`executable doesn't exist at /nonexistent/chrome-n-1` |
| 使用方配置自带 `launchOptions` 时设置该变量 | 同样启动失败，覆盖仍然生效；不设置变量时通过 |
| 日志中的浏览器版本 | `pnpm test:browser` 输出 `[browser-test-harness] chromium 152.0.7977.84 (configured channel)` |

#44 曾实现并在本机验证 Chrome Android 目标的错误提示（adb 服务未运行、没有设备），#46 按项目所有者决定移除该目标，相关代码与测试已删除。

## CI 实跑证据

项目所有者授权推送后，在模块 PR [#47](https://github.com/haigeer-labs/pwa-platform/pull/47) 上取得以下运行。PR #47 在报红与恢复为绿的验证完成前已合并；合并后推送到功能分支的临时失败提交 `faa8435` 不再触发 CI（CI 只在指向 main 的 PR 与 main 的推送时运行），该分支随后按项目所有者决定删除。

| 提交 | 事件 | 运行 | 结论 |
|---|---|---|---|
| `9c3300d` | PR #47（`pull_request`） | [34980960713](https://github.com/haigeer-labs/pwa-platform/actions/runs/34980960713) | 成功：Quality (Node 22)、Quality (Node 24)、Browser (Google Chrome stable, Node 24) 全部通过 |
| `2eeaec0` | 合并到 main（`push`） | [34981176617](https://github.com/haigeer-labs/pwa-platform/actions/runs/34981176617) | 成功：三个 job 全部通过 |

PR #47 上的运行日志：

- **Node 版本**：quality job 为 Node 22.23.2 与 24.21.0，browser job 为 Node 24.21.0。
- **冻结安装**：三个 job 都输出"Lockfile passes supply-chain policies (160 entries …)"。
- **单元测试**：contracts 138 条、harness 61 条、core 94 条通过；依赖审计报告"No known vulnerabilities found"。
- **浏览器**：`google-chrome --version` 为 Google Chrome 152.0.7977.82；harness 日志打印 `[browser-test-harness] chromium 152.0.7977.82 (configured channel)`；浏览器自测 22 个通过。runner 预装的 Chrome 可以直接由 `channel: "chrome"` 使用，不需要下载浏览器。

browser job 报红与恢复为绿的证据在后续 PR [#48](https://github.com/haigeer-labs/pwa-platform/pull/48) 上取得（均为 `pull_request` 事件）。创建 #48 的分支时，切回 `main` 的步骤失败而脚本没有停止，分支因此从临时失败提交 `faa8435` 切出；该提交被当作"故意失败"的提交使用，并在合并前撤销，PR 最终只改动验证记录。

| 提交 | 目的 | 运行 | 结论 |
|---|---|---|---|
| `429c2ce`（其父提交为 `faa8435`） | 临时把浏览器冒烟自测的期望文本改错，同时提交验证记录 | [34982914773](https://github.com/haigeer-labs/pwa-platform/actions/runs/34982914773) | 失败：browser job 在 Browser tests 步骤报红（1 个失败，期望 `"deliberately-wrong"`；其余 21 个通过）；Quality (Node 22) 与 Quality (Node 24) 均通过 |
| `1590c5b` | 撤销 `faa8435`；撤销后冒烟自测与 `main` 逐字节一致 | [34983148572](https://github.com/haigeer-labs/pwa-platform/actions/runs/34983148572) | 成功：三个 job 全部恢复为绿；browser job 使用 Google Chrome 152.0.7977.82，浏览器自测 22 个通过；两个 quality job 的依赖审计报告"No known vulnerabilities found" |

至此 browser job 的报红与恢复为绿证据齐全；此后的提交只包含验证记录与文档基线。

## 项目所有者确认

- **规格**：采用 Playwright Test；CI 使用预装 Chrome，桌面端 N-1 本地运行；独立的 browser job 只跑 Node 24；harness 提供服务器、页面、worker fixture 与断言工具。
- **#41**：`@types/node` 先定为 22.x，因 `trustPolicy` 拒绝其依赖后改为 24.13.4。
- **#44**：运行目标由环境变量选择（#46 移除 Android 目标后作废）。
- **检查点"交付前"**：确认 README 中的运行步骤与已知限制、最小页面的内联空图标、harness 自测串行运行。
- **#46 独立评审后**：新增 `waitForControllerChange`；`expectCacheControl` 严格匹配；移除 Chrome Android 目标；在日志中打印浏览器版本。

## 与 spec、ADR 和能力图的边界核对

- 没有实现平台 worker、客户端运行时、事件传输协议或安装断言；`fixtures/` 中的 worker 只用于自测。
- 能力图 `browser-test-harness`：不依赖 UI 框架的最小页面、worker fixture 与真实浏览器断言能力，只依赖 contracts。一致。
- ADR-0010 记录了工具、CI 浏览器来源、桌面端 N-1 的运行方式，以及暂不提供 Chrome Android 的原因。
- 没有修改 GitHub 仓库设置；CI 新增 job 沿用只读权限与已固定的 action。

## 已知限制（移交后续模块）

- **Chrome Android 没有运行方式**：浏览器矩阵的必测要求不变；第一个具备测试设备的运行时模块需要在其规格中决定验证方式，审批所需的驱动或下载源，并确认 worker、缓存与离线相关能力。
- **CI 只证明验证当天的稳定版**：runner 预装的 Chrome 随镜像更新，实测版本以日志中打印的版本、`google-chrome --version` 与测试注解为准。
- **按 URL 比较的等待工具**：`waitForController` 与 `waitForWorkerState` 区分不了同一 URL 的新旧版本，检查更新或恢复 worker 的接管要用 `waitForControllerChange`。
- **`snapshotCaches` 的剩余竞态**：在 `caches.has` 与 `caches.open` 之间被删除的缓存仍可能被重建；应在被测 worker 稳定后再取快照。
- **包边界只靠文档与评审约束**：运行时包出现后，可在其模块中补充"harness 只出现在 `devDependencies`"的自动检查。
- **harness 自测串行运行**：只在本机验证过并行启动会超时；使用方的 Playwright 配置自行决定并行度。
