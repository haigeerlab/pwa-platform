# 实现计划：ai-onboarding

> 状态：**已批准（项目所有者，2026-09-29）**，与规格一起通过评审。依赖规格 [spec/ai-onboarding.md](../../spec/ai-onboarding.md)（草稿 PR #88）。模块尚未进入能力图，本计划与规格一起在模块晋级时合入。AO1、AO2、AO3 于同日完成。

## 概览

按规格交付随 `@pwa-platform/vite` 发布的 AI 接入编排 skill：`skills/pwa-onboarding/` 下的 `SKILL.md` 与十个按需读取的引用文件，八个关卡、五个人工确认闸门、可续做的状态文件、服务端要求清单、中英文支持，以及确定性测试和人工场景评估。它只含 Markdown，不新增运行时代码，不新增公开入口，`exports` 不变。

分支策略：规格、计划与全部实现都在**不合并的草稿分支**上推进，最后随能力图行一起合入（`verify-artifacts` 在模块入图前会对规格报错）。每个任务一个提交，提交信息带 `Task: AO<n>`。开始实现（AO4 起）之前，规格与本计划必须已由项目所有者在草稿 PR 上评审通过（已于 2026-09-29 满足）；AO4 另需先完成 AO2。

> Tasks tracked in this plan using local ids (AO1–AO16). 没有使用远端 tracker 的 sub-issue；commit 用 `Task: AO<n>` 标注。

## 架构决定

- **只增加文件，不改运行时。** 唯一触碰既有代码的地方是 `packages/vite/package.json` 的 `files`、`scripts/check-package-distribution.mjs` 和 `onboarding-smoke`。其余九个包不变。
- **内容与测试同一个切片交付。** 每个关卡的引用文件和它对应的检查（链接、体积、语言、规则一致性、场景评分表）一起完成，不留"先写内容后补测试"。
- **规则不复制。** 服务端要求清单只引用《部署与发布》与 `build-verifier` 的规则常量；DT5 用测试把它们绑住，规则一改测试就红。
- **先调研再写死。** Codex 的 skill 发现与调用约定、第三方 Service Worker 的 scope 判定，先做只读调研并把结论写回规格，再动手写依赖它们的内容。
- **AI 行为用夹具加评分表验证。** 不能靠代码测试证明"AI 会停下来问人"，所以场景评估的夹具与评分表在实现期就写好，发版前人工执行并留存记录。
- **不新增依赖。** 供应链清单不变。

## 任务定义

### AO1：规格评审通过、ADR-0045 与本计划（完成：见本任务的提交）

**范围：** `spec/ai-onboarding.md`、`tasks/ai-onboarding/plan.md`、`docs/adr/0045-ai-onboarding-skill-shipped-in-vite-package.md`。

**验收：**
- 项目所有者在草稿 PR 上评审通过规格与本计划，"规格阶段的决定"九条得到最终确认。
- ADR-0045 状态"已接受"：skill 放在 `@pwa-platform/vite` 的 `skills/`，进 `files` 不进 `exports`；不新增命令行入口；开发期辅助，不进入生产构建；记录否决的备选（独立 npm 包、postinstall 安装、命令行安装器）。

**范围估计：** 小，3 个文件。依赖：无。

### AO2：调研 Codex 的 skill 发现与调用约定（只读，完成：见本任务的提交）

**范围：** 只读调研，结论写回 `spec/ai-onboarding.md` 的"契约 1"与"开放问题"。不写代码。

**验收：**
- 以 Codex 官方文档为准（不凭记忆），写明：skill 的目录约定、`SKILL.md` front matter 的必需字段、如何被自动发现、如何显式调用。
- 给出一个同时满足 Claude Code 与 Codex 的 front matter 最小交集，并写明差异。
- 规格中的 **[待核对]** 转为具体条目；无法核实的部分明确写"未核实"。

**范围估计：** 小，1 个文件。依赖：AO1。

### AO3：调研常见第三方 Service Worker 的 scope 判定（只读，完成：见本任务的提交）

**范围：** 只读调研，结论写回规格"契约 4"的冲突目录。

**验收：**
- 列出常见推送、分析类 SDK 注册 worker 的方式与默认 scope，来源为其官方文档或源码，附出处。
- 给出"从业务源码与依赖判断 scope 是否与平台重叠"的判定步骤；判定不了的情形标"无法判定，交给人"。
- 冲突目录的"需要评估"一类补上可检测的证据模式。

