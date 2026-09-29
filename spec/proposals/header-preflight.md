# Proposal: 面向业务方域名的响应头预检命令行
<!-- spec-guard-proposal:v2 id=header-preflight revision=sha256:a0faa3f33711dd909e4dcdcba94dcf182215ca2286d87cb557b304a8a4d61234 -->

## Summary

新增一个独立治理的能力 `header-preflight`：由业务方在本机运行的命令行，只读地请求**自己声明的域名**，判断已部署地址的响应头（即 nginx / CDN 的实际效果）是否满足 PWA Platform 的服务端要求，并逐项报告"通过 / 不通过 / 警告 / 无法判定"。它用于接入前预检想接入的域名，也用于接入后对最终部署地址做精确核对。

它必须独立于现有模块，原因有三点。第一，`build-verifier` 被设计为零网络（ADR-0032 明确采集由调用方负责），所以采集器不能并入它，需要一个新的包边界决定。第二，它会向业务方的线上域名发请求，涉及请求预算、跨域重定向、Cookie 脱敏和授权边界，这些是平台需要规定的安全契约。第三，它是新的公开接口。它与 `ai-onboarding` 互补：后者的"服务端核对"关卡在本模块交付前使用文档中的 curl 步骤，交付后改为运行本命令。

### 两种模式

从外部只能看到响应头的效果，看不到服务器配置本身，所以两种模式判定的范围不同：

| 模式 | 输入 | 能可靠判定 | 只能推断 | 判定不了 |
| --- | --- | --- | --- | --- |
| URL 模式（接入前预检） | 入口地址；可选 `--sw`、`--api` | 入口 HTML 的缓存头、重定向、HTTPS、MIME；已有指纹资源的缓存头；静态资源是否带 Set-Cookie；Vary | 缺失路径是否返回 404（探一个不存在的路径）；CDN 是否缓存了 HTML（连续两次请求看边缘命中迹象）；使用了哪家 CDN | sw.js 与 manifest 在**尚未接入时根本不存在**，只能标"无法判定"；旧指纹资源是否保留；私有接口是否真的私有 |
| 计划模式（接入后核对） | 构建产出的计划加已部署地址 | 计划中 worker、manifest、公开 HTML、离线页、指纹资源的精确路径逐项核对，复用 `build-verifier` 的 `response-headers` 与 `html-headers` | — | 同上 |

不变的原则：**无法判定不算通过**。这与 `build-verifier` 现有的原则一致（对没有观察到的路径报告而不是跳过）。

### 与仓库现有做法的关系

仓库内已有内部采集器 `packages/examples-browser-e2e/release-verifier`，为 Cloudflare 测试站服务，已经做到：所有请求有超时、跨域重定向不跟随、不使用 HEAD、响应体只哈希不保留、worker / manifest / 指纹资源只认直接 200（经过重定向一律记为"未观察到"）。本 Proposal 把它作为**参考实现**，不把它当作依赖：它属于仍在进行的 `cloudflare-test-deployment`，其形态也是为测试站定制的。

预检会向被检测站点发出少量对固定路径的请求，其中包含一个不存在的资源路径探针，会在对方访问日志里留下少量 404 记录。

### 假设

项目所有者明确提出的（2026-09-29）：

1. 需要一个检测工具：给它一个公共域名，它判断当前 nginx / CDN 的效果满足哪些要求、不满足哪些。
2. 用途包括对想接入的域名做接入前预检。
3. 不要求业务方提供其服务器配置。

按推荐采纳、尚待评审确认的：

4. 形态是本地命令行，不做在线检测服务或网页（在线服务替用户请求任意地址会引入 SSRF 与滥用风险）。
5. 两种模式：URL 模式（部分判定，缺失项标"无法判定"）与计划模式（精确）。
6. 只读：只用 GET；每次运行有请求数上限与超时；不保存 Cookie；Set-Cookie 与 Authorization 的值一律不输出；跨域重定向只报告不跟随。
7. 只对业务方声明属于自己的域名运行，输出中写明被检测的源与观察时间。
8. 规则以 `build-verifier` 为唯一来源；采集器留在它之外，保持它零网络。
9. 输出每项的结论、后果与修复提示；同时提供人读报告、机器读 JSON 与退出码。
10. 时变信号（例如 Set-Cookie 在不同请求之间可能出现或消失）只报告"本次观察到什么"，可重复采样，不当作稳定事实。

