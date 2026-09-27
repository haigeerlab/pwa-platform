# ADR-0040：Vite 构建期校验 manifest 主图标

## 状态

已接受（2026-09-27，项目所有者在 Android 实机安装失败后要求加入校验）。本决定部分取代 [ADR-0037](0037-install-metadata-manifest-members.md) 中“既有 `icons` 不做存在性检查”和“不读取图片实际尺寸”的结论；截图与快捷方式图标的既有规则不变。

## 背景

中文 Vite 浏览器夹具在 manifest 中声明了 192×192 与 512×512 PNG，但四个文件的实际尺寸均为 1×1。桌面 Chrome 只给出尺寸警告，Android Chrome 的安装界面则直接显示“无法安装此应用”。平台的配置校验只确认 `sizes` 文本与 `any`／`maskable` 变体齐全，构建产物校验又刻意跳过主图标，因此错误配置能够构建、发布，直到真机安装时才以无法定位原因的界面失败。

[Chrome 的安装资格说明](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest)要求 manifest 提供 192×192 与 512×512 图标。[W3C Image Resource 规范](https://www.w3.org/TR/image-resource/#sizes-member)同时把 `sizes` 定义为资源所包含的尺寸提示；多个尺寸主要用于 ICO 这类多图像容器，而单帧 PNG、JPEG、WebP 的声明应与文件固有尺寸一致。

## 决定

`@pwa-platform/vite` 的 `pwa()` 插件在收集完最终 bundle 与 `publicDir`、生成 manifest 之前，校验 `install.icons`：

1. 每个 `src` 必须位于当前 Vite `base` 下，并出现在本次构建的文件集合中；否则构建失败。
2. 对 `image/png`、`image/jpeg`、`image/webp`，只读取格式头部来识别媒体类型与固有宽高，不解码像素、不引入第三方图片依赖。
3. 声明类型与可识别文件签名不一致、文件头损坏、或任一声明尺寸与固有尺寸不一致时，构建失败。
4. 其他媒体类型仍允许使用，但构建输出 `vite.manifest-icon-unverified` 警告，明确要求开发者人工核验。平台不假装已检查它无法可靠解析的格式。
5. 错误包含稳定代码、`/install/icons/<index>/<field>` 配置位置、图标 URL、声明值、实测值和修复建议。图标 URL 与尺寸属于公开构建元数据，提供这些值比只给代码更能帮助接入方定位问题。

本次只校验 manifest 的主 `icons`。截图与快捷方式图标继续做存在性检查；它们的实际尺寸校验另行评估。maskable 安全区属于视觉语义，不能从尺寸和文件头可靠判断，仍需设计审查或真实设备检查。

## 影响

- 过去依赖后端在构建外提供主图标、或把主图标放在 Vite `base` 之外的应用将构建失败。接入方必须把安装图标纳入可审计的构建产物；这是有意的收紧，因为这些文件直接决定安装资格。
- `PwaInstallMetadata`、manifest 结构与公开 TypeScript API 不变；失败发生在生产构建期。
- Vite 插件的真实构建测试覆盖缺文件、类型不一致、损坏文件、尺寸不一致和合法图标。Android 实机安装作为端到端证据，不替代自动化。
- 通用 `build-verifier` 仍只接收路径列表，无法读取文件字节；它不会伪称完成尺寸校验。非 Vite 宿主若要取得同等保证，须在自己的最终产物阶段提供字节级检查。

## 拒绝的方案

- **只修测试夹具，不加产品校验**：下一位接入者仍会在 Android 上得到同样的模糊失败。
- **仅输出警告**：尺寸不一致已实证会阻止安装，继续产出候选会把确定性错误推迟到发布后。
- **引入 `sharp` 等图片库**：只读头部即可取得所需类型和尺寸；原生依赖会显著增加安装体积和供应链面。
- **在 contracts 中读取文件**：契约层必须保持纯数据校验，不能依赖文件系统或宿主构建布局。
