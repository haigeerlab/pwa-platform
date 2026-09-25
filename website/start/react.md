# Vite + React 接入

适用范围：Vite 8、React 19.2 及以上且低于 20，构建环境为 Node.js 22.12 或更高版本。先按[包选择](/start/choose)安装，再完成以下步骤。示例使用域名根路径；子路径部署需要同步调整所有路径。

本页的页面入口依赖构建期提供的 <code>virtual:pwa-config</code>。当前插件不支持 <code>vite dev</code>；本地验证请运行生产构建，再用 <code>vite preview</code> 打开产物。

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
    void register();
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

~~~ts
// src/virtual-pwa.d.ts
declare module "virtual:pwa-config" {
  import type { PwaProviderProps } from "@pwa-platform/react";
  const config: PwaProviderProps["config"];
  export default config;
}
~~~

在组件中读取状态并提供用户操作：

~~~tsx
// src/PwaActions.tsx
import { usePwa } from "@pwa-platform/react";

export function PwaActions() {
  const pwa = usePwa();
  return (
    <>
      {pwa.state.installEligible && (
        <button onClick={() => void pwa.promptInstall()}>安装应用</button>
      )}
      {pwa.state.updateWaiting && (
        <button onClick={() => void pwa.applyUpdate()}>应用更新</button>
      )}
    </>
  );
}
~~~

在现有 <code>App.tsx</code> 中导入操作组件（<code>import { PwaActions } from "./PwaActions";</code>），并在现有 JSX 中渲染 <code>&lt;PwaActions /&gt;</code>，例如放在工具栏。上面的 <code>&lt;App /&gt;</code> 已位于 <code>PwaProvider</code> 内；只定义组件而不渲染，不会出现安装或更新按钮。

这是最小 API 示例。完整更新界面要处理接管失败、跨标签页变化、未保存内容和刷新时机，见[安装与更新](/guide/updates)。

## 4. 构建并验收

运行生产构建，将产物部署到身份指定的 HTTPS 地址，并执行[上线前检查](/start/checklist)。平台不会在组件挂载时自动注册 worker；<code>Registrar</code> 的调用是必需的。
