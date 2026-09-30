# 选择接入包

先看项目的构建工具和框架，再决定安装入口。常规业务项目的功能接入需要 **构建插件 + 对应框架绑定**；内部运行时和 Workbox 引擎由包管理器作为传递依赖安装。

各平台包声明 <code>engines.node</code> 为 <code>>=22.0.0</code>；实际使用的 Vite 8 本身要求 Node.js 22.12 或更高版本。以下框架范围与已发布包的 peer 依赖一致。

Vite 插件在 <code>vite dev</code> 中也提供 <code>virtual:pwa-config</code>，普通页面可继续开发；开发服务不生成平台 worker 或预缓存。离线、安装与更新仍须通过生产构建加 <code>vite preview</code> 或目标 HTTPS 站点验收。

| 项目 | 直接安装 | 公开状态 |
| --- | --- | --- |
| Vite 5／8 + Vue >=3.4、<4 | <code>@pwa-platform/vite</code>、<code>@pwa-platform/vue</code> | npm 0.2.4 |
| Vite 5／8 + React >=19.2、<20 | <code>@pwa-platform/vite</code>、<code>@pwa-platform/react</code> | npm 0.2.4 |
| Nuxt 4.5.x | <code>@pwa-platform/nuxt</code> | 工作区私有，尚未公开 |
| TanStack Start / Next.js | 暂无可用的公开适配包 | 不在当前接入范围 |

下方安装命令包含 <code>@pwa-platform/contracts</code>，供[配置指南](/guide/configuration)中的 TypeScript 示例直接导入 <code>PwaIdentity</code>、<code>PwaInstallMetadata</code> 和 <code>PwaPolicy</code> 类型；若不使用这些类型，可以省略这个开发依赖。不要从它导入运行时行为，也不要直接引入 <code>core</code>、<code>sw-runtime</code>、<code>client-runtime</code> 或 <code>engine-workbox</code>。

## 安装命令

Vue：

~~~bash
pnpm add @pwa-platform/vue@0.2.4
pnpm add -D @pwa-platform/vite@0.2.4 @pwa-platform/contracts@0.2.4
~~~

React：

~~~bash
pnpm add @pwa-platform/react@0.2.4
pnpm add -D @pwa-platform/vite@0.2.4 @pwa-platform/contracts@0.2.4
~~~

安装命令固定 0.2.4；npm `latest` 指向该正式包版本。业务应用仍需单独完成生产部署验收。

::: warning 同一次构建中的平台包必须是同一版本
带新字段的构建计划不能被旧版本的平台包校验；升级 <code>@pwa-platform/vite</code>、框架绑定或 <code>@pwa-platform/contracts</code> 时要一起升级，不要只升级其中一个。
:::

::: warning 身份字段上线后不可变更
<code>appId</code>、<code>manifestId</code>、<code>origin</code>、<code>scope</code>、<code>serviceWorkerUrl</code>、<code>manifestUrl</code>、<code>mountPath</code>、<code>environment</code>、<code>cacheNamespaceSeed</code> 这九个字段在首次生产发布后即被记入发布基线，不可更改。首次上线前先确定真实的 HTTPS 域名、部署路径和 <code>sw.js</code> 的位置；之后再改属于迁移，需要 ADR 与迁移计划，不是普通发版。各字段的取值规则与诊断码见[字段参考](/guide/configuration#field-reference)。
:::

## 接入顺序

1. 先按[功能接入路径](/guide/integration-by-capability)决定只启用原生壳、更新、离线、公共缓存或恢复中的哪些能力。
2. 按实际部署地址写[身份、安装信息与策略](/guide/configuration)。
3. 在 Vite 配置中挂载插件。
4. 在页面入口放入框架绑定并主动调用 <code>register()</code>。
5. 构建后部署到 HTTPS 站点，按[上线前检查](/start/checklist)验证。

## 用 AI 引导接入 {#ai-onboarding}

`@pwa-platform/vite` 随包带一份给 AI 编程助手用的接入清单（`skills/pwa-onboarding/SKILL.md`，一个 Markdown 文件，没有运行时代码）。它不复述文档，只把最容易出错的几件事交代给助手：先查能不能接、清理冲突前必须你确认、身份字段写之前逐项念给你、公共缓存规则必须逐个接口由你确认、部署和切换 worker 由你自己做。

清单只带文档站链接，文档不随包发布。助手先打开文档站；打不开（内网、离线）时，会问你 PWA Platform 仓库副本放在哪个目录，然后按路径读副本里的 `website/` 页面，并提醒你副本与已装包版本是否一致。离线接入前，把本仓库整个拷到本机任意目录，最好检出与已装 `@pwa-platform/vite` 版本对应的提交。

::: warning 自 0.2.4 起提供
清单从 <code>@pwa-platform/vite@0.2.4</code> 起随包发布，0.2.3 及更早版本不含（0.2.4 另带一份内置文档，之后的版本不再携带）。先确认目录存在：<code>node_modules/@pwa-platform/vite/skills/pwa-onboarding</code>。清单里的 <code>metadata.version</code> 与包版本一致，升级包后要重新复制。
:::

复制到助手读取 skill 的目录：Claude Code 用 `.claude/skills/pwa-onboarding`，Codex 用 `.agents/skills/pwa-onboarding`，两个都用就各复制一份。

~~~bash
mkdir -p .claude/skills
cp -R node_modules/@pwa-platform/vite/skills/pwa-onboarding .claude/skills/pwa-onboarding
~~~

Windows PowerShell：

~~~powershell
New-Item -ItemType Directory -Force .claude/skills | Out-Null
Copy-Item -Recurse node_modules/@pwa-platform/vite/skills/pwa-onboarding .claude/skills/pwa-onboarding
~~~

用 Codex 时把 `.claude` 换成 `.agents`。调用：Claude Code 输入 `/pwa-onboarding`，Codex 输入 `$pwa-onboarding`。**不要把它放进 `public/`、`src/` 或 `dist/`**，否则它会被当作站点文件发布；正常构建不读取它。文档站只有中文，助手可以用英文和你对话，但引用的文档是中文。

继续阅读：[Vue 接入](/start/vue)或[React 接入](/start/react)。