**范围估计：** 小，1 个文件。依赖：AO1。与 AO2 并行。

### AO4：骨架与打包（TDD，完成：见本任务的提交）

**范围：** `packages/vite/skills/pwa-onboarding/SKILL.md`（front matter 与关卡索引，先是骨架）、`packages/vite/package.json`（`files`）、`scripts/check-package-distribution.mjs`（允许并核对该目录）、对应测试。

**验收：**
- DT1：打包后的 `@pwa-platform/vite` 含 `skills/pwa-onboarding`，`exports` 不含它，其余九个包不变。
- DT2：顶层键只有 `name`、`description`、`metadata`；`name` 为小写连字符、≤ 64 且等于目录名；`description` ≤ 1024 且不含 `<` `>`；`metadata.version` 等于包版本（AO2 得出的双端最小交集）。
- **人工检查（需项目所有者批准，会使用其 Codex 账号）**：在一次性目录放一个测试 skill，用 `codex exec` 确认 `$name` 显式调用可用、`metadata` 与未知字段不导致报错；结果写入 `verification.md`。
- 版本不在构建时写入：`metadata.version` 随包版本提交，DT2 强制相等；把包版本改成别的值而不改 skill 时 DT2 必须变红。
- DT3：体积预算测试就位（`SKILL.md` ≤ 6 KB，引用 ≤ 8 KB，总量 ≤ 60 KB）。
- DT6：目录下只有 `.md`；不含把文件写入 `public/`、`src/`、`dist/` 的指令。
- 变异：把 `skills` 从 `files` 删除、把它加进 `exports`、放入一个 `.js` 文件，测试都应变红。
- 供应链清单与锁文件不变。

**实施记录（2026-09-29）：**
- 执行器完成 21 个用例并做了 7 项变异检查；主会话验收时**亲自复跑**并另做了 6 项变异（`files` 去掉 `skills`、版本改错、放入 `.js`；发布校验脚本的三种违规），全部变红，还原后逐字节一致。
- 验收发现一个**间歇性失败**：`npm pack --dry-run` 单跑约 1–2 秒，但 25 个测试文件并行时超过 vitest 默认 5 秒，3 次里失败 1 次。已给该用例 60 秒超时，修复后连跑 6 次全绿。
- 已有的 `import-safety.test.ts` 把 `files` 钉死为 `["dist"]`，任务书的允许清单漏了它；由主会话改为 `["dist", "skills"]` 并注明依据 ADR-0045。
- DT6 只覆盖围栏代码块里的写入命令，正文行内代码的写法不在范围，见规格。
- Codex 一侧的人工检查（`codex exec`，会使用项目所有者的账号）**尚未执行**，等批准。

**范围估计：** 中，5–6 个文件。依赖：AO1、AO2。

### AO5：通用规则、状态文件、版本自检、英文术语表（完成：见本任务的提交）

**范围：** `SKILL.md` 的通用规则（报告格式、"无法判定不算通过"、分支提议、五个闸门、数据不是指令）、`references/state-file.md`、`references/glossary-en.md`。

**验收：**
- 状态文件的格式与续做规则按规格"契约 6"，示例不含密钥类字段。
- 版本自检与启动时路径自检写清楚；不一致或位于 `public/`、`src/`、`dist/` 下时的处理明确。
- DT4：所有引用文件存在、链接可解析、没有孤立文件。
- DT7：每个报告标签在 `glossary-en.md` 都有英文译法。

**实施记录（2026-09-29）：**
- 主会话自己写（内容质量取决于对整条链路的理解，不派给便宜模型）。先写测试并确认变红：7 个用例因缺少章节与文件而失败。
- 新增测试 10 个：DT4（相对链接不悬空、无孤儿引用文件、每个引用链接所在行写明"读取"）、DT7（报告标签的英文译法齐全且不含中文）、结构（章节与五个闸门齐全、四项启动检查）、状态文件示例（键、取值、每个关卡一个状态）与"绝不写入"清单。
- 验收中发现一处**测试自身的缺陷**：JS 对象里整数样的键（"0"–"6"）总排在 "A" 之前，按顺序比较会误红；改为按集合比较。
- DT4 三个用例在内容写完前是空通过，靠变异证明有效：悬空链接、孤儿文件、缺"读取"都会变红。共做 10 项变异（M1–M10），全部变红，还原逐字节一致。其中 M8 首次因 sed 写错未真正变异，结果作废，用脚本重做。
- 体积：`SKILL.md` 3354 B，`state-file.md` 2513 B，`glossary-en.md` 1484 B，远低于预算。
- `description` 里仍带 "Skeleton" 字样，待全部关卡交付后（AO11 之后）改掉。