评审时需要决定的开放问题：

- **发布形态**：新增公开包，还是并入现有包的命令？目前十个公开包里没有任何一个带命令行入口，唯一带 bin 的 `@pwa-platform/release-tools` 是私有包。
- **计划从哪来**：由 Vite 插件在构建时落盘，还是由命令行编译业务的 `pwa.config`？前者需要改动插件的公开行为，后者需要加载业务配置。

## Integration intent

| Field | Value |
| --- | --- |
| Problem | 业务方在接入前后都需要知道自己的域名（nginx / CDN）能否满足 PWA 的响应头要求，目前只能人工 curl；从外部只能看到效果而看不到服务器配置，且 sw.js 与 manifest 在接入前根本不存在；build-verifier 规则完备但零网络，缺少面向业务方的采集器与报告 |
| In scope | 本地命令行；URL 模式（入口 HTML、manifest、sw.js、指纹资源、缺失路径探针、Set-Cookie、Vary、CDN 边缘缓存迹象，可选公共接口）；计划模式（按计划的精确路径逐项核对，复用 build-verifier 的 response-headers 与 html-headers）；每项通过、不通过、警告、无法判定，附后果与修复提示；人读报告、JSON 与退出码；请求预算与超时；对时变信号标注观察时间并支持重复采样 |
| Out of scope | 在线检测服务或网页；生成 nginx / CDN 配置；读取或上传业务方的服务器配置；对未声明为业务方自己的域名运行；写入或修改被检测站点；公共或私有接口的内容分类判定（属业务判断）；弱网与浏览器行为验证；把采集器并入 build-verifier |
| Safety boundaries | 只用 GET；每次运行有请求数上限与超时；不保存 Cookie，Set-Cookie 与 Authorization 的值一律不输出；跨域重定向只报告不跟随；响应体只用于发现资源路径与计算摘要，不保留不输出；只对用户声明属于自己的域名运行；只探固定的少量路径，不做端口扫描或路径爆破；不提供服务端形态 |
| Initial dependency assumptions | 规则以 build-verifier 为唯一来源；采集器留在其外以保持 build-verifier 零网络；内部采集器 release-verifier 的做法作为参考实现而不是依赖；计划来源与发布形态在规格与评审阶段决定；发布沿用 package-distribution 的契约 |
| Acceptance intent | 对已知合规的站点 URL 模式全部通过；对已知不合规的夹具服务器（缺 no-cache、sw.js 被长缓存、缺失资源返回 200、跨域跳转、错误 MIME）逐项报出不通过且后果正确；接入前 sw.js 与 manifest 不存在时标无法判定而非通过；跨域重定向不被跟随；请求数不超过预算；任何输出都不含 Cookie 或令牌值；退出码与结论一致；计划模式与 build-verifier 对同一组观测给出相同结论 |

## Capability map baseline

| Field | Value |
| --- | --- |
| Remote | origin |
| Default branch | main |
| Commit | 6aa75189ef5c59dbae6d05588aba05d5e9d68014 |
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
| Module id | header-preflight |
| Responsibility | 面向业务方自己域名的本地预检命令行：只读采集已部署地址的响应头，复用 build-verifier 的规则给出通过、不通过、警告与无法判定的报告；接入前 URL 模式，接入后计划模式；采集器不并入 build-verifier。 |
| Depends on | build-verifier, vite-adapter, package-distribution |
| Build-order anchor | end |

## Tracker contract

| Field | Value |
| --- | --- |
| Proposal id | header-preflight |
| Identity label | proposal |
| Stage label namespace | proposal-stage: |
