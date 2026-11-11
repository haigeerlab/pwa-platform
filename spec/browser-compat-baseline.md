# 规格：browser-compat-baseline

> 2026-11-11 草案，待项目所有者审阅。这是“分两步”中的第二步。第一步的缺陷修复已随 0.4.1 发布（[PR #138](https://github.com/haigeerlab/pwa-platform/pull/138)、[发布记录](../tasks/package-distribution/release-0.4.1.md)）。本步只定正式的最低浏览器版本，并用构建期检测守住它。决策见 [ADR-0053](../docs/adr/0053-browser-compat-baseline.md)。

## 目标

为平台在浏览器中运行的代码写明**最低浏览器版本**，并在开发和 CI 中自动拦住超出这个版本的语法与 API，避免 0.4.0 那类白屏再次发生。

起因：有接入方在 0.4.0 上遇到 Safari 13.1 用户白屏。页面初始化和生成的 Service Worker 启动时调用了 `URL.canParse`、`Object.hasOwn`，宿主无法补救，因为页面上的 polyfill 进不了 worker。0.4.1 已修掉这些调用，并加了针对这三个方法的运行时调用陷阱；但语法、其他 API、生成的脚本和产物都没有检测。

## 已确认的范围

1. 最低浏览器版本：Safari 13.1、iOS Safari 13.4、Chrome 80、Edge 80、Firefox 74。
2. 承诺的含义是**不报错、能降级**：在这些版本及以上，平台代码不因语法或缺失的 API 抛出未捕获的异常，也不会解析失败。某项能力缺失时，按“该能力不可用”处理。不承诺这些版本上 PWA 功能齐全，功能可用性仍按[浏览器矩阵](../docs/architecture/browser-matrix.md)分档记录。
3. 覆盖在浏览器中运行的全部平台代码：
   - 公开包 `sw-runtime`、`client-runtime`、`entry-resilience` 的浏览器部分、`engine-workbox` 的 worker 部分、`vue`、`react`；
   - `vite` 生成的 `sw.js`、恢复 worker、离线页与恢复页脚本；
   - 私有包 `offline-write`、`push`、`nuxt` 的浏览器端代码。
4. 四层防护，每层都配一个故意违规的样例，证明检测确实会失败（见“行为要求”）。
5. 三项会改变产物的改动：
   - 更新提示条按钮间距改为不依赖 flex `gap` 的写法；
   - 更新提示条的定位改为在逻辑定位属性前先写物理定位作回退，宽度 `min()` 前先写固定宽度回退；
   - worker 打包时显式设定构建目标。

## 现状（origin/main `d04350b`，0.4.1）

- 浏览器端源码已不含 `URL.canParse`、`Object.hasOwn`、`AbortSignal.timeout`、`??=`、类字段与 CSS `inset`。
- `scripts/test-support/legacy-engine.mjs` 让八个浏览器端包的单元测试在模拟旧浏览器下运行：平台浏览器端代码一调用上述三个内置方法就抛错。它只覆盖这三个方法，其他新 API 或新语法没有任何检测。
- 所有包以 `tsc` 按 ES2022 构建，`lib` 未限制，新语法原样进入产物。
- `bundleEntry()`（`packages/vite/src/workers.ts`）打包 worker 时没有设构建目标。Vite 8 的默认值是 `baseline-widely-available`，即 Chrome 111、Safari 16.4，不会降级 `??=`、类字段等语法。
- 更新提示条 `.pwa-update-notice__actions` 用 flex `gap`，Chrome 84、Safari 14.1、iOS 14.5 起才支持；更低版本的按钮之间没有间距。
- 更新提示条四种位置及小屏布局只用逻辑定位属性 `inset-block-*`／`inset-inline-*`（`update-notice.css:26-44,108-109`），Chrome 87、Safari 14.1、iOS 14.5 起才支持。更低版本中这些声明被忽略，固定定位的提示条停在静态位置而不在角落；宽度 `min()`（`:11`）在 Firefox 74 不生效（75 起）。**0.4.1 已发布版本同样受影响**，不报错但位置错乱。
- 生成的离线页脚本以字符串形式存放（`vite/src/offline-page.ts:36-122`），类型检查和源码 lint 都看不到；恢复页模块由 `entry-resilience/src/vite/index.ts` 以 `emitFile` 生成并外链引用，属于宿主构建产物。
- `legacy-engine.mjs` 是“调用即抛错”的陷阱，属性仍然存在，`typeof` 检测会通过，因此不能模拟“API 缺失”下的降级分支。
- `FetchEvent.resultingClientId` 要 Safari 16 才有。缺失时，导航的缓存来源信号静默丢失，不报错。

## 工具实测结论（2026-11-11）

实测环境：eslint-plugin-compat 7.0.2、es-check 9.8.1、Vite 8.3.0、@mdn/browser-compat-data 8.1.8，在独立的临时目录中运行。

| 工具 | 能拦住 | 拦不住 |
| --- | --- | --- |
| TypeScript `lib: ES2020` | ES2021 及以后的 JS 内置 API（`Object.hasOwn`、`.at()`、`replaceAll` 等） | 网页 API（DOM 类型不分版本）、语法 |
| es-check `checkBrowser --checkFeatures`，`allowList` 为 `OptionalChaining,NullishCoalescing` | `??=`、公共／静态／私有类字段、BigInt、`Object.hasOwn`、`.at()`、`findLast`；正确放行数字分隔符、`?.`、`??` | 网页 API |
| eslint-plugin-compat | `structuredClone`、`Promise.any`、`Object.hasOwn`、`.at()` 等 | 任何语法；`URL.canParse`、`AbortSignal.timeout`、`resultingClientId`（它实际使用的兼容数据停在 5.7.6） |
| ESLint 自带 `no-restricted-properties` | 名单中列出的“对象.属性” | 名单外的一切 |
| Vite `build.target` | 把 `??=`、类字段降级到目标版本 | 不补 API；降不下来的语法只警告 |

- 不加 `allowList` 时，`checkBrowser` 会把 `?.`、`??` 误报为超出 ES10。
- 单用 `es2020` 模式会误报数字分隔符。

## 行为要求

1. **基线只写一处**：仓库根目录的 `.browserslistrc` 是唯一来源。es-check 与 eslint-plugin-compat 直接读取它。worker 构建目标、TypeScript `lib` 与它不能直接联动，各由一个单元测试校验与它一致。
2. **第 1 层：类型检查**。浏览器端源码使用的 tsconfig 把 `lib` 限到 ES2020，加上所需的 DOM、WebWorker 类型；`target` 保持 ES2022，不改宿主产物。构建期源码不受限。
   - 违规样例放在**各包实际的浏览器编译程序中**，与真实的 Workbox、Vue、React 类型依赖一起编译，覆盖 `Object.hasOwn`、`replaceAll`、数组 `.at()`；并检查实际加载的 lib 文件（`tsc --explainFiles`），防止依赖声明经 `reference lib` 或全局增补把 lib 扩回去。
   - 局部类型声明不得补出被禁止的运行时 API。无法维持限制时进入停止条件。
3. **第 2 层：lint**。`pnpm lint` 对浏览器端源码启用：
   - eslint-plugin-compat（flat 推荐配置，读取 `.browserslistrc`）；
   - `no-restricted-properties` 禁用名单，至少包含 `URL.canParse`、`AbortSignal.timeout`、`AbortSignal.any`、`Object.hasOwn`。名单在 ADR 中说明来源与增补规则。
   - 确实需要使用名单内的 API 时，必须先做特性检测，并在该行写明理由来局部豁免。
4. **第 3 层：产物检测**。CI 对以下产物运行两项检查，超出基线即失败：一是 es-check（`checkBrowser --checkFeatures`，读取 `.browserslistrc`，`allowList` 只放行 `OptionalChaining,NullishCoalescing`）；二是与第 2 层相同的网页 API 规则（eslint-plugin-compat 与禁用名单）。
   - 浏览器端包的 `dist`：按明确的目录映射扫描，排除只在 Node 运行的 `dist/build`、`dist/vite`、`dist/server`，保留被浏览器引用的 `shared` 等目录，并用正反夹具验证排除边界；
   - 示例应用生成的 `sw.js` 与恢复 worker（覆盖打入的 Workbox 代码）；
   - 离线页等生成页面中的内联脚本（抽出后检查）；
   - 恢复页入口模块及其递归静态导入闭包。
   - 扫描对象由检查脚本自己构建示例生成，固定输出路径；扫描前断言上述每类输入都存在且非空，缺失即失败，并打印实际扫描清单。
5. **第 4 层：运行时陷阱与缺失模拟**。
   - 保留 `legacy-engine.mjs` 的调用陷阱，并把 lint 禁用名单中的 API 都纳入，由测试校验两份名单一致。它只证明平台代码不直接调用这些 API。
   - 对写了特性检测的代码，提供单测内使用的辅助函数：在该测试中真正删除这个 API、结束后恢复，分别验证“缺失时降级”和“存在时调用”。
6. **worker 构建目标**：`bundleEntry()` 显式传入 `["chrome80","edge80","firefox74","ios13.4","safari13.1"]`，不再随宿主所装的 Vite 版本变化。
7. **更新提示条样式**：vue 与 react 的 `update-notice.css`：
   - 不再使用 flex `gap`，改为按钮外边距加容器负外边距；
   - 四种位置与小屏布局先写物理定位（`top`／`right`／`bottom`／`left`）作回退，再写原有的逻辑定位属性；宽度先写固定宽度回退，再写 `min()`。
   - 新版浏览器中的外观不变，由界面截图回归确认。验收覆盖：首个按钮与正文的间距、左右内容边界、最后一行到容器底部的距离、两按钮换行阈值（临界宽度两侧）、单按钮状态、长自定义文案、四种位置与小屏布局。
   - `--pwa-update-*` 变量与 `colors` 属性这两个公开定制点不变。
8. **违规样例**：每层至少一个样例，放在测试夹具中，不进入发布包。测试断言该层对样例报错：
   - 类型层：`Object.hasOwn`；
   - lint 层：`structuredClone` 由插件报错，`URL.canParse` 由禁用名单报错；
   - 产物层：`??=` 与类字段由 es-check 报错，写在生成字符串脚本中的 `URL.canParse` 由网页 API 规则报错，另加一个合法的数字分隔符样例，断言它通过；
   - 运行时层：一个带特性检测的正样例，在 API 真正缺失时走降级分支并通过。
9. **文档**：
   - `docs/architecture/compatibility.md`、`browser-matrix.md`、文档站兼容页写明最低版本、承诺的含义、四层检测，以及检测不到的范围（名单外的网页 API、实例属性、CSS）；
   - 写明已知降级：`resultingClientId`、`max()` 在 Firefox 74 上不生效等；
   - 写明“提高最低版本必须新增 ADR 并升主版本号”。

## 测试剖面与验收

| 层次 | 验收 |
| --- | --- |
| 检测工具 | 四层在当前代码上全部通过；每层的违规样例确实失败；数字分隔符样例通过 |
| 一致性 | `.browserslistrc` 与 worker 构建目标、TypeScript `lib` 一致的测试通过 |
| 单元 | 现有测试在扩充后的运行时模拟下全部通过 |
| 构建与 CI | Node 22／24、Windows、Chrome 正式 CI 全部通过，产物检测步骤在 CI 中实际执行；`check:publish` 通过 |
| 界面 | 更新提示条在 Chrome 当前版本的截图与改动前一致，覆盖第 7 条列出的全部情形 |
| 消费 | 候选 tarball 分别在全新 Vite 5 与 Vite 8 项目中构建，生成的 `sw.js` 通过产物检测 |

## 安全与兼容边界

- 不改变 `PwaIdentity`、Service Worker URL 与 scope、manifest ID、缓存命名空间、更新确认协议和缓存准入。
- 公开包 `tsc` 的 `target` 保持 ES2022；不引入 polyfill，不向宿主注入代码。
- 新增工具只作为开发依赖，不进入任何发布包的 `dependencies`。
- worker 内容因构建目标变化而改变，宿主升级时按既有流程更新 worker。

## 不在范围

- 不承诺基线浏览器上 PWA 功能齐全，不为旧浏览器补装能力。
- 不自写基于 MDN 数据的网页 API 检查脚本（项目所有者 2026-11-11 选择插件加禁用名单）。
- 不接入 CSS 兼容检测工具。会破坏布局的 CSS 属性靠评审把关，并记入兼容文档。
- 不在本仓库维护旧版本真机；真机验证由接入方完成，或在基线变更与大版本发布时抽查。
- 不覆盖宿主自己的业务代码兼容性。

## 已决定事项

1. 基线版本采用接入方提出的版本（项目所有者，2026-11-11）。
2. 只限制 `lib`，不改公开包构建目标（项目所有者，2026-11-11）。
3. 私有包一并纳入检测（项目所有者，2026-11-11）。
4. 提高最低版本必须新增 ADR 并升主版本号（项目所有者，2026-11-11）。
5. 分两步：缺陷修复先发 0.4.1，本模块随后单独交付（项目所有者，2026-11-11）。
6. 网页 API 用 eslint-plugin-compat 加禁用名单检测，不自写 MDN 数据检查脚本（项目所有者，2026-11-11）。
7. 提示条间距用外边距替代 flex `gap`（项目所有者，2026-11-11）。

## 评审记录

2026-11-11 Codex 只读审查本规格、ADR 与计划，提出 11 条。项目所有者会话逐条核对代码与 MDN 数据后，全部采纳：类型层须在真实编译程序中验证、运行时陷阱不等于 API 缺失、生成脚本与恢复页模块纳入网页 API 检查、产物扫描的目录映射与空输入失败、Workbox 网页 API 覆盖、任务顺序、提示条逻辑定位与 `min()` 回退及其验收、现状表述。

## 依赖与交付

依赖 `sw-runtime`、`client-runtime`、`pwa-entry-resilience`、`vite-adapter`、`vue-react-adapters`、`update-notice-ui`、`package-distribution`、`platform-governance`。

交付：
- `.browserslistrc` 与四层检测，各带违规样例；
- worker 构建目标与一致性测试；
- 提示条间距改写与截图回归；
- 文档更新；
- 随下一个补丁版本发布：仅含 worker 构建目标和提示条样式两项产物变化，版本号在发布时确定。

## Documentation impact

- `docs/architecture/compatibility.md`、`docs/architecture/browser-matrix.md`：最低版本、承诺含义、四层检测、检测不到的范围、已知降级、基线变更规则。
- `website/reference/compatibility.md` 与相关接入页、受影响包的 README：写明最低版本。
- `CONTRIBUTING.md`：新增 API 时如何处理禁用名单与特性检测。
- 功能 × 浏览器 API 清单（[feature-api-inventory.md](../tasks/browser-compat-baseline/feature-api-inventory.md)）：更新为 0.4.1 之后的状态。
