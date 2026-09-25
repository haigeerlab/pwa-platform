# 验证记录：offline-write-extension

日期：2026-09-20（本机）。状态：**本地质量门禁与独立评审完成；交付检查点 C 完成**（见下方"独立评审"一节）。

## 已取得证据

| 范围 | 命令/场景 | 结果 |
|---|---|---|
| worker 单元 | `pnpm --filter @pwa-platform/sw-runtime test` | 15 files、213 tests 通过。 |
| client 单元 | `pnpm --filter @pwa-platform/client-runtime test` | 4 files、122 tests 通过。 |
| harness 单元 | `pnpm --filter @pwa-platform/browser-test-harness test -- server.test.ts` | 7 files、66 tests 通过。 |
| 类型 | browser-test-harness、sw-runtime、client-runtime focused `typecheck` | 通过。 |
| worker Chrome | `pnpm --filter @pwa-platform/sw-runtime test:browser` | Chrome 153.0.8010.50，25 tests 通过：入队、变 binding purge、匹配 binding 的真实 POST 201 重放、recovery 删除队列库，以及既有非 GET 透传回归。 |
| client Chrome | `pnpm --filter @pwa-platform/client-runtime test:browser` | Chrome 153.0.8010.50，17 tests 通过：队列存在时 `logout()` 先清库再注销，另覆盖既有注册、更新、缓存不删除和重注册语义。 |
| 全仓门禁 | `pnpm build`、`pnpm test`、`pnpm typecheck`、`pnpm lint` | 全部通过；Nuxt 测试输出既有 H3 unused-import 与显式 fixture 编译警告，未导致失败。 |

## 独立评审

对 `main..HEAD` 的 correctness、readability、architecture、security 与 performance 复核完成。发现并修正同一毫秒的多次入队会按 IndexedDB 键序而非 FIFO 重放的问题：排序值现在在同一 readwrite 事务中从完整快照严格递增。修正后 SW 单元 213/213、类型检查与 Chrome 25/25 通过；未发现其余阻断项。

变异证明：临时移除平台 worker 的同源 window message 来源校验后，`platform-worker.test.ts` 的“忽略其他来源”场景失败（same-origin worker 来源错误获得 `skipWaiting`）。随后已用同一补丁恢复，聚焦测试重新通过；变异未提交。

## 未取得或不宣称的证据

- Chrome Android、桌面端 N-1 与远端 CI：未执行。
- Background Sync、自动重放、多方法写入、响应正文保存与 exactly-once：不在 ADR-0027 范围内，未实现也未验证。
- 远端发布门禁：尚未执行；本记录不将本地结果扩展为发布结论。（独立评审已完成，见上。）