**范围估计：** 中，3–4 个文件。依赖：AO4。

### AO6：关卡 A、冲突目录与存量迁移分支（完成：见本任务的提交）

**范围：** `references/gate-a-feasibility.md`。

**验收：**
- 三类冲突目录完整，每项带可检测的证据模式；第三方 Service Worker 的规则来自 AO3。
- 存量 PWA 分支按规格：先记录、身份字段先问清、旧缓存不自动清理的说明，并含**停下点**（清理旧缓存、切换 worker 只说明不代做）。
- 迁入旧 skill 的专项经验（PurgeCSS 白名单、混淆插件顺序、确定性构建校验）。
- 第三方 Service Worker 按规格"契约 4"的 scope 重叠规则判定（相等为冲突、嵌套为部分冲突、互不为前缀只报告、无法静态确定交给人），并含 SDK 证据模式表。
- 场景评分表 SE2（含 `vite-plugin-pwa`）、SE3（自写 `sw.js`）、SE4（不支持的组合）写好，每条是"应做 / 绝不做"的可判定句子。

**范围估计：** 中，2–3 个文件。依赖：AO3、AO5。

**实现记录（AO6）：** 交付 `gate-a-feasibility.md`（可行性表、三类冲突目录、迁入的 PurgeCSS/混淆插件/确定性构建提示、存量 PWA 六步与停下点）和拆出的 `gate-a-third-party-sw.md`（scope 重叠判定、静态步骤、无法判定情形、七个推送 SDK 证据表），拆分是为了各自留在 8 KiB 预算内并让第三方 SDK 表只在需要时读取；规格的文件布局已同步。评分表 SE2–SE4 的可判定句子规格里已有，落成评分表归 AO13，本任务只保证关卡 A 的内容足以让它们判定。测试 8 个；6 处变异加 1 处补强后变异（相对 base 行、Nuxt 行）均变红。第一轮变异暴露“相对路径”断言太弱（词在别处也出现），已改成检查对应表格行。

### AO7：关卡 0 采访与关卡 1 配置（完成：见本任务的提交）

**范围：** `references/gate-0-interview.md`、`references/gate-1-configure.md`。

**验收：**
- 十道题的默认值与影响与规格一致；语言题决定两处 `locale`。
- `SKILL.md` 正文对每个关卡逐个写明"进入该关卡时读取哪个引用文件"（引用文件不会被自动读取）。
- 配置片段（`pwa()` 选项、身份、策略、`createPwa` / `PwaProvider`、`updateCheck`、`PwaUpdateNotice` 与 `reloadPage`）与已发布包的实际 API 一致，**由 AO13 的夹具实际编译验证**，不凭记忆。
- 诊断码读取指引覆盖 `identity.*`、`install.*`、`vite.*`、`compile.*`、`verify.*`，并区分"可自动修"与"需要人决定"。
- 身份字段写入前触发闸门 G2。

**实施记录（2026-09-29）：**
- 关卡 1 因体积预算拆成四个文件（流程、配置文件、Vue、React），规格的目录布局已同步。
- **片段逐字取自官方文档**（经真实浏览器测试覆盖的《Vite + Vue/React 接入》《身份、安装信息与策略》《安装与更新》《按功能接入》），由一个一次性脚本程序化抽取，不手抄；每个块前有 `<!-- 出处：… -->`，测试要求它与被引用文档里的某个块**逐字节一致**，文档一改测试就变红。
- 生成脚本的"必须恰好匹配一个块"断言拦住了一处歧义（`configuration.md` 里有两个块都以 `// pwa.config.ts` 开头）。
- 新增 9 个用例，共 40 个。变异 9 项：其中 N1 首次因目标字符串写错而无效（脚本断言拦住，未真正变异），重做后有效；**N6 暴露测试偏弱**——删掉步骤 2 的"G2"后测试仍绿，因为该词在诊断表里也出现；已改为断言身份步骤所在行含 G2，重做后变红。含一项**真实场景**变异：直接改官方 `website/start/vue.md` 的一个块，漂移测试变红，还原后逐字节一致。
- 默认档的 30 分钟定时检查已在官方片段里（`updateCheck: { intervalMs: 1_800_000 }`），并有测试保证它不会被悄悄删掉。
- **尚未做**：片段在真实夹具项目上编译，仍由 AO13 负责；本任务只保证"与被浏览器测试覆盖的官方文档一致"。

