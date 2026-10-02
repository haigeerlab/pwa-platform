# 诊断码索引

npm `0.3.1` **已支持**可移植部署和独立的 `worker-mime` 检查；本页也标明尚未公开的私有模块诊断码。按实际安装的包版本判断诊断码是否可用。

构建日志、发布检查和入口恢复的诊断信息都以**诊断码**加**字段路径**的形式给出，例如 <code>identity.invalid-origin at /identity/origin</code>。信息里只有码和路径，不回显你的配置值。路径是指向配置的 JSON Pointer：<code>/identity/scope</code>、<code>/install/icons/0/src</code>、<code>/policy/resources/2/pathPrefix</code>，数字是数组下标。先按前缀找到分组，再按码查“怎么改”；字段本身的取值规则见[字段参考](/guide/configuration#field-reference)。

“严重度”一栏：**构建失败**表示 <code>vite build</code> 直接报错退出；**警告**只打印，不阻断构建；**发布检查失败**指 <code>build-verifier</code> 的发布检查报告 <code>ok: false</code>（由你的发布脚本采集输入，见[自检](/operations/hosting#自检)）；**运行时**指页面里的入口恢复调用，它们不抛异常，只体现在返回的 <code>diagnostics</code> 数组里。

前缀速查：<code>schema.</code>／<code>value.</code>／<code>path.</code>／<code>extensions.</code> 通用校验；<code>identity.</code> 身份；<code>install.</code> 安装元数据；<code>policy.</code>／<code>compile.</code>／<code>runtime-cache.</code> 策略与编译；<code>vite.</code> Vite 适配；<code>verify.</code> 产物与发布检查；<code>registry.</code> 同源多应用；<code>entry.</code> 入口恢复。没有诊断码的构建失败见[最后一节](#无诊断码的构建失败)。

## 通用校验

三个配置对象（身份、安装元数据、策略）和登记表都是严格对象，先过这一层。

| 码 | 严重度 | 何时出现 | 怎么改 | 详见 |
| --- | --- | --- | --- | --- |
| <code>schema.invalid-type</code> | 构建失败 | 字段类型不对，如把数字写成字符串 | 按路径找到字段，改成类型声明里的类型 | [字段参考](/guide/configuration#field-reference) |
| <code>schema.invalid-value</code> | 构建失败 | 值不在允许范围：空字符串、枚举之外（包括策略的 <code>schemaVersion</code> 不是 1、2、3）、数字越界、非法 <code>sizes</code> 等 | 对照字段参考里该字段的“取值规则” | [字段参考](/guide/configuration#field-reference) |
| <code>schema.missing-field</code> | 构建失败 | 必填字段没写 | 补上；“默认”为“无”的都是必填 | [字段参考](/guide/configuration#field-reference) |
| <code>schema.unknown-field</code> | 构建失败 | 对象里有契约之外的字段（包括拼错的字段名） | 删掉或改正拼写；不要往配置里塞平台不认识的字段 | [字段参考](/guide/configuration#field-reference) |
| <code>schema.unsupported-version</code> | 构建失败 | 共享 origin 登记表版本不符合部署模式（固定域名用 v1，可移植用 v2；策略版本错误报 <code>schema.invalid-value</code>） | 按部署模式选择登记表版本，不改变旧 v1 的含义 | [同源多应用](/operations/release#同源多应用) |
| <code>value.not-serializable</code> | 构建失败 | 配置里含不是纯 JSON 的值（函数、类实例、循环引用等） | 配置只写纯数据 | [策略只声明意图](/guide/configuration#策略只声明意图) |
| <code>path.invalid</code> | 构建失败 | 路径不是规范形式：不以 <code>/</code> 开头、含 <code>//</code>、反斜杠、查询串或 <code>.</code>／<code>..</code> 段；<code>scope</code> 没有以 <code>/</code> 结尾；<code>pathPrefix</code> 以 <code>/</code> 结尾或含 <code>*</code> | 改成规范路径；<code>scope</code> 以 <code>/</code> 结尾，<code>pathPrefix</code> 不以 <code>/</code> 结尾且无通配符 | [构建期身份校验](/guide/configuration#构建期身份校验)、[资源规则的写法约束](/guide/configuration#资源规则的写法约束) |
| <code>extensions.invalid-namespace</code> | 构建失败 | 策略的 <code>extensions</code> 键没有命名空间前缀 | 键写成 <code>vendor.feature</code> 这种带命名空间的形式 | — |

## 身份与安装元数据

| 码 | 严重度 | 何时出现 | 怎么改 | 详见 |
| --- | --- | --- | --- | --- |
| <code>identity.invalid-origin</code> | 构建失败 | <code>origin</code> 不是 <code>https:</code> 的规范 origin（带了路径或结尾斜杠也算）；<code>http:</code> 只允许 <code>localhost</code>、<code>127.0.0.1</code>、<code>[::1]</code> | 只写协议＋主机＋端口，如 <code>https://app.example.com</code> | [<code>origin</code> 填什么](/guide/configuration#origin-填什么) |
| <code>identity.invalid-environment</code> | 构建失败 | <code>environment</code> 不匹配 <code>[a-z][a-z0-9-]*</code> | 小写字母开头，只含小写字母、数字、连字符 | [构建期身份校验](/guide/configuration#构建期身份校验) |
| <code>identity.scope-excludes-mount-path</code> | 构建失败 | <code>mountPath</code> 不在 <code>scope</code> 内 | 让 <code>mountPath</code> 位于 <code>scope</code> 之内 | [构建期身份校验](/guide/configuration#构建期身份校验) |
| <code>identity.service-worker-outside-scope</code> | 构建失败 | <code>serviceWorkerUrl</code> 不在 <code>scope</code> 下 | 把 worker 放进 scope 目录 | [构建期身份校验](/guide/configuration#构建期身份校验) |
| <code>identity.scope-outside-worker-directory</code> | 构建失败 | <code>scope</code> 比 worker 所在目录更宽（如 <code>/app/assets/sw.js</code> 配 <code>scope: "/app/"</code>） | worker 直接放在 scope 目录下；平台不使用 <code>Service-Worker-Allowed</code> | [生产身份要保持稳定](/guide/configuration#生产身份要保持稳定) |
| <code>identity.manifest-outside-scope</code> | 构建失败 | <code>manifestUrl</code> 不在 <code>scope</code> 下 | 把 manifest 路径放进 scope | [构建期身份校验](/guide/configuration#构建期身份校验) |
| <code>policy.identity-override</code> | 构建失败 | 策略对象里写了身份字段（<code>appId</code>、<code>scope</code> 等） | 从策略里删掉，身份只在 <code>identity</code> 里声明 | [字段参考](/guide/configuration#field-reference) |
| <code>install.start-url-outside-scope</code> | 构建失败 | <code>startUrl</code> 不在 <code>scope</code> 内 | 改成 scope 内的路径；子路径部署要带前缀 | [生产身份要保持稳定](/guide/configuration#生产身份要保持稳定) |
| <code>install.missing-icon-variant</code> | 构建失败 | <code>icons</code> 缺 192x192 或 512x512 的 <code>any</code>／<code>maskable</code> 条目 | 四个组合各写一条 | [在 vite.config.ts 中接入](/guide/configuration#在-vite-config-ts-中接入) |
| <code>install.shortcut-url-outside-scope</code> | 构建失败 | 快捷方式 <code>url</code> 不在 scope 内 | 改成 scope 内的路径 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>install.invalid-color</code> | 警告 | <code>themeColor</code>／<code>backgroundColor</code> 不是十六进制色 | 改成 <code>#rrggbb</code> 等形式 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>install.description-too-long</code> | 警告 | <code>description</code> 超过 324 个 UTF-16 码元 | 缩短 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>install.screenshot-size-out-of-range</code> | 警告 | 截图宽或高不在 320–3840 像素 | 换尺寸合适的截图 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>install.screenshot-aspect-ratio</code> | 警告 | 截图长边超过短边的 2.3 倍 | 换比例更接近的截图 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>install.screenshot-aspect-mismatch</code> | 警告 | 同一 <code>formFactor</code> 的截图宽高比不一致 | 同类截图用同一比例 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>install.screenshot-count</code> | 警告 | <code>wide</code> 超过 8 张或 <code>narrow</code> 超过 5 张 | 删到上限以内 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>install.screenshot-no-wide</code> | 警告 | 有截图但没有 <code>wide</code>，桌面 Chrome 不显示 | 按需补一张 <code>wide</code> 截图 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |

安装元数据的警告只在 <code>policy.install.enabled</code> 为真时报告。

## 策略与编译

| 码 | 严重度 | 何时出现 | 怎么改 | 详见 |
| --- | --- | --- | --- | --- |
| <code>policy.unsafe-cache-strategy</code> | 构建失败 | 拒绝类资源（<code>session-data</code>、<code>mutation</code>、<code>stream</code>、<code>unclassified</code>）的 <code>cache</code> 不是 <code>"none"</code> | 改成 <code>"none"</code>；不要把私有接口改标成公共类别 | [资源规则的写法约束](/guide/configuration#资源规则的写法约束) |
| <code>compile.duplicate-path-prefix</code> | 构建失败 | 同一 <code>pathPrefix</code>（URL 解码后）出现两次 | 合并或删除重复规则 | [资源规则的写法约束](/guide/configuration#资源规则的写法约束) |
| <code>compile.allow-under-deny</code> | 构建失败 | 允许缓存的规则落在某条拒绝规则的前缀之内 | 把公开接口挪到拒绝前缀之外的路径 | [资源规则的写法约束](/guide/configuration#资源规则的写法约束) |
| <code>compile.public-path-outside-scope</code> | 构建失败 | Vite <code>base</code> 不在 <code>scope</code> 内 | 让 <code>base</code> 位于 <code>scope</code> 之内，子路径部署写 <code>"/app/"</code> | [构建期身份校验](/guide/configuration#构建期身份校验) |
| <code>compile.install-metadata-missing</code> | 构建失败 | <code>policy.install.enabled</code> 为真，但插件 <code>install</code> 是 <code>null</code> | 传入安装元数据，或把策略的 <code>install.enabled</code> 改为 <code>false</code> | [只使用离线与更新，不启用平台安装提示](/guide/configuration#只使用离线与更新-不启用平台安装提示) |
| <code>compile.offline-fallback-not-built</code> | 构建失败 | 策略开启了离线回退，但产物里没有该路径的文件 | 插件写 <code>offlinePage: {}</code>，或自备 <code>public/offline.html</code> | [在 vite.config.ts 中接入](/guide/configuration#在-vite-config-ts-中接入)、[常见问题](/guide/troubleshooting#构建提示离线页不存在) |
| <code>compile.offline-fallback-denied</code> | 构建失败 | 离线页路径被某条拒绝规则覆盖 | 调整规则，让离线页不在拒绝前缀下 | [离线体验](/guide/offline) |
| <code>compile.asset-rule-unmatched</code> | 警告 | 某条 <code>asset</code> 规则没有匹配到任何构建文件 | 通常是路径写错或产物路径变了，核对 <code>pathPrefix</code> | [离线体验](/guide/offline#静态资源与导航) |
| <code>compile.invalid-host-output</code> | 构建失败 | 传给编译器的构建产物清单无效；用 <code>@pwa-platform/vite</code> 时由适配器生成，一般不会出现 | 自行调用 <code>buildPwaArtifacts</code> 时检查 <code>files</code> 与 <code>publicPath</code> | [包与公开入口](/reference/packages) |
| <code>compile.unsupported-topology</code> | 构建失败 | 部署拓扑不受编译器支持 | <code>topology.kind</code> 用 <code>standalone-origin</code> 或 <code>shared-origin</code> | [在 vite.config.ts 中接入](/guide/configuration#在-vite-config-ts-中接入) |
| <code>runtime-cache.disabled-configuration</code> | 构建失败 | v3 的 <code>runtimeCache.enabled</code> 为 <code>false</code>，但上限没有全部为 0 | 关闭时三项上限都写 0 | [公共读取缓存](/guide/public-read-cache#开启与配置) |
| <code>runtime-cache.enabled-configuration</code> | 构建失败 | <code>runtimeCache.enabled</code> 为 <code>true</code>，但某项上限是 0 | 三项上限都填有效值（1–200、1–1,048,576、60–604,800） | [公共读取缓存](/guide/public-read-cache#开启与配置) |
| <code>compile.runtime-strategy-unsupported</code> | 构建失败 | 资源类别不支持所写的运行时缓存策略（<code>navigation-public-dynamic</code> 只支持 network-first） | 改成该类别支持的策略 | [离线体验](/guide/offline#公共读取的运行时缓存)、[公共读取缓存](/guide/public-read-cache) |
| <code>compile.runtime-cache-unused</code> | 警告 | 开启了运行时缓存，但没有任何规则能执行它 | 增加 <code>public-data</code> 或 <code>navigation-public-dynamic</code> 规则，或关闭运行时缓存 | [公共读取缓存](/guide/public-read-cache#可用的规则) |
| <code>offline-write.disabled-configuration</code> | 构建失败 | v2／v3 的 <code>offlineWrites</code> 为禁用形式，却带了非零值或非空 <code>targets</code> | 原样写 <code>{ enabled: false, maxEntries: 0, maxTotalBodyBytes: 0, targets: [] }</code> | [身份、安装信息与策略](/guide/configuration) |

## Vite 适配

| 码 | 严重度 | 何时出现 | 怎么改 | 详见 |
| --- | --- | --- | --- | --- |
| <code>vite.manifest-icon-missing</code> | 构建失败 | 主 <code>icons</code> 引用的文件不在本次构建产物或 <code>base</code> 下 | 把图标放进 <code>public/icons/</code>，并让 <code>src</code> 与 <code>base</code> 一致 | [在 vite.config.ts 中接入](/guide/configuration#在-vite-config-ts-中接入) |
| <code>vite.manifest-icon-invalid</code> | 构建失败 | 图标文件头损坏，或无法按声明的 <code>type</code> 解析 | 换成真实的 PNG／JPEG／WebP 文件 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>vite.manifest-icon-type-mismatch</code> | 构建失败 | 声明的 <code>type</code> 与文件签名不一致 | 改 <code>type</code> 或换文件 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>vite.manifest-icon-size-invalid</code> | 构建失败 | <code>sizes</code> 不是空格分隔的 <code>宽x高</code>（写成 <code>any</code> 或留空） | 写成如 <code>192x192</code> | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>vite.manifest-icon-size-mismatch</code> | 构建失败 | 文件实际尺寸与声明的 <code>sizes</code> 不一致 | 换图或改 <code>sizes</code> | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>vite.manifest-icon-unverified</code> | 警告 | 主图标格式是构建检查不解析的类型 | 人工核对文件类型与每个声明尺寸 | [在 vite.config.ts 中接入](/guide/configuration#在-vite-config-ts-中接入) |
| <code>vite.offline-page-without-fallback</code> | 构建失败 | 设置了 <code>offlinePage</code>，但策略没有开启 <code>offlineFallback</code> | 开启 <code>offlineFallback</code>，或去掉 <code>offlinePage</code> | [离线体验](/guide/offline#默认离线页) |
| <code>vite.offline-page-conflict</code> | 构建失败 | <code>offlineFallback.path</code> 上已有文件（如自带的 <code>public/offline.html</code>） | 删掉自带文件，或去掉 <code>offlinePage</code> | [常见问题](/guide/troubleshooting#默认离线页与已有文件冲突) |
| <code>vite.offline-page-locale-invalid</code> | 构建失败 | <code>offlinePage.locale</code> 不是 <code>zh-CN</code> 或 <code>en</code> | 改成这两个之一 | [离线体验](/guide/offline#默认离线页) |
| <code>vite.offline-page-message-invalid</code> | 构建失败 | <code>messages</code> 有未知键，或某项不是 1–200 字符的非空字符串（可用键 <code>documentTitle</code>、<code>heading</code>、<code>body</code>、<code>retry</code>） | 只用这四个键，且每项 1–200 字符 | [离线体验](/guide/offline#默认离线页) |
| <code>vite.offline-page-css-invalid</code> | 构建失败 | <code>css</code> 不是字符串或含 <code>&lt;/style</code> | 去掉 <code>&lt;/style</code> | [离线体验](/guide/offline#默认离线页) |

## 构建产物校验

这三个码由构建末尾的产物校验给出，信息里还会带一句“计划由本次构建编译，缺失通常意味着有东西在之后把它删了”。

| 码 | 严重度 | 何时出现 | 怎么改 | 详见 |
| --- | --- | --- | --- | --- |
| <code>verify.artifact-missing</code> | 构建失败 | 预缓存清单里的某个文件不在最终产物里 | 找出在 <code>pwa()</code> 之后删除或改名该文件的插件或脚本 | [无诊断码的构建失败](#无诊断码的构建失败) |
| <code>verify.artifact-path-mismatch</code> | 构建失败 | worker 或 manifest 没有发布在身份声明的路径 | 核对 <code>serviceWorkerUrl</code>、<code>manifestUrl</code> 与 Vite <code>base</code>、输出目录 | [构建期身份校验](/guide/configuration#构建期身份校验) |
| <code>verify.manifest-asset-missing</code> | 构建失败 | manifest 里的截图或快捷方式图标文件不在构建产物中 | 把文件放到 <code>public/</code> 对应路径 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |

## 发布检查（build-verifier）

这些码只出现在你的发布脚本调用 <code>verifyRelease</code> 之后；固定模式省略输入会跳过对应检查，可移植模式缺部署证据会失败。两者都要同时核对必需检查是否全部执行。总览见[部署与发布](/operations/release#平台提供的机器检查)。

| 码 | 严重度 | 何时出现 | 怎么改 | 详见 |
| --- | --- | --- | --- | --- |
| <code>verify.header-missing-directive</code> | 发布检查失败 | 线上响应缺少发布基线要求的 <code>Cache-Control</code> 指令（如 worker 缺 <code>no-cache</code>，指纹资源缺 <code>immutable</code> 或正数 <code>max-age</code>） | 改服务器或 CDN 的响应头，再采集一次 | [线上响应头](/operations/release#线上响应头)、[服务器与 CDN 配置](/operations/hosting) |
| <code>verify.header-forbidden-directive</code> | 发布检查失败 | 响应带了基线禁止的指令（如 worker 带 <code>immutable</code>，指纹资源带 <code>no-cache</code>） | 去掉该指令 | [线上响应头](/operations/release#线上响应头) |
| <code>verify.header-unreadable</code> | 发布检查失败 | 需要检查的路径没有提供观测到的响应头 | 采集该路径跟随重定向后的最终响应头并传入 | [自检](/operations/hosting#自检) |
| <code>verify.baseline-missing</code> | 发布检查失败 | 没有提供发布基线；首次发布或迁移需要人工批准 | 传入存档的生产身份基线；首次发布按流程由审批人确认 | [发布门禁](/operations/release#发布门禁) |
| <code>verify.baseline-invalid</code> | 发布检查失败 | 存档的基线不是有效的身份 | 修复存档 | [发布门禁](/operations/release#发布门禁) |
| <code>verify.baseline-mismatch</code> | 发布检查失败 | 候选身份与基线不同，路径 <code>/identity/&lt;字段&gt;</code> 指出哪个字段变了 | 改回基线值；确需变更属于身份迁移，需要 ADR 与迁移计划 | [字段参考](/guide/configuration#field-reference) |
| <code>verify.baseline-origin-mismatch</code> | 发布检查失败 | 可移植基线属于另一个实际部署域名 | 读取本域名的独立基线 | [可移植部署](/guide/portable-deployment) |
| <code>verify.retention-history-invalid</code> | 发布检查失败 | 提供的发布历史无法建立有效的保留线 | 修复发布历史记录 | [更新与旧资源保留](/operations/release#更新与旧资源保留) |
| <code>verify.retention-missing</code> | 发布检查失败 | 保留窗口内要求的旧指纹资源已经取不到 | 恢复这些资源；发布 R 时 R、R-1、R-2 的指纹资源都要可获取，更早版本至少保留 7 天 | [更新与旧资源保留](/operations/release#更新与旧资源保留) |
| <code>verify.deployment-origin-invalid</code> | 发布检查失败 | v4 计划缺本次目标 origin，或该值不是规范 HTTPS origin（本地 loopback 可用 HTTP） | 由编排器传入实际目标域名与响应证据 | [可移植部署](/guide/portable-deployment) |
| <code>verify.deployment-response-missing</code> | 发布检查失败 | v4 必需平台路径缺最终响应 URL、整数 HTTP 状态码或响应头 | 请求本域名的缺失路径并保存结果 | [可移植部署](/guide/portable-deployment) |
| <code>verify.deployment-response-mismatch</code> | 发布检查失败 | 跟随重定向后的最终响应 URL 不在本次域名或不再是要求的路径 | 修正重定向／部署目标，重新采集本域名响应 | [可移植部署](/guide/portable-deployment) |
| <code>verify.deployment-response-unsuccessful</code> | 发布检查失败 | 必需平台路径的最终响应状态码不是 200 | 修复该域名上的部署或路由后重新采集 | [可移植部署](/guide/portable-deployment) |

## 同源多应用（共享 origin）

只在使用 <code>topology: { kind: "shared-origin", registry }</code> 时出现。登记表错误在创建插件时就报出，其余在编译时。部署顺序与登记表用法见[同源多应用](/operations/release#同源多应用)。

| 码 | 严重度 | 何时出现 | 怎么改 | 详见 |
| --- | --- | --- | --- | --- |
| <code>registry.child-outside-root</code> | 构建失败 | 子应用 scope 不严格位于根 scope 之内 | 让子 scope 是根 scope 的真子路径 | [同源多应用](/operations/release#同源多应用) |
| <code>registry.scope-overlap</code> | 构建失败 | 子应用 scope 互相重叠或嵌套 | 让各子 scope 互不包含 | [同源多应用](/operations/release#同源多应用) |
| <code>registry.duplicate-identity-field</code> | 构建失败 | 登记项的 <code>appId</code>、<code>serviceWorkerUrl</code>、<code>manifestId</code>、<code>manifestUrl</code> 有重复 | 每项互不相同 | [字段参考](/guide/configuration#field-reference) |
| <code>registry.entry-url-outside-scope</code> | 构建失败 | 登记项的 worker 或 manifest URL 不在它自己的 scope 内 | 让 URL 位于该项 scope 下 | [同源多应用](/operations/release#同源多应用) |
| <code>registry.root-url-in-child-scope</code> | 构建失败 | 根应用的 worker 或 manifest URL 落进了某个子 scope | 把根的 URL 移出子 scope | [同源多应用](/operations/release#同源多应用) |
| <code>registry.cache-prefix-collision</code> | 构建失败 | 登记项之间的缓存命名空间前缀不唯一 | 各应用用不同的 <code>appId</code> | [字段参考](/guide/configuration#field-reference) |
| <code>plan.registry-identity-mismatch</code> | 构建失败 | 当前身份不能恰好对应登记表里的一项，或登记表的 <code>origin</code>／<code>environment</code> 与身份不同 | 让身份与登记表里对应项的各字段一致，<code>origin</code>、<code>environment</code> 相同 | [同源多应用](/operations/release#同源多应用) |
| <code>compile.policy-rule-in-child-scope</code> | 构建失败 | 根应用的某条策略规则落进子应用 scope | 规则不要覆盖子应用路径 | [同源多应用](/operations/release#同源多应用) |
| <code>compile.offline-fallback-in-child-scope</code> | 构建失败 | 离线页路径落进子应用 scope | 把离线页放在子 scope 之外 | [同源多应用](/operations/release#同源多应用) |
| <code>compile.start-url-in-child-scope</code> | 构建失败 | 安装 <code>startUrl</code> 落进子应用 scope | 改到子 scope 之外 | [同源多应用](/operations/release#同源多应用) |
| <code>compile.shortcut-url-in-child-scope</code> | 构建失败 | 快捷方式 <code>url</code> 落进子应用 scope | 改到子 scope 之外 | [其他可选安装字段](/guide/configuration#其他可选安装字段) |
| <code>compile.host-file-in-child-scope</code> | 警告 | 根应用的构建产物里有文件落在子 scope 内；这些文件不会进入预缓存 | 通常无需处理；确认子应用文件不由根应用发布 | [同源多应用](/operations/release#同源多应用) |
| <code>verify.root-plan-not-shared-origin</code> | 发布检查失败 | 线上根应用的计划不是对应模式的共享 origin 根计划，或固定模式的 <code>origin</code>／<code>environment</code> 不同；可移植模式还会检查根记录和 worker 最终 URL 属于本域名 | 先在本域名发布对应模式的根应用，并采集真实根 worker 响应 | [同源多应用](/operations/release#同源多应用) |
| <code>verify.root-plan-missing-exclude</code> | 发布检查失败 | 线上根计划没有覆盖这个子应用 scope 的排除规则 | 先发布带排除规则的根应用，再发布子应用 | [同源多应用](/operations/release#同源多应用) |
| <code>verify.root-registry-older</code> | 发布检查失败 | 线上根计划的登记表版本比本次的旧 | 先发布新版本登记表对应的根应用 | [同源多应用](/operations/release#同源多应用) |
| <code>verify.root-registry-child-mismatch</code> | 发布检查失败 | 线上根计划的登记表里没有与本子应用身份匹配的项 | 同步登记表后先发布根应用 | [同源多应用](/operations/release#同源多应用) |
| <code>verify.root-registry-diverged</code> | 发布检查失败 | 线上根计划与本计划登记表版本相同，内容却不同 | 登记表内容变更必须提升版本号 | [同源多应用](/operations/release#同源多应用) |

## 入口恢复（entry.*）

需要 <code>@pwa-platform/entry-resilience</code>。构建期码来自 <code>pwaEntryResilience()</code> 的选项与构建集成；清单字段码和存储码来自页面里的 <code>updateEntryManifest()</code>／<code>checkEntryRecovery()</code>，它们不抛异常，出现在返回值的 <code>diagnostics</code> 里。用法见[入口恢复](/guide/entry-resilience)。

| 码 | 严重度 | 何时出现 | 怎么改 | 详见 |
| --- | --- | --- | --- | --- |
| <code>entry.max-validity-days-invalid</code> | 构建失败 | <code>maxValidityDays</code> 不是 1 到 90 的整数（默认 30） | 改成范围内整数 | [入口恢复](/guide/entry-resilience#第一步-构建配置) |
| <code>entry.css-invalid</code> | 构建失败 | <code>css</code> 不是字符串或含 <code>&lt;/style</code> | 去掉 <code>&lt;/style</code> | [自定义样式](/guide/entry-resilience#自定义样式-可选) |
| <code>entry.option-removed</code> | 构建失败 | 用了已移除的选项 <code>keys</code>、<code>seed</code>、<code>approvedOrigins</code>、<code>discoveryUrl</code> | 删掉；清单改由应用侧取数交入 | [信任模型](/guide/entry-resilience#信任模型-adr-0033) |
| <code>entry.locale-invalid</code> | 构建失败 | <code>locale</code> 不是 <code>zh-CN</code> 或 <code>en</code> | 改成这两个之一 | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.message-invalid</code> | 构建失败 | <code>messages</code> 有未知键、空值或超过 200 字符；<code>expiry</code> 没有恰好一个 <code>{expiresAt}</code>；<code>go</code> 没有恰好一个 <code>{host}</code> | 按规则改文案 | [语言与文案](/guide/entry-resilience#语言与文案-可选) |
| <code>entry.base-mismatch</code> | 构建失败 | Vite <code>base</code> 与 <code>identity.mountPath</code> 不相等 | 让两者相同 | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.platform-plugin-missing</code> | 构建失败 | 同一份 Vite 配置里没有 <code>pwa()</code> 插件 | 同时挂载 <code>pwa()</code> | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.platform-plan-unavailable</code> | 构建失败 | <code>pwa()</code> 没有编译出计划，入口恢复读不到 | 先解决 <code>pwa()</code> 自己的构建错误 | [入口恢复](/guide/entry-resilience#第一步-构建配置) |
| <code>entry.recovery-page-not-precached</code> | 构建失败 | 恢复页或它的脚本没有进入预缓存 | 补齐覆盖它们的 <code>asset</code> 规则 | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.manifest-invalid-shape</code> | 运行时 | 交入的清单不是普通对象、缺必填字段（<code>sequence</code>、<code>expiresAt</code>、<code>status</code>、<code>reason</code>、<code>entries</code>）或有未知字段 | 按清单格式修正 | [后端返回什么](/guide/entry-resilience#第三步-后端返回什么) |
| <code>entry.app-id-mismatch</code>／<code>entry.environment-mismatch</code> | 运行时 | 清单里写了 <code>appId</code>／<code>environment</code>，与身份不一致 | 改成与身份相同，或不写 | [后端返回什么](/guide/entry-resilience#第三步-后端返回什么) |
| <code>entry.sequence-invalid</code> | 运行时 | <code>sequence</code> 不是非负整数 | 改成非负整数并严格递增 | [后端返回什么](/guide/entry-resilience#第三步-后端返回什么) |
| <code>entry.expires-at-invalid</code> | 运行时 | <code>expiresAt</code> 不是不带毫秒的 <code>YYYY-MM-DDTHH:mm:ssZ</code> | 改成该格式 | [后端返回什么](/guide/entry-resilience#第三步-后端返回什么) |
| <code>entry.expired</code> | 运行时 | 交入时 <code>expiresAt</code> 已过；或已存清单过期，<code>checkEntryRecovery()</code> 返回 <code>kind: "none"</code> | 下发新清单 | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.validity-period-too-long</code> | 运行时 | <code>expiresAt</code> 距现在超过 <code>maxValidityDays</code> | 缩短有效期，或调大 <code>maxValidityDays</code>（最多 90） | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.status-invalid</code> | 运行时 | <code>status</code> 不是 <code>normal</code>、<code>migrating</code>、<code>incident</code> | 改成这三个之一 | [后端返回什么](/guide/entry-resilience#第三步-后端返回什么) |
| <code>entry.reason-invalid-shape</code>／<code>entry.reason-code-invalid</code>／<code>entry.reason-message-invalid</code> | 运行时 | <code>reason</code> 不是含 <code>code</code>（可选 <code>message</code>）的对象；<code>code</code> 不是 <code>planned-migration</code>、<code>incident</code>、<code>none</code>；<code>message</code> 超过 200 字符或含控制字符 | 按格式修正 | [后端返回什么](/guide/entry-resilience#第三步-后端返回什么) |
| <code>entry.entries-too-many</code>／<code>entry.entry-invalid-shape</code> | 运行时 | <code>entries</code> 超过 5 条；或不是数组、某项不是只含 <code>origin</code>、<code>startPath</code> 的对象 | 最多 5 条，每项只写这两个字段 | [后端返回什么](/guide/entry-resilience#第三步-后端返回什么) |
| <code>entry.entry-origin-invalid</code>／<code>entry.entry-start-path-invalid</code> | 运行时 | <code>origin</code> 不是规范 origin（HTTPS，带路径或结尾斜杠不行）；<code>startPath</code> 不以 <code>/</code> 开头、超过 512 字符或含 <code>//</code>、反斜杠、控制字符、<code>..</code> 段 | 按规则修正 | [后端返回什么](/guide/entry-resilience#第三步-后端返回什么) |
| <code>entry.sequence-not-greater</code> | 运行时 | 交入清单的 <code>sequence</code> 不大于已存记录 | 序号严格递增 | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.no-entries</code> | 运行时 | 已存清单没有任何入口 | 无需处理，这时不展示 | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.storage-unavailable</code>／<code>entry.storage-write-failed</code> | 运行时 | 读取或写入浏览器 IndexedDB 失败（写入失败时清单未被接受） | 检查浏览器存储是否可用 | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.runtime-unavailable</code> | 运行时 | 时钟或当前 origin 等运行环境不可用 | 在浏览器页面中调用 | [常见诊断码](/guide/entry-resilience#常见诊断码) |
| <code>entry.return-path-dropped</code> | 运行时 | 传入的 <code>returnPath</code> 不合法，已丢弃 | 传入 scope 内的合法路径 | [本地存储与返回路径](/guide/entry-resilience#本地存储与返回路径) |

## 无诊断码的构建失败

这些失败直接抛出普通错误，没有诊断码。

| 错误信息（节选） | 原因 | 怎么改 |
| --- | --- | --- |
| <code>The pwa plugin needs a same-origin base that starts and ends with a slash</code> | Vite <code>base</code> 不是首尾都是 <code>/</code> 的同源路径，例如写成完整 URL（CDN 地址）、<code>"./"</code> 或空字符串 | 写成 <code>"/"</code> 或 <code>"/app/"</code>；静态资源放 CDN 时，worker 和 manifest 仍要与页面同源，不能用外部 <code>base</code> |
| <code>identity.serviceWorkerUrl must sit under the Vite base</code>、<code>identity.manifestUrl must sit under the Vite base</code>；<code>… spell the same path with different escapes; make them match</code>；<code>… must name a file under the Vite base, not the base itself</code> | 身份里的 worker 或 manifest URL 不在 Vite <code>base</code> 之下（或与 <code>base</code> 只是转义写法不同，或就是 <code>base</code> 本身） | 让 <code>base</code> 与 <code>serviceWorkerUrl</code>、<code>manifestUrl</code> 用同一写法，且两个 URL 指向 <code>base</code> 下的文件 |
| <code>pwa-platform: /index.html declares a manifest link that does not match this build</code>、<code>… declares more than one manifest link</code>、<code>… declares a &lt;base&gt; element …</code>、<code>… has no manifest link in the final HTML output</code> | 某个 HTML 入口的 manifest 链接与本次构建不符（相对路径、地址不同、重复），页面含 <code>&lt;base&gt;</code>，或最终 HTML 里的链接被别的插件去掉了 | 删掉手写链接由平台注入，或让它与 <code>IDENTITY.manifestUrl</code> 完全一致；移除 <code>&lt;base&gt;</code>；检查改写 HTML 的其他插件 |
| <code>A build plugin changed &lt;文件&gt; after the PWA plan was compiled; the precache would publish different bytes.</code> | 在 <code>pwa()</code> 编译计划之后，别的插件改写了已进入预缓存计划的文件 | 找出这个插件，让它在 <code>pwa()</code> 之前完成改写，或不再改动该文件 |
| <code>A file in the public directory has the same name as a build output</code>、<code>Two files in the artifact input publish the same path</code> | 输出路径重复：<code>public/</code> 下的文件与构建产物同名，或自行调用 <code>buildPwaArtifacts</code> 时 <code>files</code> 里有重复路径 | 重命名其中一个，或让构建自己生成它 |
| <code>This build enables no installation, so the pwa plugin writes no manifest — but the identity names one</code> | 插件 <code>install: null</code>，平台不生成 manifest，而应用没有自备 <code>manifestUrl</code> 指向的文件 | 把 manifest 放进 <code>public/</code> 对应路径，或启用安装元数据 |
| <code>topology.kind must be one of: standalone-origin, shared-origin</code> | <code>topology.kind</code> 不合法 | 改成这两个之一 |

## 仅手写计划或私有能力的码

以下码普通接入不会遇到，列在这里只为查询。

**手写或外部生成的计划（<code>plan.*</code>）。** 只有直接校验 <code>PwaPlan</code>（<code>validatePlan</code>）时出现；正常构建里计划由编译器生成，不会触发这些码：<code>plan.incomplete-baseline-denials</code>、<code>plan.cache-namespace-mismatch</code>、<code>plan.exclude-rules-mismatch</code>、<code>plan.exclude-not-first</code>、<code>plan.precache-in-child-scope</code>、<code>plan.offline-fallback-in-child-scope</code>、<code>plan.start-url-in-child-scope</code>、<code>plan.shortcut-url-in-child-scope</code>。（<code>plan.registry-identity-mismatch</code> 在编译共享 origin 时也会出现，已列在上面。）

**离线写入的启用形式（尚未发布）。** 公开使用者必须保持 <code>offlineWrites</code> 的禁用形式，所以看不到这些码：<code>offline-write.enabled-configuration</code>、<code>offline-write.target-required</code>、<code>offline-write.duplicate-target-id</code>、<code>offline-write.duplicate-target-path</code>、<code>compile.offline-write-target-invalid</code>、<code>plan.offline-write-database-mismatch</code>、<code>plan.offline-write-target-invalid</code>、<code>plan.offline-write-duplicate-target-id</code>、<code>plan.offline-write-duplicate-target-path</code>。

**Nuxt 适配（私有包，尚未发布）。** <code>@pwa-platform/nuxt</code> 目前不供外部项目安装，它的码有：<code>nuxt.base-url-mismatch</code>、<code>nuxt.build-assets-outside-scope</code>、<code>nuxt.cdn-url-unsupported</code>、<code>nuxt.offline-page-route-unknown</code>、<code>nuxt.offline-page-scripts-kept</code>、<code>nuxt.prerendered-html-denied</code>、<code>nuxt.recovery-release</code>、<code>nuxt.recovery-release-invalid-type</code>、<code>nuxt.runtime-base-url-mismatch</code>、<code>nuxt.runtime-cache-unsupported</code>。同样未发布的 <code>push</code> 与 <code>offline-write</code> 包另有自己的运行时码，本页不收录。
