# ADR-0037：安装元数据接受哪些 manifest 成员

## 状态

已接受（2026-09-24，项目所有者）。服务 [contracts-foundation 的"安装元数据的扩展字段"](../../spec/contracts-foundation.md)，配套 [build-verifier](../../spec/build-verifier.md) 与 [vite-adapter](../../spec/vite-adapter.md) 的同日修订。不修订既有 ADR 的结论。

## 背景

平台从 `PwaInstallMetadata` 生成 manifest，此前只有 9 个成员。2026-09-24 的完成度审查对照 Elk 发现缺少 `screenshots`、`shortcuts` 等成员；其中 `screenshots` 决定了 Chrome 是否显示富安装对话框。

manifest 成员很多，成熟度差别也大：有的在 W3C 主规范中，有的在扩展规范或 WICG 孵化中，有的写进去并不产生效果。其中一部分还会改变应用的运行方式，需要 worker 或页面代码配合。平台需要一个明确的取舍原则，而不是逐个随需加入。

## 决策

### 取舍原则

平台只接受满足以下全部条件的成员：

1. **是描述性的**：只影响浏览器如何展示或安装应用，不要求 worker 或页面代码配合。
2. **浏览器确实使用**：至少在 Chrome 桌面端或 Android 上产生可见效果。
3. **取值已标准化**：只接受已进入 W3C 规范（主规范或 app-info 扩展）的取值，不接受仍在孵化的取值。

### 本次接受

`description`、`categories`、`orientation`、`display_override`（仅 `window-controls-overlay`、`fullscreen`、`standalone`、`minimal-ui`、`browser`）、`screenshots`、`shortcuts`。全部可选；未写时 manifest 与计划不变。

### 本次不接受

| 成员 | 不满足的条件 |
|---|---|
| `lang`、`dir` | 2：MDN 标注主流浏览器未实现；manifest 本地化的实际机制是仍在孵化的 `*_localized` 成员 |
| `launch_handler` | 1：非 `auto` 模式需要页面用 `LaunchQueue` 接收启动目标，会牵涉 client-runtime |
| `share_target`、`file_handlers`、`protocol_handlers` | 1：需要 worker 或页面处理传入的数据，与"业务不得注入 worker 代码"的边界冲突 |
| `display_override` 中的 `tabbed`、`borderless` | 3：仍在 WICG 孵化 |
| `related_applications`、`prefer_related_applications` | 不属于平台范围：推广原生应用 |

以后要加入其中任何一个，需要新的 ADR 说明它如何满足上述条件，或为什么值得破例。

### 平台规则与浏览器偏好分开

- **平台规则是错误**，构建失败：格式不合法、快捷方式的 `url` 不在 scope 内或（同源共享拓扑下）落进子应用的 scope（规范本身不要求，平台与 `startUrl` 的两层规则保持一致）、截图或快捷方式图标的文件不在构建产物中。
- **Chrome 的产品偏好是警告**，不阻断：截图宽高在 320–3840 像素之外、长边超过短边 2.3 倍、同一 `form_factor` 比例不一致、`wide` 超过 8 张或 `narrow` 超过 5 张、没有 `wide` 截图、`description` 超过 324 个字符。这些数值来自 Chrome 官方文档与 DevTools，是产品行为而非规范，可能随版本调整；作为警告，调整时不会让既有构建失败。

平台只核对声明的 `sizes`，不读取图片实际尺寸。

### 既有 `icons` 不做存在性检查

截图与快捷方式图标缺失时构建失败，但既有的 `icons` 保持不查。已有应用可能由后端提供图标、不在构建产物中；突然开始检查会让这些应用的构建失败。两者的规则因此暂不一致，是否统一另行决定。

## 影响

- 契约增加 6 个可选字段、7 个 `install.*` 诊断码、`compile.shortcut-url-in-child-scope` 与 `plan.shortcut-url-in-child-scope`，以及 `verify.manifest-asset-missing`。
- 带新字段的 `PwaPlan` 不能被旧版本平台包校验（严格对象）；同一次构建中的平台包必须同一版本，这本就是现有分发约定。
- 平台不会因为是截图或快捷方式图标就把它们加入预缓存：安装对话框在联网时出现。业务自己的资源规则覆盖到它们时，照常按规则处理。

## 拒绝的方案

- **透传任意 manifest 成员**：等于把 manifest 变成业务可以任意写入的配置，平台无法保证 scope、同源与产物一致性，也无法阻止需要 worker 代码配合的成员。
- **按浏览器偏好做成错误**：Chrome 调整阈值时，已有构建会无故失败；而平台无法读取图片的实际尺寸，只能依据声明值判断。
- **为纳入的每个成员都查图片实际尺寸**：需要在构建中解码图片，引入依赖与耗时，收益仅是把警告做得更准。
