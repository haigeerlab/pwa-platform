# 规格：browser-compat-baseline

> 2026-11-11 草案，待项目所有者审阅。范围、基线版本、构建目标、私有包纳入、基线变更规则和 0.4.1 验收方式已在本次需求中由项目所有者逐项确认；决策见 [ADR-0053](../docs/adr/0053-browser-compat-baseline.md)。

## 目标

为平台在浏览器中运行的代码定一个**最低浏览器版本**：在这些版本及以上，平台代码不因语法或缺失的 API 报错，宿主页面和 Service Worker 都不会因此白屏或安装失败；某项能力不可用时，按现有特性检测退回普通网页。用构建期检测守住这个下限，并发布修复后的 0.4.1。

起因：有接入方（使用 0.4.0）的真实用户在 Safari 13.1 上白屏，根因是 `@pwa-platform/client-runtime` 使用了 `Object.hasOwn`（Safari 15.4 / Chrome 93 / Firefox 92 才支持）。宿主用 `@vitejs/plugin-legacy` 能补上页面端，但 `@pwa-platform/vite` 以静态资源写出的 `sw.js` 不经宿主转换，页面上的 polyfill 也进不了 Service Worker，宿主无法自行修复。这也违反了[兼容性策略](../docs/architecture/compatibility.md)中“不可用时基础 Web 体验仍须可用”的既有约定。

## 已确认的范围

1. 最低浏览器版本：Safari 13.1、iOS Safari 13.4、Chrome 80、Edge 80、Firefox 74。
2. 承诺的含义是**不报错、能降级**，不是“这些版本上 PWA 功能齐全”。例如 Safari 13 没有安装提示、Firefox 桌面版不能安装，仍按渐进兼容记录。
3. 覆盖在浏览器中运行的全部平台代码：公开包 `sw-runtime`、`client-runtime`、`entry-resilience`、`engine-workbox` 的 worker 部分、`vue`、`react`；`vite` 生成的 `sw.js`、恢复 worker、离线页与恢复页内联脚本；以及私有包 `offline-write`、`push`、`nuxt` 的浏览器端代码。
4. 修复全部超出基线的用法，并用三层检测防止回归。
5. 发布 0.4.1；CI 通过即发布，接入方 Safari 13.1 真机验证结果回来后补记，不通过则发布 0.4.2。

## 现状（origin/main `3f927d0`，0.4.0 源码）

逐项核实的超基线用法如下（浏览器端功能 × API 盘点见 BC0 交付的清单）；完整清单以 BC1 的检测工具结果为准。

| 用法 | 最低支持 | 位置（浏览器端） | 后果 |
| --- | --- | --- | --- |
| `URL.canParse` | Chrome 120、Firefox 115、Safari 17 | `client-runtime/src/shared/config.ts:78`；`sw-runtime/src/shared/config.ts:403`，`worker/decide.ts:104`，`worker/handlers.ts:488,584`，`worker/offline-document-probe.ts:16`，`worker/offline-write-intent.ts:58`；`engine-workbox/src/worker/options.ts:70`，`worker/engine.ts:57`；`entry-resilience/src/internal/origin.ts:11`；`offline-write/src/index.ts:103` | **影响最大**：`createPwaClient` 在检查 Service Worker 之前就校验配置，页面初始化抛 `TypeError`；平台 worker 启动即失败、不会安装。实际下限因此是 Chrome 120 / Safari 17，而不只是 `Object.hasOwn` 的 Safari 15.4 |
| `Object.hasOwn` | Chrome 93、Firefox 92、Safari 15.4 | `sw-runtime/src/shared/config.ts:146,147,262`（`:262` 同时卡住恢复 worker）；`client-runtime/src/shared/config.ts:63`；`entry-resilience/src/internal/plain-object.ts:18`；`offline-write/src/index.ts:99` | 页面初始化或 worker 启动抛 `TypeError` |
| `AbortSignal.timeout` | Chrome 103、Firefox 100、Safari 16 | `entry-resilience/src/browser/probes.ts:23,35` | 异常被捕获，探测一律判为不可达，`normal` 清单下恢复入口永远不出现 |
| `??=` | Chrome 85、Firefox 79、Safari 14 | `entry-resilience/src/client/index.ts:29` | 宿主不降级时整个模块解析失败 |
| 类字段（`readonly code` 按 ES2022 输出为实例字段） | Chrome 72、Firefox 69、Safari 14 | `push/src/client/index.ts:35` | Safari 13.1 上整个模块解析失败 |
| CSS `inset` | Chrome 87、Firefox 66、Safari 14.1 | `vite/src/offline-page-style.ts:34`；`entry-resilience/src/vite/default-style.ts:30` | 不报错，但离线页与恢复页的全屏覆盖层失效 |
| CSS flex `gap`、`max()` | `gap`：Safari 14.1、Chrome 84；`max()`：Firefox 75 | `vue`／`react` 的 `update-notice.css:60-62`；`entry-resilience/src/vite/default-style.ts:34` | 只影响间距，属于可接受的降级 |

