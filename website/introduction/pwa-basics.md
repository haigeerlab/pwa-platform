# PWA 基础

本页给第一次接触 PWA 的读者：先讲清几个浏览器概念，再说明本平台的哪一部分生成什么，最后是文档中所有术语的[术语表](#glossary)。已熟悉这些概念的读者可以直接跳到[平台如何对应](#platform-mapping)。

## PWA 是什么

PWA（渐进式 Web 应用）不是一种新的应用格式，而是给普通网站加上两样浏览器能力：

- **Web App Manifest**：一份 JSON 文件，告诉浏览器这个站点的名称、图标、启动地址和显示方式，浏览器据此提供“安装到桌面／主屏幕”。
- **Service Worker**：一段由浏览器在后台管理的脚本，可以拦截该站点的网络请求，用缓存来回答，因此页面在断网时仍能打开。

两者都只在安全上下文（HTTPS，本地开发时的 `localhost` 除外）下可用。是否支持、支持到什么程度取决于浏览器，本站以[兼容范围](/reference/compatibility)和[跨平台测试证据](/reference/platform-test-matrix)为准。

## Manifest 与 manifest `id`

manifest 声明名称、图标、`start_url`、`display`、`scope` 等。其中的 `id` 是浏览器用来判断“这是不是同一个应用”的标识：`id` 相同，浏览器认为是同一个已安装应用；`id` 变了，就会被视为另一个应用，用户要重新安装。没有写 `id` 时，浏览器退回到用 `start_url` 推导，因此改动启动地址也可能改变应用身份。所以本平台要求显式声明并保持稳定（`IDENTITY.manifestId`，见[身份与策略配置](/guide/configuration)）。

## Service Worker：scope 与生命周期

**scope** 决定 worker 能控制哪些页面：只有地址落在 scope 之内的页面，其请求才会经过这个 worker。浏览器默认只允许 worker 控制它所在目录及以下的路径，所以放在 `/app/sw.js` 的 worker 最多控制 `/app/`。同一 scope 同一时刻只有一个注册。

一个 worker 版本的生命周期是：

1. **install**：浏览器下载脚本并运行；通常在这里预缓存资源。
2. **waiting**：如果已有旧 worker 正在控制页面，新 worker 安装完后等待，直到旧 worker 不再控制任何页面，或新 worker 主动要求跳过等待。
3. **activate**：新 worker 成为该 scope 的激活 worker，通常在这里清理旧缓存。
4. **控制页面**：激活之后，**之后新打开或刷新的页面**才受它控制。

这就是为什么**首次访问的页面不受控**：页面加载时还没有 worker，worker 是页面加载之后才安装、激活的；除非 worker 调用 `clients.claim()` 强行接管，否则要等下一次导航（刷新或重新打开）。本平台的 worker 不调用 `clients.claim()`，也不自行 `skipWaiting()`，更新时要页面确认后才接管，见[运行时生命周期](/architecture/lifecycle)。

## 预缓存与运行时缓存

- **预缓存**：在 install 阶段，按构建时已知的文件清单（带内容指纹的脚本、样式、HTML、离线页等）一次性下载存好。资源有版本，随 worker 一起更新。
- **运行时缓存**：请求发生时才决定是否缓存，例如接口返回的数据。它没有构建时清单，因此更容易缓存到不该缓存的内容（登录后的私有数据）。

本平台对两者的态度不同：预缓存是默认能力；运行时缓存只对显式声明的同源公共 GET 开启，见[公共读取缓存](/guide/public-read-cache)与[缓存安全模型](/architecture/security)。

## 应用壳与离线页

**应用壳**是让界面骨架跑起来所需的最小静态资源：入口 HTML、脚本、样式、图标。预缓存了应用壳，断网时也能启动界面，再由业务代码决定数据怎么显示。

**离线页**是另一件事：当某次导航既没有网络、也没有可用的缓存页面时，worker 返回的一张兜底页面。它不是应用壳的替代品，只是“打不开时至少给用户一个说明”。见[离线体验](/guide/offline)。

## 平台如何对应 {#platform-mapping}

业务应用只声明 `identity`、`policy`、`install`、`topology`，由 `@pwa-platform/vite` 在构建时编译出一份 [`PwaPlan`](#glossary)，再据此产出下列文件：

| 概念 | 由谁生成或提供 | 说明 |
| --- | --- | --- |
| manifest | `@pwa-platform/vite` 生成 `IDENTITY.manifestUrl` 指向的文件，并向 HTML 注入 manifest 链接 | 启用平台安装元数据时生成；否则须自己提供该文件 |
| 平台 Service Worker | `@pwa-platform/vite` 打包 `sw-runtime` 的 worker，写到 `IDENTITY.serviceWorkerUrl` | 预缓存计划中的文件，按计划决定每个请求怎么处理 |
| 恢复 worker | 同一次构建输出根目录下的 `pwa-recovery-worker.js` | 平时不使用，事故时由发布方覆盖到原 worker URL，见[异常恢复](/architecture/lifecycle#异常恢复) |
| 离线页 | 插件配置 `offlinePage: {}` 时由平台生成，或由业务自己提供 | 见[离线体验](/guide/offline#默认离线页) |
| 页面侧注册、更新与安装 | `@pwa-platform/client-runtime` 提供的 [facade](#glossary)，`vue`／`react` 包再包装一层 | 业务代码不直接操作 `navigator.serviceWorker` |

想按技术栈动手，见[选择接入包](/start/choose)；想看构建链路，见[分层与构建链路](/architecture/)。

## 术语表 {#glossary}

以下按“先定义、后使用”的顺序排列；每条末尾的链接指向该术语在文档中的主要出处。

**PWA**
: 渐进式 Web 应用：带 manifest 与 Service Worker、可安装并可在断网时打开的网站。[本页](#pwa-是什么)

**Service Worker**
: 浏览器在页面之外后台运行的脚本，能拦截其 scope 内的请求。本站中的“worker”均指它。[本页](#service-worker-scope-与生命周期)

**scope**
: Service Worker 能控制的路径范围，以 `/` 结尾，例如 `/` 或 `/app/`。在平台里由 `IDENTITY.scope` 声明，生产注册后不可更改。[身份与策略配置](/guide/configuration)

**manifest**
: Web App Manifest，描述名称、图标、启动地址等的 JSON 文件。其 `id` 决定浏览器眼中的应用身份。[本页](#manifest-与-manifest-id)

**应用壳**
: 启动界面所需的最小静态资源（入口 HTML、脚本、样式、图标）。预缓存它，才能断网冷启动。[离线体验](/guide/offline)

**预缓存**
: 在 worker 安装阶段按构建清单一次性存好的资源，随 worker 版本更新。[缓存安全模型](/architecture/security)

**运行时缓存**
: 请求发生时才写入的缓存。平台只对显式声明的同源公共 GET 开启。[公共读取缓存](/guide/public-read-cache)

**离线页**
: 导航既无网络又无缓存可用时返回的兜底页面，由 `POLICY.offlineFallback` 指向。[离线体验](/guide/offline#默认离线页)

**恢复 worker（recovery worker）**
: 构建同时生成的另一个 worker：安装即接管，删除本应用的缓存与离线写数据库，之后不拦截任何请求，让页面直接走网络。只清理本应用命名空间下的缓存。[部署与发布](/operations/release#回滚与恢复)

**PwaPlan**
: 平台在构建时由身份、策略、安装元数据和拓扑编译出的一份可审计的计划，manifest、worker 与预缓存清单都由它生成，构建校验与发布检查也读取它。[分层与构建链路](/architecture/)

**facade**
: 页面侧的客户端对象，由 `client-runtime` 提供：注册 worker、处理安装提示、更新确认、登出等，业务代码不直接接触 `navigator.serviceWorker`。[安装与更新](/guide/updates)

**工作区私有（workspace-private package）**
: 只存在于平台仓库 monorepo 内、没有发布到 npm 的包，业务应用无法安装，例如 `nuxt`、`push`、`offline-write`。[包与公开入口](/reference/packages)

**拓扑（topology）**
: 应用在 origin 上的部署形态：`standalone-origin` 表示独占整个 origin；`shared-origin` 表示与其他 PWA 共用同一 origin（根应用加固定子路径应用），并须附带登记表。[同源多应用](/operations/release#shared-origin-registry)

**mount-relative 路径**
: 相对挂载点的路径。策略里的 `pathPrefix`、`offlineFallback.path` 都相对 `IDENTITY.mountPath` 书写，部署在 `/app/` 时仍写 `/assets`，不要重复 `/app`。[身份与策略配置](/guide/configuration)

**configDigest**
: 由运行时缓存的三项上限和可执行规则计算出的 16 位十六进制摘要，写进公共数据缓存的名字；规则或上限一变，摘要就变，新 worker 激活时会删除旧摘要的缓存。[公共读取缓存](/guide/public-read-cache)

**发布基线（identity release baseline）**
: 每个部署槽位上一次生产发布所用的 `PwaIdentity` 的 JSON 副本，保存在仓库中；发布时用它逐字段比对候选身份，防止身份被悄悄改动。[部署与发布](/operations/release#identity-baseline)

**ADR**
: Architecture Decision Record，记录难以逆转的架构决策及理由，位于仓库 `docs/adr/`。文中形如“ADR-0004”的编号指向其中一篇。[ADR 目录](https://github.com/haigeerlab/pwa-platform/tree/main/docs/adr)

**Chrome N／N-1**
: 桌面 Chrome 的当前稳定版（N）与上一个稳定版（N-1）。发布门禁要求两者都取得验收证据。[兼容范围](/reference/compatibility)

**R／R-1／R-2**
: 发布编号：R 为当前发布，R-1、R-2 为之前的两次发布。发布 R 时，这三次发布的带指纹资源都必须仍可获取。[更新与旧资源保留](/operations/release#更新与旧资源保留)

**登记表（shared-origin registry）**
: 同源多应用时，受版本控制的一份清单，列出根应用与每个子应用的 scope、worker、manifest；根应用据此排除子应用的路径。[同源多应用](/operations/release#shared-origin-registry)
