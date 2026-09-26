# 默认离线页接入说明

`@pwa-platform/vite` 可以替你生成一个离线页：断网时打开应用里没缓存过的页面，用户看到的是一个排版好、跟随亮暗主题、写着应用名称的页面，而不是浏览器自带的错误页。它是**可选**的，不开启时插件的产物与以前完全相同。设计理由见 [ADR-0036](../adr/0036-platform-default-offline-page.md)，契约见 [vite-adapter 规格](../../spec/vite-adapter.md)"修订：平台默认离线页"。

## 1. 开启

两处都要写：策略里开启离线导航回退并为该路径写一条资源规则，插件上打开 `offlinePage`。

```ts
// pwa.config.ts
export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [
    // ……你原有的规则
    { pathPrefix: "/offline.html", resourceClass: "asset", cache: "cache-first" },
  ],
};

// vite.config.ts
pwa({ identity: IDENTITY, policy: POLICY, install: INSTALL, topology: { kind: "standalone-origin" }, offlinePage: {} });
```

页面生成在 `offlineFallback.path` 对应的位置，和你自己写的离线页一样进入预缓存。以下情况构建会直接失败，不会带着问题上线：

| 诊断码 | 原因 |
|---|---|
| `vite.offline-page-without-fallback` | 设置了 `offlinePage`，但策略没有开启 `offlineFallback` |
| `vite.offline-page-conflict` | 该路径上已经有文件（例如 `public/offline.html`）。二选一：删掉自己的文件，或不开 `offlinePage` |
| `vite.offline-page-locale-invalid` | `locale` 不是 `zh-CN` 或 `en` |
| `vite.offline-page-message-invalid` | `messages` 有未知键、空串、非字符串，或超过 200 个字符 |
| `vite.offline-page-css-invalid` | `css` 不是字符串，或含 `</style` |

错误信息只给诊断码和字段路径，不回显你写的值（`messages` 里写错的键名也不会出现在错误信息里）。`css` 中的 `</style` 不区分大小写都会被拒绝；换行会统一为 LF 后再写入并计算哈希。

## 2. 语言与文案

语言在**构建时固定**，默认 `zh-CN`，页面不会按浏览器语言切换。`messages` 可以只覆盖其中几项：

```ts
offlinePage: { locale: "en", messages: { heading: "No connection right now" } }
```

| 键 | zh-CN | en |
|---|---|---|
| `documentTitle` | 离线 | Offline |
| `heading` | 当前处于离线状态 | You're offline |
| `body` | 网络恢复后页面会自动重新加载。 | This page will reload when your connection is back. |
| `retry` | 重试 | Try again |

应用名称取自 `install.name`；`install` 为 `null` 时不显示。所有文案都在构建时转义后写进静态 HTML，写 `<`、`&` 这类字符是安全的，会原样显示。

## 3. 样式与主题

页面自带一段内联默认样式，亮暗两套，背景铺满整个视口。换肤只需覆盖变量，用 `css` 选项追加：

```ts
offlinePage: { css: ".pwa-offline { --pwa-offline-accent: #c8102e; }" }
```

变量与[入口恢复页](entry-recovery-integration.md)一一对应，只换了前缀：`--pwa-offline-bg`、`-fg`、`-muted`、`-accent`、`-accent-fg`、`-radius`、`-max-width`、`-font`，亮暗默认值也与恢复页相同。class 为 `pwa-offline`、`pwa-offline__app`、`pwa-offline__heading`、`pwa-offline__body`、`pwa-offline__retry`。表上没有的一律不是契约。

根容器铺满整个视口，内容宽度由 `--pwa-offline-max-width` 通过左右内边距限制；内容超出视口高度时从顶部开始并可滚动。改宽度请只覆盖变量，不要覆盖根容器的 `margin` 或 `max-width`。

暗色换肤的两条写法与恢复页相同（`@media (prefers-color-scheme: dark)` 下的 `.pwa-offline:not([data-theme="light"])`，以及 `.pwa-offline[data-theme="dark"]`）。离线页是独立文档，没有应用脚本去设置 `data-theme`，实际生效的只有系统偏好；两条都写，是为了让两个页面的换肤 CSS 可以同一种写法。

## 4. 严格 CSP

页面有两到三段内联内容：默认样式、你的 `css`（如果有）、一段固定的脚本（点击重试时刷新，网络恢复时自动刷新）。脚本收到 `online` 事件时、以及页面可见时每 10 秒，以不经过平台缓存的同源 `HEAD` 请求检查当前应用的公开 worker 脚本；只有返回 2xx 才刷新。Android 的 `online` 事件可能早于实际联网，因此事件本身不直接触发刷新；定时探测也能处理部分 iPhone 不派发 `online` 的情况。探测不读取业务接口或第三方域名。构建日志会打印它们的哈希：

```
offline.html style (default): sha256-…
offline.html style (host css): sha256-…
offline.html script: sha256-…
```

若你的 CSP 不允许 `unsafe-inline`，把样式哈希填进 `style-src`、脚本哈希填进 `script-src`；`connect-src` 还须允许 `'self'`，才能使用上述同源联网探测。**平台升级或改了 `css` 之后要重新取。** 脚本或同源探测被拦截时，页面内容与“重试”按钮仍可显示；被拦截的自动恢复路径不会生效。

## 5. 已验证到什么程度

- 单元与构建测试：文案、转义、class 与样式对齐、五个诊断码、预缓存、日志中的哈希与页面中的内联内容一致；不开启时插件产物与以前逐字节相同（110 个文件）。
- 真实浏览器（本机 Chrome 桌面端）：断网时显示生成的页面、中英文与覆盖文案、页面本身被预缓存、暗色背景铺满视口、恢复联网后自动刷新；即使浏览器没有派发 `online`，同源 `HEAD` 探测也能触发刷新。
- Android 与 iPhone 上的英文离线页已实测。iPhone 27.0 的安装窗口断网时仍报告 `navigator.onLine=true`，原实现恢复联网后没有自动重载；同源定时探测已在 iPhone Vue 与 React 安装窗口通过真机复测。Android 真机另发现 `online` 事件可能早于实际联网，最新修复改为先探测再刷新；最终版本的手机复测正在进行。Nuxt 暂不支持该选项，Nuxt 应用仍需自带离线页。
