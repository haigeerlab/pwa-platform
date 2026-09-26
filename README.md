# PWA Platform

面向业务开发者的 [VitePress 文档站](website/index.md)包含包选择、Vue／React 接入、能力边界、架构与上线检查。运行 <code>pnpm docs:dev</code> 本地阅读，<code>pnpm docs:build</code> 生成静态站点到 <code>website/.vitepress/dist/</code>。部署到子路径时，用 <code>PWA_DOCS_BASE=/子路径/ pnpm docs:build</code> 构建；Cloudflare Pages 的独立站点配置见[文档站构建与部署](docs/operations/documentation-site.md)。

`pwa-platform` 是一个与框架无关的 PWA 基础设施，用于构建可安装、具备韧性的 Web 应用。它统一处理 Service Worker 生命周期、安全缓存、离线降级、更新体验和构建校验；每个接入应用仍自行拥有产品策略。

仓库的模块级能力已完成交付；业务应用生产发布仍以各通道的验收门禁为准。十个公开包统一为 npm 正式版 `0.1.0`（`latest`），包括可选的入口恢复包。Nuxt、Push 与离线写入包仍是工作区私有包。各模块状态与未取得的证据见下文。

## 范围

首个版本支持基于 Vite 构建的 Vue 3.4+ 和 React 19.2+ 应用，提供安装能力、静态资源预缓存、安全的离线降级、受控更新提示和构建期策略校验。

**支持范围**：v1 先按桌面端通道发布（[ADR-0030](docs/adr/0030-desktop-release-channel.md)），保证范围是 Chrome 桌面端的当前与上一个稳定版。在首次以 `desktop+android` 通道发布之前，Chrome Android 未经验证、不做任何保证，包括基础网页体验。

默认 v1 不提供公共 API 缓存、私有数据缓存、离线写入、媒体下载或 Next.js 适配器。协调的 v2 policy 可选择启用受限、会话绑定的离线写队列；它不是 fetch 拦截，也不提供 Background Sync 或自动重放，详见 [ADR-0027](docs/adr/0027-explicit-session-bound-offline-write-queue.md)。

## 架构

应用配置会被编译为与框架无关的 `PwaPlan`：

```text
PwaIdentity + PwaPolicy + 宿主构建产物
  -> PwaPlan
  -> manifest + Service Worker + 离线页 + 校验报告
```

详见[架构概览](docs/architecture/overview.md)、[能力图](spec/CAPABILITY-MAP.md)和[架构决策记录](docs/adr/)。每个包的作用、边界与接入方式见[包导览](docs/guides/packages-overview.md)。

## 更新流程

浏览器只比较 Service Worker 脚本的字节，构建时预缓存清单写入其中：**预缓存资源或平台 worker 代码变化即为新版本**；业务 API 数据、未预缓存的文件或原样重新部署不会触发。

一次升级分两部分生效。页面代码（HTML、JS）的应用壳导航为网络优先，在线时刷新即取得新版；Service Worker 与离线缓存则由后台安装的新 worker 负责，它**先等待**，用户确认（`applyUpdate()`）后才接管，平台不自动接管也不强制刷新。因此：

- 发布前打开的页面：确认更新，再刷新；
- 发布后已在线刷新过的页面：只需确认更新，把离线版本切到新版；
- 不做操作：该应用所有标签页关闭后，下次打开时新 worker 自动生效。

平台提供状态与方法，也提供显式挂载的 Vue／React 默认更新提示；应用仍可自行实现，并决定何时刷新。触发条件、内部步骤与接入写法见[安装与更新指南](website/guide/updates.md)。

## 开发状态

[能力图](spec/CAPABILITY-MAP.md)中的 22 个模块都已完成模块级质量门禁，每个模块的门禁结果与未取得的证据见 `tasks/<module-id>/verification.md`。GitHub 当前不可用：2026-09-17 起新增的 7 个模块没有投影为 GitHub Issue，门禁以本地记录代替 CI（[ADR-0031](docs/adr/0031-local-gate-substitute-for-ci.md)），GitHub 恢复后须补跑。新能力仍须先完成独立的规格与计划，才可开始开发。

**基础与运行时**

- `contracts-foundation`、`policy-compiler`、`build-verifier`：身份、策略、计划的契约与校验，以及不依赖构建工具的产物核验。
- `platform-governance`、`browser-test-harness`：浏览器矩阵、发布回滚与恢复演练的治理基线，以及真实浏览器测试工具。
- `workbox-engine`、`sw-runtime`：以 Workbox 为内部引擎的平台 worker 与恢复 worker。
- `client-runtime`：页面侧注册、安装引导、更新提示、登出清理与生命周期事件，含主动检查更新（[ADR-0020](docs/adr/0020-client-update-check.md)）。

**框架与宿主接入**

- `vite-adapter`、`vue-react-adapters`：Vite 插件与 Vue 3、React 19 的框架绑定（[ADR-0016](docs/adr/0016-framework-bindings.md)）。
- `examples-browser-e2e`：Vue 与 React 示例，以及 V1 验收矩阵要求的安装、离线启动、更新提示与恢复路径的真实浏览器验证；更新提示写法见[接入指南](docs/guides/update-prompt.md)。
- `ssr-adapters`：`@pwa-platform/nuxt`，已在 Nuxt 4.5.x 上验证。TanStack Start 未通过可行性门槛，推迟交付。

