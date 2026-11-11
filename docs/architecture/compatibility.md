# 兼容性策略

## 初始支持范围

| 接入面 | 支持范围 |
|---|---|
| Vue | `>=3.4.0 <4.0.0` |
| React / react-dom | `>=19.2.0 <20.0.0` |
| Nuxt | `>=4.5.0 <4.6.0` |
| TanStack Start | 未通过可行性门槛，推迟；所测版本为 `1.168.54`（RC） |
| Next.js | not committed until target router and builder are selected |

“支持”表示该范围具备 peer dependency 校验、构建 fixture 和浏览器行为测试，并不代表所有历史版本都可用。

## Nuxt 与 TanStack Start（2026-09-18 复核）

- **Nuxt** 只支持 `>=4.5.0 <4.6.0`，已去掉 3.x：Nuxt 3 于 2026-07-31 停止维护（项目所有者 2026-09-17 决定，见 [spec/ssr-adapters.md](../../spec/ssr-adapters.md) 已决定事项第 2 条）。
- **TanStack Start**（`@tanstack/react-start`）未通过可行性门槛，推迟交付：所测的精确版本为 `1.168.54`（2026-09-14 发布），当时官方文档标注为 Release Candidate。门槛未通过的原因见 [spec/ssr-adapters.md](../../spec/ssr-adapters.md) 范围一节与 [tasks/ssr-adapters/plan.md](../../tasks/ssr-adapters/plan.md) 任务 2 实施记录（检查点 A，2026-09-17 裁决）。
- 依据：项目所有者 2026-09-17 决定（检查点 A）、Nuxt 3 停止维护日期。
- 复核日期：2026-09-18（本次复核未发现 `1.168.54` 之后有更贴近门槛通过条件的变化；latest 已到 `1.168.56`，仍为 RC）。

## 浏览器策略

使用特性检测而非浏览器嗅探。安装、Push、徽标和后台能力均为渐进增强；不可用时基础 Web 体验仍须可用。

### 最低浏览器版本（[ADR-0053](../adr/0053-browser-compat-baseline.md)）

平台在浏览器中运行的代码，最低支持 **Safari 13.1、iOS Safari 13.4、Chrome 80、Edge 80、Firefox 74**。范围包括页面端包、生成的 `sw.js` 与恢复 worker、生成页面中的脚本，以及私有包的浏览器端代码。版本只写在仓库根目录 [`.browserslistrc`](../../.browserslistrc) 一处。

- **承诺的含义**：在这些版本及以上，平台代码不因语法或缺失的 API 抛出未捕获的异常，也不会解析失败；某项能力缺失时按“不可用”处理。**不承诺 PWA 功能齐全**，例如 Safari 13 没有安装提示，Firefox 桌面版不能安装；功能可用性按[浏览器矩阵](browser-matrix.md)分档记录。
- **四层检测**：
  - 类型层：各包 `tsconfig.floor.json` 把 `lib` 限到 ES2020；
  - lint 层：eslint-plugin-compat 加 `no-restricted-properties` 禁用名单；
  - 产物层：`scripts/check-browser-artifacts.mjs` 用 es-check 与网页 API 规则检查包 dist、生成的 worker、内联脚本和恢复页模块；
  - 运行时层：单元测试中的调用陷阱，以及 `withoutBuiltin()` 缺失模拟。
  - 每层都有故意违规的样例，断言检测确实会失败。
- **检测不到的范围**，靠评审与旧版本真机抽查弥补：
  - 禁用名单以外、compat 插件数据也没有的网页 API；
  - 对象实例上的属性（如 `FetchEvent.resultingClientId`）；
  - CSS；
  - 运行时构造的代码（如 `new RegExp` 中的新正则语法）。
- **已知引擎差异**：Safari 13 对 `new URL(value, undefined)` 抛 `TypeError`，显式传入的 `undefined` 基址不会被当作“没有基址”。浏览器端代码在基址可能缺失时必须只传一个参数。四层检测中只有运行时层能发现这一类问题：单测的运行时模拟会让平台浏览器端代码中的这种调用抛错。
- **已知降级**：
  - `FetchEvent.resultingClientId` 要 Safari 16，缺失时导航的缓存来源信号静默丢失；
  - 恢复页的 `max()` 在 Firefox 74 上不生效；
  - 更新提示条在不支持逻辑定位的浏览器上使用物理定位回退（0.4.2 起），从右往左排版时不会镜像。
- **nuxt 例外**：nuxt 运行时插件经 `nuxt/app` 带入 `@types/node` 引用的 `esnext.disposable`、`es2025.float16`。类型层仅为 nuxt 放行这两个 lib，违规样例仍须报错；这两个 lib 带来的 API 由其他层拦住：`Float16Array`、`Math.f16round` 由 compat 规则拦，`Symbol.dispose`、`Symbol.asyncDispose` 由禁用名单拦，`using` 声明由 `no-restricted-syntax` 拦，各有违规样例。
- **基线变更**：提高任一浏览器的最低版本是破坏性变更，必须新增 ADR 并升主版本号；降低版本或修复违规可在补丁版本中进行。

Push 在 iOS 上只对**已安装到主屏幕的 Web App**提供；未安装的 Safari 页面不应把它当作可用能力。Safari 与 Firefox 都属于渐进兼容档：应用必须先做特性检测，不能将订阅或通知作为基础体验的前提。
