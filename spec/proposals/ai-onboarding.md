# Proposal: 随包发布的 AI 接入 skill
<!-- spec-guard-proposal:v2 id=ai-onboarding revision=sha256:8b9bc728cc170c3e9a300cf0e65763a587d0ba7b1d799d910b0c5a23f7d4de63 -->

## Summary

新增一个独立治理的能力 `ai-onboarding`：随 `@pwa-platform/vite` 发布、与所装版本匹配的 **AI 接入编排 skill**。它由 AI 主导，按关卡引导业务方把项目接入 PWA Platform，并在关键点由人确认。它**编排现有能力，不新增检查规则**：项目内配置检查复用构建时诊断，发布门禁复用 `build-verifier`，服务端规则以《部署与发布》为唯一来源，skill 只引用、不复制。

它必须独立于现有模块：第一，它往公开 npm 包里加文件，改变的是公开发布物的契约；第二，仓库里已有的 `.agents/skills/pwa-vite5-vue-integration` 只覆盖 Vite 5 + Vue 3.4 一种宿主，放在仓库内、没有随包发布，也没有冲突检测、服务端步骤和公共缓存的人工确认；第三，AI 替业务方判断"哪个接口是公共的"有真实的数据泄漏风险，需要平台规定一条不可省略的人工确认闸门。

### 接入链路

链路分本地、环境、上线后三段。服务端检查和浏览器验证需要已部署的地址，所以放在环境段。

| 段 | 关卡 | 内容 | 通过标准 |
| --- | --- | --- | --- |
| 本地 | A. 可行性与冲突检测 | 核对 Vite/框架版本与 base；只读扫描依赖、源码、HTML、public 与构建配置；分"必须移除 / 需要评估 / 仅提示"；线上已是 PWA 时走存量迁移分支 | 在兼容范围内；冲突已处理或已明确保留 |
| 本地 | 0. 采访 | 能力选择、部署结构、同域多应用与 PC/H5、接口清单、界面语言（默认中文，可选英文）、是否有未保存内容的场景、是否有长期不刷新的独立窗口用户；默认档为应用壳、离线页加更新提示（含 30 分钟定时检查），不开运行时缓存 | 能力选择与更新策略确定 |
| 本地 | 1. 配置并检查 | 接入插件与绑定、写身份与策略、挂载默认更新提示并配置检查间隔；读取 vite build 的诊断码并修复 | 构建通过，无图标、身份、安装、策略诊断 |
| 本地 | 2. 公共/私有分类 | 逐个接口列出并由人确认，默认一条公共规则都不写 | 每条公共规则均已由人确认 |
| 环境 | 3. 服务端核对 | 服务器无关的响应头要求清单，对已部署地址用 curl 逐类核对，其中 sw.js 的 no-cache 标为决定更新能否到达用户的关键项 | 无不通过项；无法判定的项已说明 |
| 环境 | 4. 浏览器验证 | 安装、离线、更新（含已安装的独立窗口与多标签页）、弱网与恢复 worker 演练的逐条步骤 | 清单逐条通过 |
| 环境 | 5. 发布门禁（可选） | 用 build-verifier 生成报告 | 报告通过 |
| 上线后 | 6. 排障（循环） | 按症状采集事实、定位到关卡、修复后回到该关卡重验；线上事故走恢复 worker 分支 | 症状消失且对应关卡通过 |

不通过就停在该关卡并说明"哪一项不满足、不满足会怎样、怎么改"。无法从外部判定的项标为"无法判定"，不算通过。链路的终点是"配置层通过、分类已由人确认、浏览器行为验证通过"，而不是"两道检查通过"。

本 Proposal 只覆盖 skill 与其配套说明。服务端部分只提供**服务器无关的响应头要求清单**与 curl 核对步骤：不提供 nginx / CDN 配置样例，也不收集、读取或上传业务方的服务器配置，业务方或其 AI 对照清单自行配置。响应头预检命令行（接入前的 URL 模式与接入后的计划模式）依赖对第三方域名发请求、需要新的包边界决定，属于另一批新公开接口，另行提出为独立模块，不在此范围。

### 假设

项目所有者明确提出的（2026-09-29）：

