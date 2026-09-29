# 关卡 1：Vite + React

适用范围：Vite 5／8、React 19.2 及以上且低于 20、Node.js 22.12 及以上。已有项目保留 `@vitejs/plugin-react`、路由等原有插件，只**追加**，不要替换。

## 1. 挂载构建插件

<!-- 出处：website/start/react.md -->
```ts
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
```

把 `pwa()` 加进现有 `plugins` 数组。要英文离线页，写 `offlinePage: { locale: "en" }`（构建时选定）。

## 2. 提供页面绑定并主动注册

<!-- 出处：website/start/react.md -->
```tsx
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
```

`Registrar` 只在生产环境调用 `register()`，平台不会自动注册。`updateCheck` 是默认档的定时检查（30 分钟），采访确认没有长期不刷新的独立窗口用户时可以去掉。

给虚拟模块加类型，在现有 `tsconfig` 的 `compilerOptions.types` 里**追加**，保留原有类型：

<!-- 出处：website/start/react.md -->
```json
{ "compilerOptions": { "types": ["vite/client", "@pwa-platform/vite/virtual"] } }
```

## 3. 默认更新提示

放在 `PwaProvider` 内：

<!-- 出处：website/guide/updates.md -->
```tsx
import { PwaUpdateNotice } from "@pwa-platform/react/ui";
import "@pwa-platform/react/update-notice.css";

<PwaProvider config={config}>
  <App />
  <PwaUpdateNotice
    position="bottom-right"
    colors={{ primaryButtonBackground: "#006e52", primaryButtonText: "#ffffff" }}
  />
</PwaProvider>
```

英文界面给组件加 `locale="en"`（运行时选择，默认 `zh-CN`）。需要保护未保存内容时（采访 Q8 为"有"），传入 `reloadPage={...}`，由业务先确认或保存再 `location.reload()`；默认组件不会替业务判断。

## 4. 验证

`vite dev` 只提供 `virtual:pwa-config`，不生成平台 worker。安装、离线与更新必须用 `vite build` 加 `vite preview`，或部署后验证。
