# 默认值与时间约定

平台内部有一批固定的时间、数量和命名约定。它们分散在页面侧运行时、worker 和构建器中，这里集中列出。“是否可配置”只指业务是否有公开的配置项；标为“否”的值是实现内的常量，可能随版本调整，不应写死依赖。以下数值对应已发布的 <code>0.2.3</code>。

## 更新

| 约定 | 值 | 是否可配置 | 详见 |
| --- | --- | --- | --- |
| 定时更新检查 | 默认**关闭**，没有默认间隔 | 是：<code>updateCheck: { intervalMs }</code> | [安装与更新](/guide/updates#定时检查的行为) |
| 检查间隔范围 | 60000 ms 到 2147483647 ms 的整数，超出范围创建绑定时抛错 | 是（在范围内） | [安装与更新](/guide/updates#定时检查的行为) |
| 检查开始时机 | <code>register()</code> 成功之后，第一次检查在一个完整间隔之后 | 否 | [安装与更新](/guide/updates#定时检查的行为) |
| 页面在后台时 | 到点的检查被跳过并记为“欠着”，重新可见时补查 | 否 | [安装与更新](/guide/updates#定时检查的行为) |
| <code>applyUpdate()</code> 等待接管 | 最多 10 秒，超时 Promise 拒绝；没有等待版本时直接返回 <code>false</code> | 否 | [安装与更新](/guide/updates) |
| 默认更新提示的“稍后”提醒 | 30 分钟后再次提示，只保存在内存中，刷新页面后重置 | 否（自绘提示可自行决定） | [自绘更新提示](/guide/update-prompt-custom) |
| 默认更新提示的显示防抖 | 等待版本稳定 100 ms 后才显示 | 否 | [安装与更新](/guide/updates#可选的默认更新提示) |
| <code>served-from-cache</code> 补查 | 注册后向 worker 询问一次，10 秒无回复就放弃，不报错 | 否 | [公共读取缓存](/guide/public-read-cache#served-from-cache-事件) |

## 安装

| 约定 | 值 | 是否可配置 | 详见 |
| --- | --- | --- | --- |
| 安装提示事件 | 每个 <code>beforeinstallprompt</code> 事件只能 <code>prompt()</code> 一次，用过即丢弃 | 否（浏览器规则） | [安装与更新](/guide/updates#安装提示的限制) |
| 平台接管安装提示 | 只有计划带安装信息时才拦截浏览器自己的提示 | 是：是否提供 <code>PwaInstallMetadata</code> | [身份、安装信息与策略](/guide/configuration) |

## 离线

| 约定 | 值 | 是否可配置 | 详见 |
| --- | --- | --- | --- |
| 离线页恢复探测 | 每 10 秒和收到 <code>online</code> 事件时，对控制页面的 worker 脚本地址发 <code>HEAD</code>；3 秒未响应即中止；仅页面可见时探测；2xx 就重新加载 | 否 | [离线体验](/guide/offline#默认离线页)、[服务器与 CDN 配置](/operations/hosting#更新检查对服务端的负载) |
| 断网时导航的候选顺序 | 请求 URL 本身、去掉查询参数的同一路径、该路径下的 <code>index.html</code>（仅限已预缓存），最后是离线页；没有应用壳通配回退 | 否 | [离线体验](/guide/offline#静态资源与导航) |
| <code>networkTimeoutSeconds</code> | 默认**关闭**；开启时为 1 到 30 的整数秒，超时后转用回退 | 是：策略字段 | [离线体验](/guide/offline#弱网超时) |
| 预缓存安装 | 整体成败：任一预缓存 URL 取回失败，新 worker 安装失败，旧版本继续服务 | 否 | [离线体验](/guide/offline#静态资源与导航) |
| <code>Range</code> 请求 | 不走预缓存，直接交给网络 | 否 | [缓存安全模型](/architecture/security) |

## 运行时缓存

运行时缓存默认关闭；开启后下面三项**没有默认值**，必须显式给出。

| 约定 | 值 | 是否可配置 | 详见 |
| --- | --- | --- | --- |
| <code>maxEntries</code> | 1 到 200 的整数 | 是（必填） | [公共读取缓存](/guide/public-read-cache#开启与配置) |
| <code>maxEntryBytes</code> | 1 到 1048576（1 MiB）的整数字节 | 是（必填） | [公共读取缓存](/guide/public-read-cache#开启与配置) |
| <code>maxAgeSeconds</code> | 60 到 604800（7 天）的整数秒；从**平台写入缓存的时刻**起算，与响应自身的 <code>max-age</code>、<code>Date</code> 无关 | 是（必填） | [公共读取缓存](/guide/public-read-cache#开启与配置) |
| 基线拒绝 | <code>non-get</code>、<code>cross-origin</code>、<code>no-store</code>、<code>opaque-response</code>、<code>redirect</code>、<code>websocket</code>、<code>unclassified</code>，任何策略都不能取消 | 否 | [缓存安全模型](/architecture/security) |
| 拒绝类资源 | <code>session-data</code>、<code>mutation</code>、<code>stream</code>、<code>unclassified</code> 一律为拒绝规则 | 否 | [缓存安全模型](/architecture/security) |
| 配额错误 | 发生 <code>QuotaExceededError</code> 时清空全部运行时缓存 | 否 | [公共读取缓存](/guide/public-read-cache#已知限制) |
| 规则或上限变化 | 换用新的数据缓存（名称含配置摘要），旧的在下次激活时清除 | 否 | [公共读取缓存](/guide/public-read-cache#离线与更新行为) |

## 登出

| 约定 | 值 | 是否可配置 | 详见 |
| --- | --- | --- | --- |
| worker 确认清理的等待 | 10 秒，超时 <code>logout()</code> 返回 <code>false</code> 且不注销 | 否 | [安装与更新](/guide/updates) |
| 清理范围 | 离线写队列、全部运行时缓存及其过期记录；**不含预缓存** | 否 | [缓存安全模型](/architecture/security#登出与激活清理什么) |
| 页面未受控时 | 直接返回 <code>false</code>（首次访问的页面就是这种情况） | 否 | [运行时生命周期](/architecture/lifecycle#首次访问) |

## 入口恢复

这是可选包 <code>@pwa-platform/entry-resilience</code> 的约定。

| 约定 | 值 | 是否可配置 | 详见 |
| --- | --- | --- | --- |
| <code>maxValidityDays</code> | 默认 30，范围 1 到 90 的整数天：入口清单的 <code>expiresAt</code> 距交入时刻不得超过它 | 是：插件选项 | [入口恢复](/guide/entry-resilience) |
| 清单条目数 | 最多 5 条 | 否 | [入口恢复](/guide/entry-resilience) |
| 探测（仅 <code>normal</code> 状态） | 先探测主入口，失败才逐个探测备用入口；串行；每次 5 秒超时；备用入口只展示探测可达的 | 否 | [入口恢复](/guide/entry-resilience) |
| <code>returnPath</code> | 长度不超过 1024 | 否 | [入口恢复](/guide/entry-resilience) |

## 恢复 worker

| 约定 | 值 | 是否可配置 | 详见 |
| --- | --- | --- | --- |
| 文件名 | <code>pwa-recovery-worker.js</code>，位于构建输出根目录 | 否 | [运行时生命周期](/architecture/lifecycle#异常恢复) |
| 接管方式 | 安装时立即 <code>skipWaiting()</code>，删除完成后 <code>clients.claim()</code> | 否 | [运行时生命周期](/architecture/lifecycle#异常恢复) |
| 离线写数据库被阻塞 | 最多再等 3 秒，之后按失败处理 | 否 | [运行时生命周期](/architecture/lifecycle#异常恢复) |
| 失败行为 | 缓存或离线写数据库删除失败则中止（不取消 Push、不接管）；过期记录清理与 Push 取消为尽力而为 | 否 | [运行时生命周期](/architecture/lifecycle#异常恢复) |

## 发布

| 约定 | 值 | 是否可配置 | 详见 |
| --- | --- | --- | --- |
| 旧指纹资源保留 | 发布 R 时保留 R、R-1、R-2；更早版本从被取代之日起再保留 7 天，取更长者 | 否（检查内固定） | [部署与发布](/operations/release#更新与旧资源保留) |
| 指纹文件识别 | 文件名末尾 <code>-</code> 加恰好 8 个 <code>[A-Za-z0-9_-]</code> 字符再接扩展名 | 否 | [服务器与 CDN 配置](/operations/hosting#响应头总表) |
| 指纹资源 <code>max-age</code> | 必须为正数（<code>0</code> 不通过） | 是（具体长度由你决定） | [服务器与 CDN 配置](/operations/hosting#响应头总表) |
| worker、manifest、公开 HTML | <code>no-cache</code>，不得含 <code>immutable</code> | 否 | [服务器与 CDN 配置](/operations/hosting#响应头总表) |
| <code>scope</code> 与 worker 目录 | 必须相等，否则构建以 <code>identity.scope-outside-worker-directory</code> 失败 | 否 | [缓存安全模型](/architecture/security#service-worker-所有权) |

## 命名

| 约定 | 值 | 是否可配置 | 详见 |
| --- | --- | --- | --- |
| 应用缓存前缀 | <code>pwa:&lt;appId&gt;:&lt;environment&gt;:</code>，各段经 <code>encodeURIComponent</code> 编码 | 由身份决定 | [身份、安装信息与策略](/guide/configuration#cachenamespaceseed-是什么) |
| 预缓存 | <code>pwa:&lt;appId&gt;:&lt;environment&gt;:&lt;cacheNamespaceSeed&gt;:precache</code> | 由身份决定 | [身份、安装信息与策略](/guide/configuration#cachenamespaceseed-是什么) |
| 运行时页面缓存 | <code>…:&lt;cacheNamespaceSeed&gt;:runtime-pages</code> | 由身份决定 | [公共读取缓存](/guide/public-read-cache) |
| 运行时数据缓存 | <code>…:&lt;cacheNamespaceSeed&gt;:runtime-data-&lt;配置摘要&gt;</code> | 由身份和缓存配置决定 | [公共读取缓存](/guide/public-read-cache) |
| 离线写队列数据库（IndexedDB） | <code>pwa-offline-write:&lt;appId&gt;:&lt;environment&gt;:&lt;cacheNamespaceSeed&gt;</code>，各段经 <code>encodeURIComponent</code> 编码；该模块尚未对外发布 | 由身份决定 | [可选能力与交付状态](/guide/optional) |
| 过期记录（IndexedDB） | Workbox 自己的 <code>workbox-expiration</code> 数据库；平台只删除属于本应用缓存的记录 | 否 | [缓存安全模型](/architecture/security#登出与激活清理什么) |
| 页面配置虚拟模块 | <code>virtual:pwa-config</code> | 否 | [包与公开入口](/reference/packages) |

命名一旦在生产环境注册就不能改变：修改 <code>appId</code>、<code>environment</code> 或 <code>cacheNamespaceSeed</code> 需要架构决策记录和迁移计划，见[生产身份要保持稳定](/guide/configuration#生产身份要保持稳定)。