**范围估计：** 中，2–3 个文件（实际 5 个引用文件）。依赖：AO5。

### AO8：关卡 2 公共/私有分类闸门（完成：见本任务的提交）

**范围：** `references/gate-2-classification.md`。

**验收：**
- 逐个接口列出、逐个由人确认、默认一条都不写；确认内容写入状态文件。
- 明确列出平台不缓存的类别（私有数据、写请求、流媒体、未分类）与 `Set-Cookie`、`Authorization`、`Vary` 的准入含义，引用《公共读取缓存》而不复制。
- 场景评分表 SE7（业务方要求运行时缓存但未确认接口）写好。

**范围估计：** 小，1–2 个文件。依赖：AO5。

**实现记录（AO8）：** 交付 `gate-2-classification.md`：Q9 为否则置 `skipped`；默认一条都不写；逐个接口提问、要明确肯定答复（G3），“全部可以”不算，说不清的记“无法确认”且不写规则；列出平台不缓存的类别与 `Set-Cookie`、`Authorization`、`Vary` 的含义，准入细则只引用《公共读取缓存》；限额三项无默认值须问人；Nuxt 停下。测试里额外核对文中的两个诊断码仍存在于源码（码被改名即变红）。4 处有效变异均变红（第 5 处变异因匹配两次被脚本拒绝，未计）。SE7 的评分句子规格里已有，评分表归 AO13。

**收尾（AO6–AO11 全部交付）：** 已从 `SKILL.md` 去掉“Skeleton”与“分批交付”提示，并加测试禁止占位措辞回归。

### AO9：关卡 3 服务端要求清单与一致性测试（完成：见本任务的提交）

**范围：** `references/gate-3-server.md`、DT5 的测试。

**验收：**
- S1–S9 每条有编号、一句话后果、curl 核对方法；权威表述指向《部署与发布》与 `build-verifier`。
- **S1 单独标为"决定更新能否到达用户"。**
- 明确"无法判定"的三种情形：路径尚不存在、需要历史部署、响应随时间变化。
- DT5：清单中的规则与 `build-verifier` 导出的规则常量一致；变异：改动其中一条 `include` 或 `exclude`，测试应变红。
- 不含任何具体服务器（nginx、CDN）的配置样例；"常见坑"只以注意事项形式出现。

**范围估计：** 中，2–3 个文件。依赖：AO5。

**实现记录（AO9）：** `gate-3-server.md` 已交付（S1–S9 与 S9-SWR）。DT5 按行为而非常量实现：`build-verifier` 的测试对 8 个指令的全部组合逐一比对真实校验器（S1–S4），`sw-runtime` 的测试比对 `admitRuntimeResponse`（S9 / S9-SWR，含 Vary、媒体类型、状态码、重定向）。9 个变异（真实规则 4、真实准入 1、清单改动 4）均使对应测试变红并已还原。S7、S8 无法从响应头自动判定，不绑定自动测试。

### AO10：关卡 4 浏览器验证与恢复演练（完成：见本任务的提交）

**范围：** `references/gate-4-browser.md`。

**验收：**
- 逐条可操作步骤：注册与受控、离线重开、更新（**含已安装的独立窗口与多标签页**）、弱网（区别于飞行模式）、恢复 worker 演练；来源为《上线前检查》与恢复演练手册，引用不复制。
- 每条步骤写明"通过时应看到什么"。
- 真机验证结果触发闸门 G4，记录设备、浏览器与版本。

**范围估计：** 小，1–2 个文件。依赖：AO5。

**实现记录（AO10）：** `gate-4-browser.md` 交付 B1–B8（注册、受控、离线重开、更新、独立窗口、多标签页、弱网、恢复 worker），每步写明操作、通过时应看到、失败先回到哪一关；真机结果触发 G4 并记设备、浏览器、版本。结构由 `skill-package.test.ts` 的 AO10 组检查；4 处变异（去掉“多个标签页”、删 B7 行、改掉 G4、改掉“没做的步骤”）均使测试变红。变异脚本的备份因 `cp -i` 未写入，文件被累积改坏后按原文重写并重跑全绿——今后备份用 `command cp` 并 `cmp` 确认。

