# 实施计划：browser-compat-baseline

> 2026-11-11 与[规格](../../spec/browser-compat-baseline.md)、[ADR-0053](../../docs/adr/0053-browser-compat-baseline.md) 一并经项目所有者批准。

## 排期与进入条件

- 能力图末尾追加本模块。`cloudflare-test-deployment` 剩余项（外部前提与所有者暂缓项），以及已暂停的 `stable-release-qualification`、`offline-experience-resilience` 保持原状。
- 审阅通过后切换本机 `.agent/state.json` 的 `activeModule`；该文件不入库，需在主检出中操作。
- 工具版本以 2026-11-11 实测为准：eslint-plugin-compat 7.0.2、es-check 9.8.1。实施时再读一次最新版本，有变化则重新实测违规样例。

## 顺序原则

先建检测，确认它在违规样例上报错、在当前代码上通过，再做产物变化（worker 目标、提示条样式）。每个任务一条提交。

## BC1：基线文件

- 新增根目录 `.browserslistrc`，写入五个最低版本；把 browserslist 列为根开发依赖。
- 新增共用的基线读取函数（解析 `.browserslistrc`，输出目标版本列表），供后续一致性测试使用。

**验收**：读取函数的单测通过；本任务不要求其他配置已对齐。

## BC2：类型层

- 为浏览器端源码设 `lib: ["ES2020", "DOM", ...]`。涉及 `sw-runtime` 的 worker 与 shared 部分、`client-runtime` 的 client 与 shared 部分、`entry-resilience` 浏览器部分、`engine-workbox/src/worker`、`vue`、`react`、`offline-write`、`push` 客户端、`nuxt` 运行时插件。`target` 不变，构建期 tsconfig 不受限。
- 违规样例放在各包实际的浏览器编译程序中（与真实 Workbox、Vue、React 类型一起编译），覆盖 `Object.hasOwn`、`replaceAll`、数组 `.at()`，断言 `tsc` 报错。
- 用 `tsc --explainFiles` 检查每个浏览器程序实际加载的 lib 文件，断言没有 ES2021 及以上的 lib 被依赖带入。
- 一致性测试：浏览器端 tsconfig 的 `lib` 与 BC1 读取的基线一致。
- 局部声明不得补出被禁止的运行时 API。

**验收**：`pnpm typecheck` 通过；全部样例失败；lib 检查与一致性测试通过。

## BC3：lint 层

- `eslint.config.js` 对浏览器端源码 glob 启用 `compat.configs["flat/recommended"]` 与 `no-restricted-properties` 禁用名单。
- 用仓库实际的 typescript-eslint 配置核实插件对 `.ts` 生效：`structuredClone` 由插件报错，`URL.canParse` 由禁用名单报错。插件不生效时停下来提交决策。

**验收**：`pnpm lint` 通过；两个样例分别由各自规则报错。

## BC4：产物层与运行时层

- 新增检查脚本：
  - 自己构建 React、Vue 示例到固定临时目录；
  - 收集扫描对象：浏览器端包 `dist`（按目录映射，排除 `dist/build`、`dist/vite`、`dist/server`）、生成的 `sw.js` 与恢复 worker、抽出的离线页等内联脚本、恢复页入口模块及其递归静态导入闭包；
  - 断言每类输入都存在且非空，并打印扫描清单；
  - 对全部对象运行 es-check（`checkBrowser --checkFeatures`，`--browserslistPath .browserslistrc`，`--allowList=OptionalChaining,NullishCoalescing`）与 lint 层相同的网页 API 规则。
- 目录映射的正反夹具：仅 Node 目录中的新 API 不报错，`shared` 中的新 API 必须报错。
- 违规样例：`??=`、类字段由 es-check 报错；生成字符串脚本中的 `URL.canParse` 由网页 API 规则报错；数字分隔符必须通过；缺少任一类输入时脚本必须失败。
- 接入 CI 的 Quality 任务。
- `legacy-engine.mjs` 加入 `AbortSignal.any`，由测试校验与禁用名单一致；新增单测辅助函数，在单个测试内真正删除指定 API、结束后恢复；加一个带特性检测的正样例，验证缺失时走降级。

**验收**：当前产物全部通过；样例按预期失败或通过；CI 日志中出现完整扫描清单。

## BC5：worker 构建目标

- 进入条件：BC4 的产物扫描已覆盖生成的 worker（含 Workbox 代码）的语法与名单内网页 API；扫描若报出 Workbox 问题，先按停止条件提交决策。
- `bundleEntry()` 传入 `build.target: ["chrome80","edge80","firefox74","ios13.4","safari13.1"]`；一致性测试校验它与 BC1 的基线一致。
- 对比改前改后的 `sw.js`，确认差异只来自语法降级；运行 sw-runtime、vite 单测与 Chrome 浏览器套件。
- 分别用 Vite 5 与 Vite 8 宿主构建，确认目标写法被接受、产物通过 BC4 扫描。构建出现 `TOLERATED_TRANSFORM` 警告时，必须由 BC4 的扫描失败兜住。

## BC6：提示条样式

- vue、react `update-notice.css`：
  - `.pwa-update-notice__actions` 去掉 `gap`，改为按钮外边距加容器负外边距，保持 0.5rem 间距与 0.875rem 上边距；
  - 宽度先写固定宽度回退，再写 `min()`。0.4.2 已发布的定位回退块（`@supports not (inset-inline-start: 0)`）保持不变。
- 用 `ui-browser-tests/update-notice.spec.ts` 在 Chrome 当前版本截图对比改前改后。覆盖首按钮与正文间距、左右内容边界、最后一行到容器底部距离、两按钮换行阈值（临界宽度两侧）、单按钮、长自定义文案、四种位置与小屏布局。
- 两包样式保持一致，由现有对等测试校验。

## BC7：文档

- `compatibility.md`、`browser-matrix.md`、`website/reference/compatibility.md`、受影响包 README：写明最低版本、承诺含义、四层检测、检测不到的范围、已知降级与基线变更规则。
- `CONTRIBUTING.md`：用新 API 时如何查 MDN、如何增补禁用名单、如何写局部豁免与缺失测试。
- 更新功能 × API 清单到 0.4.1 之后的状态，修正其中“由 BC1 覆盖 Workbox”的错误指向（应为 BC4）。

## BC8：门禁与交付

- 本地：typecheck、lint、单测、构建、`check:publish`、产物检查、Chrome 浏览器套件、docs 检查。
- 候选 tarball 消费：全新 Vite 5 与 Vite 8 项目构建，生成的 `sw.js` 通过产物检查。
- 自审后开 PR，正式 CI 全部通过后交所有者合并。
- 产物变化（worker 目标、提示条样式）随下一个补丁版本发布，版本号与时间由所有者决定。

## 停止条件

- eslint-plugin-compat 在 TS 源码上不生效。
- 某个依赖必须使用超基线 API，且无法通过降级解决（例如 Workbox 新版本）。
- 提示条截图出现非预期差异。
- 某个浏览器程序的实际 lib 被依赖扩到 ES2021 以上，且无法在不放宽限制的前提下解决。
- Vite 5 或 Vite 8 不接受显式构建目标写法。

出现以上情况时停下来提交决策，不擅自放宽基线或加 polyfill。
