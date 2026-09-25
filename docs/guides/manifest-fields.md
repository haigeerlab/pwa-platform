# manifest 扩展字段接入说明

平台从安装元数据（`PwaInstallMetadata`）生成 manifest。除了必需的名称、颜色、图标，还可以写以下可选字段，让安装对话框更完整、给应用加上快捷入口。全部可选，不写时 manifest 与以前完全相同。哪些 manifest 成员被接受、哪些不被接受以及原因，见 [ADR-0037](../adr/0037-install-metadata-manifest-members.md)。

## 1. 写法

```ts
export const INSTALL: PwaInstallMetadata = {
  // ……必需字段：startUrl、display、name、shortName、themeColor、backgroundColor、icons
  description: "处理工单与审批",
  categories: ["business", "productivity"],
  orientation: "portrait",
  displayOverride: ["window-controls-overlay", "standalone"],
  screenshots: [
    { src: "/app/screenshots/desktop.png", sizes: "1280x800", type: "image/png", formFactor: "wide", label: "工单列表" },
    { src: "/app/screenshots/phone.png", sizes: "750x1334", type: "image/png", formFactor: "narrow", label: "工单详情" },
  ],
  shortcuts: [
    {
      name: "新建工单",
      shortName: "新建",
      url: "/app/tickets/new",
      icons: [{ src: "/app/icons/new-ticket.png", sizes: "192x192", type: "image/png", purpose: "any" }],
    },
  ],
};
```

截图与快捷方式图标的文件放进 `public/`（或任何会进入构建产物的位置），路径写成站点上的绝对路径。

## 2. 每个字段

| 字段 | 输出为 | 取值 | Chrome 用它做什么 |
|---|---|---|---|
| `description` | `description` | 非空文本 | Android 安装提示中展示 |
| `categories` | `categories` | 小写、非空、不重复的字符串；参考 [W3C 分类清单](https://github.com/w3c/manifest/wiki/Categories) | 浏览器不使用，供分发平台分类 |
| `orientation` | `orientation` | `any`、`natural`、`portrait`、`portrait-primary`、`portrait-secondary`、`landscape`、`landscape-primary`、`landscape-secondary` | 主要在 Android 与独立窗口中锁定方向 |
| `displayOverride` | `display_override` | `window-controls-overlay`、`fullscreen`、`standalone`、`minimal-ui`、`browser`，按顺序取第一个受支持的；都不支持时回到 `display` | 例如桌面端的窗口控件覆盖 |
| `screenshots` | `screenshots`（`formFactor` → `form_factor`） | `src`、`sizes`（单个 `宽x高`，小写 `x`，不带前导零，每边至多 5 位）、`type`（`image/png`、`image/jpeg`、`image/webp`）、可选 `formFactor`（`wide`、`narrow`）与 `label` | 富安装对话框（桌面 Chrome 108 起、Android 94 起） |
| `shortcuts` | `shortcuts`（`shortName` → `short_name`） | `name`、`url`（必须在应用 scope 内，只写路径、不带查询串或片段）、可选 `shortName`、`description`、`icons` | 长按图标或右键时的快捷入口 |

所有新增数组至少一项；写空数组会被拒绝。

## 3. 构建会拒绝什么

| 情况 | 结果 |
|---|---|
| 格式不合法（空文本、大写或重复的分类、`sizes` 不是 `宽x高`、未知取值、多余字段） | 构建失败 |
| 快捷方式的 `url` 不在 scope 内（`install.shortcut-url-outside-scope`），或同源共享拓扑下根应用的快捷方式落进子应用的 scope（`compile.shortcut-url-in-child-scope`） | 构建失败。规范本身不要求，平台与 `startUrl` 的规则保持一致 |
| 截图或快捷方式图标的文件不在构建产物中（`verify.manifest-asset-missing`） | 构建失败 |

错误只报诊断码与字段路径，不回显你写的值。

## 4. 只提示、不阻断的警告

这些来自 Chrome 的产品行为，数值可能随 Chrome 版本调整：

| 警告 | 含义 |
|---|---|
| `install.screenshot-size-out-of-range` | 截图宽或高不在 320–3840 像素之间 |
| `install.screenshot-aspect-ratio` | 长边超过短边的 2.3 倍 |
| `install.screenshot-aspect-mismatch` | 同一 `formFactor` 的截图宽高比不一致（未写 `formFactor` 按 `narrow` 计） |
| `install.screenshot-count` | `wide` 超过 8 张或 `narrow` 超过 5 张，多出的 Chrome 不显示 |
| `install.screenshot-no-wide` | 没有 `wide` 截图，桌面端不会显示截图 |
| `install.description-too-long` | `description` 超过 324 个字符（Chrome DevTools 的提示阈值；按 UTF-16 码元计，一个 emoji 可能算 2 个） |

平台只核对你声明的 `sizes`，不读取图片实际尺寸，请如实填写。Android 从 Chrome 109 起忽略 `wide` 截图，所以两种都要准备：桌面用 `wide`，手机用 `narrow`。

## 5. 注意事项

- **同一次构建中的平台包必须是同一版本。** 带新字段的构建计划不能被旧版本的平台包校验。
- **平台不会因为是截图或快捷方式图标就把它们加入预缓存**：安装对话框只在联网时出现。如果你自己的资源规则覆盖了它们所在的目录，它们会照常按规则进入预缓存。
- **既有的 `icons` 不检查文件是否存在**，与截图不同，原因见 ADR-0037；请自行确认图标可访问。
- 以下成员平台不接受：`lang`、`dir`（浏览器未实现）、`launch_handler`、`share_target`、`file_handlers`、`protocol_handlers`、`related_applications`，以及 `display_override` 中仍在孵化的 `tabbed`、`borderless`。

## 6. 已验证到什么程度

- 单元与构建测试：每个字段的合法与非法样例、每个诊断码与边界值、manifest 键名映射、Vite 与 Nuxt 构建中缺文件即失败；不写这些字段时，vite 测试夹具的构建产物与以前逐字节相同。
- 真实浏览器（本机 Chrome 桌面端）：Chrome 解析生成的 manifest 没有错误，并识别出说明、方向、显示覆盖、宽截图与快捷方式。
- 未验证：Chrome Android、桌面端上一个版本；富安装对话框本身的外观（需要真实安装流程）。
