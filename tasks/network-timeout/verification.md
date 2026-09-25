# 验证记录：network-timeout

规格见[模块规格](../../spec/network-timeout.md)，决定见 [ADR-0038](../../docs/adr/0038-network-timeout.md)，任务 NT1–NT8 见[计划](plan.md)。

## 环境

Node v24.18.0、pnpm 11.18.0、macOS arm64、Google Chrome 153.0.8010.53、Playwright 1.63.0、Workbox 7.4.1。分支 `claude/pwa-platform-review-cba86f`，基于 `main` 的 `b414fa4`。

| 提交 | 任务 | 内容 |
|---|---|---|
| `2f61c61`、`d3e12ca` | NT1 | 规格、能力图、计划、ADR-0038 |
| `4696534` | NT2 | 契约与编译 |
| `04a512c` | NT3 | 引擎的超时与命中原因 |
| `6b2c0f1` | NT4 | worker 配置与导航超时；更正规格的逐字节说法 |
| `52820a2` | NT5 | 页面事件的新取值 |
| `ce3d0d2` | NT6 | 真实浏览器场景 |

## 已取得的证据

- **契约与编译**：contracts 266 项、core 178 项。合法 1、30；非法 0、31、1.5 报 `schema.invalid-value`；字符串 `"5"` 报 `schema.invalid-type`（与仓库中其他数字字段的错误类型一致，规格写的是 `invalid-value`，此处按仓库惯例）；未写时计划不含该键。变异：上限改为 31（6 项转红）；编译时总是写入该键（9 项转红）。
- **引擎**：engine-workbox 44 项。用 `fetchDidFail` 标记区分命中原因：Workbox 只在 `fetch()` 抛错时调用它，超时路径不调用，因此不需要与 Workbox 自己的计时器竞争。单元测试以仿照 7.4.1 源码的替身代替 Workbox 策略类（`ExpirationPlugin` 需要 IndexedDB）；与真实 Workbox 的配合由下方浏览器场景与变异证明。变异：超时命中记为 `network-failed`、超时不传给 `NetworkFirst`（各 2 项转红）。
- **worker**：sw-runtime 318 项。导航四种情况用假计时器测试；未设置时 `navigate()` 走原有代码路径。变异：超时后不查回退（1 项转红）；超时且无回退时提前报错（1 项转红）。
- **页面事件**：client-runtime 139 项，直接消息与导航暂存查询两条通道都原样带出 `network-timeout`，未知取值仍被丢弃。
- **全仓**：`pnpm test`、`pnpm typecheck`、`pnpm lint` 通过。
- **真实浏览器**（`context.route` 拦住请求不放行来模拟挂起；2026-09-24 实测它能拦截 worker 自己发出的请求）：导航约 1.3–1.6 秒后显示离线页；未开启超时的站点在 3 秒后仍在等待；数据与页面两种运行时缓存超时后用缓存应答并带 `network-timeout`，挂起期间缓存快照不变；`abort()` 时仍为 `network-failed`。`--repeat-each 5` 25/25；sw-runtime 浏览器场景共 49 项通过。变异：导航忽略超时（1 个场景转红）；引擎把超时命中记为 `network-failed`（2 个场景转红，这也证明了真实 Workbox 下原因的区分）。
- **产物对照**：`2f61c61` 在干净 worktree 中构建 vite 浏览器夹具，记录 154 个产物文件的 SHA-256 并确认构建确定性。NT4 后同法构建：注入 worker 的配置对象逐字段相同、不含新键；平台 worker、恢复 worker 与页面脚本（及引用它们的 `index.html`）字节变化，原因是导航计时器分支与页面共用的 `reason` 校验；其余 126 个文件逐字节相同。规格原稿"worker 产物逐字节相同"的说法已更正，ADR-0038 的影响一节同步。

## 未取得的证据

- 真实弱网环境（本记录的挂起由 Playwright 路由模拟）。
- Chrome Android、桌面端 N-1、CI。

## 已知弱点

- "缓存快照不变"的核验（真实浏览器场景与产物对照都用到）只比较每个缓存的条目数，不比较条目本身的内容或响应体字节；一次内容被覆盖但条目数不变的写入不会被这项检查发现，证据强度弱于名字暗示的程度。

## NT8：门禁与独立评审（2026-09-24）

**干净 worktree 门禁**（检出 `cf1fc96`）：`pnpm install --frozen-lockfile --offline`、`lint`、`build`、`typecheck` 退出 0；`pnpm test` 全仓 2356 项通过；`pnpm test:browser` 全仓 219 项通过；运行后无改动。`git diff b414fa4...cf1fc96` 对 vite、nuxt、build-verifier、entry-resilience、push 为空。

**独立评审**（新上下文，审阅 `b414fa4...cf1fc96`）：阻断 0，应修 2，均在 `6608912` 处理：

1. 接入说明称"用 TypeScript 穷举分支的代码会提示缺少新值"不成立：页面事件的 `metadata` 类型是字符串索引类型，`reason` 不是联合类型。已改为"新值只在运行时出现，需要自己接住"。
2. "网络响应晚到仍写入缓存"只是尽力而为：Workbox 7.4.1 中晚到的写入挂在 handler 自己的等待列表上，不延长 FetchEvent 的生命周期，worker 被回收时可能丢失。ADR-0038、规格、接入说明改为"通常会写入；worker 被回收时可能丢失"。引擎单元测试的替身原先用 `event.waitUntil`，恰好掩盖了这一差别，已改为与真实实现一致，并修正其注释与用例名。

同时采纳的建议：`fetchDidFail` 插件只在"network-first 且设置了超时"时注册，未设置时引擎的插件列表与此前相同；超时后查找回退失败时继续等网络（新增用例）；按时返回 5xx 后断言无残留计时器；"超时、无回退、网络随后失败"返回网络错误；显式写 `networkTimeoutSeconds: undefined` 被拒绝（contracts 在可序列化检查阶段报 `value.not-serializable`，worker 配置报范围错误，规格已同步）；挂起辅助函数保留全部匹配的请求；去掉包含消息投递耗时的上界断言；导航超时用例也做缓存快照比对。

**补做的关键变异**：去掉 `fetchDidFail` 标记（即取消"超时"与"网络失败"的区分依据），真实浏览器中 `abort()` 用例转红、引擎单元测试 1 项转红；把回退查找的失败重新抛出，sw-runtime 1 项转红。恢复后通过。

**修复后复跑**（`6608912`）：contracts 272、engine-workbox 46、sw-runtime 321 项；全仓 `pnpm test`、`typecheck`、`lint` 通过；network-timeout 浏览器场景 `--repeat-each 5` 25/25，sw-runtime 浏览器场景 49 项通过。
