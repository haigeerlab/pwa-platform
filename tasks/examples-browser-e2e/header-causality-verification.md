# HTTP 响应头与 PWA 行为：本地对照实验

日期：2026-10-01。对象：本仓库 Vue 示例的真实 v1/v2 Vite 构建产物、`FixtureServer`、Google Chrome 154.0.8037.59（桌面，无头）。所有请求指向临时 `localhost`，没有修改外部站点或线上 CDN。实验代码见 `packages/examples-browser-e2e/browser-tests/header-causality.spec.ts`；公共数据缓存复核见 `packages/sw-runtime/browser-tests/runtime-cache.spec.ts`。

## 方法与判读边界

- `build-verifier` 的 `response-headers` 与 `html-headers` 两项只判断相应资源的 `Cache-Control`；新增独立的 `worker-mime` 判断 worker 主脚本的 `Content-Type`。它们不判断 `Vary`、`ETag` 或浏览器功能本身。下文公共数据缓存的 MIME／`Vary` 结果来自 `sw-runtime` 的另一层规则，不属于这三项发布检查。
- 每个用例在独立浏览器上下文和独立 fixture 服务器中，只改所测路径的响应头；v1→v2 的构建产物来自同一示例的真实构建。记录浏览器请求是否到达服务器、页面版本或更新提示，并同时调用现有 `build-verifier`。响应头值从实际 HTTP 响应读取。
- HTML、manifest、指纹资源的 HTTP 缓存实验禁止 Service Worker，避免把浏览器 HTTP 缓存与 worker 的运行时策略混在一起；HTML 还实际导航到测试 URL，观察界面的 `#version`。因此 HTML 结论证明浏览器 HTTP 缓存的风险，不等于断言当前平台 worker 一定以相同方式导航。manifest 变名组只修改 v2 构建产物中的 `name`，测试后恢复文件。
- worker 用例保留真实 Service Worker。先用平台默认的 `updateViaCache: "imports"`，再在测试页显式重注册为 `"all"`。`registration.update()` 代表一次主动检查，不代表所有自动检查时机。
- 另设受 worker 控制的入口导航组：新标签页的 `navigator.serviceWorker.controller` 指向本应用 worker；只改变 `/app/` 入口的缓存头，其余构建文件逐路径恢复基线。它比无 worker 的 HTML 组更接近示例 PWA 的实际页面加载。
- `no-cache` 是本项目发布门禁的**字面规则**，不是所有 PWA 的规范硬性条件。`public, max-age=0, must-revalidate` 在本次浏览器实验中实现了重新取资源，但现有校验器仍判失败；两者应分开讨论。

## 实测结果

`Cache-Control` 的数值均为响应头。`请求数`只统计指定 URL 在该用例观测窗口内抵达 fixture 服务器的请求，门禁结果由真实构建计划和实收头计算。

| 资源和条件 | 值 | 请求数 | 浏览器观测 | 发布门禁 |
|---|---|---:|---|---|
| worker，默认 `updateViaCache=imports` | `no-cache` | 1 | v2 更新提示出现 | 通过 |
| worker，默认 `imports` | `public, max-age=0, must-revalidate` | 1 | v2 更新提示出现 | 不通过 |
| worker，默认 `imports` | `public, max-age=14400` | 1 | v2 更新提示出现 | 不通过 |
| worker，显式 `updateViaCache=all` | `no-cache` | 1 | v2 worker 进入 waiting，更新提示出现 | 通过项目头规则 |
| worker，显式 `all` | `public, max-age=14400` | 0 | 本次检查未见 waiting worker 或更新提示 | 不通过项目头规则 |
| worker `Content-Type`，其余头保持基线 | `application/javascript` / `text/plain` | — | JavaScript：注册成功、离线重载显示 v1；`text/plain`：浏览器报 MIME 错误、未注册、离线重载失败 | 两者的 `response-headers` **都通过**；`worker-mime` 前者通过、后者失败 |
| 公开 HTML `/app/index.html?header-causality` | `no-cache` | 2 | v2 发布后同 URL 返回新 HTML，导航显示 v2 | 通过 |
| 同上 | `public, max-age=0, must-revalidate` | 2 | 返回新 HTML，导航显示 v2 | 不通过 |
| 同上 | `public, max-age=14400` | 1 | 返回旧 HTML，导航仍显示 v1 | 不通过 |
| 受 worker 控制的新标签页，入口 `/app/` | `no-cache` | 1 | v2 发布后页面显示 v2 | 通过项目头规则 |
| 同上 | `public, max-age=0, must-revalidate` | 1 | 页面显示 v2 | 不通过项目字面规则 |
| 同上 | `public, max-age=14400` | 0 | 页面仍显示 v1 | 不通过项目头规则 |
| manifest，同 URL 读取两次 | `no-cache` / `public, max-age=0, must-revalidate` / `public, max-age=14400` | 2 / 2 / 1 | 长缓存避免第二次网络请求；未改变 manifest 内容，未驱动原生安装界面 | 仅 `no-cache` 通过 |
| manifest，v2 `name` 改为 `PWA Platform Example Updated`，再读同 URL | `no-cache` / `public, max-age=0, must-revalidate` / `public, max-age=14400` | 2 / 2 / 1 | 前两者取得新名称；长缓存仍返回旧名称。这证明元数据取得路径受缓存头影响，不直接证明已安装应用名称完成更新 | 本组复用上行的头规则 |
| 带指纹 JS，同 URL 读取两次 | `no-cache` / `public, max-age=0, must-revalidate` / `public, max-age=14400` / `public, max-age=31536000, immutable` | 2 / 2 / 1 / 1 | 正 `max-age` 减少重复请求；本次没有证明 `immutable` 比普通正 `max-age` 多带来某项功能 | 本次四个值中仅最后一项通过；校验器要求正 `max-age` 和 `immutable`，不固定一年 |

