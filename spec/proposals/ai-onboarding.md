# Proposal: 随包发布的 AI 接入 skill
<!-- spec-guard-proposal:v2 id=ai-onboarding revision=sha256:818f2eee6a8a70d6a1e114aa0effa150fd2f6d6fe07fe49ff085b79af6be285b -->

## Summary

新增一个独立治理的能力：把"如何把业务应用接入 PWA Platform"做成随 npm 包发布、与已安装版本匹配的 AI skill，引导业务方（多数由 AI 编写代码）按功能逐步接入。

它必须独立于现有模块，原因有三点。第一，它把文件加入公开 npm 包，改变的是公开发布物的契约，而不是内部实现。第二，仓库里已有的 `.agents/skills/pwa-vite5-vue-integration` 只覆盖 Vite 5 + Vue 3.4 这一种宿主，放在仓库内、没有随包发布，也没有服务端响应头步骤和公共缓存的人工确认环节。第三，AI 替业务方判断"哪个接口是公共的"有真实的数据泄漏风险，需要一条由平台规定的、不可省略的人工确认闸门。

本 Proposal 只覆盖 skill 与其配套说明。响应头配置的生成器和线上核对命令是依赖计划推导路径的代码，属于新的公开接口，另行提出 Proposal，不在此范围。

### 待项目所有者确认的假设

以下五条由项目所有者于 2026-09-29 以"按推荐继续"整体采纳，尚未逐条确认，可以修订：

1. 同一份 `SKILL.md` 同时服务 Claude Code 与 Codex，安装时分别复制到对应的 skill 目录。
2. 首批只支持 Vite + Vue / React；Nuxt 不在范围，并在 skill 中明确说明。
3. 默认不开运行时缓存；业务方明确提出才进入公共读取缓存分支。
4. 服务端部分先只提供配置样例与 `curl` 核对步骤，不做生成器。
5. skill 放进 npm 包随包发布，并接受由此产生的公开契约变化；安装为业务方显式运行的命令，不使用 postinstall。

## Integration intent

| Field | Value |
| --- | --- |
| Problem | 业务方由 AI 接入 PWA 时缺少与所装版本匹配的、按功能逐步的引导；现有 skill 只覆盖单一宿主、未随包发布，缺少服务端响应头步骤与公共缓存的人工确认，AI 可能把私有接口误判为公共接口而造成数据被缓存 |
| In scope | 随包发布的 SKILL.md 及其引用文件；采访式流程（能力选择、部署结构、接口清单）；默认不开运行时缓存；公共缓存规则的人工确认闸门；服务端响应头的配置样例与 curl 核对步骤；显式的安装命令；对不支持组合（如 Nuxt 运行时缓存）的明确说明 |
| Out of scope | 响应头配置生成器与线上核对命令；Nuxt 与其他未适配框架；替业务方编写或持有其 nginx / CDN 配置；使用 postinstall 自动安装；任何会写入业务仓库以外位置的动作 |
| Safety boundaries | 任何 public-data 或 navigation-public-dynamic 规则必须逐个接口列出并由人确认，默认一条都不写；skill 只含说明文字，不携带可执行脚本；不读取或输出令牌、Cookie 与响应体；遇到不支持的组合必须停下说明而不是硬做 |
| Initial dependency assumptions | 沿用 package-distribution 的发布契约与包文件规则；沿用 public-read-cache 的响应准入条件与 network-timeout 的超时建议；接入步骤沿用 production-readiness-documentation 按功能重组后的说明 |
| Acceptance intent | 新装包的业务项目中，AI 按 skill 能完成"只装壳"接入并通过构建；skill 在业务方未确认前不会写出任何公共缓存规则；服务端核对步骤能对最终部署地址给出逐类通过或不通过；skill 内容与已安装包版本一致 |

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
| Responsibility | 随 npm 包发布、与已安装版本匹配的 AI 接入 skill：采访式引导业务方按功能接入，默认不开运行时缓存，公共缓存规则须人工确认，含服务端响应头核对步骤；首批仅 Vite + Vue/React。 |
| Depends on | package-distribution, public-read-cache, network-timeout, production-readiness-documentation |
| Build-order anchor | end |

## Tracker contract

| Field | Value |
| --- | --- |
| Proposal id | ai-onboarding |
| Identity label | proposal |
| Stage label namespace | proposal-stage: |
