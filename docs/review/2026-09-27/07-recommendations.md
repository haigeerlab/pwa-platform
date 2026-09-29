# 07 · 改进建议（按严重程度与投入产出排序）

排序规则：先看**对开发者或最终用户的实际影响**（能否得出错误结论、是否违反安全承诺），再看**投入**。其中 S 为半天以内，M 为 1–3 天，L 为一周以上。“关联”一列指向[风险清单](06-architecture-risks.md)（R 开头）或[接入报告](04-pc-onboarding-review.md)（C 开头）。

按本仓库的工作流，涉及公开契约或行为的改动（#1、#2、#5、#8）应先补规格或 ADR，再实施。

## 2026-09-28 状态

下文保留审查当时的建议原文。处理结果以本节为准。

| # | 状态 | PR | 说明 |
|---|---|---|---|
| 1 | ✅ 已完成 | [#27](https://github.com/haigeerlab/pwa-platform/pull/27) |  |
| 2 | ✅ 已完成 | [#27](https://github.com/haigeerlab/pwa-platform/pull/27) |  |
| 3 | ✅ 已完成 | [#27](https://github.com/haigeerlab/pwa-platform/pull/27)、[#38](https://github.com/haigeerlab/pwa-platform/pull/38) | `vite preview` 陷阱随 #27 补充，其余 4 处随 #38 补充 |
| 4 | ✅ 已完成 | [#27](https://github.com/haigeerlab/pwa-platform/pull/27) |  |
| 5 | ❌ 撤回 | — | worker 读不到 `Set-Cookie`，见风险 R2 |
| 6 | ✅ 已完成 | [#28](https://github.com/haigeerlab/pwa-platform/pull/28) |  |
| 7 | ✅ 已完成（不阻断） | [#34](https://github.com/haigeerlab/pwa-platform/pull/34)、[#37](https://github.com/haigeerlab/pwa-platform/pull/37) | 改用服务器端断网，WebKit、Firefox 引擎冒烟不阻断门禁（ADR-0042） |
| 8 | ✅ 已完成 | [#30](https://github.com/haigeerlab/pwa-platform/pull/30) |  |
| 9 | ✅ 已完成 | [#31](https://github.com/haigeerlab/pwa-platform/pull/31) |  |
| 10 | ◐ 部分完成 | [#25](https://github.com/haigeerlab/pwa-platform/pull/25) | iPhone 安装窗口内更新、Safari 双标签页已补齐；R9 平台侧根因已由 ADR-0043 修复（0.2.3），界面层现象未再复现、继续观察；单 Origin 故障已在 Android（2026-09-27）、iPhone（2026-09-29）完成；Android N-1 与真实 DNS／证书故障仍待真机 |
| 11 | ✅ 已完成 | [#32](https://github.com/haigeerlab/pwa-platform/pull/32) |  |
| 12 | ✅ 已完成 | [#33](https://github.com/haigeerlab/pwa-platform/pull/33) | 保留期检查的“可用资产”取自构建产物，不是服务器响应 |
| 13 | ✅ 已完成（调整） | [#29](https://github.com/haigeerlab/pwa-platform/pull/29) | 改为 `requiredReleaseChecks(plan)`，与 ADR-0025 保持一致 |
| 14 | ✅ 已完成 | [#38](https://github.com/haigeerlab/pwa-platform/pull/38) |  |
| 15 | ✅ 已完成 | [#39](https://github.com/haigeerlab/pwa-platform/pull/39)、[#49](https://github.com/haigeerlab/pwa-platform/pull/49) | 删除失败场景已补：故障注入测试构建，并改为逐项尝试后再判失败（[offline-write.spec.ts](../../../packages/sw-runtime/browser-tests/offline-write.spec.ts)） |
| 16 | ✅ 已完成 | [#41](https://github.com/haigeerlab/pwa-platform/pull/41)、[#48](https://github.com/haigeerlab/pwa-platform/pull/48) | 真实 Chrome 中耗尽配额的用例已补（[runtime-cache.spec.ts](../../../packages/sw-runtime/browser-tests/runtime-cache.spec.ts)） |
| 17 | ✅ 已完成 | [#40](https://github.com/haigeerlab/pwa-platform/pull/40) | 改用本仓库打包产物，离线安装 |
| 18 | ✅ 已评估，不采用 | [#50](https://github.com/haigeerlab/pwa-platform/pull/50) | workbox-window 的两个信号在本平台都已有对应，见下方“#18 评估” |
| 19 | ✅ 已完成（仅文档） | [#38](https://github.com/haigeerlab/pwa-platform/pull/38) | 保持 `vue: ^3.4.0`，改为醒目标注 |

### #18 评估（2026-09-28）

结论：**不引入 `isExternal` 式语义**，不改代码。workbox-window 用两个信号解决的问题，本平台都已按自己的模型处理，并有真实 Chrome 用例（L3，本次在 Vue 与 React 示例上重跑通过）：

- **`isExternal`（等待中的 worker 不是本页注册的）**：同一 scope 的所有标签页注册的是同一个 worker URL，更新对每个页面的含义和可做的操作都相同（确认后接管，是否刷新由应用决定）。区分“谁触发的”不会改变任何一个页面该显示什么。每个页面各自观察浏览器的 `controllerchange`，一处确认、所有标签页的提示同时清除（[update.spec.ts:56](../../../packages/examples-browser-e2e/browser-tests/update.spec.ts#L56)）。
- **`wasWaitingBeforeRegister`（页面加载前 worker 就已在等待）**：真正要回答的是“这个页面是不是已经跑在新代码上”，本平台的参考实现直接判定这一点：已是新代码时文案为 `An update is ready for offline use`，接管后横幅消失、不再提示刷新（[update.spec.ts:119](../../../packages/examples-browser-e2e/browser-tests/update.spec.ts#L119)，[更新提示指南](../../guides/update-prompt.md)）。
- **重复提示**：`client-runtime` 对同一个等待中的 worker 在同一页面生命周期内只发一次 `update-waiting`（`announcedWaiting` 去重）；页面刷新或新开标签页后再次提示是有意为之，因为更新仍待确认，“稍后”只是隐藏横幅。

若以后收到“提示重复或误导”的具体反馈，应先按反馈复现，再考虑给 `update-waiting` 增加元数据，而不是照搬 workbox-window 的布尔值。

此外，按项目所有者要求优化了 CI（[#42](https://github.com/haigeerlab/pwa-platform/pull/42)）：不再要求 PR 与 `main` 同步，改为合并后在 `main` 上重跑作为安全网；不阻断的 job 移出 PR 触发，每个 PR 从 5 个 job 降到 3 个。

## 第一批：投入小、收益立竿见影（建议下一个迭代完成）

| # | 建议 | 关联 | 影响 | 投入 | 验收标准 |
|---|---|---|---|---|---|
| 1 | **导航分支也拒绝带 `Authorization` 的请求**，使代码与 public-read 规格、ADR-0012 增补一致；同步修改 `decide.test.ts:346` 中把错误行为固定下来的断言 | R1 | 消除规格与代码的不一致，关掉一条缓存私有 HTML 的路径 | S | 单元测试断言：导航加 `authorization` 时结果为 `passthrough`；增加一个 Chrome E2E |
| 2 | **身份契约增加“scope 不能超出 SW 脚本所在目录”的校验**，新增诊断码；或者把 `Service-Worker-Allowed` 作为显式支持的选项写进契约 | R3 | 把一种浏览器才会拒绝的注册失败提前到构建期 | S | `validate.test.ts` 覆盖 `scope=/app/`、`sw=/app/assets/sw.js` 被拒绝；Vite 与 Nuxt 行为一致 |
| 3 | **接入文档补 5 处**：`vite preview` 默认带 `Vary: Origin` 的陷阱；等 worker 变为 `activated` 后再刷新（平台不 `clients.claim`）；单页应用深层路由断网时的表现及“建议同时开启离线页”；离线页不处理 4xx/5xx；新增“多标签页”和“断网与恢复”两节 | C-1 至 C-6 | 直接消除接入中唯一的高严重度卡点和 4 个默认行为盲区 | S | 按[场景配置示例](05-scenario-recipes.md)末尾的清单逐项并入 `website/guide/` |
| 4 | **准入拒绝时输出诊断**：在 `vite preview` 或开发构建中，worker 通过 `console.debug` 或页面事件报告被拒绝的原因（例如 `vary`、`authorization`、`set-cookie`） | R8 | 把静默失败变成可排查的问题；生产环境里 CDN 往响应里加 `Vary` 时同样受益 | S–M | E2E 断言：`Vary: Origin` 的响应产生一条带原因的诊断 |
| 5 | ~~public-read 默认拒绝带 `Set-Cookie` 的响应~~ **撤回（2026-09-28）**：worker 读不到 `Set-Cookie`，无法实现，文档警告已存在。后续候选：在 build-verifier 中对服务端采集的公共读取路径响应头检查 `Set-Cookie`（新增校验项，需要 ADR，投入 M） | R2 | — | — | — |
| 6 | **本地门禁不再被偶发超时拖垮**：给 `run-gate.integration.test.ts` 显式设置更长的超时（或串行执行）；`pnpm test` 改为不中止地跑完全部包再汇总 | R7 | 一个包偶发超时，不会再挡住其余 15 个包的结果 | S | 连续 3 次 `pnpm test` 都通过 |

## 第二批：补齐证据（决定“能不能对外宣称兼容”）

| # | 建议 | 关联 | 影响 | 投入 | 验收标准 |
|---|---|---|---|---|---|
| 7 | **增加 WebKit 和 Firefox 的最小冒烟矩阵**：注册、离线打开应用壳、离线页、更新接管、恢复 worker，这 5 个用例在 Playwright 中增加 `webkit`、`firefox` 两个 project | R6 | 证据台账中所有 L3 目前都只代表 Chrome；这是对外宣称兼容性的前提 | M | 两个浏览器 project 的 CI 或本地门禁通过；非 Chromium 的安装用例继续显式 `skip` |
| 8 | **离线写入 `flush` 做单飞控制**：在 worker 内按会话绑定加锁，或在 `prepareFlush` 时把记录标为“发送中” | R5 | 在该包发布之前关掉重复发送的路径 | M | 并发 `flush` 测试断言：每个幂等键只发送一次 |
| 9 | **更新提示 UI 增加 `locale: "zh-CN" \| "en"` 和内置英文文案**，与离线页、恢复页对齐；补充组件单元测试 | 02 矩阵 | 多语言配置方式一致；组件目前完全没有单元测试 | S–M | 7 个 E2E 场景加上英文 locale 断言；新增组件单元测试 |
| 10 | **收集并补齐证据台账的缺口**：iPhone 断网恢复后显示 `not registered`（R9）的根因定位；Android N-1；单 Origin 真实故障下的入口恢复。（iPhone 安装窗口内更新与 R10 已在审查期间由 PR #25 补齐，见 ADR-0041） | R9、R10 | 把证据台账中“待补”的 L4 变成结论 | M（需要人工操作真机） | `verification.md` 中对应行有明确的结论 |
| 11 | **补齐非导航请求的拒绝类 E2E**：mutation（POST）、stream、session-data 各一个用例，断言在线时不写缓存、断网时得到网络错误 | V1 验收矩阵 | 让默认拒绝缓存从“导航有 L3”升级为“V1 矩阵要求的全部类别有 L3” | S–M | 3 个新用例 |
| 12 | **真实浏览器的发布检查加入 `html-headers` 和 `release-retention`** | 台账 #17、#27 | 这两项目前只有合成输入的 L2 | S | `release.spec.ts:64` 的检查列表包含这两项 |
| 13 | **发布门禁默认严格**：提供一个“生产”预设，默认要求 `identity-baseline` 等检查项全部执行，缺少输入即失败 | R4 | 让“身份不可变”不再取决于调用方是否用对了 API | M | 使用生产预设、不传 `baseline` 时门禁失败 |

## 第三批：结构性改进（排期取决于路线图）

| # | 建议 | 关联 | 投入 | 说明 |
|---|---|---|---|---|
| 14 | 明确开发者文档的唯一来源：`website/` 对外，`docs/guides/` 只放内部材料，或者二者合并 | R15 | M | 同时消除站内链接指向 `main` 分支未发布内容的问题 |
| 15 | 恢复 worker 故障注入测试：模拟删除缓存或 IndexedDB 失败，观察接管时机与残留状态 | R14 | M | 验证通过后决定是否把 `clients.claim` 移到清理全部成功之后 |
| 16 | 配额错误时统一清理全部运行时缓存（包括还没实例化的那类） | R12 | M | 先写测试复现，再修 |
| 17 | 把“新人接入冒烟”固化为自动化用例：从 npm 包新建 Vite 项目，走完最小接入，用 Playwright 验证 | 04 报告 | M | 防止文档与发布包再次漂移；本次实测的脚本可以作为起点 |
| 18 | 评估 workbox-window 式的 `isExternal` 语义，用于区分本页发起的更新和其他标签页早已在等待的 worker | 01 对标 | S（评估） | 目前的设计已经够用，只在出现重复提示的反馈时再做 |
| 19 | Vue 最低版本提到 3.5（去掉 3.4 下无法释放客户端的限制），或在文档中醒目标注这一点 | R13 | S | 属于 peer 范围变更，需要写进变更说明 |

## 不建议做的事

- **不要为了对齐竞品而增加 `autoUpdate` 或单页应用通配回退。** 这两点是 ADR-0005 和 ADR-0012 的有意取舍，是本平台区别于 vite-plugin-pwa 的安全立场。正确做法是把后果写进文档（#3），而不是改变行为。
- **不要把平台默认 UI 扩展成完整的安装引导组件库。** 对标项目里只有托管服务（Progressier）和 PWABuilder 的独立组件在做这件事，需求出现后再评估。
