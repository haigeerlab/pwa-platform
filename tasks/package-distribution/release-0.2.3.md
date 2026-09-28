# npm 发布记录：0.2.3

> 状态：十个 `0.2.3` 包已发布至 npm，`latest` 均指向 `0.2.3`。逐包读回的 tarball 完整性摘要全部一致，内容与发布前审核的候选包一致；从 registry 安装的 Vite 5 + Vue 3.4 与 Vite 5 + React 19.2 项目类型检查与生产构建通过，React 构建在 Chrome 中完成注册、接管与离线重开。发布过程中出现约 9 分钟依赖方先于被依赖包公开的窗口，见下文“事件”。

## 范围与版本选择

十个公开包统一 `0.2.3`。`0.2.2` 已准备（[#64](https://github.com/haigeerlab/pwa-platform/pull/64)）但从未发布，项目所有者决定跳过它，把其改动与第二批复审修复合并为 `0.2.3`。自 `0.2.1`（`c077274`）以来改动过源码的公开包只有两个：

| 包 | 改动 |
|---|---|
| `client-runtime` | R9（[#54](https://github.com/haigeerlab/pwa-platform/pull/54)）回访时以浏览器既有活动注册报告 `registered`；N1（[#60](https://github.com/haigeerlab/pwa-platform/pull/60)）此时已在安装的新版本也会宣告 `update-waiting` |
| `sw-runtime` | R14（[#67](https://github.com/haigeerlab/pwa-platform/pull/67)）恢复 worker 在 `blocked` 后最多等 3 秒；N3（[#68](https://github.com/haigeerlab/pwa-platform/pull/68)）有版本在安装时跳过运行时缓存配额清理；N2（[#69](https://github.com/haigeerlab/pwa-platform/pull/69)）发送途中到达的 flush 补跑一轮；`decide.ts` 一处注释（[#63](https://github.com/haigeerlab/pwa-platform/pull/63)） |

其余八个包只有 `package.json` 的版本号变化，与 registry 上 `0.2.1` 的 tarball 逐文件比对确认。详见 [CHANGELOG](../../CHANGELOG.md)。

本记录只说明库包分发，不构成任何业务应用的生产发布证据。

## 候选与门禁

- 准备 PR：[#72](https://github.com/haigeerlab/pwa-platform/pull/72)，合并提交 `87e40a9`；合并后 `main` 上 CI（run 36448762612）五个 job 全部通过，含引擎冒烟与真实 FCM 推送套件。
- 准备期间引擎冒烟发现两个测试写法问题（N2 用例依赖 Chromium 的请求重试，WebKit 上必现失败；R5 用例在 N2 之后假设两个页面结果恒等，Firefox 约 1/20 失败），由 [#71](https://github.com/haigeerlab/pwa-platform/pull/71) 修正测试后再发布，产品代码未改。
- 候选门禁在 `main` @ `87e40a9` 的全新克隆上执行（2026-09-28，macOS arm64，Node 24.18.0，pnpm 11.18.0，Google Chrome 153.0.8010.53），全部 exit 0：

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile`、`lint`、`build`、`typecheck`、`docs:build`、`check:publish` | 通过 |
| `pnpm test` | 2436 个用例通过 |
| `pnpm test:browser` | 281 个用例通过 |
| `pnpm test:onboarding-smoke` | 通过 |
| `pnpm test:browser:engines` | 126 通过、12 跳过（Chromium 专有用例） |
| `pnpm test:browser:network` | 本机未运行；`main` CI 的 network job 通过 |
| `pnpm audit --ignore-registry-errors` | 无已知漏洞 |

- 逐包 `pnpm pack`：版本均为 0.2.3，内部依赖精确为 0.2.3，无 `workspace:` 残留，README、LICENSE 齐全，未扫出密钥模式。
- 独立消费验证（候选 tarball）：Vite 5.0.0 + Vue 3.4.0 项目安装后 `vue-tsc --noEmit`（`vue-tsc` 2.2.12；2.0.0 的发布包缺 `index.js`，不可用）与 `vite build` 通过，产物含 R14 与 N3 的新逻辑。类型检查使用 `skipLibCheck: true`：关闭时唯一的报错来自 Vite 5.0.0 自身声明与 `@types/node` 24 的不兼容，来自 `@pwa-platform` 的报错为 0。
- 发布前确认十包 `0.2.3` 在 registry 均不存在；发布身份为包维护者 `jianian`。

## 发布

执行人：项目所有者（npm 认证与暂存批准由本人完成），从 `main` @ `87e40a9` 的全新克隆执行 `pnpm publish --access public --tag latest`。前三个包用逐包等待下载的脚本发布，其余七个应所有者要求改为批量提交暂存，再统一批准。时间为 UTC，“公开”取 registry 的 `time["0.2.3"]`。

| 包 | 提交 | 公开 | SHA-256（前缀） | integrity 与下载一致 | 与候选比对 |
|---|---|---|---|---|---|
| contracts | 16:19:16 | 16:20:31 | `ea246695` | ✅ | 相同 |
| core | 16:23:50 | 16:25:28 | `ea681526` | ✅ | 相同 |
| engine-workbox | 16:26:22 | 16:27:17 | `42f24394` | ✅ | 相同 |
| build-verifier | 16:28:36 | 16:29:31 | `819f7d7e` | ✅ | 相同 |
| vite | 16:28:43 | 16:30:20 | `5d42bdfd` | ✅ | 内容相同（`package.json` 字段顺序不同） |
| vue | 16:28:48 | 16:30:55 | `2039d281` | ✅ | 相同 |
| react | 16:28:51 | 16:30:57 | `867b2eab` | ✅ | 相同 |
| client-runtime | 16:28:41 | 16:31:49 | `9cea2577` | ✅ | 内容相同（`package.json` 字段顺序不同） |
| sw-runtime | 16:28:39 | 16:34:49 | `87425185` | ✅ | 相同 |
| entry-resilience | 16:28:45 | 16:34:57 | `b02437ba` | ✅ | 内容相同（`package.json` 字段顺序不同） |

“候选”指从 `87e40a9` 全新克隆 `pnpm pack` 得到的 tarball；三包的差异与 0.2.1 相同，来自 pnpm 改写 `workspace:` 依赖时字段顺序不固定，解析后的 `package.json` 与其余文件完全一致。

## 事件

- **非交互终端也会暂存。** 第一次在非交互 shell 中执行 `contracts` 的 `pnpm publish` 报 `ERR_PNPM_OTP_NON_INTERACTIVE`，但版本已进入暂存；此后在交互终端重发得到 `409 Cannot publish over previously staged version`，批准公开后再发得到 `403 You cannot publish over the previously published versions`。三者都说明“这个版本已经提交过”，处理方式都是去 npm 批准或跳过，而不是重发。
- **依赖方先于被依赖包公开，约 9 分钟。** 批量提交后，批准顺序未按依赖顺序：`vite`、`vue`、`react`、`client-runtime` 在 16:30–16:31 公开，而它们精确依赖的 `sw-runtime@0.2.3` 16:34:49 才公开，tarball 到 16:39:45 才可下载（`entry-resilience` 同样约 16:39 才可下载）。**16:30 至 16:39 之间，`npm install @pwa-platform/vue`（或 `react`、`vite`）会因取不到 `sw-runtime@0.2.3` 失败**；已安装 0.2.1 的项目不受影响（0.2.1 各包精确依赖 0.2.1）。此后十包均可正常安装。
- **公开到可下载的延迟**：多数包在公开后 1–5 分钟内可下载，`sw-runtime` 约 5 分钟。

改进写入[npm 包发布流程](../../docs/operations/npm-package-release.md)。

## 发布后验证

- 十包 `latest` 均为 `0.2.3`，tarball 均可下载，`dist.integrity` 与下载内容一致，内部依赖均为精确 `0.2.3`。
- 在全新目录用 npm 直接从 registry 安装：
  - Vite 5.0.0 + Vue 3.4.0：安装树中所有 `@pwa-platform/*` 均为 0.2.3；`vue-tsc --noEmit` 与 `vite build` 通过；`pwa-recovery-worker.js` 含 R14 的等待逻辑，`sw.js` 含 N3 的安装中检查。
  - Vite 5.0.0 + React 19.2.0（接入冒烟模板）：安装树均为 0.2.3；`tsc --noEmit` 与 `vite build` 通过。以 `vite preview` 在 Chrome 153 中打开：`sw.js` 激活，重载后受控；断网重载仍受控并渲染应用壳；断网访问从未缓存的路径得到平台默认离线页（标题“离线”）。