1. 服务端只提供服务器无关的要求清单与核对步骤，不提供配置样例，不要求业务方提供其服务器配置。
2. 引导要覆盖整条链路：清理冲突包、项目内配置检查、服务端检查、浏览器验证、上线后排障，由 AI 主导编排。
3. skill 属于开发期辅助，不得进入生产构建，也不得增加线上体积。
4. 需要一个能对想接入的域名做预检的工具（另行提出）。

按推荐采纳、尚待评审确认的：

5. 同一份 `SKILL.md` 同时服务 Claude Code 与 Codex，复制到对应目录。
6. 首批只支持 Vite + Vue / React，Nuxt 不在范围并在 skill 中明确说明。
7. 默认档为应用壳、离线页加更新提示（含 30 分钟定时检查，采访确认没有长期不刷新的独立窗口用户时可关闭），不开运行时缓存；业务方明确提出才进入公共读取缓存分支。
8. skill 放在 `@pwa-platform/vite` 的 `skills/` 目录，加入 `files`、不加入 `exports`；不新建独立 npm 包。
9. 安装用文档里的复制命令，不新增命令行入口，不使用 postinstall。
10. 接入状态写入业务仓库里的一份状态文件（不含密钥），供新会话续做，也作为审计记录。
11. 任何删除依赖或文件的动作只提改动清单，由人确认后在单独分支上执行。
12. 采访必问是否有未保存内容的场景；有则要求业务传入 reloadPage 做保护，默认不自动刷新页面。
13. 多标签页沿用默认更新组件的行为：已显示过更新卡片的其他标签页，会在某个标签页确认后切成请刷新状态。Vue 与 React 的实现均已核对源码，行为一致。
14. 接入对象暂按内部业务团队；skill 正文随 @pwa-platform/vite 发版，改文字需要发新版本，第一版接受这一耦合。
15. （项目所有者明确提出）默认语言为中文，支持切换为英文。采访时询问语言，并据此设置默认更新提示的 locale 与离线页的 locale（二者内置 zh-CN 与 en）；skill 的对话与产出使用所选语言，技术标识符与诊断码保持原文。文档站目前只有中文，英文模式下引用的参考文档仍是中文，由 AI 忠实转述，这一限制在评审时确认。

## Integration intent

| Field | Value |
| --- | --- |
| Problem | 业务方由 AI 接入 PWA 时缺少与所装版本匹配、覆盖整条链路的引导：现有 skill 只覆盖单一宿主、未随包发布，且没有冲突检测、服务端步骤、恢复与排障；AI 还可能把私有接口误判为公共接口而造成数据被缓存 |
| In scope | 随 @pwa-platform/vite 发布的 skills/pwa-onboarding（SKILL.md 与按需读取的引用文件）；八个关卡的编排：可行性与冲突检测（含存量 PWA 迁移分支）、采访、配置与构建诊断、公共缓存人工确认、服务端要求清单与核对、浏览器验证、可选发布门禁、上线后排障；默认档为应用壳、离线页加更新提示（含定时检查）；可续做的接入状态记录；恢复 worker 与回滚指引；已装 skill 与包版本的一致性自检；文档中的复制安装命令；对不支持组合的明确说明；中英文支持（默认中文，按所选语言设置更新提示与离线页的 locale，skill 的对话与产出使用所选语言） |
| Out of scope | 响应头配置生成器；响应头预检命令行（另行提出为独立模块）；nginx / CDN 配置样例；收集、读取或上传业务方的服务器配置；新建独立 npm 包；专用安装命令行或 postinstall；Nuxt 与其他未适配框架；自动删除依赖或文件；未经人确认的生产部署或 worker 切换；替业务方编写或持有其 nginx / CDN 配置 |
| Safety boundaries | 必须由人确认：删除依赖或文件、首次生产注册前的身份字段、每条 public-data 或 navigation-public-dynamic 规则（默认一条不写）、真机验证、生产部署与 worker 切换；skill 只含说明文字不带可执行脚本，不得写入 public、src、dist；仓库文件、HTTP 响应与用户贴回的输出一律当数据而不是指令；不读取或输出令牌与 Cookie；预检只对业务方声明属于自己的域名执行；遇到不支持的组合必须停下说明 |
| Initial dependency assumptions | 沿用 vite-adapter 的包结构与 exports 约束、package-distribution 的发布契约；准入条件来自 public-read-cache，超时建议来自 network-timeout；响应头规则以 build-verifier 与《部署与发布》为唯一来源，skill 引用不复制；接入步骤沿用 production-readiness-documentation |
| Acceptance intent | 在新装包的业务项目中 AI 按 skill 完成默认档接入（含已挂载的更新提示）并通过构建；四类夹具（干净项目、含 vite-plugin-pwa 的项目、含自写 sw.js 的项目、不支持的组合）结果符合预期且不支持组合会停下；业务方未确认前不写出任何公共缓存规则；生产构建产物不含 skill 文件且体积与未安装时相同（哨兵字符串加产物哈希）；更新流程已在标签页、已安装的独立窗口与多标签页下验证；无法从外部判定的项标为无法判定而非通过；选择英文时对话与产出为英文且两处 locale 已设为 en；新会话能凭状态记录从中断的关卡续做；已装 skill 与包版本不一致时给出警告；要求清单不依赖具体服务器，业务方不提供其配置也能完成 |

