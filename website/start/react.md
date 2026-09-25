# Vite + React 接入

适用范围：Vite 8、React 19.2 及以上。先按[包选择](/start/choose)安装，再完成以下步骤。示例使用域名根路径；子路径部署需要同步调整所有路径。

## 1. 声明身份与策略

新增 <code>pwa.config.ts</code>，按[配置指南](/guide/configuration)填写真实部署 origin、名称和图标。

## 2. 挂载构建插件

~~~ts
// vite.config.ts
import { pwa } from "@pwa-platform/vite";
import { defineConfig } from "vite";
import { IDENTITY, INSTALL, POLICY } from "./pwa.config";

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

这是最小 API 示例。完整更新界面要处理接管失败、跨标签页变化、未保存内容和刷新时机，见[安装与更新](/guide/updates)。

## 4. 构建并验收

运行生产构建，将产物部署到身份指定的 HTTPS 地址，并执行[上线前检查](/start/checklist)。平台不会在组件挂载时自动注册 worker；<code>Registrar</code> 的调用是必需的。