运行时公共数据缓存使用仓库已有真实 worker E2E 复核：合格 JSON 在线读取后可离线读取；响应带 `Cache-Control: no-store`、`private` 或 `Vary: Cookie`，以及 JSON 路径返回 `Content-Type: text/plain` 时，在线仍可读取，但 worker 不写入公共缓存，离线读取失败。`stale-while-revalidate` 路径收到 `Cache-Control: no-cache` 也不写入；`Vary: Origin` 拒绝有 worker 控制台诊断。此处的影响来自平台的**公共缓存准入策略**，而不是浏览器单靠这些字段关闭了整个 PWA。

这组对照把“脚本判定与实测不一致”分成三类：`max-age=0, must-revalidate` 是当前字面门禁比本次 Chrome 行为严格；长缓存 worker 在默认 `imports` 下没有阻断本次更新，但在 `all` 下阻断，属于有触发条件的风险；错误 worker MIME 使功能失败而旧 `response-headers` 仍通过，这一缺口现由独立 `worker-mime` 检查覆盖。指纹资源的长缓存主要在本次实验中体现为请求次数减少，不能写成缺少 `immutable` 已导致功能失败。

## 给运维与后端的字段说明

| 响应类别 | 建议字段值 | 为什么这样配；本次证据的范围 |
|---|---|---|
| worker 主脚本 | `Cache-Control: no-cache` | 在 `updateViaCache=all` 的受控实验中，长缓存挡住本次更新请求，`no-cache` 允许更新；平台默认 `imports` 下长缓存未阻断本次更新。因此这是跨注册模式的防护要求，不能声称当前默认配置已故障。CDN 是否额外返回旧内容未测。 |
| worker 主脚本 MIME | `Content-Type: text/javascript`（`application/javascript` 也受浏览器认可） | `text/plain` 正反例使注册失败并失去离线启动；`response-headers`／`html-headers` 不检查该字段，独立 `worker-mime` 发布检查会阻断错误值。 |
| 公开 HTML（入口、启动页、离线页） | `Cache-Control: no-cache` | 长缓存的受控浏览器导航保持旧 HTML/旧界面；在本示例实际 worker 控制下，新标签页也停在 v1，入口请求未抵达服务器。重新校验后取得 v2。`max-age=0, must-revalidate` 在本次实验中同样取得 v2，但当前校验器字面上只接受 `no-cache`。离线页没有单独做版本变更实验。 |
| manifest | `Cache-Control: no-cache` | v2 名称变更后再次读取同 URL，`no-cache` 取得新名称，长缓存仍取得旧名称；这是更新流程的输入差异。Chrome 原生安装记录是否完成更新还受浏览器检查时机和窗口关闭影响，本次**没有证明长缓存已造成已安装应用更新失败**。 |
| 带内容指纹的 JS/CSS 等静态资源 | `Cache-Control: public, max-age=31536000, immutable` | 正 `max-age` 在重复读取时将服务器请求从 2 次降为 1 次；本次未单独证明 `immutable` 的增量效果。旧版本指纹资源仍须按发布保留窗口提供，不能仅靠这个头。 |
| 显式公共运行时 JSON/HTML 缓存 | 公共内容需符合策略的 MIME 与 `Vary` 条件；敏感私有内容使用 `Cache-Control: private, no-store` | `private`、`no-store`、`Vary: Cookie`、错误 MIME 各自会让平台拒绝公共缓存：在线可用，离线不可读。`private` 单独存在并不等于禁止浏览器私有缓存；SWR 路径的 `no-cache` 也会被拒绝。不能把“离线失败”解释为全站 PWA 安装失败。 |

