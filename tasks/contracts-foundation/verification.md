# 验证记录：contracts-foundation

> 模块质量门禁（#21）的可复现结果。任务事实源仍是 GitHub Issues #2。

## 环境与对象

- 日期：2026-09-15
- 分支：`feat/contracts-foundation`，基线 `main` = `origin/main` = `f1ed837`
- 被验证的代码提交：`1482058`（此后提交仅含文档）
- 环境：Node v24.18.0，pnpm 11.18.0，Darwin arm64
- 方式：从该提交新建独立 git worktree，`pnpm install --frozen-lockfile` 后执行；执行后 worktree 无任何改动

## 仓库命令

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 退出 0，lockfile 无需解析 |
| `pnpm lint` | 退出 0，无告警 |
| `pnpm test --filter @pwa-platform/contracts` | 退出 0，7 个文件、127 条测试通过，类型测试 0 错误，声明快照匹配 |
| `pnpm build --filter @pwa-platform/contracts` | 退出 0 |
| `pnpm --filter @pwa-platform/contracts typecheck` | 退出 0（含 schema 与公开类型严格相等、诊断字段白名单两项编译期检查） |
| `git diff --check main...HEAD` | 无空白错误 |

## 回归面

- 运行时导出列表、package.json（单入口、`sideEffects: false`、仅依赖 zod）、公开声明快照、v1 golden 文档、运行时依赖边界均由 `test/public-api.test.ts` 锁定。
- 守护有效性以变异测试确认（每次均逐字节恢复）：schema 漂移（2 处）、模块顶层创建 schema、`events.ts` 引入 zod 或再导出校验模块、收紧 `mountPath` 破坏 golden、index 泄漏内部符号、从字段白名单删除字段——均使对应检查失败。
- tree-shaking（esbuild，浏览器目标）：仅引用常量的消费端 139 字节 gzip、无 zod；引用校验函数约 30KB gzip。

## 模块审阅清单

- [x] 不引入 UI 框架、Workbox、Service Worker 注册、缓存实现：源码扫描 0 处命中（`serviceWorkerUrl` 等仅为契约字段名）。
- [x] 不含策略编译语义（合并、优先级、排序、归一化、路由匹配）：扫描 0 处命中；plan 中的不安全缓存检查仅为结构校验。
- [x] 运行时依赖仅 `zod@4.6.5`，只在 `src/validate.ts` 加载；浏览器侧的 `readLifecycleEvent` 手写且不触达 zod。
- [x] 导入时不读取浏览器全局对象、不调用 `new Function`（`test/import-safety.test.ts`）。
- [x] 独立上下文代码评审完成；阻断与应修项已在 `1482058` 修复并补测试，所有者决定写入 spec。

## 与 Spec、ADR、能力图的边界核对

- ADR-0007、能力图、`package-boundaries.md`：contracts 只负责类型、schema、诊断与结构校验，编译归 `policy-compiler`（`@pwa-platform/core`）——一致。
- ADR-0008：要求 contracts 提供缓存命名空间命名规则，但本模块 spec 与 #17–#21 未包含。所有者决定作为 follow-up #22，#2 在其完成前保持开放。`cacheNamespaceSeed` 暂按 identity-revision 段理解，待 #22 确认。
- `docs/architecture/contracts.md` 提到 PwaPlan 记录"启用同源治理时的登记表版本"、PwaPolicy 含"可选功能模块"；而 spec 规定 PwaPlan v1 为 15 个字段的封闭形状。同源治理需要提升 `planVersion`，可选功能在 v1 仅能通过 policy `extensions` 表达——留给 `shared-origin-topology` 与相应模块处理。

## 已知限制（移交后续模块）

- 路径校验只要求 URL 标准序列化形式，不归一化百分号转义（`/%61pi` 与 `/api` 均被接受）。规则比较须按 spec「路径按 URL 标准解码」由 `policy-compiler` 负责。

## 修订：安装元数据的扩展字段（2026-09-24）

