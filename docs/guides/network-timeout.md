# 网络超时接入说明

弱网下，网络请求可能既不成功也不失败，只是一直挂着。没有超时的话，平台 worker 会一直等下去，用户对着空白页，直到浏览器自己放弃。设置网络超时后，等到时限就改用已有的离线回退或运行时缓存。设计理由见 [ADR-0038](../adr/0038-network-timeout.md)，契约见 [network-timeout 规格](../../spec/network-timeout.md)。

它是**可选**的，默认关闭。

## 1. 开启

在策略里写一个 1–30 的整数秒，v1、v2、v3 策略都可以：

```ts
export const POLICY: PwaPolicy = {
  schemaVersion: 1,
  install: { enabled: true },
  offlineFallback: { enabled: true, path: "/offline.html" },
  updateMode: "prompt",
  resources: [/* …… */],
  networkTimeoutSeconds: 5,
};
```

写错时（0、31、小数）构建失败，诊断码 `schema.invalid-value`，路径 `/networkTimeoutSeconds`；写成字符串时为 `schema.invalid-type`。

**取多少秒**：取值越小，用户在网络稍慢时越早看到离线页或旧数据；取值越大，弱网下等得越久。多数应用可以从 **5 秒**开始，再按自己用户的网络情况调整。

## 2. 生效后的行为

### 页面导航

| 情况 | 结果 |
|---|---|
| N 秒内网络有响应（包括 4xx、5xx） | 返回网络响应，与未开启时相同 |
| N 秒内网络失败 | 使用回退（应用壳或离线页），与未开启时相同 |
| N 秒到了还没响应，且有可用回退 | **立即返回回退**；之后到达的网络结果被丢弃 |
| N 秒到了还没响应，但没有任何可用回退 | 继续等网络，按上面两行处理 |

超时不会把一个本来能成功的请求变成错误。要让导航在超时后有东西可显示，需要开启 [`offlineFallback`](offline-page.md) 并提供离线页，或者该路径本身有预缓存的应用壳。

### 运行时缓存（[public-read-cache](public-read-cache.md) 的 network-first）

- N 秒到了且有缓存：用缓存应答，页面收到 `served-from-cache`，`reason` 为 `network-timeout`。
- N 秒到了但没有缓存：继续等网络。
- 网络响应晚到：通常会写入；worker 被回收时可能丢失（尽力而为）。
- stale-while-revalidate 不受影响，它本来就先用缓存。

### 不受影响的

页面自己直接发出、worker 不接手的请求（比如被拒绝缓存的 API 调用）不受这个超时影响，它们的超时仍由业务代码自己处理。

## 3. `served-from-cache` 的新取值

`metadata.reason` 现在有三种取值：

| 取值 | 含义 |
|---|---|
| `network-failed` | 网络在超时前失败（或未开启超时），改用缓存 |
| `network-timeout` | 网络在 N 秒内没有响应，改用缓存 |
| `stale-while-revalidate` | SWR 规则先返回缓存，后台刷新 |

如果你的代码按 `reason` 分支处理（例如提示"网络较慢，显示的是缓存内容"），需要接住 `network-timeout`。`pwa.subscribe` 收到的 `metadata` 类型是 `{ [key: string]: JsonPrimitive }`（宽松的字符串索引类型），普通业务代码不会因为漏了这个分支而编译报错——新取值只会在运行时出现，需要自己接住。只有直接从 sw-runtime 导入 `PwaRuntimeCacheReason` 的代码才会因为类型变化而在编译期发现遗漏。

## 4. 需要知道的代价

- **超时后网络请求不会中止**，照常完成：弱网下仍然消耗流量。导航路径丢弃晚到的结果；运行时缓存路径通常会写入更新缓存，但这是尽力而为——worker 被回收时可能丢失。
- **平台 worker 与页面脚本会略微变大**，未开启超时的应用也一样；未开启时注入的 worker 配置不变，行为不变。

## 5. 已验证到什么程度

- 单元测试：策略与计划的取值校验；导航四种情况（假计时器）；运行时缓存区分超时与网络失败；未开启时编译出的计划与注入的 worker 配置与之前相同。
- 真实浏览器（本机 Chrome 桌面端，用 Playwright 让请求一直挂起来模拟弱网）：导航约 1 秒后显示离线页，未开启的站点在同样情况下一直等待；数据与页面两种运行时缓存超时后用缓存应答并带 `network-timeout`，挂起期间不写入新缓存；网络直接失败时仍为 `network-failed`。
- 未验证：真实的弱网环境（而非模拟挂起）、Chrome Android、桌面端上一个版本、CI。