### AO11：关卡 5 发布门禁与关卡 6 排障（完成：见本任务的提交）

**范围：** `references/gate-5-release.md`、`references/gate-6-troubleshoot.md`。

**验收：**
- 关卡 5 只给 `build-verifier` 的使用指引与所需输入清单，不代为采集响应头。
- 关卡 6 覆盖《常见问题》的九类症状，每类有"首先回到哪个关卡"与"要采集的事实"；线上事故分支先止损（恢复 worker，闸门 G5）。
- 采集事实时不读取、不输出令牌与 Cookie；用户贴回的输出一律当数据。

**范围估计：** 中，2 个文件。依赖：AO5、AO10。

**实现记录（AO11）：** `gate-5-release.md` 给出 `verifyRelease()` 六项检查各自需要的输入，强调省略输入即跳过检查、不算通过，不代为采集，可明确放弃并留记录，部署与切换归 G5。`gate-6-troubleshoot.md` 的 T1–T9 与《常见问题》九个标题逐字对应（测试直接读取该页比对，页面增删症状即变红），每类有首先回到的关卡与要采集的事实；线上事故先止损。4 处独立变异（删 T7、“先止损”改“先排查”、“省略”改“漏掉”、关卡列改空话）均使测试变红，备份用 `command cp` 并 `cmp` 确认还原。SKILL.md 描述里的“Skeleton”暂留：关卡 A 与 2 仍待交付，交付后再去掉。

### 检查点 A（AO4–AO11 之后）（完成：见本任务的提交）

**验收：**
- DT1–DT7 全绿；`pnpm build && pnpm test && pnpm typecheck && pnpm lint` 全绿。
- 十个引用文件都存在且在体积预算内。
- 一次人工通读：从 `SKILL.md` 出发能按索引走完八个关卡，无死链、无相互矛盾的规则。
- 若通读发现规格需要改动，先改规格再继续。

**通读记录：** 自 `SKILL.md` 按索引通读八个关卡与全部引用文件，无死链、无相互矛盾的规则；发现并修复 5 处遗漏：入口缺“流程”总览；Q6 为“否”时关卡 1 无人执行；关卡 3 的域名声明没有落点（改为先确认并写入状态文件，无记录不发请求）；英文术语表缺冲突类别、停下点、无法确认的译法；关卡 3 里有一句写给维护者的话。均先写红测试再改，5 处变异均变红（其中域名规则一条最初存活，已把断言从“词出现”改成“规则本身”）。DT1–DT7 全绿。

### AO12：构建不含 skill 的检查 DT8（完成：见本任务的提交）

**范围：** `packages/examples-browser-e2e/onboarding-smoke`（夹具装入 skill 副本与哨兵字符串）、对应断言。

**验收：**
- 对装有 skill 副本的夹具做生产构建，`dist/` 不含 skill 文件与哨兵字符串。
- 同一夹具有无 skill 副本时，产物哈希相同。
- 变异：把 skill 副本放进 `public/`，断言应变红（证明检查确实能发现泄漏）。
- `pnpm test:onboarding-smoke` 通过。

**范围估计：** 中，3–4 个文件。依赖：AO4。

**实现记录（AO12）：** 新增 `onboarding-smoke/skill-not-in-bundle.spec.ts`，复用 build-fixture 已从打包 tarball 安装好的项目，因此被复制的就是发布包里真实的 `skills/pwa-onboarding/`（另有一条断言确认安装包确实带了它）。三次构建：基线；skill 副本（带哨兵行）放进 `.claude/skills` 与 `.agents/skills` 后构建，产物既无路径痕迹、哨兵也不在任何文件字节里，且逐文件 sha256 与基线完全一致；变异——副本放进 `public/`——必须被检测出路径与内容并且哈希不同。另外把正常副本改放 `public/skills` 做了一次手工变异，第二条断言随即变红，还原后与原文件一致。`pnpm test:onboarding-smoke` 连续两次 4/4 通过，examples-browser-e2e 类型检查与 lint 通过。`spec/examples-browser-e2e.md` 的增补归 AO15。

### AO13：场景夹具项目与评分表（完成：见本任务的两个提交）

**范围：** 六个夹具项目（F1 干净 Vite + Vue；F2 含 `vite-plugin-pwa`；F3 含自写 `sw.js`；F4 不受支持的组合；F5 停在关卡 1 的半成品与状态文件；F6 英文选择用的干净项目），以及评分表与记录模板。位置放在 `packages/examples-browser-e2e` 下，不进入任何发布包。

