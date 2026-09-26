# Vite + React 接入

适用范围：Vite 5／8、React 19.2 及以上且低于 20，构建环境为 Node.js 22.12 或更高版本。先按[包选择](/start/choose)固定安装 beta.2，再完成以下步骤。示例使用域名根路径；子路径部署需要同步调整所有路径。

beta.2 在 <code>vite dev</code> 和生产构建中都提供 <code>virtual:pwa-config</code>；开发服务不生成平台 worker。安装、离线与更新仍须运行生产构建，再用 <code>vite preview</code> 或目标 HTTPS 站点验收。
示例要求浏览器提供 <code>navigator.serviceWorker</code>；若业务系统还要在不提供此 API 的环境运行，请先看[兼容范围中的降级说明](/reference/compatibility#不支持-service-worker-的环境)。

## 1. 声明身份与策略

新增 <code>pwa.config.ts</code>，按[配置指南](/guide/configuration)填写真实部署 origin、名称和图标。

## 2. 挂载构建插件

~~~ts
// vite.config.ts
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";
import { IDENTITY, INSTALL, POLICY } from "./pwa.config.ts";

export default defineConfig({
  base: "/",
  plugins: [
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

运行生产构建，将产物部署到身份指定的 HTTPS 地址，并执行[上线前检查](/start/checklist)。平台不会在组件挂载时自动注册 worker；<code>Registrar</code> 的调用是必需的。