当前校验器把 `no-cache` 作为发布约定，而不是对其他缓存指令做语义归一化。因此看到 `public, max-age=0, must-revalidate` 报错时，运维可以统一改成项目约定的 `no-cache` 使门禁通过；**不建议仅凭本次 Chrome 成功就放宽门禁**。RFC 9111 规定，无参数的响应 `no-cache` 要求缓存每次复用前成功验证；`max-age=0` 表达的是零秒新鲜期，`must-revalidate` 只约束已过期响应。共享缓存还可由 `s-maxage` 覆盖 `max-age` 的新鲜期。故两种头值在本次浏览器路径中的观测相同，不等于所有浏览器、CDN 与附加指令组合下的契约等价。依据：[RFC 9111 §4.2.1、§5.2.2](https://www.rfc-editor.org/rfc/rfc9111.html)。

2026-10-01 对自有 Cloudflare Pages React/Vue 主站只读 GET 核对：两站 `/app/`、`/app/sw.js`、`/app/manifest.webmanifest` 均返回 HTTP 200 与 `Cache-Control: no-cache`；HTML、JavaScript、manifest 的 `Content-Type` 分别为 `text/html; charset=utf-8`、`application/javascript`、`application/manifest+json`。这些请求没有修改线上响应头，也没有进行线上反例部署，因此只能证明当前配置，不能把本地因果结论直接说成 Cloudflare 已发生故障。

## 复现与未覆盖项

本机验证记录：`pnpm build` 通过；示例包 `typecheck` 通过；完整响应头对照组 **23 passed**（含新增 manifest 变名组 3 项）；运行时公共缓存相关用例分两次执行 **6 passed + 2 passed**；新增测试文件 ESLint 与 `git diff --check` 通过。Chrome 启动与 localhost 测试在本机沙箱外执行，首次沙箱内 Chrome 启动失败不计为产品故障。

批准 [ADR-0051](../../docs/adr/0051-worker-script-mime-release-check.md) 后复跑同一 23 项浏览器对照，全部通过；其中 MIME 组同时断言 `response-headers` 两个值都通过、`worker-mime` 仅 JavaScript 类型通过。Vue/React 的真实发布报告用例各通过一次，均含六项必需检查。全仓 `pnpm build`、`typecheck`、`lint`、`test` 和 `check:publish` 通过；详细记录见[build-verifier 验证记录](../build-verifier/verification.md)。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @pwa-platform/examples-browser-e2e typecheck
pnpm --filter @pwa-platform/examples-browser-e2e exec playwright test browser-tests/header-causality.spec.ts --reporter=list
pnpm --filter @pwa-platform/sw-runtime exec playwright test browser-tests/runtime-cache.spec.ts --grep 'online read writes|Cache-Control: no-store|Cache-Control: private|Vary: Cookie|SWR under Cache-Control: no-cache|wrong MIME|Vary: Origin rejection' --reporter=line
```

另做一次独立 Chrome 154 临时用户配置探针（不计入自动化通过数）：CDP `PWA.install` 成功，`chrome://web-app-internals` 显示安装名为 `PWA Platform Example`。发布变名的 v2 后，`no-cache` 使 `Page.getAppManifest` 读到 `PWA Platform Example Updated`，观测窗口内服务器收到 2 次 manifest 请求；`max-age=14400` 下页面 manifest 仍是旧名，服务器收到 0 次请求。随后以 CDP `PWA.launch` 启动并关闭 standalone 窗口，两组的 `web-app-internals` 安装名和 `manifest_update_time` 都没有变化。这说明**本次没有驱动到可判定的原生 manifest 更新周期**；不能把 `no-cache` 页面已取新名写成已安装应用已更新，也不能把长缓存组写成已证实的原生更新故障。Chrome 文档说明桌面版的检查节奏及窗口关闭后应用变更的条件，见 [web.dev：How Chrome handles updates to the web app manifest](https://web.dev/articles/manifest-updates?hl=en)。

未覆盖：原生安装后的 manifest 元数据更新结果；其他浏览器和移动端；真实 Nginx/CDN 的共享缓存、失效传播与响应变体；worker 的导入脚本；长期自动检查与离线时序。没有这些证据时，不把某条线上配置判成已经造成对应功能故障。

规范与浏览器机制参考：[RFC 9111 HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)、[Chrome：Fresher service workers, by default](https://developer.chrome.com/blog/fresher-sw)。
