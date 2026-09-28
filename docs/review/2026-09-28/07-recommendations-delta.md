# 07Δ · 改进建议（增量）

上一轮 19 条的复核结论见 [06 风险增量](06-risks-delta.md)“建议项复核”：确认完成 12 条，#7、#13、#14 只是部分完成，#10 属于真机项，无法从代码核验。下面只列本轮新增或需要重开的建议。投入：XS < 半小时，S < 半天，M < 两天。

## 第一批：下一次发版前做完（都是小改动）

| # | 建议 | 对应 | 严重度 | 投入 |
|---|---|---|---|---|
| 1 | 合并 [#60](https://github.com/haigeerlab/pwa-platform/pull/60)，再把 R9 与 N1 一起随下一个补丁版本发布；发布前 R9 在所有状态表里都注明“源码已修，未发布” | N1、N5 | P2 | XS |
| 2 | 把 `requiredReleaseChecks` / `verifyReleaseGateCoverage` 接进 `release-tools` 的生产发布门禁，让“空报告”或缺检查项在生产预设下失败；这是上一轮 #13 原定的验收标准 | R4 | P2 | S |
| 3 | 改正 `CHANGELOG.md:19`：写明部署方若自加 `Service-Worker-Allowed` 放宽过 scope，升级到 0.2.0 后会构建失败，并给出迁移路径（新身份 + 迁移计划） | N4 | P3 | XS |
| 4 | 同步 `decide.ts:34`、`:71` 的注释，与 `:125` 的导航分支一致 | N6 | P3 | XS |
| 5 | 网站补 5 处：入口探测固定 5 秒超时（G1）；带 `Authorization` 的导航同样不写缓存（G3）；排查页写明对原生 `update()` 报 `InvalidStateError` 时改用 `checkForUpdate()`（C-7）；`IDENTITY.origin` 的用途与本地验收填法；`integration-by-capability.md:9` 总览表写明 `updateMode` 在所有路径必填（C-10） | 05、04 | 低～中 | S |

## 第二批：需要一次小决策或浏览器探针

| # | 建议 | 对应 | 严重度 | 投入 |
|---|---|---|---|---|
| 6 | 决定 `docs/guides/` 的去留：要么迁入 `website/` 并删除，要么网站只链接到已发布标签（而不是 `main`）；当前 10 份指南仍与网站并存 | R15 | P3 | S |
| 7 | 用 CDP `overrideQuotaForOrigin` 做探针，确认新版本 precache 超配额时是否会清掉旧版本仍在用的运行时缓存；属实就让清理回调只在 activated worker 中执行，或写进 ADR-0035 | N3 | P3 | S |
| 8 | offline-write flush 改为 trailing pass（在途时的新请求在本轮结束后补跑一轮），并用“flush 中途 skipWaiting”的探针数服务端 POST 次数 | N2 | P3 | S |
| 9 | `checkForUpdate()` 在 `update()` 挂起时会无限期占住后续检查。ADR-0043 否决过“加超时”；需要重新决定：接受并写进文档，或只对**定时检查**加上限 | R9 余项 | P3 | S（含 ADR 增补） |
| 10 | 恢复 worker 的 `deleteDatabase` 在 `onblocked` 时立即判失败，而请求可能随后成功；补一个故障注入用例确认 | R14 余项 | P3 | S |
| 11 | 查清 `served-from-cache.spec.ts:59` 的偶发失败，别让它变成门禁的随机红 | N7 | P3 | S |

## 第三批：证据覆盖（投入大，但决定能否进入生产通道）

| # | 建议 | 对应 | 投入 |
|---|---|---|---|
| 12 | 取得 Android Chrome N-1（等 Chrome 下一稳定版轮换，或保留一台不升级的设备）；这是 `desktop+android` 通道唯一的硬缺口 | ADR-0041、03 (c) | 取决于设备 |
| 13 | 完成 iPhone 入口恢复演练余下的 3 步（`unconfirmed-outage`、离线不误报、过期），先解决 iOS 下的故障注入方法 | 03 (c) | M |
| 14 | 把引擎冒烟扩到 client-runtime 与 examples-browser-e2e 的更新和恢复用例；目前 R9、R12 的关键用例只在 Chromium 上跑 | R6 | M |
| 15 | 加一个桌面 Edge 冒烟（Playwright `channel: "msedge"`，不阻断），成本低，能补上完全空白的一格 | 03 (e) | S |
| 16 | 第一次真正的生产发布时按 `docs/operations/browser-release-evidence.md` 填写一份正式记录；至今这份模板从未被填写过 | 03 (e) | 随发布 |

## 暂不建议

- 恢复页的旧字段名单（G2）、offline-write 单飞在文档中的宣传（G4）、`pnpm create vite` 参数被吞的提示：都属于低价值信息补充，等相关页面下次改动时顺带处理。
- R2（worker 读不到 `Set-Cookie`）、R13（Vue 3.4 卸载不释放客户端）、R11（纵深防御）：维持已登记的限制，没有新事实改变判断。
