# Capability Map: PWA Platform

> Status: **approved — 2026-09-15. Module Specs, plans, and GitHub Issue projection may begin.**

## 目标

建立一个独立、框架无关的 PWA 基础设施平台：业务项目通过声明式策略获得安装、可靠离线壳、受控更新和可审计缓存；平台统一承担 Service Worker、Workbox、构建产物与安全默认值。

首期面向 Vue 3.4+ 与 React 19.2+ 的 Vite 项目。Nuxt、TanStack Start、同源多 PWA、Push、离线写入与访问入口灾备是依赖首期契约的后续模块，不进入 v1 的实现承诺。

## 模块

| Module id | Responsibility | Depends on |
|---|---|---|
| contracts-foundation | 定义并验证 PwaIdentity、PwaPolicy、PwaPlan 与生命周期事件的稳定序列化契约。 | — |
| policy-compiler | 归一化配置、合并平台安全基线、定义规则优先级并将 Identity、Install 与 Policy 编译为 PwaPlan。 | contracts-foundation |
| platform-governance | 固化浏览器矩阵、发布回滚、恢复演练、供应链、事故 Runbook 与 V1 验收基线。 | contracts-foundation |
| browser-test-harness | 提供不依赖 UI 框架的最小页面、worker fixture 与真实浏览器断言能力，供运行时模块在交付时验证。 | contracts-foundation |
| workbox-engine | 封装 Workbox InjectManifest 并实现 Service Worker 引擎端口，不将原始 Workbox 配置暴露为业务 API。 | contracts-foundation |
| sw-runtime | 基于编译后的 Plan 与引擎端口执行安装、激活、静态预缓存、离线降级、受控清理和恢复 worker 产物；运行时缓存留待后续能力。 | policy-compiler, workbox-engine, browser-test-harness |
| client-runtime | 管理注册、安装引导、更新提示、状态事件与登出清理命令，并以浏览器 harness 验证页面与 worker 协议。 | contracts-foundation, browser-test-harness, sw-runtime |
| build-verifier | 校验身份、策略、构建产物和部署契约，生成可审计报告。 | contracts-foundation |
| vite-adapter | 将 Vite 构建输出与 PwaPlan 编译、Worker 注入、产物验证连接起来。 | client-runtime, build-verifier, workbox-engine |
| vue-react-adapters | 提供 Vue 3 与 React 19 的薄 facade 与状态绑定。 | vite-adapter |
| examples-browser-e2e | 提供 Vue/React 示例和真实浏览器的安装、离线、更新、登出验证矩阵。 | vue-react-adapters |
| ssr-adapters | 支持 Nuxt 4 的 SSR 路由分类、Nitro 产物与客户端注册；TanStack Start 未通过可行性门槛（2026-09-17），推迟到其 GA 且生产托管路径稳定后另行评估。 | vite-adapter, examples-browser-e2e |
| shared-origin-topology | 为固定根路径与子路径 PWA 提供身份登记、scope 排除和发布顺序校验。 | policy-compiler, build-verifier |
| push-module | 提供可选订阅、通知展示、点击导航与后端 SDK 契约。 | client-runtime, sw-runtime |
| offline-write-extension | 提供显式、会话绑定的受限队列；业务仍负责幂等、授权和冲突解决。 | contracts-foundation, policy-compiler, sw-runtime, client-runtime |
| pwa-entry-resilience | 在不突破 Origin 隔离的前提下，提供已签名恢复入口清单、由 Vite 发布的恢复引导、用户确认的跨 Origin 迁移、安全路径续接和恢复演练验证。 | contracts-foundation, policy-compiler, platform-governance, browser-test-harness, sw-runtime, client-runtime, build-verifier, vite-adapter |
| release-gate-contract | 为 `build-verifier` 定义纯函数的必需检查覆盖判定，防止调用方仅凭部分检查或空报告放行。 | build-verifier |
| package-distribution | 将 Vite/Vue/React 首批依赖闭包配置为可审计的 npm 预发布包；不执行实际发布或替代业务生产部署门禁。 | platform-governance, vite-adapter, vue-react-adapters, examples-browser-e2e |
| release-orchestration-protocol | 定义外部发布系统采集事实、串行保存发布记录、更新身份基线与记录人工例外的协议；不在本仓库实现带凭据的部署器。 | release-gate-contract, platform-governance |
| browser-release-evidence | 定义生产发布所需的桌面 N/N-1、Android N/N-1、原生安装及恢复演练证据记录。 | browser-test-harness, platform-governance |
| cloudflare-test-deployment | 为 React/Vue 静态示例和 Nuxt SSR 候选定义按宿主隔离的 Cloudflare 测试部署、目标登记、身份与资产保留及桌面现场证据；不替代 V1 发布门禁。 | examples-browser-e2e, ssr-adapters, build-verifier, browser-release-evidence |
| public-read-cache | 以 PwaPolicy v3 显式开启同源公共读取的运行时缓存：响应准入、配额与时效、激活/登出/恢复清理，以及页面可感知的缓存来源信号；私有与会话数据仍一律拒绝。 | contracts-foundation, policy-compiler, browser-test-harness, workbox-engine, sw-runtime, client-runtime, vite-adapter, ssr-adapters, offline-write-extension |
| network-timeout | 以 `PwaPolicy` 可选的 `networkTimeoutSeconds` 显式开启网络超时：导航超时后使用既有离线回退，network-first 运行时缓存超时后使用缓存并以 `network-timeout` 通知页面；未写时行为与产物不变。 | contracts-foundation, policy-compiler, workbox-engine, sw-runtime, client-runtime, public-read-cache |

