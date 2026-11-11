# npm 发布记录：0.4.2

> 2026-11-11：十个公开包已发布到 `latest`，完成公开读回与全新消费；接入方已在 Chromium 80 真内核上用真实页面验证更新提示条可见、可用。

## 范围与基点

本版只包含 [PR #143](https://github.com/haigeerlab/pwa-platform/pull/143)：`@pwa-platform/vue`、`@pwa-platform/react` 的 `update-notice.css` 新增物理定位回退，只在不支持逻辑定位的浏览器（`@supports not (inset-inline-start: 0)`）生效。

0.4.1 在 Chrome/Edge 87、Safari 14.1、iOS 14.5 以下的浏览器上，默认更新提示条停在页面末尾，页面高于视口时完全不可见（见 [0.4.1 记录](release-0.4.1.md)）。支持逻辑定位的浏览器沿用原规则。其余八个包内容不变，只升版本号以保持十包统一。计划见 [release-0.4.2-plan.md](release-0.4.2-plan.md)。

- 准备 PR [#144](https://github.com/haigeerlab/pwa-platform/pull/144) 合并为 `c6b16cb90b1a`，该提交 [main CI](https://github.com/haigeerlab/pwa-platform/actions/runs/42969577943) 七项全部通过；`v0.4.2` 标签与 `release/npm-0.4.2` 分支固定于该提交。
- 候选包从准备分支打包，并在全新 React／Vue 项目中消费验证。从合并提交重新打包后，十包文件逐一比对：除 `package.json` 中依赖键的顺序外没有差异，键排序后完全一致。

## 修复前的真内核复测

接入方在 Chromium 80.0.3987.0 上复测了 #143。快照 722274，在 Rosetta 下运行，启动参数为 `--disable-gpu --in-process-gpu`，没有删除任何方法。测试页内容高 2400px，提示条挂在 body 末尾：

- 0.4.1：四种位置 × 宽、窄两种视口，共 8 组提示条全部在视口外（top=2400）。
- 本修复：8 组全部在视口内，角落与居中位置正确。
- 新版 Chrome 157 对照：8 组与 0.4.1 的位置和宽度完全一致。

从右往左排版的页面未在真内核上测试。

## 发布与集中读回

- 用交互式终端完成网页身份验证，npm 直接连接终端。按 contracts → core／engine-workbox／build-verifier → sw-runtime → client-runtime → vite → entry-resilience／vue／react 连续提交，十包均返回 0，随后按同一顺序批准。
- 2026-11-11T06:18:50Z 集中读回：十包 `latest` 均为 0.4.2，tarball 均 HTTP 200，SHA-256 与发布归档一致，平台内部依赖全部为 0.4.2。

| 包 | 发布时间（UTC） | SHA-256 |
| --- | --- | --- |
| contracts | 06:15:14 | `96a07fbec39f442f521c7bbcb43d7fb6301ca78d6bc77c230db20c56eb7b8e0e` |
| core | 06:15:16 | `c6788e2197c8890212da9c412cdfca86c47a85622162fb34e3da1a42e9a37fab` |
| engine-workbox | 06:15:19 | `8445cdaed4eb2d88c5a2cdc6fd96a5a9f676b57841adc5a969d1fb0a1804f6be` |
| build-verifier | 06:15:22 | `ba7dc4d86d6eb7abe7dfaa17e7c0b239d95b4010483f17c931f7e80c47fdebff` |
| sw-runtime | 06:15:45 | `4adac0894017fbec0de4f6377bf4ddb61ad8133a7b3b843184cd821994d8109f` |
| client-runtime | 06:15:27 | `dc9b8dd3838eff040a7c0e195b87b7b509b08da15ab1d840fcd32faf0b8f4463` |
| vite | 06:16:21 | `0b9662a6d4b213d65b263bfd81034a7896c9ca1ee2466248c2c7c4ee95b03f86` |
| entry-resilience | 06:15:33 | `48a2b1b7c38a9820260e4f805566692c893cc9abdc1403e2871f3b3ff7e945b3` |
| vue | 06:15:35 | `416561c08a1ae5326f7cf3c47d902d2669dc5da9d926630153a455c6e8136c6c` |
| react | 06:16:28 | `006ecb783044d586472319561f5da78a7c587adcdedcd3b13ef2f53edb4b98c2` |

## 全新消费

只从公共 registry 安装的两个全新项目都构建通过：Vite 8.3.0 + React 19.3.0，以及 Vite 8.3.0 + Vue 3.5.42。

- 锁文件中平台包的 resolved 地址全部是官方 registry，依赖闭包全为 0.4.2。
- 打包后的 CSS 保留了 `@supports not (inset-inline-start: 0)` 回退。
- 生成的 `sw.js`、恢复 worker 与离线页脚本按 ES2020 核查通过。

## 接入方升级验证（Chromium 80 真内核，真实页面）

2026-11-11，一个接入方把直接依赖升级到 0.4.2。锁文件只有十个平台包变化，integrity 与 npm 一致，构建通过。产物 CSS 含回退规则，`sw.js` 不含 `URL.canParse`、`Object.hasOwn`。

在 Chromium 80.0.3987.0 上，用接入方的生产构建（不是测试页）验证完整的更新流程：

1. v1 接管页面后，服务端切到字节不同的 v2，再调用 `registration.update()`。
2. 新 worker 进入 waiting，更新提示条出现，带“更新”“稍后”两个按钮。位置为距右 16、距底 16、宽 384，视口 1440×777，在视口内。
3. 用真实鼠标事件点击“更新”：约 8 秒后提示条消失，waiting 清空，页面正常。

同一内核上的冒烟测试也通过：worker 接管，断网后显示默认离线页。冒烟测试时接入方的业务数据接口不可用，首页数据很少；0.4.1 对照组表现相同，与本版无关。

接入方在 0.4.2 发布前加在宿主样式里的临时定位补丁已撤回，直接使用 0.4.2。

## 未完成

- Safari 13.1、iOS Safari 13.4、Firefox 74 的真机验证，与 0.4.1 一并由接入方补测。
- 提示条按钮间距（flex `gap`）与最低浏览器版本的检测体系，在 `browser-compat-baseline` 模块中进行。