- `contracts` 的运行时代码不进入浏览器：浏览器端只以 `import type` 引用（`verbatimModuleSyntax` 下会被擦除），引用它的 `build/` 目录只在构建期运行。其中的 `Object.hasOwn`、`.at()`、`??=` 不在本基线范围内。
- 所有包以 `tsc` 按 ES2022 构建，不降级，源码语法原样进入产物。
- `bundleEntry()`（`packages/vite/src/workers.ts`）打包 worker 时没有设构建目标，结果取决于宿主安装的 Vite 版本的默认值。
- 生成的离线页内联脚本（`vite/src/offline-page.ts` 的 `OFFLINE_PAGE_SCRIPT`）不经任何转换，现用的 `?.` 正好处在基线上。
- Workbox 7.4.1 被打进 worker 的部分尚未盘点，由 BC1 的产物检测覆盖；`FetchEvent.resultingClientId` 在基线浏览器上的支持情况待核实。
- `build-verifier`、`vite`、`core` 的构建期代码和 `engine-workbox` 的构建部分只在 Node 中运行，不在本基线范围内。

## 安全与兼容边界

- 不改变 `PwaIdentity`、Service Worker URL 与 scope、manifest ID、缓存命名空间、更新确认协议和缓存准入。
- 公开包的 `tsc` 构建目标保持 ES2022，宿主拿到的产物只因本次源码修复而改变；不引入 polyfill，不向宿主注入代码。
- 替换写法必须与原行为等价：`URL.canParse` 换成以 `try { new URL(...) }` 判定的同名内部函数；`Object.hasOwn` 换成 `Object.prototype.hasOwnProperty.call`；`AbortSignal.timeout` 换成 `AbortController` 加 `setTimeout` 并在完成后清除计时器；`??=` 换成普通赋值；类字段改为在构造函数中赋值；CSS `inset` 换成四个方向的定位属性。
- worker 打包显式设定与基线一致的构建目标。产物内容变化后，宿主升级时走正常的 worker 更新流程，不新增接管路径。
- 新增的检测工具只作为开发依赖，不进入任何发布包的 `dependencies`。

## 行为要求

1. **基线只写一处**：仓库根目录的 browserslist 配置是唯一来源；TypeScript、lint 与产物检测都从这里读取或与它保持一致，测试校验三者没有分叉。
2. **第 1 层，类型检查**：浏览器端包的 `lib` 限制到 ES2020（加所需的 DOM、WebWorker 类型）；使用 ES2021 及以后的内置 API 时 `pnpm typecheck` 失败。
3. **第 2 层，lint**：引入 `eslint-plugin-compat`，在 `pnpm lint` 中按基线检查浏览器端源码的 Web API；超基线的 API 未经特性检测就使用时报错。
4. **第 3 层，产物检测**：引入 `es-check`，在 CI 中检查浏览器端包的 `dist`、示例应用生成的 `sw.js` 与恢复 worker，以及生成页面中的内联脚本，语法不得超过 ES2020。
5. **防回归测试**：每一层至少有一个故意违规的样例，证明该层确实会失败，而不只是“当前代码恰好通过”。
6. **降级**：基线浏览器缺少某项能力时，按“该能力不可用”处理，与现有特性检测一致；不得因为缺失能力抛出未捕获的异常。
7. **CSS**：三层检测不覆盖 CSS。会破坏布局的属性（如 `inset`）本次替换；只影响间距的 `gap`、`max()` 作为可接受的降级记录在兼容文档中。
8. **文档**：`docs/architecture/compatibility.md` 和 `browser-matrix.md` 写明最低版本、承诺的含义和三层检测；包 README 与文档站接入说明同步；0.4.1 发布记录写明改动和真机验证状态。

