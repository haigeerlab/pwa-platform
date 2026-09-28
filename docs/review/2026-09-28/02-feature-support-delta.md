# 02Δ · 功能支持矩阵增量

上一轮：[02-feature-support-matrix.md](../2026-09-27/02-feature-support-matrix.md)。功能清单本身（有什么、怎么开、默认会怎样）**没有新增或删除的功能**；变化集中在行为细节和证据等级。持续维护的逐项证据见[功能证据台账](../../operations/feature-evidence-ledger.md)。

| 功能 | 变化 | 默认 | 已发布？ | 证据 |
|---|---|---|---|---|
| 更新提示 UI（React/Vue） | 新增 `locale`：内置 `zh-CN`、`en` | 不渲染；启用后 `locale` 默认 `zh-CN` | 是（0.2.0） | L3（Chrome）；单元测试含两种语言的文案一致性 |
| 注册状态（`registered`） | 回访时若浏览器已有同 scope、同脚本且已激活的注册，立即报告 `registered`，不再排在挂起的更新之后（R9，ADR-0043） | 自动 | **否**（在 0.2.1 之后合入） | L2 + L3（`registration.spec.ts:79`）；iPhone 真机复核通过 |
| 更新等待（`update-waiting`） | 回访时已在安装的新版本会在 installed 后宣告（N1） | 自动 | **否**，[#60](https://github.com/haigeerlab/pwa-platform/pull/60) 待合并 | L2 |
| 运行时缓存：`Authorization` | 带 `Authorization` 的**导航**请求也不写入 pages 缓存（R1） | 自动 | 是（0.2.0） | L3（`runtime-cache.spec.ts:250`）；网站只写了非导航的一半（05 的 G3） |
| 运行时缓存：准入诊断 | 拒绝写入时在 worker 控制台打印原因（如 `vary (Vary: Origin)`）（R8） | 自动 | 是（0.2.0） | L3（仅 Chromium，引擎冒烟中跳过） |
| 运行时缓存：配额 | 配额错误时清理本应用全部运行时缓存，不论本次生命周期是否建过对应引擎（R12） | 自动 | 是（0.2.0） | L3（仅 Chromium）；副作用见 06 的 N3 |
| 身份校验：scope | `scope` 必须恰好等于 SW 脚本所在目录（R3） | 构建期强制 | 是（0.2.0） | L2 |
| 恢复 worker | 某个缓存或数据库删除失败时继续删除其余项（#15） | 发布恢复产物时 | 是（0.2.1） | L3（Chrome，另有不阻断的 WebKit/Firefox 冒烟） |
| 离线写入 flush | 同一会话绑定的并发 flush 合并为一次（R5） | 使用离线写入时 | 包未发布 | L3（Chrome）；边界见 06 的 N2 |

## 证据分层口径（与上一轮一致）

- **代码实现**：只读到代码，没有测试。
- **L2**：单元或集成测试。
- **L3**：真实浏览器自动化。本轮分成“Chrome（阻断门禁）”和“WebKit/Firefox 引擎冒烟（不阻断，不等于 Safari/iOS/Firefox 稳定版）”。
- **L4**：真机人工记录，只引用 `tasks/stable-release-qualification/verification.md` 中有日期、设备和结果的条目。
