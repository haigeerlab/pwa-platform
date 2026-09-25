# 选择接入包

先看项目的构建工具和框架，再决定安装入口。常规业务项目的功能接入需要 **构建插件 + 对应框架绑定**；内部运行时和 Workbox 引擎由包管理器作为传递依赖安装。

构建环境需要 Node.js 22.12 或更高版本；以下框架范围与已发布包的 peer 依赖一致。

接入前还要评估日常开发流程：Vite 插件仅在生产构建时提供 <code>virtual:pwa-config</code>。照本站 Vue／React 示例导入该模块后，<code>vite dev</code> 无法解析它，开发服务器不能直接启动；当前本地验收路径是项目的生产构建加 <code>vite preview</code>。若现有团队依赖 <code>vite dev</code>，应先确认能否接受这一限制。

| 项目 | 直接安装 | 公开状态 |
| --- | --- | --- |
| Vite 8 + Vue >=3.4、<4 | <code>@pwa-platform/vite</code>、<code>@pwa-platform/vue</code> | npm beta |
| Vite 8 + React >=19.2、<20 | <code>@pwa-platform/vite</code>、<code>@pwa-platform/react</code> | npm beta |
| Nuxt 4.5.x | <code>@pwa-platform/nuxt</code> | 工作区私有，尚未公开 |
| TanStack Start / Next.js | 暂无可用的公开适配包 | 不在当前接入范围 |

下方安装命令包含 <code>@pwa-platform/contracts</code>，供[配置指南](/guide/configuration)中的 TypeScript 示例直接导入 <code>PwaIdentity</code>、<code>PwaInstallMetadata</code> 和 <code>PwaPolicy</code> 类型；若不使用这些类型，可以省略这个开发依赖。不要从它导入运行时行为，也不要直接引入 <code>core</code>、<code>sw-runtime</code>、<code>client-runtime</code> 或 <code>engine-workbox</code>。

## 安装命令

Vue：

~~~bash
pnpm add @pwa-platform/vue@0.1.0-beta.1
pnpm add -D @pwa-platform/vite@0.1.0-beta.1 @pwa-platform/contracts@0.1.0-beta.1
~~~

React：

~~~bash
pnpm add @pwa-platform/react@0.1.0-beta.1
pnpm add -D @pwa-platform/vite@0.1.0-beta.1 @pwa-platform/contracts@0.1.0-beta.1
~~~

安装命令写明版本号，因为当前 npm 的 <code>latest</code> 标签也指向 beta，不应由标签推断稳定性。

## 接入顺序

1. 按实际部署地址写[身份、安装信息与策略](/guide/configuration)。
2. 在 Vite 配置中挂载插件。
3. 在页面入口放入框架绑定并主动调用 <code>register()</code>。
4. 构建后部署到 HTTPS 站点，按[上线前检查](/start/checklist)验证。

继续阅读：[Vue 接入](/start/vue)或[React 接入](/start/react)。
