# 实施计划：browser-compat-baseline

> 2026-11-11 草案，与[规格](../../spec/browser-compat-baseline.md)、[ADR-0053](../../docs/adr/0053-browser-compat-baseline.md) 一并交项目所有者审阅；批准前不改代码。

## 排期与进入条件

- 能力图末尾追加本模块。`cloudflare-test-deployment` 剩余项（外部前提与所有者暂缓项），以及已暂停的 `stable-release-qualification`、`offline-experience-resilience` 保持原状。
- 审阅通过后切换本机 `.agent/state.json` 的 `activeModule`；该文件不入库，需在主检出中操作。
- 工具版本以 2026-11-11 实测为准：eslint-plugin-compat 7.0.2、es-check 9.8.1。实施时再读一次最新版本，有变化则重新实测违规样例。

## 顺序原则

先建检测，确认它在违规样例上报错、在当前代码上通过，再做产物变化（worker 目标、提示条样式）。每个任务一条提交。

## BC1：基线文件与一致性

- 新增根目录 `.browserslistrc`，写入五个最低版本。
- 新增一致性测试：用 browserslist 解析 `.browserslistrc`，断言它与 worker 构建目标常量、浏览器端 tsconfig 的 `lib` 一致。
- 把 browserslist 列为根开发依赖。

**验收**：测试通过；改动任一处，测试即失败。

## BC2：类型层

- 为浏览器端源码设 `lib: ["ES2020", "DOM", ...]`。涉及 `sw-runtime` 的 worker 与 shared 部分、`client-runtime` 的 client 与 shared 部分、`entry-resilience` 浏览器部分、`engine-workbox/src/worker`、`vue`、`react`、`offline-write`、`push` 客户端、`nuxt` 运行时插件。`target` 不变，构建期 tsconfig 不受限。
- 盘点受影响的类型。若某个依赖的类型声明需要更新的 `lib`，记录下来，并用 `skipLibCheck` 或局部声明解决；不放宽浏览器端源码的 `lib`。
- 违规样例：`Object.hasOwn`，`tsc` 报错。

**验收**：`pnpm typecheck` 通过；样例失败。

## BC3：lint 层

- `eslint.config.js` 对浏览器端源码 glob 启用 `compat.configs["flat/recommended"]` 与 `no-restricted-properties` 禁用名单。
- 核实插件在 typescript-eslint 解析器下对 `.ts` 文件生效。若不生效，停下来提交决策。
- 违规样例：`URL.canParse`，以及插件可报的 `structuredClone`，断言 ESLint 报错。

**验收**：`pnpm lint` 通过；样例失败。

## BC4：产物层与运行时层

- 新增脚本，对浏览器端包 `dist` 与示例应用生成的 `sw.js`、恢复 worker、内联脚本运行 es-check（`checkBrowser --checkFeatures`，`--browserslistPath .browserslistrc`，`--allowList=OptionalChaining,NullishCoalescing`）。内联脚本先抽出为临时文件。
- 接入 CI 的 Quality 任务，在构建之后执行。
- 违规样例：`??=`、类字段应失败；数字分隔符应通过。
- `legacy-engine.mjs` 加入 `AbortSignal.any`，与禁用名单一致，并由测试校验两者一致。

**验收**：当前产物通过；样例按预期失败或通过；CI 实际执行该步骤。

## BC5：worker 构建目标

- `bundleEntry()` 传入 `build.target: ["chrome80","edge80","firefox74","ios13.4","safari13.1"]`（常量，与 BC1 一致性测试关联）。
- 对比改前改后的生成 `sw.js`，确认差异只来自语法降级；运行 sw-runtime、vite 单测与 Chrome 浏览器套件。
- 降不下来的语法只警告。构建出现 `TOLERATED_TRANSFORM` 警告时，必须由 BC4 的产物层失败兜住。

## BC6：提示条间距

- vue、react `update-notice.css` 的 `.pwa-update-notice__actions` 去掉 `gap`，改为按钮外边距加容器负外边距，保持 0.5rem 间距与 0.875rem 上边距。
- 用 `ui-browser-tests/update-notice.spec.ts` 在 Chrome 当前版本截图，对比改前改后：单行和换行两种布局都要看。
- 两包样式保持一致，由现有对等测试校验。

## BC7：文档

- `compatibility.md`、`browser-matrix.md`、`website/reference/compatibility.md`、受影响包 README：写明最低版本、承诺含义、四层检测、检测不到的范围、已知降级与基线变更规则。
- `CONTRIBUTING.md`：用新 API 时如何查 MDN、如何增补禁用名单、如何写局部豁免。
- 更新功能 × API 清单到 0.4.1 之后的状态。

## BC8：门禁与交付

- 本地：typecheck、lint、单测、构建、`check:publish`、产物检测、Chrome 浏览器套件、docs 检查。
- 候选 tarball 消费：全新 Vite 项目构建，生成的 `sw.js` 通过产物检测。
- 自审后开 PR，正式 CI 全部通过后交所有者合并。
- 产物变化（worker 目标、提示条样式）随下一个补丁版本发布，版本号与时间由所有者决定。

## 停止条件

- eslint-plugin-compat 在 TS 源码上不生效。
- 某个依赖必须使用超基线 API，且无法通过降级解决（例如 Workbox 新版本）。
- 提示条截图出现非预期差异。

出现以上情况时停下来提交决策，不擅自放宽基线或加 polyfill。
