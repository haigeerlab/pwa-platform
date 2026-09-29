# 关卡 3：服务端核对

进入条件：项目已经部署到一个环境，并且**人提供了地址**，该地址的域名已由业务方声明属于业务方自己。目的：对这个地址的响应头逐项核对，找出会让更新到不了用户、缓存不生效或白屏的服务端配置。

## 原则

- **规则的权威来源**是《部署与发布》的"线上响应头"表和 `build-verifier` 的判定；本文件只做编号、后果和核对方法，**不另立规则**。测试把 S1–S4 绑定到 `build-verifier`，把 S9 绑定到运行时缓存的响应准入：规则一变，测试就变红。
- **只读**：只用 `GET`，只看响应头，不保存响应体，不带 Cookie，`Set-Cookie` 只判断有没有，不输出值。请求数要少，只请求下表用到的路径。
- **无法判定不算通过**，见下文。
- 不给 nginx 或 CDN 的配置样例，也不要求业务方提供服务器配置：告诉业务方"哪些资源要满足什么"，由他们对照自行配置。

## 怎么核对

先从项目里找出实际路径：`serviceWorkerUrl`、`manifestUrl`、`mountPath`、`startUrl`、离线页路径来自 `pwa.config.ts`；指纹资源取构建产物里带哈希的 JS 或 CSS 两个；公共接口来自关卡 2 已确认的清单。

```bash
BASE=https://你的域名
# 循环变量不要叫 path：在 zsh 里它绑定 PATH，会让 curl 找不到。
for target in "/" "/sw.js" "/manifest.webmanifest"; do
  echo "=== $target"
  curl -sS -m 20 -D - -o /dev/null "$BASE$target" | tr -d '\r' | grep -iE '^(HTTP|location|content-type|cache-control|vary|age|x-cache)'
done
# 只判断有没有 Cookie，不输出值：
curl -sS -m 20 -D - -o /dev/null "$BASE/" | tr -d '\r' | grep -ci '^set-cookie'
```

不加 `-L`：要看的是这个地址本身的状态，重定向就是 S5 的发现。

## 要求清单

"必须含 / 不得含"两列是 `Cache-Control` 指令；`max-age>0` 表示大于 0 的 `max-age`。

| 编号 | 资源 | 必须含 | 不得含 | 不满足的后果 | 核对方法 |
| --- | --- | --- | --- | --- | --- |
| S1 | Service Worker 脚本（`serviceWorkerUrl`） | `no-cache` | `immutable` | 新版本被 CDN 或缓存卡住，用户长时间拿不到更新，**决定更新能否到达用户**；`Content-Type` 不是 JavaScript 则注册失败 | 看 `cache-control` 与 `content-type` |
| S2 | manifest（`manifestUrl`） | `no-cache` | `immutable` | 名称、图标的变更长期不生效；`Content-Type` 应为 application/manifest+json | 看 `cache-control` 与 `content-type` |
| S3 | 公开 HTML：`mountPath`、`startUrl`、离线页 | `no-cache` | `immutable` | 用户停在引用旧哈希资源的旧应用壳上，更新滞后或白屏 | 看 `cache-control` |
| S4 | 带指纹的静态资源 | `immutable`、`max-age>0` | `no-cache`、`no-store` | 反复向服务器验证，浪费流量；不是壳缓存的必要条件 | 看 `cache-control` |
| S5 | 入口与 worker 路径 | 直接返回 200，且是 HTTPS | 重定向 | 被重定向的响应不进缓存，worker 无法注册 | 状态码，不加 `-L` |
| S6 | 缺失的静态资源 | 返回 404 | 返回 200 的 HTML（SPA 兜底） | 发版后旧哈希文件被删，HTML 被当 JS 解析，更新窗口内白屏 | 请求资源目录下一个不存在的文件，会在对方日志留下一条 404 |
| S7 | 静态资源与公开响应 | 不带 Cookie | Set-Cookie | CDN 缓存不稳定；平台读不到它，带它的公开响应仍会被缓存 | 只判断有没有，多采样几次 |
| S8 | 旧指纹资源 | 按发布窗口保留 | 部署时直接删除旧版 | 已打开的旧页面与回滚白屏 | 从外部通常判定不了，见下 |
| S9 | 公共接口（仅在开运行时缓存时） | 状态 200、不重定向；`Content-Type` 为 application/json（动态页面为 text/html）；`Vary` 为空，或只含 `Accept`、`Accept-Encoding` | `private`、`no-store` | 整体不入缓存，页面表现照常，只有 worker 控制台一行警告 | 看 `cache-control`、`vary`、`content-type` |
| S9-SWR | 公共接口，且使用 stale-while-revalidate | 同 S9 | `no-cache`、`must-revalidate`、`max-age=0`、`s-maxage=0` | 不入缓存 | 看 `cache-control` |

**S1 单独强调**：它是更新提示能不能到达用户的关键。报告里把 S1 的结果单独列出来，不要淹在总数里。

## 无法判定

下面三种情形一律标 `无法判定`，**不算通过**，并说明原因：

1. **路径尚不存在**：接入前 `sw.js` 和 manifest 根本没有，S1、S2 只能标无法判定。
2. **需要历史部署才能知道**：S8 从外部通常看不出旧指纹资源是否保留，问人或看发布记录。
3. **响应随时间变化**：例如 `Set-Cookie` 有时出现有时不出现。只报告"本次观察到什么"，可以间隔采样几次再下结论。

此外，看不到 `Service-Worker-Allowed` 的配置时，worker 的最大 scope 也判定不了。

## 各类服务器的常见坑

只是提醒，不是配置样例：

- **nginx**：某个 `location` 一旦写了自己的 `add_header`，外层的 `add_header` 就不再继承，每个块都要写全。不要给 worker 脚本用 `expires`，它会自动生成 `max-age`。用 `try_files` 兜底到 `index.html` 会让缺失的静态资源变成 200，即 S6。
- **CDN**：边缘节点必须尊重源站的 `no-cache`，否则 S1、S3 在源站配对了也没用；有的 CDN 会自动加 `Vary: Origin` 或 `Cookie`，让公共接口整体不入缓存（S9）；静态资源上的 Cookie 会让边缘缓存不稳定（S7）。
- **发版流程**：部署时清空旧目录会直接违反 S8。

## 结束时

用报告标签逐项报告。S1–S9 中没有 `不通过` 项，且 `无法判定` 项都已说明，才算通过；把结果和日期写入状态文件，关卡 3 置为 `done`。
