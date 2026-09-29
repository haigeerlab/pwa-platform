# ADR-0045：AI 接入 skill 随 `@pwa-platform/vite` 发布

## 状态

已接受（2026-09-29，项目所有者评审通过 [spec/ai-onboarding.md](../../spec/ai-onboarding.md) 与 [tasks/ai-onboarding/plan.md](../../tasks/ai-onboarding/plan.md)；本 ADR 记录其中关于包边界与发布方式的决定）。来源 Proposal：[spec/proposals/ai-onboarding.md](../../spec/proposals/ai-onboarding.md)（评审 Issue #84，`accepted`）。

本 ADR 只记录已经作出的决定。Codex 一侧的 skill 目录与调用约定已由计划任务 AO2 核实，见文末"增补"。

## 背景

业务方接入 PWA Platform 时，代码多数由 AI 编写。接入不只是配置插件：要先清理冲突包，检查项目内配置，再在已部署环境里核对服务端响应头和浏览器行为，上线后还要按症状排障。这些引导需要与**已安装的包版本**一致，否则 skill 说的和 API 实际不符。

现状：

- 仓库里的 `.agents/skills/pwa-vite5-vue-integration`（35 行）只覆盖 Vite 5 + Vue 3.4 一种宿主，放在仓库内，没有随任何 npm 包发布，也没有冲突检测、服务端步骤、公共缓存的人工确认和排障。
- `@pwa-platform/vite` 的 `files` 是 `["dist"]`，`exports` 只有 `.` 与 `./virtual`，`sideEffects: false`，是构建插件，官方安装命令把它装为开发依赖。
- 十个公开包里没有任何一个带命令行入口；唯一带 `bin` 的 `@pwa-platform/release-tools` 是私有包。发布内容由 `scripts/check-package-distribution.mjs` 核对，其中硬编码了十个包的清单。
- AI 替业务方判断"哪个接口是公共的"，误判会让私有数据被缓存进浏览器。这是需要平台规定的安全边界，不是实现细节。
- 项目所有者要求：引导属于开发期辅助，不得进入生产构建，也不得增加线上体积。

## 决定

- **位置**：`packages/vite/skills/pwa-onboarding/`，包含 `SKILL.md` 与按需读取的引用文件。
- **打包**：加入 `@pwa-platform/vite` 的 `files`，**不加入 `exports`**，因此无法被 `import` 引用，也不会被打包器带进业务产物。其余九个包不变。
- **内容**：只含 Markdown，不含任何可执行脚本。
- **安装**：文档给出复制命令，目标固定为 `.claude/skills/pwa-onboarding` 或 `.agents/skills/pwa-onboarding`。**不新增命令行入口，不使用 `postinstall`。**
- **不进入生产构建**，由三层保证：不被 `exports` 暴露；skill 启动时自检自身路径，位于 `public/`、`src/`、`dist/` 之下则停止；`onboarding-smoke` 中的构建检查在产物里搜索哨兵字符串并比较产物哈希（变异：把 skill 放进 `public/` 时该检查必须变红）。复制命令本身无法强制目标目录，这是自检与构建检查存在的原因。
- **版本一致**：`SKILL.md` 的 `metadata.version` 随包版本号一起提交，由测试强制两者相等（不在构建时改写源文件：发布的就是包根目录的 `skills/` 源文件）；skill 启动时与 `node_modules` 中的包版本比较，不一致则警告，由人决定是否继续。
- **规则不复制**：服务端要求清单以《部署与发布》与 `build-verifier` 的规则常量为唯一来源；一致性测试把它们绑住。
- **人工确认闸门**：删除依赖或文件、首次生产注册前的身份字段、每条公共缓存规则、真机验证、生产部署与 worker 切换，必须由人在对话里明确确认，并记入接入状态文件。skill 不推送、不部署、不切换 worker。
- **范围外**：响应头预检命令行（曾提出为 `header-preflight`，后决定不做，Issue #87 已关闭）；配置生成器；nginx / CDN 配置样例；收集或上传业务方的服务器配置。

## 备选方案

- **新建独立 npm 包（如 `@pwa-platform/ai-onboarding`）。** 不采用：要改发布校验脚本里硬编码的十个包的清单，并维护与 `@pwa-platform/vite` 的版本联动；收益只是边界更干净，而 `@pwa-platform/vite` 本来就是开发依赖，已满足"不进入生产安装与构建"。
- **`postinstall` 自动安装。** 不采用：会在使用者不知情时往其仓库写文件；许多团队默认禁用依赖的安装脚本（本仓库自己也以 `strictDepBuilds` 拒绝未批准的依赖脚本，见[依赖变更流程](../operations/dependency-changes.md)），脚本可能根本不运行。
- **专用命令行安装器（新增 `bin`）。** 不采用：这会成为第一个公开命令行入口，是新的公开接口，公开包是否可以带命令行入口是一个需要单独决定的问题（曾随 `header-preflight` 提出，该提案已决定不做）；复制一个文件足以满足第一版。
- **把 skill 放在文档站或仓库里，让 AI 读链接。** 不采用：与已安装的版本不匹配，离线不可用，容易漂移。
- **继续只用 `.agents/skills/pwa-vite5-vue-integration`。** 不采用：单一宿主，未随包发布。该 skill 在本 skill 交付时并入并标记废弃，其专项经验迁入冲突目录的"仅提示"。
- **把 skill 内容作为运行时模块从 `exports` 导出。** 不采用：会被打包器带入业务产物，违背"不增加线上体积"。

## 影响

