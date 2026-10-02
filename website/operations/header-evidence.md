---
pageClass: header-evidence
---

# 响应头配置为什么影响 PWA

这页可以直接交给负责 Nginx、CDN 或静态托管的同事。先按下表核对**浏览器实收的最终响应**，再看下方的正反例，理解改动能解决什么、哪些影响尚未证实。具体配置示例和部署顺序见[服务器与 CDN 配置](/operations/hosting)，发布门禁见[部署与发布](/operations/release)。

手机上可横向滑动表格查看全部列。

> 证据范围：2026-10-01，平台 Vue 示例的真实 v1/v2 构建、临时 localhost 服务、桌面 Chrome 154.0.8037.59。每组只改变所测资源的响应头；没有修改外部站点或线上 CDN。这是**本地自动化证据**，不是某个生产站点已经发生故障的证明。

## 发给运维的配置清单

以下路径以应用在浏览器中挂载于 `/app/` 为例。`/app/` 是**公开 URL 前缀**，不要求 `dist/` 内有一个 `app/` 文件夹；它由构建时的 Vite `base`、PWA 身份路径和服务器映射共同决定。请换成实际 `serviceWorkerUrl`、`manifestUrl`、入口、离线页和资产目录，详见[路径与构建产物的关系](#路径与构建产物的关系)。源站与 CDN 都可能设置响应头，**以不带登录态的线上 GET 最终响应为准**。

| 资源 | 应配置或核对 | 避免配置或出现 | 对应的功能与证据 |
| --- | --- | --- | --- |
| `/app/sw.js` | `Cache-Control: no-cache`；`Content-Type` 为合法 JavaScript MIME，如 `text/javascript` 或现有的 `application/javascript` | `Cache-Control: immutable`；`Content-Type: text/plain`；缺失时回退成 HTML | `text/plain` 在实测中使 worker 注册及离线启动失败。长缓存是否挡住更新受 `updateViaCache` 模式影响；`no-cache` 是本项目跨模式的发布约定。 |
| `/app/`、安装 `startUrl`、离线页及其他公开 HTML | `Cache-Control: no-cache` | `Cache-Control: immutable` 或长期缓存 | 长缓存使本次导航仍显示 v1；在已受 worker 控制的新标签页中也复现。 |
| `/app/manifest.webmanifest` | `Cache-Control: no-cache`；建议 `Content-Type: application/manifest+json` | `Cache-Control: immutable` 或长期缓存 | 长缓存使页面再次读取时仍得到旧名称；本次**未证明**已安装应用的系统显示名因此更新失败。 |
| 带内容指纹的 JS/CSS 等资产 | `Cache-Control` 含正数 `max-age` 与 `immutable`；`public, max-age=31536000, immutable` 是示例，不固定一年 | `Cache-Control: no-cache`、`no-store` 或 `max-age=0` | 正数 `max-age` 将本次重复读取的源站请求从 2 次降到 1 次。`immutable` 的独立增益未由本实验测出。仍须保留旧版本文件。 |
| `pwa-recovery-worker.js` | 建议与主 worker 一样返回 `no-cache` 和 JavaScript MIME；复制到主 worker URL 后按主 worker 规则检查 | 长缓存、错误 MIME 或缺失时回退成 HTML | 恢复发布要让浏览器取得新的脚本字节；独立恢复文件的头目前不在机器发布检查内。 |
| 主 worker URL 的 `HEAD` 响应 | 状态码为 2xx，且指向真实 worker | 非 2xx，或由 SPA 回退页冒充 | 离线页用 `HEAD` 探测网络恢复；本组响应头因果实验未单独改变该状态码，需按[服务器自检](/operations/hosting#自检)验收。 |
| 显式启用的公共运行时 JSON/HTML | 返回符合业务数据的 MIME，且满足公共缓存准入策略 | 对要写入公共缓存的响应加 `private`、`no-store`、`Vary: Cookie` 或错误 MIME | 这些反例在线读取仍可用，但平台 worker 拒绝写公共缓存，离线读取失败。此规则只适用于已明确开启的公共读取缓存。 |
| 私有 HTML/API | `Cache-Control: private, no-store`；人工核对 | `Cache-Control: public`、`immutable` | 私有响应不由发布头检查代替业务安全审查。 |

## 路径与构建产物的关系

`dist/` 是本机的输出目录名，`/app/` 是浏览器访问地址中的路径。两者不必同名。假设 `dist/` 顶层有 `index.html`、`sw.js`、`manifest.webmanifest` 和 `assets/`：

- **部署在域名根路径：**服务器把 `dist/` 的内容作为网站根目录，浏览器访问 `/`、`/sw.js` 和 `/assets/…`；Vite `base`、PWA `scope` 与 `mountPath` 使用 `/`。
- **部署在 `/app/`：**可以把 `dist/` 的**内容**放到服务器网站根目录下的 `app/` 目录，例如 `/var/www/site/app/sw.js`；若 Nginx 的 `root` 是 `/var/www/site`，浏览器访问 `/app/sw.js`。此时 Vite `base`、PWA `scope` 与 `mountPath` 使用 `/app/`，`serviceWorkerUrl` 等资源 URL 也要带 `/app/` 前缀。

服务器或 CDN 也可用其他目录映射，关键是**浏览器最终访问的 URL**与构建时写入的资源引用、PWA 身份及部署配置一致。只把按 `/` 构建的产物映射到 `/app/`，而不调整 Vite `base` 和 PWA 路径，可能使页面仍请求根路径的脚本或 worker。完整 Nginx 根路径与子路径示例见[服务器与 CDN 配置](/operations/hosting#nginx-示例)。

不要把 `no-cache` 理解成“每次都重新下载整个文件”：它允许缓存保存副本，但复用前必须成功验证。`max-age=0, must-revalidate` 在这次 Chrome 实验中也取得了新内容，**但不满足本项目的字面发布规则**，且与 `no-cache` 在共享缓存及附加 `s-maxage` 的条件下不等价。[RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html)给出这些指令的语义。worker 必须以 JavaScript MIME 提供是[Service Workers 规范](https://www.w3.org/TR/service-workers/#update-algorithm)的要求；合法类型按[MIME Sniffing 标准](https://mimesniff.spec.whatwg.org/#javascript-mime-type)判断。

## 实测时发生了什么

“请求数”只计该用例观测窗口内抵达临时服务器的目标 URL 请求；不是线上流量估计。表中“门禁”指 npm `0.3.1` **已发布**的检查结果，包含新增的 `worker-mime`。

| 对照条件 | 请求数 | Chrome 观察 | 发布检查结论 |
| --- | ---: | --- | --- |
| worker 默认 `updateViaCache=imports`：`no-cache` / `max-age=0, must-revalidate` / `max-age=14400` | 1 / 1 / 1 | 三组都发现 v2 更新并显示提示 | 仅 `no-cache` 符合项目缓存头规则 |
| worker 显式 `updateViaCache=all`：`no-cache` / `max-age=14400` | 1 / 0 | 前者出现 waiting worker 和更新提示；后者本次检查未发现新 worker | 前者通过、后者失败 |
| worker `Content-Type: application/javascript` / `text/plain` | — | 前者注册成功且可离线启动；后者报 MIME 错误，未注册、离线启动失败 | 旧 `response-headers` 两组都通过；新增 `worker-mime` 仅前者通过 |
| 公开 HTML，v2 发布后同 URL 再次导航：`no-cache` / 零秒 `max-age` / 四小时 `max-age` | 2 / 2 / 1 | 前两组显示 v2；长缓存组仍显示 v1 | 仅 `no-cache` 通过 |
| 已受 worker 控制的新标签页入口：上述三种头值 | 1 / 1 / 0 | 前两组显示 v2；长缓存组仍显示 v1 | 仅 `no-cache` 通过 |
| manifest 的 `name` 在 v2 改变：上述三种头值 | 2 / 2 / 1 | 前两组的页面读取取得新名；长缓存仍返回旧名 | 仅 `no-cache` 通过 |
| 带指纹 JS 重复读取：`no-cache` / 零秒 `max-age` / 四小时 `max-age` / 一年 `max-age, immutable` | 2 / 2 / 1 / 1 | 正 `max-age` 减少一次请求；未观察到 `immutable` 单独带来的功能变化 | 仅最后一组符合本项目资产规则 |

公共运行时缓存另用真实 worker 用例复核：JSON 返回 `no-store`、`private`、`Vary: Cookie` 或错误 MIME 时，在线请求仍可读，离线读取失败；`stale-while-revalidate` 路径收到 `no-cache` 也不写入缓存。这是**平台公共缓存准入策略**的效果，不能表述为这些头让整个 PWA 不能安装。

## 如何在自己的环境验收

下面四条 GET 命令覆盖 worker、入口 HTML、manifest 和**一个**带指纹资产，是缓存头与 worker MIME 的核心抽样。四条都合格，说明这四个实际 URL 在采集时的最终响应符合对应规则；**不能据此判定整个服务端配置已完成**。还要检查不同的安装 `startUrl`、离线页、其他公开 HTML、其余资源，以及适用时的恢复 worker、公共运行时缓存和私有接口；主 worker 的 `HEAD`、缺失文件的 404、HTTPS、worker scope 和浏览器功能也需另行验收。

1. 用不带 Cookie 的 **GET** 请求每个实际路径，跟随重定向，检查最后一个 HTTP 响应块的状态码、`Cache-Control` 和 `Content-Type`。入口、离线页尤其要看最终地址，不能只看 301/308 响应头。
2. 在源站和 CDN 出口各测一次。如果两处不同，先找覆盖规则；不要只看 Nginx 配置文件或构建产物。部署新版本后重复采集，并保存路径、时间和最终头值。
3. 在隔离的浏览器环境完成注册、离线启动、v1→v2 更新提示和受 worker 控制的入口导航。响应头门禁通过不能代替这些功能测试。

```sh
curl -sS -L -D - -o /dev/null https://app.example.com/app/sw.js
curl -sS -L -D - -o /dev/null https://app.example.com/app/
curl -sS -L -D - -o /dev/null https://app.example.com/app/manifest.webmanifest
curl -sS -L -D - -o /dev/null https://app.example.com/app/assets/index-EXAMPLE1.js
```

上面最后一个资产路径必须换成**本次真实构建生成的指纹文件**。worker 的额外 `HEAD` 探测另按[服务器自检](/operations/hosting#自检)核对。不要在命令中附带生产 Cookie 或访问令牌。

## 证据边界与版本

- 本地对照自动化 **23/23 通过**；Vue/React 的真实构建发布报告用例 **2/2 通过**。复现见仓库中的[浏览器用例](https://github.com/haigeerlab/pwa-platform/blob/main/packages/examples-browser-e2e/browser-tests/header-causality.spec.ts)与[完整验证记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/examples-browser-e2e/header-causality-verification.md)。
- npm `0.3.1` **已包含**独立的 `worker-mime` 检查和本地正反例；业务发布系统须采集 worker `Content-Type` 并执行该检查。旧版 `0.2.5` 没有这项检查，须人工核对。`response-headers` 仍只判断缓存头。
- 原生安装后的 manifest 系统显示名更新周期、其他浏览器与移动端、真实 Nginx/CDN 的共享缓存与失效传播、worker 导入脚本和长期自动检查时序均未由这组实验确认。不要把表中的本地差异写成某个线上站点已经发生的故障。