**可选能力**（不进入 V1 验收矩阵）

- `shared-origin-topology`：同一源上根应用与固定子路径应用各自作为独立 PWA 运行（[ADR-0019](docs/adr/0019-shared-origin-registry-and-exclude.md)）。目前只支持 Vite 接入。
- `push-module`：`@pwa-platform/push` 提供显式订阅与后端格式契约；订阅、发送与后端清理仍由业务负责（[接入说明](docs/guides/push-integration.md)）。
- `offline-write-extension`：`PwaPolicy v2` 显式开启、会话绑定的离线写入队列（[ADR-0027](docs/adr/0027-explicit-session-bound-offline-write-queue.md)）。
- `pwa-entry-resilience`：当前 Origin 迁移或不可达时，使用业务应用提供的备用入口清单，让已安装用户确认后跳转（[接入说明](docs/guides/entry-recovery-integration.md)）。
- `public-read-cache`（路线图 v1.1）：`PwaPolicy v3` 显式开启公共读取的运行时缓存（[ADR-0035](docs/adr/0035-explicit-public-read-runtime-cache.md)、[接入说明](docs/guides/public-read-cache.md)）。Nuxt 暂不支持开启。

**发布就绪**

- `release-gate-contract`、`release-orchestration-protocol`、`browser-release-evidence`：发布门禁的覆盖判定、外部发布系统的协议，以及生产发布所需浏览器证据的记录模板。
- `package-distribution`：九个公开包首批于 2026-09-20 以 `0.1.0-beta.0` 发布到 npm，随后发布 [beta.1](tasks/package-distribution/release-2026-09-24.md) 与 [beta.2](tasks/package-distribution/release-2026-09-26-beta2.md)；正式版 `0.1.0` 加入入口恢复包。完整变化见 [CHANGELOG](CHANGELOG.md)。
- `cloudflare-test-deployment`：React 与 Vue 示例的 Cloudflare 测试部署。**尚未完成**：完整七日保留期的复核，以及在另一台机器上的恢复；业务项目接入发布门禁已由项目所有者决定延后（[待办](tasks/cloudflare-test-deployment/todo.md)）。

**尚未取得或尚未放行**

- **业务应用 V1 生产发布尚未放行**：桌面发布演练中，机器发布门禁的保留检查仍在等待历史发布补齐（[演练清单](tasks/platform-governance/desktop-release-rehearsal.md)）。这与本仓库 npm 库包的发布判定不同。
- **Chrome Android N 与 N-1 的证据一直未取得**，各模块按"未执行"登记；桌面 N-1 只在部分模块中取得。
- 真实 CI 运行、生产或类生产环境的验证，以各模块验证记录中"未取得的证据"一节为准。

## 本地开发

需要 Node.js `>=22` 与 pnpm `>=11`。安装依赖后可运行：

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
pnpm typecheck
pnpm test:browser
```

不带 `--filter` 时，`test`、`build` 与 `typecheck` 按依赖顺序作用于所有工作区包。只验证单个包时追加 `--filter <包名>`，例如 `pnpm test --filter @pwa-platform/core`；脚本会先构建它依赖的工作区包。

`pnpm test:browser` 在本机已安装的 Google Chrome 稳定版中运行真实浏览器测试，不下载浏览器；用法与桌面端 N-1 的运行方式见 [browser-test-harness](packages/browser-test-harness/README.md)。

React 示例的安卓 PWA 冒烟验收使用 Cloudflare Pages Direct Upload。执行 `pnpm deploy:pages:react` 会从密钥管理系统取得最小权限 `CLOUDFLARE_API_TOKEN` 与目标 `CLOUDFLARE_ACCOUNT_ID`，再重建 React `v1` 静态产物，并将保留 `/app/` 挂载目录的父目录发布到专用测试站。认证信息和 API Token 不写入仓库，详细流程见 [Pages 冒烟部署](docs/operations/pages-smoke-deploy.md)。

每个 PR 和 main 上的每次推送，CI 都会以冻结 lockfile 在 Node 22 与 24 上运行 lint、构建、测试和 typecheck，并在 runner 预装的 Google Chrome 稳定版上（Node 24）运行 `pnpm test:browser`（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）。依赖安装受仓库的供应链规则约束，见[依赖变更流程](docs/operations/dependency-changes.md)。

## npm 正式包

npm 组织 scope 为 `@pwa-platform`。已发布的十包是 `contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`client-runtime`、`vite`、`entry-resilience`、`vue` 与 `react`，统一版本 `0.1.0`、MIT 许可证。`latest` 指向正式版；业务应用通常安装一个框架绑定以及构建期的 `@pwa-platform/vite`，内部依赖由包管理器解析。需要入口灾备时另装 `@pwa-platform/entry-resilience`。npm 包正式发布不代表某个业务应用已通过生产部署门禁。

`browser-test-harness`、`examples-browser-e2e`、`nuxt`、`push`、`offline-write` 继续保持私有，不在正式版分发范围。入口恢复的接入方式与信任模型见[入口恢复接入说明](docs/guides/entry-recovery-integration.md)。详细的本地发布顺序、tarball 验收和后续生产门禁见 [npm 包发布流程](docs/operations/npm-package-release.md)。

所有工作区依赖继续使用 `workspace:*`；`pnpm pack` / `pnpm publish` 会在产物中改写为同版本依赖。npm 包可安装不等于业务项目已通过生产部署验收。