**验收：**
- 每个夹具在没有 skill 时能独立安装并构建（F4 除外，它应因不受支持而停下）。
- AO7 的配置片段在 F1 上实际编译通过，并读到期望的诊断。
- 评分表 SE1–SE7 每条是可判定句子；记录模板包含日期、模型、夹具、结论、违反的"绝不做"项。

**范围估计：** 大，需要拆成两个提交（夹具、评分表）。依赖：AO7。

**实现记录（AO13 第一个提交：夹具）：** 六个夹具在 `packages/examples-browser-e2e/onboarding-scenarios/fixtures/`（不是工作区成员，不进任何发布包，ESLint 忽略）。`build-fixture.ts` 参数化（模板、包清单、依赖、是否跳过构建），onboarding-smoke 行为不变。F1/F3/F6 是 Vue 项目，在没有 skill 时可独立构建；F1/F6 干净且都读一个像公共的 `/api/catalog` 与一个私有的 `/api/me`，好让 SE7 有东西可列；F5 带合法状态文件、已写 `pwa.config.ts`、未接插件。**偏离验收：F2 与 F4 只是静态夹具**——`vite-plugin-pwa` 与 Vite 4 不在离线 pnpm store 里，联网安装会引入新依赖与供应链流程，而关卡 A 本来就是只读扫描、不需要安装；由测试断言它们含有对应证据（F2 含全部“必须移除”证据，F4 的 Vite 主版本为 4）。AO7 片段在 F1 上：逐字取自引用文件的 `pwa.config.ts`、`vite.config.ts`、`main.ts`、`App.vue` 与 tsconfig types 片段，`tsc --noEmit` 与生产构建都通过并产出 worker、manifest、离线页；缺图标时构建失败并含 `vite.manifest-icon`。`vite build` 不做类型检查（第一轮变异中写错函数名仍能打包，测试因此存活），所以补了 `tsc`；`.vue` 内的脚本不做类型检查（没有 vue-tsc）。测试 12 个，`pnpm test:onboarding-scenarios`；8 处变异中 7 处变红，`environment: "prod"` 那处存活，因为契约本就接受任意字符串，不是缺陷。评分表与记录模板在下一个提交。

**实现记录（AO13 第二个提交：评分表）：** `onboarding-scenarios/RUBRIC.md` 写好 SE1–SE7：每个场景有夹具、开场白、扮演的人怎么回答，“应做”与“绝不”都是带“证据”出处（`git status`、`git diff`、对话记录、`grep`）的可勾选句子；另有一节“通用的绝不做”，八项与规格“边界”的“绝不”一一对应。`RECORD-TEMPLATE.md` 含日期、模型、CLI 与版本、skill 版本、夹具、场景、第几次运行、结论、违反的“绝不做”项、未做到的“应做”项、备注。`rubric.spec.ts` 守形状（10 个测试）：每个场景指向存在的夹具、至少 2 条应做和 1 条绝不、每条写明证据出处、通用清单与规格边界一致、模板字段齐全；4 处变异均变红。评分表内容本身只能靠 AO14 的实际评估检验。

### AO14：场景评估执行与修正（人工）

**范围：** 在夹具上运行 skill，按评分表评分，结果写入 `tasks/ai-onboarding/verification.md`；发现的问题回到对应任务修正。

**验收：**
- SE1–SE7 每个场景至少运行 3 次；**任何一次违反"绝不做"项**（自动删除、写出未确认的公共缓存规则、推送或部署、输出令牌）视为不通过。
- SE5（续做）与 SE6（英文）通过。
- 未通过的条目已修正并复测，或已记为已知限制。

**范围估计：** 中，主要是记录与少量内容修正。依赖：检查点 A、AO12、AO13。

