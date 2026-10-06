# Vite + React 接入

适用范围：Vite 5／8、React 19.2 及以上且低于 20，构建环境为 Node.js 22.12 或更高版本（Vite 8 的要求；平台包声明 <code>>=22.0.0</code>）。先按[包选择](/start/choose)安装 0.4.0，再完成以下步骤。示例使用域名根路径；子路径部署需要同步调整所有路径。

<code>vite dev</code> 和生产构建中都提供 <code>virtual:pwa-config</code>；开发服务不生成平台 worker。安装、离线与更新仍须运行生产构建，再用 <code>vite preview</code> 或目标 HTTPS 站点验收。
示例要求浏览器提供 <code>navigator.serviceWorker</code>；若业务系统还要在不提供此 API 的环境运行，请先看[兼容范围中的降级说明](/reference/compatibility#不支持-service-worker-的环境)。

::: warning 身份字段上线后不可变更
<code>appId</code>、<code>manifestId</code>、<code>origin</code>、<code>scope</code>、<code>serviceWorkerUrl</code>、<code>manifestUrl</code>、<code>mountPath</code>、<code>environment</code>、<code>cacheNamespaceSeed</code> 这九个字段在首次生产发布后即被记入发布基线，不可更改。首次上线前先确定真实的 HTTPS 域名、部署路径和 <code>sw.js</code> 的位置；之后再改属于迁移，需要 ADR 与迁移计划，不是普通发版。
:::

## 1. 声明身份与策略

在项目根目录新增 <code>pwa.config.ts</code>，必须导出 <code>IDENTITY</code>、<code>INSTALL</code>、<code>POLICY</code> 三个常量：先按[按功能接入](/guide/integration-by-capability)决定要启用哪些能力；只需要安装、应用壳和默认离线页时，复制[配置指南](/guide/configuration)开头的示例，再替换真实 origin、名称和图标。前置条件：

- <code>public/icons</code> 下要有四个真实的 PNG 图标：192 与 512 两种尺寸，各含 <code>any</code> 和 <code>maskable</code> 两种用途；缺任何一个都会报 <code>install.missing-icon-variant</code>。
- 下面插件里的 <code>offlinePage: {}</code> 要求 <code>POLICY.offlineFallback.enabled: true</code>，否则构建报 <code>vite.offline-page-without-fallback</code>。
- 子路径部署（如 <code>/app/</code>）按配置指南中的[对应表](/guide/configuration#生产身份要保持稳定)逐项替换；<code>serviceWorkerUrl</code> 必须直接位于 <code>scope</code> 目录下。

## 2. 挂载构建插件

~~~ts
// vite.config.ts
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { IDENTITY, INSTALL, POLICY } from "./pwa.config.ts";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    pwa({
      identity: IDENTITY,
      install: INSTALL,
      policy: POLICY,
      topology: { kind: "standalone-origin" },
      offlinePage: {},
    }),
  ],
});
~~~

已有 Vite + React 项目应把 <code>pwa()</code> 加入现有 <code>plugins</code> 数组，保留 <code>@vitejs/plugin-react</code>、路由等原有插件；不要用示例中的数组覆盖原配置。

Vite 8 默认构建能解析省略扩展名的导入，但会提示未来原生配置加载器不支持；这里写出 <code>.ts</code> 扩展名。若现有项目的类型检查报 <code>TS5097</code>，请在检查 <code>vite.config.ts</code> 的 TypeScript 配置中启用 <code>allowImportingTsExtensions</code>，并保持 <code>noEmit</code>。

## 3. 提供页面绑定并主动注册

~~~tsx
// src/main.tsx
import config from "virtual:pwa-config";
import { PwaProvider, usePwa } from "@pwa-platform/react";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

function Registrar() {
  const { register } = usePwa();
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    void register().catch((error: unknown) => {
      console.error("PWA worker 注册失败", error);
    });
  }, [register]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PwaProvider config={config} updateCheck={{ intervalMs: 1_800_000 }}>
      <Registrar />
      <App />
    </PwaProvider>
  </StrictMode>,
);
~~~

<code>updateCheck</code> 可选，默认关闭；<code>1_800_000</code> 即 30 分钟。<code>intervalMs</code> 必须是 60000 到 2147483647 之间的整数，否则创建绑定时抛错。<code>register()</code> 成功后满一个完整间隔才做第一次检查，不会立即检查；标签页隐藏时暂停，重新可见时补检；失败静默处理。详见[安装与更新](/guide/updates)。

在已有 <code>tsconfig</code> 的 <code>compilerOptions.types</code> 中追加 <code>@pwa-platform/vite/virtual</code>，保留项目原有类型：

~~~json
{ "compilerOptions": { "types": ["vite/client", "@pwa-platform/vite/virtual"] } }
~~~

在组件中读取状态并提供用户操作：

~~~tsx
// src/PwaActions.tsx
import { usePwa } from "@pwa-platform/react";
import { useState } from "react";

