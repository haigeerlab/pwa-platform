# 选择接入包

先看项目的构建工具和框架，再决定安装入口。常规业务项目的功能接入需要 **构建插件 + 对应框架绑定**；内部运行时和 Workbox 引擎由包管理器作为传递依赖安装。

构建环境需要 Node.js 22.12 或更高版本；以下框架范围与已发布包的 peer 依赖一致。

自 0.1.0 起，Vite 插件在 <code>vite dev</code> 中也提供 <code>virtual:pwa-config</code>，普通页面可继续开发；开发服务不生成平台 worker 或预缓存。离线、安装与更新仍须通过生产构建加 <code>vite preview</code> 或目标 HTTPS 站点验收。

| 项目 | 直接安装 | 公开状态 |
| --- | --- | --- |
| Vite 5／8 + Vue >=3.4、<4 | <code>@pwa-platform/vite</code>、<code>@pwa-platform/vue</code> | npm 0.2.0 |
| Vite 5／8 + React >=19.2、<20 | <code>@pwa-platform/vite</code>、<code>@pwa-platform/react</code> | npm 0.2.0 |
| Nuxt 4.5.x | <code>@pwa-platform/nuxt</code> | 工作区私有，尚未公开 |
| TanStack Start / Next.js | 暂无可用的公开适配包 | 不在当前接入范围 |

下方安装命令包含 <code>@pwa-platform/contracts</code>，供[配置指南](/guide/configuration)中的 TypeScript 示例直接导入 <code>PwaIdentity</code>、<code>PwaInstallMetadata</code> 和 <code>PwaPolicy</code> 类型；若不使用这些类型，可以省略这个开发依赖。不要从它导入运行时行为，也不要直接引入 <code>core</code>、<code>sw-runtime</code>、<code>client-runtime</code> 或 <code>engine-workbox</code>。

## 安装命令

Vue：

~~~bash
pnpm add @pwa-platform/vue@0.2.0
pnpm add -D @pwa-platform/vite@0.2.0 @pwa-platform/contracts@0.2.0
~~~

React：

~~~bash
pnpm add @pwa-platform/react@0.2.0
pnpm add -D @pwa-platform/vite@0.2.0 @pwa-platform/contracts@0.2.0
~~~

安装命令固定 0.2.0；npm `latest` 指向该正式包版本。业务应用仍需单独完成生产部署验收。

::: warning 同一次构建中的平台包必须是同一版本
带新字段的构建计划不能被旧版本的平台包校验；升级 <code>@pwa-platform/vite</code>、框架绑定或 <code>@pwa-platform/contracts</code> 时要一起升级，不要只升级其中一个。
:::

## 接入顺序

1. 先按[功能接入路径](/guide/integration-by-capability)决定只启用原生壳、更新、离线、公共缓存或恢复中的哪些能力。
2. 按实际部署地址写[身份、安装信息与策略](/guide/configuration)。
3. 在 Vite 配置中挂载插件。
4. 在页面入口放入框架绑定并主动调用 <code>register()</code>。
5. 构建后部署到 HTTPS 站点，按[上线前检查](/start/checklist)验证。

继续阅读：[Vue 接入](/start/vue)或[React 接入](/start/react)。