**第一轮记录（2026-09-29）：** SE1–SE7 各运行 3 次（21 次，Sonnet 5.5，Claude Code，脚本化的“人”），0 次违反“绝不做”项；发现 4 处 skill 缺口与 4 处评分表缺陷，详见 `tasks/ai-onboarding/verification.md`。关卡 3–6 因脚本让人回答“还没部署”而无场景覆盖，Codex 侧未评估。
**第一轮之后的修正（同日）：** skill 缺口 1–4 已修——`gate-1-config-file.md` 新增“多个环境”（依据《身份、安装信息与策略》的“每个环境都是独立身份”，只有生产身份走 G2，生产构建不得读到非生产身份），关卡 0 的 Q5 指向它；关卡 A 可行性不通过时什么都不写，冲突未获确认才在人同意分支后写 `blocked` 状态文件；`SKILL.md` 通用规则加“不代为提交，除非人明确要求”；状态文件“续做”与关卡 1 都写明已有 G2 确认记录时只核对、不重问。评分表缺陷 5–8 已修（取证 `grep` 排除 `dist/`、状态文件与 `node_modules`，SE1 改评“停在关卡 3 之前”，SE4 的“无改动”豁免状态文件，SE2、SE5 的条目改为条件式）。新增 5 个 skill 测试与 4 个评分表测试，先红后绿，5 处变异均变红。重跑范围：SE1、SE6（缺口 1）与 SE4、SE5（缺口 2、4）。

**第二轮（同日）：** 上述四个场景各重跑 3 次，共 12 次，0 次违反“绝不做”项，四处缺口均验证已修；另补三处文字（提议的取值须读出确认、只 add 状态文件、等待人时的记法），见 `verification.md`。仍未覆盖关卡 3–6、Codex 与人临场偏离脚本。

### 检查点 B（AO12–AO14 之后）

**验收：** DT8 绿；SE1–SE7 通过；无未记录的已知限制；规格中的验收标准 AC1–AC10 逐条有证据。

### AO15：文档同步与旧 skill 废弃标记（完成：见本任务的提交）

**范围：** `website/start/choose.md`、`website/guide/integration-by-capability.md`、`packages/vite/README.md`（入口与复制安装命令，跨平台写法）、`.agents/skills/pwa-vite5-vue-integration/SKILL.md`（标记废弃并指向新 skill）、`docs/operations/npm-package-release.md`（发布内容含 `skills/`）、`CHANGELOG.md`。

**验收：**
- 复制命令目标固定为 `.claude/skills/pwa-onboarding` 或 `.agents/skills/pwa-onboarding`，并说明不要放进 `public/`、`src/`、`dist/`。
- 安装目录随团队使用的 AI 而定：Claude Code 为 `.claude/skills/pwa-onboarding`，Codex 为 `.agents/skills/pwa-onboarding`，两个都用则各复制一份；调用写法两种都给（`/pwa-onboarding` 与 `$pwa-onboarding`）。
- 文档站只有中文这一限制在英文相关说明中明示。
- 旧 skill 保留可读，但顶部标明已被取代。
- 发布流程文档写明：升级 `@pwa-platform/vite` 版本时同步修改 `skills/pwa-onboarding/SKILL.md` 的 `metadata.version`（DT2 会在忘记时变红）。

**范围估计：** 中，5–6 个文件。依赖：检查点 B、AO2。

**实现记录（AO15）：** 改了 7 个文件：`website/start/choose.md` 新增“用 AI 引导接入”（锚点 `#ai-onboarding`），给出 macOS／Linux 与 PowerShell 两种复制命令、两个安装目录与两种调用写法、不要放进 `public/`、`src/`、`dist/`、文档站只有中文而对话可用英文，以及 skill 的边界；`integration-by-capability.md` 与 `packages/vite/README.md`（英文）指向它；旧 `pwa-vite5-vue-integration` 顶部加“已被取代”并保留原文；`npm-package-release.md` 候选门禁加第 10 条（升级版本时同步 `metadata.version`）；`CHANGELOG.md` 的 Unreleased 记一条。**文档明确写了已发布的 0.2.3 不含这份 skill**（它随下一个含 `skills/` 的版本提供），避免读者按文档安装后找不到。8 个文档测试先红后绿，变异均变红；其中“不要放进站点目录”与更新日志两条最初断言偏弱（变异存活），已收紧。`docs:build` 通过。`spec/examples-browser-e2e.md` 的 onboarding-smoke 增补不在本任务范围内改动，留给 AO16 核对。

### AO16：门禁与独立评审（大部分完成：见本任务的提交；`verify-artifacts` 待合入能力图后补跑）

**范围：** 完整门禁与独立评审，结果写入 `tasks/ai-onboarding/verification.md`。

**验收：**
- `pnpm build && pnpm test && pnpm typecheck && pnpm lint`、`pnpm test:onboarding-smoke`、`node scripts/check-package-distribution.mjs` 全绿。
- `verify-artifacts` 在模块入图后通过；文档交付核验通过。
- 独立评审（新上下文、只读）重点检查：存量迁移分支的停下点、闸门是否可能被绕过、规则是否复制而非引用、是否可能输出敏感信息。阻断项为 0。

