# ADR-0026：页面侧 `update-applied` 生命周期事件

## 状态

已接受（2026-09-20）。项目所有者已授权按本文的边界修改 contracts、client-runtime、Vue/React 绑定和示例行为。

## 背景

[ADR-0005](0005-update-prompt-and-recovery-worker.md) 要求默认提示更新、由用户确认后才让新 worker 接管；[ADR-0013](0013-client-facade-and-page-side-lifecycle-events.md) 因此只向页面发出 `update-waiting`，而 `applyUpdate()` 只等待 `controllerchange`，不重新加载页面。

这使当前页面状态机只有把 `updateWaiting` 置为 `true` 的路径。确认后新 worker 确实接管，但页面和 Vue/React 绑定没有可观察的“此提示已不再可操作”信号，更新提示会持续存在。真实浏览器恢复演练也暴露了该残留状态会干扰后续等待提示的判断。

这是 contracts、client-runtime 和两个框架绑定共同的公开行为变化，不能把它当作示例的界面修补。

## 决策

- **在 contracts 的生命周期事件表新增 `update-applied`。** 它沿用现有 `PwaEventEnvelope` v1，`metadata` 固定为 `{}`；旧版本读取器按既有前向兼容规则把未知事件返回为 `unknown`。
- **`update-applied` 是页面侧提示周期的完成信号，而非 worker 生命周期事件。** 某个 facade 已发出 `update-waiting` 后，若其 `ServiceWorkerContainer` 随后发生 `controllerchange`，它只发出一次 `update-applied` 并清除该本地“已提示”的跟踪。它表示该页面曾提示的等待版本已不再等待、该提示必须消失；它不声称页面的 JavaScript、DOM 或业务数据已刷新。
- **每个已注册页面独立监听 `controllerchange`。** 标签页 A 调用 `applyUpdate()` 后，新 worker 接管同 scope 的受控标签页；每个此前发出 `update-waiting` 的标签页都按自己的 `controllerchange` 发出 `update-applied`。不引入 BroadcastChannel、页面间消息或新的 worker 消息协议。由恢复 worker 或另一标签页触发的接管同样会结束已显示的陈旧提示。
- **`applyUpdate()` 的结果语义不变。** 没有等待 worker 仍返回 `false`；确认消息投递失败或 10 秒内未观察到接管仍抛错。两种失败都不发 `update-applied`、不复位 `updateWaiting`。若超时后才发生 `controllerchange`，长寿命监听页面仍须发出 `update-applied`，因为提示此时才真正失效。
- **Vue 与 React 的 reducer 都把 `update-applied` 映射为 `updateWaiting = false`。** 其他状态字段、方法集合和 SSR 语义不变；重复的 `update-applied` 对状态是幂等的。
- **不自动刷新。** `applyUpdate()`、`update-applied` 和框架绑定均不得调用 reload、导航或修改页面数据。缓存准入、缓存命名空间、`PwaIdentity`、Service Worker URL 和 scope 均不变。

## 为什么不复用 `activated`

contracts 已有 `activated` 名称，但 [ADR-0013](0013-client-facade-and-page-side-lifecycle-events.md) 明确它是 worker 侧触发点，当前没有到页面的传输通道。即使新增该通道，它也会描述任意 worker 激活：首次安装、恢复 worker 与并非本页面提示所对应的版本都可能触发。它既不能保证某个页面曾显示更新提示，也不能表达“这个提示现在不可操作”。复用它会扩大 sw-runtime 的公开协议、错误地把 worker 事实等同于页面状态，并仍不能准确复位跨标签页 UI。

`update-applied` 则只由已有的页面侧 `controllerchange` 观察得出，并以先前的 `update-waiting` 为前提，恰好表达框架状态需要的转换，不改变 worker。

## 备选方案

- **`applyUpdate()` 一调用就清除提示：拒绝。** 确认消息可能投递失败或新 worker 可能不接管；此时清除会把仍可操作的更新伪装成已完成。
- **在调用标签页本地清除：拒绝。** 其他打开的标签页仍会显示过期提示，违背同一注册接管后的可见状态。
- **确认后强制刷新：拒绝。** 这违反 ADR-0005、ADR-0013 和 V1 验收矩阵对“不得全局强制刷新”的约束，并会中断表单、支付和长会话。

## 影响

- contracts、client-runtime、Vue、React 与 examples-browser-e2e 需要同步的 TDD 修改；`PwaClient` 不增加方法。
- 现有单标签页更新测试要从“接管后提示仍在”改为“接管后提示消失且页面未刷新”，并新增两个同 scope 标签页的接管覆盖。
- 恢复演练继续以注册槽位和 worker 状态作为等待条件，不以提示是否出现作为恢复已完成的证据。
- 本决定不补齐 Android N、React 真机安装、Android 恢复演练、远端 CI、包分发策略或 Vue 3.4 兼容性等既有发布证据缺口。
