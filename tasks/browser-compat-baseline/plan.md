# 实施计划：browser-compat-baseline

> 2026-11-11 草案，与[规格](../../spec/browser-compat-baseline.md)和 [ADR-0053](../../docs/adr/0053-browser-compat-baseline.md) 一并交项目所有者审阅；批准前不改代码。

## 排期与进入条件

- 能力图末尾追加本模块，构建顺序同步追加。`cloudflare-test-deployment` 剩余 5 项（第二台机器等外部前提和所有者暂缓项）、已暂停的 `stable-release-qualification` 和 `offline-experience-resilience` 都保持原状。
- 审阅通过后，把本机 `.agent/state.json` 的 `activeModule` 切到本模块。该文件不入库，本 worktree 中没有，需要先确认它在主检出中的位置。
- 工具版本于 2026-11-11 从 npm 读取：`eslint-plugin-compat` 7.0.2（peer `eslint ^9 || ^10`，内含 `@mdn/browser-compat-data` 与 `browserslist`），`es-check` 9.8.1。实施时以官方文档核对配置项，不凭记忆写参数。

## 顺序原则

先建检测、确认它在现有代码上报错，再修代码让它通过。这样每一处修复都由检测驱动，修完后检测本身就是防回归手段。

## BC0：盘点（已完成）

27 项功能 × 浏览器 API 清单见 [feature-api-inventory.md](feature-api-inventory.md)；超基线用法见规格现状表。

## BC1：基线与三层检测（先让它报错）

1. 在仓库根目录新增 browserslist 配置，写入五个最低版本。
2. 类型层：给浏览器端源码（`sw-runtime` 的 worker 与 shared、`client-runtime` 的 client 与 shared、`entry-resilience` 的浏览器部分、`engine-workbox/src/worker`、`vue`、`react`、`offline-write`、`push` 的客户端部分）的 tsconfig 设 `lib: ["ES2020", ...]`。构建期目录保持原样。
3. lint 层：在 `eslint.config.js` 中只对上述浏览器端目录启用 `eslint-plugin-compat`，读取 browserslist。
4. 产物层：新增脚本，对浏览器端包的 `dist`、示例应用生成的 `sw.js` 与恢复 worker、生成页面中的内联脚本运行 `es-check es2020`，并接入 CI。
5. 一致性测试：browserslist 与 tsconfig `lib` 不分叉。
6. 每层一个违规样例（放在测试夹具中，不进入发布包），断言该层失败。

**验收**：三层在现有代码上报出规格现状表中的各项，不多不少；若多出未知项，补进规格后再继续。违规样例确实失败。

## BC2：替换 JS 用法

- `URL.canParse`：各包内用 `try { new URL(value, base) }` 实现同名内部函数，不新增跨包依赖。涉及 `client-runtime`、`sw-runtime`、`engine-workbox/worker`、`entry-resilience`、`offline-write`。
- `Object.hasOwn` 换成 `Object.prototype.hasOwnProperty.call`：涉及 `client-runtime`、`sw-runtime`、`entry-resilience`、`offline-write`。
- 单元测试：属性在原型链上而非自身、无法解析的 URL、`null` 原型对象。

**验收**：既有单元测试全部通过，新增测试通过，类型层和 lint 层对这些位置不再报错。

## BC3：入口探测、语法与样式

- `entry-resilience/src/browser/probes.ts`：`AbortSignal.timeout` 换成 `AbortController` 加 `setTimeout`，结束后清除计时器；测试计时器被清理、超时后中止。
- `entry-resilience/src/client/index.ts:29` 的 `??=` 换成普通赋值。
- `push/src/client/index.ts` 的类字段改为在构造函数中赋值；`message` 与 `code` 的行为不变。
- `inset: 0` 换成 `top/right/bottom/left: 0`：`vite/src/offline-page-style.ts`、`entry-resilience/src/vite/default-style.ts`。离线页 CSP 哈希随样式重算，检查生成测试的快照。
- `gap` 与 `max()` 保留，在兼容文档中记录为可接受的降级。

## BC4：worker 打包目标与依赖盘点

- `packages/vite/src/workers.ts` 的 `bundleEntry()` 显式传入与 browserslist 一致的构建目标，并核对 Vite 8 中该选项的写法与默认值（以官方文档为准）。
- 对生成的 `sw.js` 与恢复 worker 跑产物层检测，确认 Workbox 7.4.1 部分不超出基线。
- 核实 `FetchEvent.resultingClientId` 在基线浏览器上的支持情况。缺失时缓存来源事件只是静默丢失，按降级处理，但要在兼容文档中写明。

**停止条件**：如果 Workbox 自身用了构建工具无法降级的 API，停下来提交决策，不擅自加 polyfill。

## BC5：文档

- `docs/architecture/compatibility.md`：最低版本、承诺含义、三层检测、CSS 降级、基线变更规则。
- `docs/architecture/browser-matrix.md`：在既有分档之外写明最低版本。
- 受影响包 README 与 `website/guide/` 接入说明：写明最低版本。
- 功能 × API 清单的定稿版本转入文档站或 `docs/architecture/`，供运营和上线检查使用。

## BC6：门禁与自审

- 本地：`pnpm typecheck`、`pnpm lint`、单元测试、构建、`check:publish`、产物层检测、Chrome 浏览器套件。
- 候选 tarball 在全新 Vite 项目中构建，生成的 `sw.js` 通过产物层检测。
- 差异自审，然后开 PR，正式 CI（Node 22／24、Windows、Chrome，及非阻塞的 Edge 和 WebKit／Firefox）全部通过后交所有者合并。

## BC7：发布 0.4.1

- 沿用既有流程：十个包版本号统一改为 0.4.1，冻结候选；所有者做 npm 身份验证，并按依赖顺序批准；集中读回完整性，再做全新消费验证。
- 写 `tasks/package-distribution/release-0.4.1.md`，并通知接入方版本号和改动点。

## BC8：真机补记

- 接入方在 Safari 13.1 上升级 0.4.1 后反馈：页面不白屏、worker 注册并安装、离线页可用。结果补记到验证记录。
- 不通过时按规格发 0.4.2。
