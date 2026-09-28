# ADR-0043：已有同一脚本的活动注册即视为已注册

## 状态

已接受（2026-09-28，项目所有者选择方案 A）。修订 [spec/client-runtime.md](../../spec/client-runtime.md) 中 `registered` 事件的发出时机；关闭架构审查风险 R9 的平台侧根因，iPhone 真机复核仍按 [ADR-0041](0041-keep-apple-as-progressive-compatibility.md) 进行。

## 背景

iPhone 真机曾在断网恢复后导航回应用时显示 `not registered`：页面已被本源 worker 控制、注册中已有 activated 的 worker，但同页 `serviceWorker.register()` 与 `registration.update()` 都超过 5 秒未完成（[验证记录](../../tasks/stable-release-qualification/verification.md)）。示例的 `registered` 状态来自 `client-runtime` facade 的 `register()`，而它只等待浏览器的 `navigator.serviceWorker.register()`。

2026-09-28 用本机探测服务器（可让 `/app/sw.js` 请求挂起）复现：

| 引擎 | 已有一个挂起的 `update()` 时调用 `register()` | 同时调用 `getRegistration()` |
|---|---|---|
| iOS 模拟器 WebKit（iPhone 17，iOS 26.3） | 超过 8 秒未完成 | 1 毫秒返回 activated 注册 |
| 桌面 Chromium（Google Chrome 153） | 超过 8 秒未完成 | — |
| 桌面 WebKit（Playwright） | 超过 8 秒未完成 | — |
| Firefox（Playwright） | 立即完成 | — |

没有挂起的 `update()` 时，即使脚本请求挂起，三种引擎的 `register()` 都立即完成。原因是 Service Worker 规范中同一 scope 的 register 与 update 在同一个任务队列中排队执行：`register()` 要等前面的 update 任务结束，而 update 任务要等脚本请求返回。iPhone 在网络刚恢复时，导航触发的后台更新检查容易挂在尚未恢复的连接上，于是平台把一个正常工作的注册报告为“未注册”。这不是 iOS 独有的问题：任何浏览器在 `sw.js` 请求挂起时都会出现。

## 决定

- facade 的 `register()` 在调用浏览器 `register()` 的同时，用不排队的 `getRegistration(scope)` 查找已有注册。若该注册的 scope 恰为配置的 `scope`、活动 worker 已存在且其脚本 URL 恰为 `serviceWorkerUrl`，就把它当作本次注册结果：立即发出 `registered`，开始观察更新，`register()` 随即完成。
- 浏览器的 `register()` 照常在后台执行，脚本若有变化仍会被发现并走既有的 `update-waiting` 路径；它此后的失败不再报告给调用方，与一次失败的更新检查同等处理，已有注册继续工作。
- 以下情形保持原行为，继续等待浏览器 `register()`：首次访问（没有注册）、注册只有 installing 或 waiting 的 worker、活动 worker 运行的是另一个脚本、找到的是更宽 scope 的注册，或 `getRegistration()` 本身失败。
- `registered` 事件的负载不变（`{ scope }`，带 origin 的绝对 URL）。

## 备选方案

- **给 `register()` 与平台发起的 `update()` 加超时。** 不采用：超时只能把“挂起”变成“失败”，页面仍报告未注册，而且超时阈值难以同时适配慢网与挂起。
- **只把事实记录下来，不改平台。** 不采用：状态错误对任何在 `sw.js` 请求挂起时打开页面的用户都会出现，并直接阻断 iPhone 渐进兼容通道的晋级判定。

## 影响

- 回访页面在网络异常时也能立即得到正确的注册状态；首次访问语义不变。
- 回访时 `register()` 的失败（例如 `sw.js` 暂时 404）不再让 facade 的 `register()` 拒绝；需要感知脚本不可用的调用方应使用 `checkForUpdate()` 的结果。
- iPhone 真机仍需用同一探测方法确认：网络恢复时确有挂起的 `sw.js` 请求，并且修复后不再显示 `not registered`。确认前 R9 的真机结论保持待定。

## 增补：挂载时已在安装的版本（2026-09-28，审查增量复核 N1）

直接采用已有注册后，这个注册可能已经有一个 installing worker：导航触发的更新检查在页面脚本运行前就开始安装新版本，其 `updatefound` 早于 facade 挂上监听。原路径不会遇到这种情况，因为浏览器的 `register()` 排在该更新之后，返回时新版本已经 waiting；新路径若只看 `waiting` 和此后的 `updatefound`，本页生命周期内就不会发出 `update-waiting`。

因此 facade 在开始观察注册时，也对当时的 `installing` worker 订阅 `statechange`，它到达 `installed` 时按既有规则宣告 `update-waiting`：页面不受任何 worker 控制时不宣告，同一个 worker 不重复宣告。
