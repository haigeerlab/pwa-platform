---
layout: home
hero:
  name: PWA Platform
  text: 为业务应用接入 PWA
  tagline: 声明应用身份与缓存策略，由平台生成安装、离线和更新所需的基础设施。
  actions:
    - theme: brand
      text: 选择接入包
      link: /start/choose
    - theme: alt
      text: 了解平台
      link: /introduction/
features:
  - title: 按技术栈接入
    details: 为 Vite + Vue 或 React 选择公开包，按步骤配置、注册并验证。
    link: /start/choose
    linkText: 查看接入路径
  - title: 明确缓存边界
    details: 用声明式策略管理离线资源；私有数据、写入和未分类请求默认不缓存。
    link: /architecture/security
    linkText: 理解安全模型
  - title: 带着发布证据上线
    details: 核对构建产物、线上响应头、更新行为、旧资源保留和恢复流程。
    link: /start/checklist
    linkText: 查看上线检查
  - title: 看清工具定位
    details: 对照本平台、vite-plugin-pwa、Workbox 与产品化工具的职责和交付范围。
    link: /introduction/tooling-comparison
    linkText: 阅读能力对照
---

PWA Platform 是供多个业务应用复用的 PWA 基础设施。业务团队声明应用身份和缓存意图，平台生成 manifest、Service Worker 与离线页，并在构建时核对产物。安装按钮和业务数据仍由应用负责；更新提示可选用平台默认 UI 或自行实现。

::: warning 当前发布状态
十个公开包的正式版本为 **0.1.0**（npm `latest`），包括 Vite、Vue、React 和可选的入口恢复包。Nuxt、Push 与离线写入包仍只在工作区。包发布不代替业务应用的生产部署验收。
:::

## PWA 解决哪些问题

PWA 能把网页接入浏览器的安装、离线、更新、通知和部分系统集成能力，但每项能力仍受浏览器、部署环境和业务数据约束。下面按开发者要解决的问题说明本库的覆盖层级；**“工作区已有实现”不等于外部项目可安装**。手机上可横向滑动表格查看完整列。

| 问题维度 | 你希望得到的结果 | 本库当前覆盖 |
| --- | --- | --- |
| 安装与入口 | 用户从桌面再次打开应用，看到正确的名称和图标 | 正式包生成稳定 ID 的 manifest 并提供安装状态；按钮和引导界面由应用实现 |
| 离线与弱网 | 已访问的应用壳断网仍可打开，部分公共内容可用 | 正式包提供预缓存、离线回退和显式公共读取缓存；不会让所有页面、API 自动离线 |
| 数据安全 | 避免把账号数据、写请求或流媒体留在缓存里 | 正式包默认拒绝这些请求和未分类请求；业务必须正确识别真正公开的响应 |
| 更新与故障恢复 | 新版本由用户确认后接管，坏 worker 有恢复路径 | 正式包提供等待更新、主动检查、可选更新提示 UI 和恢复 worker；应用控制刷新，发布方负责恢复部署 |
| 通知与后台任务 | 重新触达用户，断网后继续处理任务 | Web Push 与受限离线写队列仅在工作区；后台同步和周期同步尚未提供 |
| 操作系统集成 | 通过分享、文件或启动入口进入应用 | manifest 快捷方式已在正式包；Share Target、File Handlers、Launch Handler 尚未提供 |
| 工程交付 | 构建时发现产物问题，发布前验证真实行为 | 正式包做构建校验；浏览器测试工具属于仓库内部，业务站点仍需自行验收 |
| 本地开发 | 在开发服务器中调试页面与 PWA 行为 | `vite dev` 可解析页面配置；worker 与预缓存仍只在生产构建生成，离线验收使用 `vite build` + `vite preview` |

## 功能对照：现在能用到哪一层

状态说明：**已发布**＝已随公开包交付；**有条件**＝还需显式配置、浏览器支持或业务配合；**工作区实现**＝源码有实现但对应包未公开发布；**未提供**＝当前没有该平台能力。所有能力都需按[兼容范围](/reference/compatibility)和[上线前检查](/start/checklist)验证。

