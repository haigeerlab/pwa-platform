# 关卡 1：`pwa.config.ts`

默认档（应用壳、离线页、更新提示，不开运行时缓存）的身份、安装信息与策略。下面的代码块**逐字取自**《身份、安装信息与策略》，这份文档由真实浏览器测试覆盖；不要凭记忆改写。

<!-- 出处：website/guide/configuration.md -->
```ts
// pwa.config.ts
import type {
  PwaIdentity,
  PwaInstallMetadata,
  PwaPolicy,
} from "@pwa-platform/contracts";

export const IDENTITY: PwaIdentity = {
  appId: "businessapp",
  manifestId: "/",
  origin: "https://app.example.com",
  scope: "/",
  serviceWorkerUrl: "/sw.js",
  manifestUrl: "/manifest.webmanifest",
  mountPath: "/",
  environment: "production",
  cacheNamespaceSeed: "r1",
};

export const INSTALL: PwaInstallMetadata = {
  startUrl: "/",
  display: "standalone",
  name: "业务应用",
  shortName: "业务",
  themeColor: "#087b8b",
  backgroundColor: "#ffffff",
  icons: [
    { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    { pathPrefix: "/", resourceClass: "navigation-public-static", cache: "network-first" },
    { pathPrefix: "/index.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
    { pathPrefix: "/assets", resourceClass: "asset", cache: "cache-first" },
  ],
};
```

## 必须替换的内容

- `IDENTITY` 的每一项：写入前先过闸门 **G2**，向人确认具体取值。`origin` 必须是真实的 `https` 站点，不含路径和结尾斜杠。
- `INSTALL.name`、`shortName` 用所选语言书写；`icons` 指向 `public/icons/` 下的**真实文件**，声明的 MIME 与尺寸要与文件一致。
- 每个环境（开发、测试、生产）各有独立的 `environment` 与 `cacheNamespaceSeed`，不要拿生产身份去做本地或测试验收。

## 不需要安装能力（Q6 为"否"）

`INSTALL` 整段不写，身份之外的安装入口改为：插件选项里 `install: null`（不生成 manifest），策略里 `install: { enabled: false }`。它不会自动关闭 worker 或缓存策略，离线页与更新提示照常工作。

## 多个环境

每个环境都是**独立身份**：不同 `environment` 各有互不影响的缓存命名空间（依据 `website/guide/configuration.md` 的"本地验收用什么 environment"，不复述其全部内容）。所以 `pwa.config.ts` 里的 `IDENTITY` 是**生产身份**，只有它要过 G2。

采访 Q5 回答了不止生产环境时：

- 每个非生产环境（例如本地 `vite preview` 验收用的 `"preview"`）单独写一份身份，`environment` 与 `cacheNamespaceSeed` 都取自己的值，`origin` 用该环境的真实地址（本机可用 `http://localhost:4173`）。**不复用生产的取值。**
- 向人问清这些环境的名字和地址，环境名和公开地址（含 `localhost`）写进状态文件的"决策记录"，内网、预发等非公开地址不写进状态文件（口头给出、只写进配置，配置是否提交由业务方决定）；它们不是首次生产注册前的身份，不用走 G2，但仍要人给出，不要自己编。`cacheNamespaceSeed`、`appId` 你可以提议，但必须连同其他取值一起读出来，请人确认后再写，不能只是宣布。
- 用哪份身份由构建入口决定，例如按 Vite 的 mode。**生产构建不能读到非生产身份，非生产构建也不能拿到生产身份。**

## 部署在子路径（例如 `/app/`）

浏览器看到的 URL 都要带前缀：Vite `base`、`manifestId`、`scope`、`mountPath`、`serviceWorkerUrl`、`manifestUrl`、`startUrl` 和图标的 `src`。**策略里的 `pathPrefix` 与 `offlineFallback.path` 仍然相对挂载点，不要再写 `/app`**。`serviceWorkerUrl` 必须直接位于 `scope` 目录下，否则构建报 `identity.scope-outside-worker-directory`。

## 不在这里做的事

- 业务方要求公共运行时缓存：不要改这里的策略，转关卡 2，由人逐个确认后再升级策略。
- 同一域名下有多个应用：需要共享 origin 登记表，`topology` 不再是 `standalone-origin`，先停下与人确认。
