# ADR-0022：Vite 插件在构建时注入 manifest 链接

## 状态

已接受（2026-09-18）。决定内容即项目所有者同日评审通过的 [vite-adapter 规格修订](../../spec/vite-adapter.md)。在 [ADR-0015](0015-vite-plugin-build-pipeline.md) 的构建流水线上增加一个 HTML 钩子，不改变 manifest 的生成、发布与产物校验。

## 背景

插件按身份生成 manifest，并把它发布到 `identity.manifestUrl`，却从不在页面里引用它。浏览器只有在页面带 `<link rel="manifest">` 时才会读取 manifest，所以应用漏写这一行时，永远不会被认为可安装。与此同时，构建成功、产物校验也通过，没有任何信号提示问题。

示例应用之所以可安装，是因为它们的 `index.html` 手写了这一行。vue-vben-admin 的真实接入试验按迁移指南接入后，正好漏了这一行，直到检查可安装性才发现（[分析报告第七节](../product/vben-admin-pwa-analysis.md#七真实接入试验结果2026-09-18)）。

## 决策

- **构建时注入。** 插件新增 `transformIndexHtml` 钩子，只在构建时运行，处理每个 HTML 入口。页面没有 manifest 链接时，在 `<head>` 末尾注入 `<link rel="manifest" href="<identity.manifestUrl>">`。开发服务器下不注入：插件本来就只作用于构建，开发时也没有 manifest。
- **已有链接只检查、不改写。** `rel` 按空白分词后含 `manifest`（不区分大小写）的 `<link>` 都算。只有一个，且 `href` 是逐字等于 `identity.manifestUrl` 的根路径，或是 `identity.origin` 上路径相同且没有查询/片段的完整 URL 时，原样保留；相对路径、`<base>` 元素、无效 URL、其他源、其他路径或多个链接都会让构建失败。页面上写的是一个不同的 manifest，身份就对不上；这种错误应当在构建时暴露，而不是等到上线后才发现装不上。
- **最终产物再核验。** `transformIndexHtml` 之后的 `order: "post"` 插件仍可增加链接，因此在 `writeBundle` 对每个经该钩子处理的最终 HTML entry 重新扫描，要求恰好一个正确链接。其他插件自行生成的 HTML（例如入口恢复页）不经过此钩子，仍由各自模块的契约校验。错误会提示链接可能由其他插件注入，但不回显链接或身份值。
- **HTML 注释里的链接不算数。** 浏览器不会读取注释里的链接，把它算进去只会让无害的遗留标记导致构建失败。
- **错误信息只说明问题类型和 HTML 入口的路径**，不回显 `href` 或身份的任何值，与插件现有的约定一致。
- **只注入这一个标签。** `theme-color`、`apple-touch-icon` 等标签是应用的展示决定，插件不代劳。
- **不管 `install` 是否为 `null` 都注入。** 两种情况下 `manifestUrl` 上都有文件，`null` 时由应用自备（vite-adapter 规格的开放问题）。
- **`buildPwaArtifacts` 不变。** 注入只存在于 Vite 插件钩子里，不经过钩子的调用方（如 `@pwa-platform/nuxt`）不受影响。

## 影响

- **已手写正确链接的应用，构建结果不变。** 两个示例应用保留手写链接，作为兼容性证明；vite 包自己的浏览器夹具改为依赖注入。
- **手写了错误地址或多个链接的应用，升级后构建会失败。** 这是有意的：它们原本就指向了错误的 manifest，或者带着无效的重复标记。
- **Nuxt 模块不会得到这行链接。** Nuxt 的页面头部由它自己生成，需要另行通过 `app.head` 处理，已列为开放问题。
- **需要 `crossorigin="use-credentials"` 的应用**（例如整站走登录网关）仍然可以手写链接：地址正确的手写链接会被原样保留。
- **改变注入的标签集合、在开发服务器下注入、改写应用已有的正确链接，都需要新的 ADR。**
- 规格见 [spec/vite-adapter.md](../../spec/vite-adapter.md) 的“修订：构建时注入 manifest 链接”，计划见 [tasks/vite-adapter/plan.md](../../tasks/vite-adapter/plan.md) 的 M1–M4。