## 测试剖面与验收

| 层次 | 验收 |
| --- | --- |
| 单元 | 被替换处的行为测试保持通过；新增覆盖“属性在原型链上而非自身”、无法解析的 URL 与入口探测超时清理计时器 |
| 检测工具 | 三层在当前代码上全部通过；每层的违规样例确实失败 |
| 构建与 CI | Node 22／24、Windows、Chrome 正式 CI 全部通过；`check:publish` 通过 |
| 浏览器回归 | Chrome 当前版本既有浏览器套件通过；生成的 `sw.js` 通过产物检测 |
| 消费 | 候选 tarball 在全新 Vite 项目中构建，生成的 `sw.js` 不含超基线用法 |
| 真机（发布后） | 接入方在 Safari 13.1 上升级 0.4.1，验证页面不白屏、worker 注册并安装、离线页可用；结果补记到验证记录 |

## 不在范围

- 不承诺基线浏览器上 PWA 功能齐全；不为旧浏览器补装安装提示、Push 等能力。
- 不提供 polyfill 包，不调整公开包的 ES2022 构建目标。
- 不在本仓库购置或维护 Safari 13.1 真机；旧版本真机验证由接入方完成，或在基线变更与大版本发布时抽查。
- 不覆盖宿主自己的业务代码兼容性。

## 已决定事项

1. 基线版本采用接入方提出的版本（项目所有者，2026-11-11）。
2. 只限制 `lib`，不改公开包构建目标（项目所有者，2026-11-11）。
3. 私有包一并纳入检测（项目所有者，2026-11-11）。
4. 提高最低版本必须新增 ADR 并升主版本号（项目所有者，2026-11-11）。
5. 0.4.1 CI 通过即发布，真机验证后补记（项目所有者，2026-11-11）。

## 依赖与交付

依赖 `sw-runtime`、`client-runtime`、`pwa-entry-resilience`、`vite-adapter`、`package-distribution`、`platform-governance`、`offline-experience-resilience`（与能力图一致）。交付：源码修复、三层检测与违规样例、文档更新、0.4.1 发布与读回、接入方真机验证的补记。

## Documentation impact

- `docs/architecture/compatibility.md`、`docs/architecture/browser-matrix.md`：新增最低版本与检测说明。
- `website/guide/` 中的接入与兼容说明、受影响包的 README：写明最低版本。
- `tasks/package-distribution/release-0.4.1.md`：发布记录。

## 2026-11-11 范围调整：分两步（待按此修订全文）

项目所有者在两边会话中均确认“分两步”：

- **第一步（缺陷修复，0.4.1）**：[PR #138](https://github.com/haigeerlab/pwa-platform/pull/138) 已替换 `URL.canParse`、`Object.hasOwn`、`AbortSignal.timeout`、`??=`、push 类字段与 CSS `inset`，新增 `scripts/test-support/legacy-engine.mjs`（八个浏览器端包的单元测试中，浏览器端代码调用这三个内置方法即抛错），并对生成的 worker、内联脚本与浏览器端 dist 做了一次性 ES2020 解析核查。
- **第二步（本模块，待重新审阅）**：只做基线 ADR 与 CI 检测，另加以下从第一步移出的事项：
  1. 更新提示条（vue／react `update-notice.css`）的 flex `gap`：Chrome 84、Safari 14.1 起支持，更低版本按钮无间距。项目所有者决定不进 0.4.1，在本步配合界面截图回归处理；它是公开样式，须考虑宿主覆盖。
  2. worker 打包（`packages/vite/src/workers.ts` 的 `bundleEntry()`）显式设定构建目标。
  3. 产物检测不能简单用 `es-check es2020`：数字分隔符（`10_000`）是 ES2021，但 Safari 13.0、Chrome 75、Firefox 70 已支持，属基线内；需按 browserslist 判定或单独放行。
  4. API 检测须以 MDN browser-compat-data 全量核对，第一步只按名单查了常见新内置方法。
  5. `FetchEvent.resultingClientId`（Safari 16）缺失时，导航的缓存来源信号静默丢失、不报错，在兼容文档中记为降级。
