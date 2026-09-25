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

Push 在 iOS 上只对**已安装到主屏幕的 Web App**提供；未安装的 Safari 页面不应把它当作可用能力。Safari 与 Firefox 都属于渐进兼容档：应用必须先做特性检测，不能将订阅或通知作为基础体验的前提。