Build order: contracts-foundation → policy-compiler, platform-governance, browser-test-harness → workbox-engine → sw-runtime → client-runtime, build-verifier → vite-adapter → vue-react-adapters → examples-browser-e2e → ssr-adapters, shared-origin-topology, push-module, offline-write-extension, pwa-entry-resilience, release-gate-contract, browser-release-evidence → release-orchestration-protocol, package-distribution, cloudflare-test-deployment, public-read-cache → network-timeout

---

## 评审记录

- [x] 模块边界确认（2026-09-15 架构复审后修订）
- [x] 依赖方向单向无环
- [x] module id 已定稿（新增 `browser-test-harness`）
- [x] 构建顺序符合依赖拓扑

评审人：项目所有者
日期：2026-09-15

### 2026-09-17 修订草案：新增 `pwa-entry-resilience`（已评审通过）

来源：[spec/proposals/pwa-entry-resilience.md](proposals/pwa-entry-resilience.md)，基线已按当前能力图重算。

- [x] 模块边界确认：只做 Origin 隔离之内的入口引导，不跨 Origin 延续 Service Worker、会话、缓存或安装身份；恢复界面为平台发布的独立页，不经框架绑定
- [x] 依赖方向单向无环：8 个依赖均为已交付模块
- [x] 构建位置：并入最后一组并行模块，属于 v1 之后的可选能力（参照 ADR-0006），不进入 V1 验收矩阵
- [x] 目标段同步列入"访问入口灾备"（目标指纹随之变化，Epic 正文待 tracker 可用后刷新）

评审人：项目所有者
日期：2026-09-17

### 2026-09-19 修订：发布就绪度与部署编排（已接受）

- [x] 模块边界确认：纯校验留在平台包；网络、凭据、部署状态与生产写入留给外部发布系统；真实设备证据不伪造成自动化通过
- [x] 依赖方向单向无环：`release-gate-contract` 与 `browser-release-evidence` 可并行，`release-orchestration-protocol` 在二者之后
- [x] 不把外部发布器新增为平台运行时包；本仓库只交付其协议和验证入口

评审人：项目所有者
日期：2026-09-19

### 2026-09-20 修订：Cloudflare 宿主测试部署规划（已接受）

- [x] 模块边界确认：这是测试部署和证据模块，不新增公开运行时包，也不降低 V1 浏览器门禁
- [x] 依赖方向单向无环：复用示例、Nuxt 候选、产物校验和浏览器证据模块
- [x] 构建位置：在宿主示例和现有发布证据契约之后；Nuxt Workers 另设可行性门禁，Next/Start 延后

评审人：项目所有者（部署规划讨论后要求继续）
日期：2026-09-20

### 2026-09-24 修订：新增 `public-read-cache`（已评审通过）

来源：路线图 v1.1 cache；规格草案见 [spec/public-read-cache.md](public-read-cache.md)。

- [x] 模块边界确认：只做 v3 显式开启的同源公共 `GET` 运行时缓存；v1/v2 策略中已声明的运行时策略继续透传，不静默生效；私有、会话、写入、流式与未分类请求的拒绝语义不变
- [x] 依赖方向单向无环：9 个依赖均为已交付模块；复用 `offline-write-extension` 的 logout 清理握手，并要求 `ssr-adapters` 对启用的 v3 明确报错
- [x] 构建位置：并入最后一组并行模块；属于 v1.1，不进入 V1 验收矩阵
- [x] 缓存命名空间行为变更（新增运行时缓存 kind 与激活期清理）须以 ADR-0035 记录后方可实现

评审人：项目所有者
日期：2026-09-24

### 2026-09-24 修订：新增 `network-timeout`（已评审通过）

来源：2026-09-24 平台完成度审查的 P2 项；规格草案见 [spec/network-timeout.md](network-timeout.md)。

- [x] 模块边界确认：只在业务显式写了超时秒数时生效，导向既有回退与运行时缓存，不新增缓存写入；页面直接发出的请求不受影响
- [x] 依赖方向单向无环：6 个依赖均为已交付模块；复用 public-read-cache 的运行时缓存引擎与 `served-from-cache` 信号
- [x] 构建位置：在 public-read-cache 之后；可选能力，不进入 V1 验收矩阵
- [x] 导航判断与事件取值的变更须以 ADR-0038 记录后方可实现

评审人：项目所有者
日期：2026-09-24
