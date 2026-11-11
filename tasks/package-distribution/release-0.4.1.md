# npm 发布记录：0.4.1

> 2026-11-11：十个公开包已发布到 `latest`，完成公开读回与全新消费；接入方模拟旧浏览器验证与 Chromium 80 真内核验证均通过，Safari 13.1、iOS、Firefox 74 待补记。

## 范围与基点

本版只包含 [PR #138](https://github.com/haigeerlab/pwa-platform/pull/138) 的浏览器端兼容修复：浏览器端代码不再调用 `URL.canParse`、`Object.hasOwn`、`AbortSignal.timeout`，不再使用 `??=`、push 类字段与 CSS `inset`。修复前，`createPwaClient` 与生成的 `sw.js`／恢复 worker 在 Chrome 120、Firefox 115、Safari 17 以下启动即抛错。公开 API、PWA 身份、scope、worker URL 与缓存行为不变。计划见 [release-0.4.1-plan.md](release-0.4.1-plan.md)。

- 准备 PR [#139](https://github.com/haigeerlab/pwa-platform/pull/139) 合并为 `4f7b81bd9335922ba3aef0703a292fe09c878d11`。该提交的 [main CI](https://github.com/haigeerlab/pwa-platform/actions/runs/42954360314) 七项全部通过：Quality Node 22／24、Windows、Chrome，以及非阻塞的 Edge、WebKit／Firefox 引擎冒烟和真实 FCM。
- `v0.4.1` 标签与 `release/npm-0.4.1` 分支都固定在该提交。
- 候选包先从准备分支打包，在全新 React／Vue 项目中消费验证；之后从合并提交重新打包发布。两份十包共 518 个文件逐字节相同。只有五个包的 `package.json` 依赖键顺序不同（pnpm 改写 `workspace:*` 时顺序不固定），排序后完全一致。

## 发布与集中读回

- 使用 Node 24.18.0／npm 11.16.0，由项目所有者在交互式终端完成网页身份验证，执行 `npm publish <tarball> --access=public --tag=latest --ignore-scripts`。按 contracts → core／engine-workbox／build-verifier → sw-runtime → client-runtime → vite → entry-resilience／vue／react 的顺序连续提交，十包均返回 0，随后按同一顺序批准。
- 前两轮提交因没有交互式终端（对话框内运行，以及脚本把输出经 `tee` 写日志）全部以 EOTP 拒绝，没有包被提交。
- 注册表处理完成顺序与提交顺序不同：vue、react 在 client-runtime 之前公开，最后一个公开的是 build-verifier（03:59:40Z）。在此之前约一分钟内，安装 vue／react 0.4.1 会因依赖未公开而失败。
- 2026-11-11T04:00:15Z 集中读回：十包 `latest` 均为 0.4.1，tarball 均 HTTP 200，SHA-256 与发布归档一致，平台内部依赖全部为 0.4.1。

| 包 | 发布时间（UTC） | SHA-256 |
| --- | --- | --- |
| contracts | 03:58:32 | `250ba58865045f85cb9bbc00e9ca065dbc6a60fadf4681700e066e40d6f2f696` |
| core | 03:58:34 | `4130684298bd2068e3ebc0cbb7ad2923a687fc60291f11f84281319519fdbd7d` |
| engine-workbox | 03:57:46 | `5dc74942b6d76d8d96847851b06cd44661402d8f3068b4506aa1281992a91f77` |
| build-verifier | 03:59:40 | `a58c45a7549b32ff03b7d76dd1525140888a30efda5731f8102489194370437c` |
| sw-runtime | 03:58:12 | `ab35e298f289e99d932518d922a4e3ecd54f72e811e4d4561c2d122dce9da35c` |
| client-runtime | 03:59:14 | `6a940b017b88bce3eab46720015652e37eaaea3b40717e1363831d06856ddfc5` |
| vite | 03:58:47 | `901268bf88eb48af2c7e29b679f31974bfd41281b3087d55837a1ee84a872447` |
| entry-resilience | 03:58:50 | `ccd45742c2b1e42be7c768b24e14dc99fde22ca61c21287835962bb5f1071b6b` |
| vue | 03:58:15 | `2592205e56e0c6354db704990277c4a003434a31b62cd90dd282350c0f5e8dc7` |
| react | 03:58:24 | `29d7bc2f825c35a81f809e2ab7233f966e6d6f3819d138e6688318ebb06a6183` |

## 全新消费

- 两个全新临时项目只从公共 registry 安装，使用独立缓存，不用 workspace 或本地 tarball：Vite 8.3.0 + React 19.3.0，以及 Vite 8.3.0 + Vue 3.5.42。
- 锁文件中平台包的 resolved 地址全部是官方 registry，依赖闭包全为 0.4.1，两者的 Vite 构建均通过。
- 生成的 `sw.js`、恢复 worker 和离线页内联脚本按 ES2020 解析通过（数字分隔符在基线内，核查时放行），不含 `URL.canParse`、`Object.hasOwn`、`AbortSignal.timeout` 等较新的内置方法。

## 接入方模拟验证（非真机）

2026-11-11，一个接入方把直接依赖升级到 0.4.1。锁文件只有十个平台包的版本和 integrity 变化，与 npm `dist.integrity` 一致，构建通过。产物 73 个文件按 ES2020 语法检查通过，`sw.js`、恢复 worker 与离线页不含 `URL.canParse`、`Object.hasOwn`、`AbortSignal.timeout`、`structuredClone`、`??=`。

运行验证用的是新版无头 Chrome：在 `sw.js`、恢复 worker 和页面开头删除 `URL.canParse`、`Object.hasOwn`、`AbortSignal.timeout`，模拟旧浏览器。它只覆盖这三个缺失的内置方法，不代表旧浏览器的其他差异。

| 场景 | 页面不白屏 | worker 注册并激活 | 刷新后受控 | 断网打开新地址 |
| --- | --- | --- | --- | --- |
| 0.4.1 正常 | 通过 | 通过 | 是 | 默认离线页 |
| 0.4.1 模拟旧浏览器 | 通过 | 通过 | 是 | 默认离线页 |
| 0.4.0 模拟旧浏览器（对照） | 通过 | 失败（未注册） | 否 | 浏览器自带断网页 |

四组均无页面错误或 worker 控制台错误。对照组复现了修复前 worker 装不上的缺陷，0.4.1 在相同条件下恢复正常。

## 接入方 Chromium 80 实测（真内核）

2026-11-11，接入方在真实的旧版浏览器内核上验证 0.4.1，没有删除任何内置方法：

- **浏览器**：Chromium 80.0.3987.0，官方快照 722274，即 Chrome 80 的分支点。
- **运行环境**：macOS 27.2（Apple Silicon），通过 Rosetta 运行。启动参数加了 `--disable-gpu --in-process-gpu`，因为老版本 GPU 进程在 Rosetta 下会崩溃，与被测代码无关。
- **托管与驱动**：页面为接入方的生产构建，由本地服务托管；用 `--unsafely-treat-insecure-origin-as-secure` 允许本地 http 域名注册 Service Worker；通过 DevTools 协议驱动。
- **断网方式**：直接停掉服务，请求真实失败。

| 产物 | 页面 | 首次注册 | 刷新后受控 | 断网打开新地址 | 未捕获错误 |
| --- | --- | --- | --- | --- | --- |
| 0.4.1 | 正常 | worker 已激活 | 是 | 默认离线页 | 无 |
| 0.4.0（对照） | 正常 | 未注册 | 否 | 浏览器自带的连接被拒错误页 | 无 |

结论：在 Chrome 80 内核上，0.4.1 的 worker 能注册、接管并提供离线页；0.4.0 的 worker 注册不了。这与修复目标一致。

**已知问题：更新提示条在 Chrome/Edge 80–86、Safari 13.1–14.0 上不可见。** 接入方在同一 Chromium 80 内核上，用 0.4.1 原样的 `update-notice.css` 测试：测试页内容高 2400px，提示条设为右下角，挂在 body 末尾，视口 1440×900。

| 浏览器 | 提示条位置 | 在视口内 |
| --- | --- | --- |
| Chromium 80.0.3987.0 | top=2400、left=0（文档流原位置） | 否 |
| 新版 Chrome | 右下角 | 是 |

原因：提示条的所有定位只用逻辑属性 `inset-block-*`／`inset-inline-*`，它们要 Chrome 87、Safari 14.1、iOS 14.5 起才支持。旧版本忽略这些属性后，固定定位元素停在静态位置，页面比视口高时就跑到视口外。

影响：用户看不到“有新版本”的提示，也点不到更新；新 worker 一直等待，直到用户关闭该站点的全部标签页。宽度 `min()` 在 Chrome 80 上正常（79 起支持），Firefox 74 未测。

## 未完成

- Safari 13.1、iOS Safari 13.4、Firefox 74 的验证尚未取得：Firefox 74 无法在当前 macOS 上启动，与被测代码无关。接入方将改用线上真机服务测试，结果回来后补记；不通过则发 0.4.2。
- 最低浏览器版本 ADR 与 CI 兼容检测另行立项（`browser-compat-baseline`），不在本版。
