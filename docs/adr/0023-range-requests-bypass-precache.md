# ADR-0023：Range 请求不由预缓存应答

## 状态

已接受（2026-09-19）。修订 [ADR-0012](0012-platform-worker-runtime-config-and-recovery-worker.md) 中平台 worker 的请求判断表第 5 行，不改变 [ADR-0002](0002-declarative-policy-and-compiled-plan.md) 的计划契约。

## 背景

判断表第 5 行规定：非导航请求的路径加查询串精确命中清单时，读取预缓存。预缓存存的是完整响应，`engine.match` 只收到清单 URL，请求头传不进去。因此带 `Range` 的请求会拿到完整的 200 响应，而不是 206。音视频元素依赖 206 来拖动进度和分段加载，结果就是已预缓存的媒体拖动失败。本仓库的真实浏览器复现测试确认了这一点（`packages/sw-runtime/browser-tests/range-request.spec.ts`），Immich 也在生产环境遇到过（immich-app/immich#27923）。

有两种修法：

- **在计划的 `requestBaselineDenials` 中新增 `range`。** 按 contracts 规格，新增拒绝项必须提升 `planVersion`，会改动 v1 公开契约，并连带更新 core 的逐字节快照和 worker 配置的白名单。而这个列表在 worker 里只用于审计：请求层面的拒绝由判断表本身执行。
- **只修改 worker 的判断表。** 带 `Range` 的请求本应由预缓存应答时，改为不接手。

## 决策

- **判断表第 5 行：请求本应由预缓存应答，但带有 `Range` 请求头（不论取值）时，worker 不接手，原因记为 `range`。** 请求的表现与没有 worker 时完全相同。
- **`range` 不是计划层面的拒绝项。** 它是对 HTTP 部分内容语义的实现限制，不是业务可以选择的缓存策略。`PwaPlan`、`requestBaselineDenials`、`planVersion` 与 worker 配置格式都不变。
- **只在本应读预缓存时使用 `range` 这个原因。** 拒绝、排除、未分类和不在清单内的请求，仍按原来的原因不接手，审计含义保持不变。导航请求不看 `Range`。
- **不从缓存切出部分内容。** 不引入 `workbox-range-requests`，也不写运行时缓存。

## 影响

- **离线时无法拖动已预缓存的音视频**：带 `Range` 的请求交给网络，断网时得到网络错误。v1 不以离线媒体播放为目标。浏览器播放媒体时，第一个请求通常就带 `Range: bytes=0-`，所以预缓存的媒体在离线时整体无法播放，这一点写进已知限制。需要离线媒体的应用应等待运行时缓存能力，届时另写 ADR 评估部分内容应答。
- **已发布的 worker 不会自动修复**：这个行为改变随下一次发布生效，不涉及迁移，也不影响缓存命名空间与身份。
- **业务不需要做任何改动**：公开 API、`PwaPolicy` 与计划都不变。
- **由预缓存应答部分内容、按 `Range` 取值区别对待、把 `range` 提升为计划层面的拒绝项，都需要新的 ADR。**
- 规格见 [spec/sw-runtime.md](../../spec/sw-runtime.md) 的"修订：Range 请求不由预缓存应答"，实现计划见 [tasks/sw-runtime/plan.md](../../tasks/sw-runtime/plan.md) 的 R1–R4。