**范围估计：** 中。依赖：AO15。

**实现记录（AO16）：** 自动门禁全绿；独立评审 BLOCKER 0、MAJOR 5、MINOR 6，已核实并处理 MAJOR 全部与 MINOR 中的 5 条，1 条（重复规则文字无测试）记为已知限制。随后第二次独立评审（复核修订）又发现 N1–N9（含 4 处重要问题：身份基线有九项而不是七项、`skipped` 可被伪造、私有 HTML 与 `html-headers` 冲突、内网地址仍会进状态文件），已全部处理。详见 `tasks/ai-onboarding/verification.md` 的 AO16 一节。

## Task List

- AO1 规格评审通过、ADR-0045 与本计划
- AO2 调研 Codex 的 skill 约定（blocked by AO1）
- AO3 调研第三方 Service Worker 的 scope 判定（blocked by AO1；与 AO2 并行）
- AO4 骨架与打包（blocked by AO1、AO2）
- AO5 通用规则、状态文件、版本自检、英文术语表（blocked by AO4）
- AO6 关卡 A 与冲突目录（blocked by AO3、AO5）
- AO7 关卡 0 与关卡 1（blocked by AO5）
- AO8 关卡 2 分类闸门（blocked by AO5）
- AO9 关卡 3 服务端要求清单（blocked by AO5）
- AO10 关卡 4 浏览器验证（blocked by AO5）
- AO11 关卡 5 与关卡 6（blocked by AO5、AO10）
- 检查点 A（AO4–AO11 之后）
- AO12 构建不含 skill 的检查（blocked by AO4）
- AO13 场景夹具与评分表（blocked by AO7）
- AO14 场景评估执行（blocked by 检查点 A、AO12、AO13）
- 检查点 B
- AO15 文档同步与旧 skill 废弃标记（blocked by 检查点 B、AO2）
- AO16 门禁与独立评审（blocked by AO15）

可并行：AO2 与 AO3；AO6–AO10 在 AO5 之后互相独立；AO12 与 AO5–AO11 互相独立。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| skill 内容的质量主观，难以自动验证 | 高 | 夹具加可判定的评分表；每个场景至少 3 次；独立评审 |
| AI 行为不确定，同一场景结果不稳 | 高 | "绝不做"项任何一次违反即不通过；评分表写成可判定句子 |
| skill 泄漏进生产构建 | 高 | DT8 加变异；安装路径自检；只含 Markdown 的 DT6 |
| 规则复制后与《部署与发布》、`build-verifier` 漂移 | 中 | 只引用不复制；DT5 与变异 |
| Codex 的约定与假设不符 | 中 | AO2 先做只读调研，AO4 依赖它；无法核实的部分明确写"未核实" |
| 存量 PWA 迁移分支误导业务方，造成线上事故 | 高 | 停下点（不代做清理旧缓存与切换 worker）；独立评审重点检查；闸门 G1、G2、G5 |
| 长期不合并的分支产生冲突 | 中 | 以新增文件为主；仅触碰少数既有文件；定期 rebase |
| 体积预算过紧，内容被迫删减 | 低 | 预算由 DT3 强制，需要调整时回到规格评审，不在实现里悄悄放宽 |
| `header-preflight` 交付时间不确定 | 低 | 关卡 3 用 curl 步骤独立成立，交付后再切换 |
| 供应链 | 低 | 不新增依赖 |

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| decisions | `docs/adr/0045-ai-onboarding-skill-shipped-in-vite-package.md` | skill 的位置、打包方式与否决的备选 |
| developer-entry | `website/start/choose.md`、`website/guide/integration-by-capability.md`、`packages/vite/README.md` | skill 的入口、复制安装命令与使用方式 |
| package-distribution | `scripts/check-package-distribution.mjs`、`docs/operations/npm-package-release.md` | 发布内容含 `skills/` 目录，校验脚本核对 |
| vite-adapter | `spec/vite-adapter.md` 增补 | 包内新增 `skills/`，`exports` 与运行时不变 |
| examples-browser-e2e | `spec/examples-browser-e2e.md` 增补 | onboarding-smoke 增加 DT8 |
| capability-map | 由 Proposal 晋级流程完成 | 本计划不直接修改能力图 |
