# 选择接入包

先看项目的构建工具和框架，再决定安装入口。常规业务项目的功能接入需要 **构建插件 + 对应框架绑定**；内部运行时和 Workbox 引擎由包管理器作为传递依赖安装。

构建环境需要 Node.js 22.12 或更高版本；以下框架范围与已发布包的 peer 依赖一致。

自 0.1.0 起，Vite 插件在 <code>vite dev</code> 中也提供 <code>virtual:pwa-config</code>，普通页面可继续开发；开发服务不生成平台 worker 或预缓存。离线、安装与更新仍须通过生产构建加 <code>vite preview</code> 或目标 HTTPS 站点验收。

| 项目 | 直接安装 | 公开状态 |
| --- | --- | --- |
| Vite 5／8 + Vue >=3.4、<4 | <code>@pwa-platform/vite</code>、<code>@pwa-platform/vue</code> | npm 0.2.3 |
| Vite 5／8 + React >=19.2、<20 | <code>@pwa-platform/vite</code>、<code>@pwa-platform/react</code> | npm 0.2.3 |
| Nuxt 4.5.x | <code>@pwa-platform/nuxt</code> | 工作区私有，尚未公开 |
| TanStack Start / Next.js | 暂无可用的公开适配包 | 不在当前接入范围 |

下方安装命令包含 <code>@pwa-platform/contracts</code>，供[配置指南](/guide/configuration)中的 TypeScript 示例直接导入 <code>PwaIdentity</code>、<code>PwaInstallMetadata</code> 和 <code>PwaPolicy</code> 类型；若不使用这些类型，可以省略这个开发依赖。不要从它导入运行时行为，也不要直接引入 <code>core</code>、<code>sw-runtime</code>、<code>client-runtime</code> 或 <code>engine-workbox</code>。

## 安装命令

Vue：

~~~bash
pnpm add @pwa-platform/vue@0.2.3
pnpm add -D @pwa-platform/vite@0.2.3 @pwa-platform/contracts@0.2.3
~~~

React：

~~~bash
pnpm add @pwa-platform/react@0.2.3
pnpm add -D @pwa-platform/vite@0.2.3 @pwa-platform/contracts@0.2.3
~~~

安装命令固定 0.2.3；npm `latest` 指向该正式包版本。业务应用仍需单独完成生产部署验收。

::: warning 同一次构建中的平台包必须是同一版本
带新字段的构建计划不能被旧版本的平台包校验；升级 <code>@pwa-platform/vite</code>、框架绑定或 <code>@pwa-platform/contracts</code> 时要一起升级，不要只升级其中一个。
:::

## 接入顺序

1. 先按[功能接入路径](/guide/integration-by-capability)决定只启用原生壳、更新、离线、公共缓存或恢复中的哪些能力。
2. 按实际部署地址写[身份、安装信息与策略](/guide/configuration)。
3. 在 Vite 配置中挂载插件。
4. 在页面入口放入框架绑定并主动调用 <code>register()</code>。
5. 构建后部署到 HTTPS 站点，按[上线前检查](/start/checklist)验证。

## 用 AI 引导接入 {#ai-onboarding}

`@pwa-platform/vite` 随包带一份给 AI 编程助手用的引导 skill（`skills/pwa-onboarding/`，只有 Markdown，不新增任何入口或运行时代码）。它按关卡带着助手完成：可行性与冲突检测、采访、配置并检查、服务端核对、浏览器验证、上线后排障。每个关卡结束都要你在对话里明确确认，才会继续。

::: warning 已发布的 0.2.3 不含这份 skill
它只在包含 <code>skills/</code> 目录的 <code>@pwa-platform/vite</code> 版本里提供。安装后先确认目录存在：<code>node_modules/@pwa-platform/vite/skills/pwa-onboarding</code>。skill 的 <code>metadata.version</code> 与包版本一致，升级包后要重新复制。
:::

把它复制到助手读取 skill 的目录。Claude Code 用 `.claude/skills/pwa-onboarding`，Codex 用 `.agents/skills/pwa-onboarding`；两个都用就各复制一份。

macOS／Linux：

~~~bash
mkdir -p .claude/skills
cp -R node_modules/@pwa-platform/vite/skills/pwa-onboarding .claude/skills/pwa-onboarding
~~~

Windows PowerShell：

~~~powershell
New-Item -ItemType Directory -Force .claude/skills | Out-Null
Copy-Item -Recurse node_modules/@pwa-platform/vite/skills/pwa-onboarding .claude/skills/pwa-onboarding
~~~

用 Codex 时把目标目录里的 `.claude` 换成 `.agents`。然后在助手里调用：Claude Code 输入 `/pwa-onboarding`，Codex 输入 `$pwa-onboarding`。

**不要把它放进 `public/`、`src/` 或 `dist/`**：那样它会被当作站点文件发布。它属于开发期辅助，正常构建不读取它。

它的边界：

- 不会代你部署、推送或切换 worker，也不会代你删除依赖或文件，这些都要你确认或亲自执行。
- 不收集你的服务器配置，只告诉你哪些资源要满足什么响应头，由你对照自行配置。
- 不会替你决定哪些接口是公共接口；开启公共读取缓存前，每个接口都要你逐个确认。
- 本文档站只有中文。你可以用英文与助手对话，助手会把引用的中文文档忠实转述成英文，界面文案的语言在采访里另行选择。

继续阅读：[Vue 接入](/start/vue)或[React 接入](/start/react)。