- `@pwa-platform/vite` 的 npm 包多一个 `skills/` 目录，体积预算总量 ≤ 60 KB；发布时由校验脚本核对该目录。这是新的公开发布物契约：目录结构与 front matter 的变化需要以增补形式记录在本 ADR。
- 改 skill 文字需要发新版本的 `@pwa-platform/vite`（项目所有者接受这一耦合）。
- 文档站只有中文，英文模式下引用的参考文档仍是中文，由 AI 转述；界面语言由更新提示与离线页已有的 `locale`（`zh-CN`、`en`）承载。
- 规格、计划与实现都在不合并的草稿分支上推进，与能力图行一起合入：`verify-artifacts` 在模块入图前会对规格报错，且当前模块 `cloudflare-test-deployment` 尚未完成，插入命令会拒绝。
- 不新增依赖，供应链清单不变。

## 增补：Codex 一侧的约定（2026-09-29，计划任务 AO2）

核实方式：`openai/codex` 主分支源码，以及本机 codex-cli 0.157.1 自带的 skill 文档与校验脚本。官方 skills 页面返回 HTTP 403，**未读到**；"运行时忽略未知 front matter 字段"是从源码推断的，**未实跑**（AO4 计划做一次需批准的人工检查）。

对上文"决定"的修正：

- **安装目录随团队使用的 AI 而定，不是"二选一"。** Claude Code 读 `.claude/skills/pwa-onboarding`；Codex 读 `.agents/skills/pwa-onboarding`（从当前目录逐级向上扫到仓库根），**不读 `.claude/skills`**。两个 AI 都用的团队要复制两份。符号链接是否可行、Claude Code 是否读 `.agents/skills`，均未核实。
- **`SKILL.md` 的版本写在 `metadata.version`，不写顶层 `version`。** Codex 自带的校验器只允许 `name`、`description`、`license`、`allowed-tools`、`metadata` 五个顶层键。`name` 为小写连字符、≤ 64 字符；`description` ≤ 1024 字符且不含 `<` `>`。
- **显式调用语法不同**：Claude Code 用 `/pwa-onboarding`，Codex 用 `$pwa-onboarding`。
- **引用文件不会被自动读取**，`SKILL.md` 正文必须逐个写明何时读哪个文件。

## 增补：缩减为一页清单（2026-09-29）

本 ADR 的核心决定不变：清单放在 `@pwa-platform/vite` 的 `skills` 目录，进 `files` 不进 `exports`，不新增命令行入口，不进入生产构建。变的是清单本身：它由"八个关卡加引用文件的全链路引导"缩减为**一个约 3.6 KB 的 `SKILL.md`**，规则指向文档站，不复述。原因是实现之后回看，全链路引导对一个开源库过重，维护成本高、关卡 3–6 从未在真实部署上验证，且每轮评审都能找到新的文字漏洞。完整实现保留在 git 历史里。

上文正文保留原样作为历史记录，以下各条以本增补为准（2026-09-29 逐条核对，契约见[规格](../../spec/ai-onboarding.md)）：

| 正文原话 | 现在 |
| --- | --- |
| 位置：`SKILL.md` 与按需读取的引用文件；Codex 增补：正文逐个写明何时读哪个引用文件 | 只有一个 `SKILL.md`，没有 `references/`（测试强制）。 |
| 版本一致：skill 启动时与 `node_modules` 中的包版本比较，不一致则警告 | 不做启动时比较。只保留 `metadata.version` 等于包版本（测试强制），文档要求升级包后重新复制。 |
| 规则不复制：一致性测试把服务端要求与 `build-verifier` 规则常量绑住 | 没有一致性测试。清单不复述规则，只链接文档站；链接的页面必须存在于 `website/`（测试强制），且发布 `vite` 前线上文档站须与发布提交一致（见下一条增补）。 |
| 人工确认闸门含"真机验证"，确认结果记入接入状态文件 | 没有状态文件和闸门编号。仍须人明确确认的是：删除依赖或文件、身份字段、每条公共缓存规则；推送、部署、切换 worker 由人执行。真实浏览器验证是清单的一步，不是确认闸门。 |
| 旧 skill 并入并标记废弃，专项经验迁入冲突目录的"仅提示" | 已标记废弃（PR #92），没有迁移：不再有冲突目录，新清单的"找冲突"一步覆盖通用冲突。 |
| 体积预算总量 ≤ 60 KB | `SKILL.md` ≤ 6144 字节，整个目录 ≤ 8192 字节（测试强制）。 |
| 英文模式下引用的参考文档仍是中文，由 AI 转述 | 没有语言选项。清单为中文，助手可以用英文和人对话；文档站只有中文。 |

## 增补：文档只在线提供，发布 `vite` 前先部署文档站（2026-09-29）

清单引用的文档不随包发布，每篇在 `SKILL.md` 里带文档站链接。文档站合并后不自动部署，可能落后于发布的包（核对当天线上比 `main` 落后 20 个 `website/` 文件），所以 [npm 包发布流程](../operations/npm-package-release.md)第 11 条要求：发布 `vite` 前，线上文档站与发布提交的 `website/` 无差异、清单中每个链接返回 200、线上《选择接入包》含"用 AI 引导接入"一节，否则先部署文档站。

备选方案：把引用的 8 页（约 53 KB）随包发布，版本准确、离线可用，但这些页面还链到其他页面和 GitHub 文件，边界上仍会断，也与缩减决定相悖；按 git tag 做版本化链接，但仓库目前没有 tag，文档站内的站内链接在 GitHub 上会失效。都不采用。代价：AI 需要能访问文档站；文档站只有最新版，用旧版本包的人读到的是新版文档。
