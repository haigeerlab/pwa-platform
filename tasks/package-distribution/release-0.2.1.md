# npm 发布记录：0.2.1

> 状态：十个 `0.2.1` 包已发布至 npm，`latest` 均指向 `0.2.1`。逐包读回完整 tarball、完整性摘要与候选比对均通过；从 registry 安装全部十包后，类型检查与生产构建通过。

## 范围与版本选择

十个公开包统一 `0.2.1`。唯一的发布源码改动是恢复 worker 删除失败时逐项尝试（[#49](https://github.com/haigeerlab/pwa-platform/pull/49)，审查建议 #15），见 [CHANGELOG](../../CHANGELOG.md) 的 0.2.1 小节。无公开 API、配置或诊断变化，所以选 patch；`^0.2.0` 的接入方会自动升级。自 0.2.0 候选提交 `84bcfa29` 起，十包的 `src`、`package.json`、`README.md` 中只有 `sw-runtime/src/recovery-worker/index.ts` 一处源码差异。

本记录只说明库包分发，不构成任何业务应用的生产发布证据。

## 候选与门禁

- 准备 PR：[#52](https://github.com/haigeerlab/pwa-platform/pull/52)。候选提交 `c0772746f617874ecbbf90bc4088bec06fb6199e`，合并提交 `f59b251`。两者之间 `packages/` 无差异。
- 候选门禁在候选提交的干净副本上执行（2026-09-28T07:11–07:19Z，macOS arm64，Node 24.18.0，pnpm 11.18.0，Google Chrome 153.0.8010.53），全部 exit 0：

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile`、`lint`、`build`、`typecheck`、`docs:build`、`check:publish` | 通过 |
| `pnpm test` | 2422 个用例通过 |
| `pnpm test:browser` | 276 个用例通过 |
| `pnpm test:onboarding-smoke` | 通过 |
| `pnpm test:browser:engines` | 120 通过、10 跳过（Chromium 专有用例） |
| `pnpm test:browser:network` | 4 通过（真实 FCM） |
| `pnpm audit --ignore-registry-errors` | 无已知漏洞 |

  第一次批量运行时，`install --frozen-lockfile` 与 `audit` 因脚本把带参数的命令整体传给 pnpm 而报“命令不存在”（pnpm 先按锁文件完成了安装）；两条命令随后在同一副本上按正确参数重跑，均 exit 0。
- 逐包 `pnpm pack`：版本均为 0.2.1，内部依赖精确为 0.2.1，无 `workspace:` 残留，README、LICENSE 齐全，无多余文件，未扫出密钥模式。与 registry 上的 0.2.0 逐文件比对，除 `sw-runtime` 的 `dist/recovery-worker/index.js`（及 map、README 版本号）外只有 `package.json` 版本号与依赖字段顺序不同。
- 独立消费验证（候选 tarball）：Vite 5.0.0 + Vue 3.4.0 项目安装十包后，`vue-tsc --noEmit` 与 `vite build` 通过，构建出的 `pwa-recovery-worker.js` 含新的逐项删除逻辑。
- 发布前确认十包 `0.2.1` 在 registry 均不存在；合并后 `main`（`f59b251`）上的 CI 通过。

## 发布

执行人：项目所有者（npm 身份认证由本人完成），从 `main` @ `f59b251` 的全新克隆执行 `pnpm install --frozen-lockfile && pnpm build`，确认 HEAD 与十包版本后，按依赖顺序逐包 `pnpm publish --access public --tag latest`。

| 包 | 公开时间（UTC） | SHA-256（前缀） | integrity 与下载一致 | 与候选比对 |
|---|---|---|---|---|
| contracts | 07:32:58 | `1dc01204` | ✅ | 相同 |
| core | 07:40:25 | `822ca053` | ✅ | 相同 |
| engine-workbox | 07:45:01 | `d980aac1` | ✅ | 相同 |
| build-verifier | 07:49:59 | `5e0b9189` | ✅ | 内容相同（依赖字段顺序不同） |
| sw-runtime | 07:54:13 | `e8cc8988` | ✅ | 内容相同（依赖字段顺序不同） |
| client-runtime | 08:00:58 | `72a55d01` | ✅ | 内容相同（依赖字段顺序不同） |
| react | 08:03:27 | `126acdc1` | ✅ | 相同 |
| entry-resilience | 08:04:07 | `26de2c2b` | ✅ | 相同 |
| vite | 08:05:06 | `70939a31` | ✅ | 内容相同（依赖字段顺序不同） |
| vue | 08:05:08 | `cab5bc39` | ✅ | 相同 |

四个包的 tarball 与候选 tarball 哈希不同，原因只是 `pnpm pack`／`pnpm publish` 改写 `workspace:` 依赖时字段顺序不固定；解析后的 `package.json` 与候选完全一致，其余文件逐字节相同。

## 事件：npm 暂存发布与批准

- 本次 npm 的发布分两步：`pnpm publish` 报告 `✅ Published package` 时版本只是**暂存**，项目所有者在 npm 上完成认证批准后才公开。暂存期间该版本不在 packument 中、tarball 为 404。前五个包的公开间隔约 5 分钟，即每次批准所用的时间；起初被误判为 0.2.0 那样的 registry 异步登记延迟。
- 为提速，中途停止逐包等待的脚本时，`client-runtime` 已有一个暂存版本，改用临时标签重新发布它得到 `409 Cannot publish over previously staged version "0.2.1"`；批准该暂存版本后正常公开。**同一版本的暂存无法被重新发布，只能批准。**
- 最后四个包连续上传后由所有者批准，公开顺序为 react → entry-resilience → vite → vue，与建议的 vite → entry-resilience → vue → react 不同。`entry-resilience@0.2.1` 精确依赖 `vite@0.2.1`，比它早约 1 分钟公开，这段时间内安装 `entry-resilience@latest` 可能以 `ETARGET` 失败；`react` 公开时其依赖均已公开。窗口已结束，未收到影响报告。
- 改进写入[npm 包发布流程](../../docs/operations/npm-package-release.md)：按依赖顺序批准；等待的对象是“批准后公开”，不是 registry 登记。

## 发布后验证

- 十包 `latest` 均为 `0.2.1`，tarball 均可下载，`dist.integrity` 与下载内容一致。
- 在全新目录用 npm 直接从 registry 安装全部十个 `0.2.1`（Vite 5.0.0、Vue 3.4.0、React 19.2.0），安装树中所有 `@pwa-platform/*` 均为 0.2.1；`vue-tsc --noEmit` 与 `vite build` 通过，构建出的 `pwa-recovery-worker.js` 含新的逐项删除逻辑。