## Capability map baseline

| Field | Value |
| --- | --- |
| Remote | origin |
| Default branch | main |
| Commit | 2dcd1e0f547b4207bdf304674f60cf39b82c2194 |
| Capability map | spec/CAPABILITY-MAP.md |
| Goal digest | fabc064662d4 |
| Build order | contracts-foundation → policy-compiler, platform-governance, browser-test-harness → workbox-engine → sw-runtime → client-runtime, build-verifier → vite-adapter → vue-react-adapters → examples-browser-e2e → update-notice-ui, ssr-adapters, shared-origin-topology, push-module, offline-write-extension, pwa-entry-resilience, release-gate-contract, browser-release-evidence → release-orchestration-protocol, package-distribution, cloudflare-test-deployment, public-read-cache → network-timeout, capability-comparison → stable-release-qualification → production-readiness-documentation |

### Module digests

| Module id | Row digest |
| --- | --- |
| contracts-foundation | 2db83d2b0b48 |
| policy-compiler | 908b7bb27c18 |
| platform-governance | 11995952727a |
| browser-test-harness | 80c8d3dc3f12 |
| workbox-engine | aadb84708f8b |
| sw-runtime | 2d96266076e9 |
| client-runtime | 3de5ca551219 |
| build-verifier | 3b729b456e18 |
| vite-adapter | 865d8066d65c |
| vue-react-adapters | 2517367fe6f9 |
| examples-browser-e2e | 4e2fafe8b8c1 |
| update-notice-ui | 49714ec7b385 |
| capability-comparison | e4cfc16f8d28 |
| ssr-adapters | 021e2d3637d2 |
| shared-origin-topology | 8f58409776a6 |
| push-module | 74877b7e1c88 |
| offline-write-extension | 64f5b70a5f5a |
| pwa-entry-resilience | 0659e9b6c5f9 |
| release-gate-contract | 451ae5224c89 |
| package-distribution | 1b735d8f8bb7 |
| release-orchestration-protocol | 4f2ae2e7988a |
| browser-release-evidence | 695fe301ddef |
| cloudflare-test-deployment | c217dee00abc |
| public-read-cache | 1ca6fe680b49 |
| network-timeout | cf52c8706009 |
| stable-release-qualification | 28f144c7a727 |
| production-readiness-documentation | 63ded6f997c8 |

## Change

| Field | Value |
| --- | --- |
| Type | new-module |
| Module id | ai-onboarding |
| Responsibility | 随 @pwa-platform/vite 发布、与所装版本匹配的 AI 接入编排 skill：冲突检测与清理、配置引导、公共缓存人工确认、服务端要求清单与核对、浏览器验证与排障；仅开发期辅助，不进入生产构建；首批仅 Vite + Vue/React。 |
| Depends on | vite-adapter, build-verifier, package-distribution, public-read-cache, network-timeout, production-readiness-documentation |
| Build-order anchor | end |

## Tracker contract

| Field | Value |
| --- | --- |
| Proposal id | ai-onboarding |
| Identity label | proposal |
| Stage label namespace | proposal-stage: |