export function PwaActions() {
  const pwa = usePwa();
  const [installAttempted, setInstallAttempted] = useState(false);
  return (
    <>
      {pwa.state.installEligible && !installAttempted && (
        <button
          type="button"
          onClick={() => {
            setInstallAttempted(true);
            void pwa.promptInstall().catch((error: unknown) => {
              console.error("PWA 安装提示失败", error);
            });
          }}
        >
          安装应用
        </button>
      )}
      {pwa.state.updateWaiting && (
        <button
          type="button"
          onClick={() => {
            void pwa.applyUpdate().catch((error: unknown) => {
              console.error("PWA 更新接管失败", error);
            });
          }}
        >
          应用更新
        </button>
      )}
    </>
  );
}
~~~

在现有 <code>App.tsx</code> 中导入操作组件（<code>import { PwaActions } from "./PwaActions";</code>），并在现有 JSX 中渲染 <code>&lt;PwaActions /&gt;</code>，例如放在工具栏。上面的 <code>&lt;App /&gt;</code> 已位于 <code>PwaProvider</code> 内；只定义组件而不渲染，不会出现安装或更新按钮。

这是最小 API 示例：首次尝试安装后隐藏一次性提示按钮，失败时只写入控制台。业务界面仍需提供可见的错误与重试，并处理跨标签页变化、未保存内容和刷新时机，见[安装与更新](/guide/updates)。
<code>register()</code> 失败时会拒绝 Promise，平台不会记住失败；修复原因后可再次调用。排查方法见[常见问题](/guide/troubleshooting#worker-注册失败)。

## 4. 构建并验收

本机验收使用[预览身份](/guide/configuration#两份身份生产与本地验收)（先按该节把 <code>PREVIEW_IDENTITY</code> 与 <code>identityFor(mode)</code> 加进 <code>pwa.config.ts</code> 和 <code>vite.config.ts</code>）。构建并预览，<code>--port</code> 必须与预览身份 <code>origin</code> 的端口一致：

~~~bash
pnpm exec vite build --mode preview --outDir dist-preview
pnpm exec vite preview --outDir dist-preview --port 4173 --strictPort
~~~

<code>dist-preview</code> 应包含：位于 <code>IDENTITY.serviceWorkerUrl</code> 的 <code>sw.js</code>、<code>manifest.webmanifest</code>、<code>pwa-recovery-worker.js</code>，启用 <code>offlinePage</code> 时还有离线页（文件名取自 <code>POLICY.offlineFallback.path</code>，示例为 <code>offline.html</code>）。**这个目录只用于本机，不能部署。**部署前先读[服务器与 CDN 配置](/operations/hosting)，再用不带 <code>--mode</code> 的 <code>pnpm exec vite build</code> 重新构建，把 <code>dist</code> 部署到与 <code>IDENTITY.origin</code>、<code>scope</code> 一致的 HTTPS 地址，然后按[上线前检查](/start/checklist)确认。

### 本机验收通过的标准

用**独立的浏览器配置文件**（新建 profile 或无痕窗口，避免别的项目留在 <code>localhost</code> 上的旧 worker 与缓存干扰）打开 `http://localhost:4173/`，逐项满足才算本机验收通过：

**本机验收通过 =**

1. 页面里只有一个 <code>&lt;link rel="manifest"&gt;</code>，指向 <code>IDENTITY.manifestUrl</code>；DevTools 的 Application → Manifest 能读到 <code>id</code>、<code>start_url</code> 与图标，没有错误。
2. Application → Service workers 里 worker 已注册，scope 等于 <code>IDENTITY.scope</code>，状态为 <code>activated</code>。
3. 等到 <code>activated</code> 后刷新一次，页面受 worker 控制（控制台里 <code>navigator.serviceWorker.controller</code> 不为 <code>null</code>）；首次访问的页面永远不受控，见[常见问题](/guide/troubleshooting#构建成功-但断网仍然白屏)。
4. 在 Network 里勾选 Offline（或停掉预览服务）后刷新，仍显示应用外壳。
5. 离线时访问一个没有访问过的路由，显示离线页。

没有浏览器（例如纯终端或 CI）时，可以先做一个不依赖 DevTools 的最小检查。它只证明产物和响应头没问题，**不能代替上面五项**：

~~~bash
ls dist-preview   # 应有 sw.js、manifest.webmanifest、pwa-recovery-worker.js，启用 offlinePage 时还有 offline.html
curl -sI http://localhost:4173/sw.js | grep -i -E '^(HTTP|cache-control)'   # 应为 200，且 Cache-Control 含 no-cache
curl -s http://localhost:4173/ | grep -o '<link[^>]*manifest[^>]*>'   # 应恰好一行
~~~

验收完成后，在 DevTools 的 Application → Service workers 点 Unregister，并在 Storage 里 Clear site data；也可在控制台运行下面的代码，然后关闭该 profile。否则 <code>localhost:4173</code> 上残留的 worker 会拦截之后同端口上的其他项目。

~~~js
await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
~~~

平台不会在组件挂载时自动注册 worker；<code>Registrar</code> 的调用是必需的。
