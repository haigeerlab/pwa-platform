# ADR-0053：浏览器最低版本与构建期兼容检测

## 状态

提议（2026-11-11）。决策要点已由项目所有者在需求确认中逐项选定，本文待其审阅后改为已接受。服务 [browser-compat-baseline](../../spec/browser-compat-baseline.md)。

## 背景

- 平台一直没有承诺最低浏览器版本。[兼容性策略](../architecture/compatibility.md)只要求做特性检测，能力不可用时基础 Web 体验仍须可用；[浏览器矩阵](../architecture/browser-matrix.md)只规定必测和参考的当前版本。
- 0.4.0 的页面初始化和生成的 worker 启动时调用了 `URL.canParse`、`Object.hasOwn`，没有做检测。结果是有接入方的 Safari 13.1 用户白屏，worker 在 Chrome 120／Safari 17 以下装不上。
- worker 由 `@pwa-platform/vite` 单独打包，宿主无法降级，页面上的 polyfill 也进不了 worker，只能由平台修复。0.4.1 已修复这些调用，并加了针对这三个方法的单测调用陷阱；语法、其他 API、生成脚本与产物仍无检测。
- 2026-11-11 实测（见规格“工具实测结论”）：
  - 没有单个工具能同时覆盖语法、JS 内置 API 和网页 API。
  - eslint-plugin-compat 不检查语法，实际使用的兼容数据也过旧，恰好漏掉这次出事的 `URL.canParse` 与 `AbortSignal.timeout`。

## 决策

### 1. 最低版本，只承诺“不报错、能降级”

最低版本定为 Safari 13.1、iOS Safari 13.4、Chrome 80、Edge 80、Firefox 74。在这些版本及以上，平台在浏览器中运行的代码不得抛出未捕获的异常，也不得解析失败。范围包括页面端包、`sw.js`、恢复 worker、生成页面中的脚本，以及私有包的浏览器端代码。能力缺失时按“该能力不可用”处理；功能可用性仍按浏览器矩阵分档记录。

### 2. 版本只写在 `.browserslistrc`

仓库根目录 `.browserslistrc` 是唯一来源，es-check 与 eslint-plugin-compat 直接读取它。worker 构建目标和 TypeScript `lib` 无法直接读取，各由一个单元测试校验与它一致。

### 3. 四层检测，按工具实际能力分工

| 层 | 对象 | 手段 | 负责拦住 |
| --- | --- | --- | --- |
| 类型 | 浏览器端源码 | tsconfig `lib: ES2020`，`target` 不变 | JS 内置新 API |
| lint | 浏览器端源码 | eslint-plugin-compat，加 `no-restricted-properties` 禁用名单 | 网页 API |
| 产物 | 浏览器端 `dist`（排除 build／vite／server）、生成的 worker、内联脚本、恢复页模块闭包 | es-check `checkBrowser --checkFeatures`（`allowList` 仅放行 `OptionalChaining,NullishCoalescing`），加与 lint 层相同的网页 API 规则 | 语法、JS 内置新 API，以及字符串脚本和 Workbox 等依赖中的名单内网页 API |
| 运行时 | 单元测试 | `legacy-engine.mjs` 调用陷阱；对有特性检测的代码，在单测内真正删除 API 验证降级 | 平台代码直接调用名单内 API；降级分支确实可走 |

每层都保留故意违规的样例，并断言该层失败。产物层另设一个数字分隔符样例，断言它通过。

### 4. 网页 API 用禁用名单补工具缺口，不自写 MDN 检查脚本

eslint-plugin-compat 漏掉的、而平台曾经或可能用到的网页 API，写入 `no-restricted-properties` 名单。初始名单为 `URL.canParse`、`AbortSignal.timeout`、`AbortSignal.any`、`Object.hasOwn`。

增补规则：
- 新代码要用较新的网页 API 时，先查 MDN 兼容数据；
- 低于基线就加入名单，并改为特性检测后使用；
- 局部豁免必须在该行写明理由与检测方式。

不自写基于 MDN 数据的检查脚本（项目所有者 2026-11-11 选择）。这样的脚本也查不了实例属性（如 `FetchEvent.resultingClientId`），却要长期跟着数据升级。

### 5. 公开包不降构建目标，worker 显式设构建目标

- 公开包 `tsc` 的 `target` 保持 ES2022，宿主产物不因本决策改变；也不带 polyfill。
- `bundleEntry()` 显式传入 `["chrome80","edge80","firefox74","ios13.4","safari13.1"]`。worker 的语法降级因此由平台控制，不再取决于宿主所装 Vite 的默认值（Vite 8 默认 Chrome 111／Safari 16.4）。
- worker 内容会变化，宿主升级时按既有流程更新 worker；Service Worker URL、scope 与缓存命名空间不变。

### 6. 提高最低版本是破坏性变更

以后提高任一浏览器的最低版本，必须新增 ADR，并升主版本号。降低版本或只修复违规，可以在补丁版本中进行。

## 后果

- 新代码超出基线时，在编辑器、`pnpm typecheck`、`pnpm lint` 或 CI 中失败，不再等到用户白屏才发现。
- 新增开发依赖：eslint-plugin-compat、es-check。它们不进入发布包。
- 仍检测不到的范围，写入兼容文档：
  - 名单外的网页 API；
  - 实例属性；
  - CSS；
  - 运行时才构造的代码，例如 `new RegExp` 中的新正则语法。
- 已知降级：`resultingClientId` 在 Safari 16 以下缺失，信号静默丢失；恢复页 `max()` 在 Firefox 74 上不生效。
- 更新提示条的逻辑定位属性（Chrome 87、Safari 14.1 起）与 `min()`（Firefox 75 起）在 0.4.1 中没有回退，旧浏览器上提示条位置错乱；本模块补物理定位与固定宽度回退，随下一个补丁版本发布。
- 这些都靠评审与旧版本真机抽查弥补。抽查在基线变更和大版本发布时进行。

## 被否决的方案

- **只用 eslint-plugin-compat**：不检查语法，兼容数据过旧，漏掉这次出事的 API。
- **只用 es-check `es2020`**：会误报数字分隔符，且查不到网页 API。
- **自写 MDN 数据检查脚本**：覆盖面增益有限，维护成本高，项目所有者未选。
- **把公开包构建目标降到 ES2020**：会改变所有宿主的产物和类字段语义。
- **随包提供或注入 polyfill**：会改变宿主的全局环境，而且进不了 worker。
- **引入 `browserslist-to-esbuild` 生成 worker 目标**：自 2024 年起未更新，改为显式写目标，加一致性测试。
