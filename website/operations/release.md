# 部署与发布

平台在构建时能检查产物，但无法仅凭一次构建证明线上响应头、历史版本保留和浏览器安装体验。业务应用需要把这些检查纳入自己的发布流程。

## 独立 origin：默认方案

一个 origin 和 scope 对应一个 PWA 身份，是最直接的部署方式。部署时确保 Vite <code>base</code>、身份中的 <code>origin</code> 与 <code>scope</code>、manifest 和 worker 的实际 URL 相符。worker 应从 HTTPS 同源地址提供；发布时核查 HTML、worker 和指纹资产的缓存头。

## 线上响应头

构建报告无法证明 CDN 或源站实际返回的响应头。发布时应逐类请求线上 URL，并按下表核对 `Cache-Control`：

| 资源 | 必须包含 | 不得包含 |
| --- | --- | --- |
| Service Worker 脚本、manifest、公开 HTML | `no-cache` | `immutable` |
| 带指纹的静态资源 | `immutable` 和发布配置指定的长 `max-age` | `no-cache`、`no-store` |
| 私有 HTML 与数据 | `private`、`no-store` | `public`、`immutable` |

私有 HTML 按私有响应检查，不因它是 HTML 而套用公开 HTML 规则。记录实际访问 URL、响应头和检查时间；不要把令牌、响应体或用户数据写入发布记录。

## 发布门禁

业务发布方要保存本次提交的 CI 或经批准的本地替代记录、目标浏览器与原生安装证据、线上产物和响应头检查结果、身份基线比较、历史资源可用性及恢复演练记录。机器检查须同时证明**必需检查全部执行**且**检查结果通过**；一次 Vite 构建不能代替线上事实采集。首次发布或生产身份迁移须保留基线缺失或不匹配的诊断，并经平台负责人按发布流程批准，不能省略检查来取得绿色报告。

## 同源多应用

同一 origin 上可以有根应用与固定子路径应用，各自持有独立 manifest 和 worker；这不是跨 origin 隔离，存储仍同源共享。目前仅支持 Vite 接入。

根应用需要一份受版本控制的登记表，并从中生成子 scope 的排除规则：不能预缓存子应用文件、接管子路径请求或替子应用返回根离线页。**先发布根应用的排除规则，再发布子应用**；移除时反向执行。发布子应用前还要核对线上根应用的计划已经包含相应排除。

### 本地根路径与线上移动子路径 {#root-mobile-paths}

本地两个项目可以各自在开发服务器的 `/` 调试；`vite dev` 不注册平台 worker。生产构建须按**浏览器实际访问路径**分别配置，不能把按根路径构建的移动项目只靠代理挂到 `/m/`：

| 配置 | 根应用 | `/m/` 子应用 |
| --- | --- | --- |
| Vite `base`、worker `scope` | `/` | `/m/` |
| `IDENTITY.mountPath` | `/` | `/m` |
| `IDENTITY.manifestId` | `/` | `/m/` |
| `IDENTITY.serviceWorkerUrl` | `/sw.js` | `/m/sw.js` |
| `IDENTITY.manifestUrl` | `/manifest.webmanifest` | `/m/manifest.webmanifest` |
| `INSTALL.startUrl` | `/` | `/m/` |

两份身份使用相同的生产 `origin`、`environment`，不同的 `appId`，并在各自构建中传入同一版本的 `topology: { kind: "shared-origin", registry }`。根应用的发布计划必须先排除 `/m/`，子应用发布时用线上根计划通过 `release-order` 检查。服务器把 `/m` 重定向到 `/m/`；上线前逐项核对资源、图标、manifest、worker 和离线页的最终 URL。若移动站不注册 PWA，根 worker 仍应排除这个独立站点的路径。

### 一部 Android 与一部 iPhone 能验证什么

两部手机都能用于真实设备测试：Android Chrome 和 iPhone Safari 各测在线、离线、安装入口、更新提示、明确刷新与恢复，并分别记录浏览器和系统版本。iPhone Safari 属于渐进兼容范围，不要求第二部 iPhone。当前 `desktop` 发布通道只承诺桌面 Chrome N/N-1；`desktop+android` 通道按现有浏览器矩阵还要求 Android Chrome N/N-1，且以两台关闭自动更新的实体设备保留旧版本。因此只有一部 Android 时仍可完成其当前版本的功能测试，但不能把未测的另一个 Chrome 版本记为通过，也不能据此宣称 Android 正式支持。

## 更新与旧资源保留

新 worker 等待期间，旧页面仍可能请求旧版指纹资源。发布系统不能只保留最新一版：发布 R 时，R、R-1、R-2 的带指纹资源都必须可获取；更早版本的资源须从被下一次发布取代之日起保留满 7 天，以两项要求中更长的窗口为准。一次 Vite 构建不会替发布系统执行历史保留检查。

## 回滚与恢复

普通回滚要确保旧版 HTML、脚本和资产仍能获取。若线上 worker 自身异常，按恢复流程把恢复 worker 部署到**原 worker URL**，核查它只清理该应用的专属缓存，并从网络重新加载页面。不要通过改变生产身份字段来临时“绕过”事故。

本页给出业务接入必须核对的发布条件。拥有源仓库访问权限的发布团队还应使用内部的[发布与事故手册](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/release-and-incident-runbook.md)和[身份发布基线](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/identity-release-baseline.md)记录完整证据。