规格见[模块规格](../../spec/contracts-foundation.md)"修订：安装元数据的扩展字段"，决定见 [ADR-0037](../../docs/adr/0037-install-metadata-manifest-members.md)，任务 MX1–MX7 见[计划](plan.md)。

| 提交 | 任务 | 内容 |
|---|---|---|
| `51fe324`、`f72ceb8` | MX1 | 三份规格修订、计划与 ADR-0037 |
| `fba1daf` | MX2 | 契约类型、schema、诊断码 |
| `e725e3c` | MX3 | build-verifier 的截图与快捷方式图标存在性检查 |
| `9435b8b` | MX4 | vite 生成与 Nuxt 构建用例 |
| `07031c8` | MX5 | 真实浏览器验证 |

### 已取得的证据

- **契约单元测试**：contracts 236 项通过。每个新字段的合法与非法样例（空数组、重复与大写分类、非 `宽x高` 的 `sizes`、未知取值、多余字段）；`install.shortcut-url-outside-scope` 为错误；6 个 Chrome 偏好为警告，边界值 320/319、3840/3841、恰好 2.3 与超出、8/9 张 wide、5/6 张 narrow、324/325 字符；诊断不回显值；未写新字段时解析结果与诊断与修订前相同。
- **比例判断**：实现最初用浮点除法 `长边 / 短边 > 2.3`；主会话改为整数交叉相乘，使"恰好 2.3 倍"的边界不依赖浮点舍入。
- **变异**（均转红，恢复后通过）：去掉快捷方式 scope 检查（2 项）；比例阈值改为 2.4（1 项）；narrow 上限改为 6（1 项）。
- **全仓单元测试**：MX2 后通过。build-verifier 中固定 `verify.*` 码清单的测试只新增一项 `verify.manifest-asset-missing`，其余断言未改。

### 未取得的证据

Chrome Android、桌面端 N-1、CI；富安装对话框本身的外观（需要真实安装流程）。

### MX7：门禁与独立评审（2026-09-24）

**干净 worktree 门禁**（检出 `c73ba1c`）：`pnpm install --frozen-lockfile --offline`、`lint`、`build`、`typecheck` 退出 0；`pnpm test` 全仓 2300 项通过；`pnpm test:browser` 全仓 214 项通过；运行后无改动。

**独立评审**（新上下文，审阅 `b12b8dd...c73ba1c`）：阻断 0，应修 3，均在 `857e8af` 处理：

1. 快捷方式 URL 只照搬了 `startUrl` 的 scope 规则，漏了同源共享拓扑下的子 scope 规则：根应用可以写一个打开子应用页面的快捷方式。现在编译期由 core 报 `compile.shortcut-url-in-child-scope`，计划层由 contracts 报 `plan.shortcut-url-in-child-scope`，与 `startUrl` 的两层规则一一对应。新增编译期三例（落进子 scope、百分号编码、仅首字母相同不误报）与计划层一例；变异去掉编译期检查（2 项转红）、去掉计划层兜底（1 项转红）。这是本修订唯一对 core 的改动，规格已记明。
2. 接入说明未写快捷方式 URL 不能带查询串：补写，并新增测试。
3. 接入说明"截图不进入离线缓存"过于绝对：改为"平台不会因为是截图就加入预缓存；业务的资源规则覆盖到时照常处理"，规格与 ADR 同步。

同时采纳的建议：`sizes` 每边至多 5 位（新增测试）；`/app`（缺末尾斜杠）的快捷方式被拒绝（新增测试）；接入说明注明 `description` 按 UTF-16 码元计。未采纳：Nuxt 用例的两个文件放在共享的 `basic` 夹具中（该夹具 `resources` 为空，文件不进预缓存，其他 Nuxt 测试不断言文件清单）；新诊断码插在 `DIAGNOSTIC_CODES` 中间而非末尾（代码中无按下标使用）。

**修复后复跑**（`857e8af`）：全仓 `pnpm test`、`lint`、`typecheck` 通过；contracts 240 项、core 175 项。浏览器测试未重跑：修复只涉及编译期与计划校验，不改变任何已有构建的产物。