| 能力 | 本库状态 | 范围与接入责任 |
| --- | --- | --- |
| 稳定 manifest ID、名称、图标、截图 | 已发布 | [配置安装信息](/guide/configuration)；URL 与实际部署一致，图像文件由应用提供，展示由浏览器决定 |
| 可安装状态、自定义安装引导 | 有条件 | [安装按钮由应用实现](/guide/updates)；仅在浏览器给出安装提示时调用 `promptInstall()` |
| 应用壳预缓存、离线页 | 有条件 | [声明静态资源和导航规则](/guide/offline)；首次在线访问后才可能离线打开，其他路由不会自动可用 |
| 弱网超时回退 | 有条件 | [显式设置 `networkTimeoutSeconds`](/guide/offline)；用于导航与 `network-first` 公共读取，不给所有业务请求设超时 |
| 按规则缓存公共 GET | 有条件 | [PwaPolicy v3 显式开启](/guide/public-read-cache)；仅同源公共响应，业务负责证明内容与身份无关 |
| 私有、写入、流媒体和未分类请求默认拒绝缓存 | 已发布 | [安全基线](/architecture/security)不可被允许规则覆盖；业务仍须正确分类和设置响应头 |
| 用户确认后更新 | 已发布 | [等待更新与接管](/guide/updates)由平台提供；可选默认提示 UI，未保存内容保护与刷新时机由应用决定 |
| 可选更新提示 UI | 已发布 | Vue／React 需显式挂载组件和导入 CSS；位置、文案与按钮色值可配置，不自动刷新 |
| 主动／定时检查更新 | 有条件 | `checkForUpdate()` 与可选 `updateCheck` 是页面侧检查；不是 Periodic Sync API |
| 恢复 worker、清理本应用缓存 | 有条件 | [构建产物与恢复流程](/operations/release)已提供；发布方必须部署并演练，不能把它当作通用开关 |
| 同源根应用与子路径应用隔离 | 有条件 | [共享 origin 部署](/operations/release)需要登记表、根应用排除规则和发布顺序校验 |
| manifest 快捷方式 | 已发布 | [安装元数据](/guide/configuration)可声明 `shortcuts`；目标 URL 与图标必须真实存在 |
| Web Push 通知 | 工作区实现 | [可选能力](/guide/optional)尚未公开；业务后端仍需保存订阅、发送与清理失效订阅 |
| 显式离线写队列 | 工作区实现 | [可选能力](/guide/optional)尚未公开；应用主动入队和提交，负责幂等与冲突 |
| 入口迁移／域名故障引导 | 有条件 | [入口灾备](/guide/optional)已公开；旧应用壳与清单须事先缓存，用户确认跳转后在新地址重新登录 |
| Nuxt 4 SSR 适配 | 工作区实现 | [接入包范围](/start/choose)仅工作区可用；外部项目目前没有公开 Nuxt 包 |
| Background Sync／Periodic Sync | 未提供 | 没有 worker 后台自动重放或周期同步；页面定时检查更新不能替代它们 |
| Share Target／文件关联／Launch Handler | 未提供 | 当前 manifest 契约和生成器没有这些入口；需要时由业务另行评估 |
| Service Worker 自动化测试工具 | 工作区实现 | 仓库有浏览器测试工具与示例；它们不是外部业务项目的公开接入包 |
| `vite dev` 开发服务器 | 已发布 | `virtual:pwa-config` 在开发时可解析页面配置；开发环境不生成或注册平台 worker |

## 接入自己的系统

1. 按技术栈[选择公开包并安装 0.1.0 版本](/start/choose)。当前公开接入面是 Vite 5／8 + Vue 3 或 React 19；Nuxt 包尚未公开。
2. 从[完整配置示例](/guide/configuration)填写身份、安装信息和缓存策略。先确定真实 HTTPS 地址、部署路径、图标文件和哪些响应确实公开；生产身份首次注册后不能随普通发版更改。
3. 按[Vue](/start/vue)或[React](/start/react)指南挂载构建插件、读取 `virtual:pwa-config`，并在应用启动后主动调用 `register()`。安装按钮由业务实现；更新提示可选用[默认 UI](/guide/updates#可选的默认更新提示)或自行展示。
4. 做生产构建，用 `vite preview` 或目标 HTTPS 站点检查离线与更新结果。`vite dev` 可用于普通页面开发，但不会生成平台 worker；上线前逐项完成[浏览器与发布检查](/start/checklist)。

## 从这里开始

| 你想完成的事 | 阅读 |
| --- | --- |
| 判断它是否适合你的项目 | [项目介绍](/introduction/)与[能力边界](/introduction/capabilities) |
| 与其他 PWA 工具怎么选 | [PWA 工具能力对照](/introduction/tooling-comparison) |
| 知道该安装哪些包 | [选择接入包](/start/choose) |
| 在现有项目跑通 | [Vue 接入](/start/vue)或[React 接入](/start/react) |
| 理解配置为什么这样写 | [身份与策略](/guide/configuration) |
| 准备发布业务应用 | [上线前检查](/start/checklist)与[部署发布](/operations/release) |

## 一句话理解链路

~~~text
应用身份 + 安装信息 + 业务策略 + 构建产物
  → 可审计的 PwaPlan
  → manifest + Service Worker + 离线页 + 构建校验报告
~~~

平台的核心约束是：**私有数据、写操作、流媒体和未分类请求默认不缓存**。需要公共读取缓存时，业务必须显式声明并对响应的公共属性负责。
