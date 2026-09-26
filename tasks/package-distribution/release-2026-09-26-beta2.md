# npm 预发布候选记录：0.1.0-beta.2（2026-09-26）

> 状态：**候选已验证，尚未发布**。本记录不代表 npm 已上传、文档站已部署或内部业务项目已完成接入。

## 范围与源码

九个公开包统一为 `0.1.0-beta.2`：`contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`client-runtime`、`vite`、`vue`、`react`。候选源码为分支 `codex/vite5-update-ui-beta2` 的固定提交 `7dd0b285e939a444517662b5521bf875c4644a0f`。本记录本身是后续文档提交，不改变该提交的包产物。拟继续使用 `next` 标签；上传前仍须核对 npm 账号、组织权限、2FA、`latest`／`next` 当前指向和版本占用情况。

本候选加入 Vite 5 适配、Vue／React 可选更新提示 UI 及业务接入文档与 Skill。对比页将已发布的 beta.1 与工作区新增能力分开描述，未把候选版写成已发布。更新提示默认不会自动刷新：用户确认后先接管新 worker，再显式刷新；位置、文案、背景／文字色值和刷新处理可由业务配置。Vue／React 在候选验证中还修复了恢复 worker 瞬时等待状态使提示误显示“更新已完成”的问题。

## 固定提交的干净检出门禁

在独立的 detached worktree `/private/tmp/pwa-beta2-gate.BXBGXL` 中，从上述提交执行。环境为 macOS arm64、Node v22.22.0、pnpm 11.18.0、Chrome 153.0.8010.53。命令均带 `CI=true`；完成后该检出 `git status --short` 为空。

| 门禁 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 退出 0；749 个依赖从本地 store 复用，无下载 |
| `pnpm lint`、`pnpm build`、`pnpm typecheck` | 均退出 0 |
| `pnpm test` | 退出 0；全仓测试通过 |
| `pnpm test:browser` | 退出 0；全仓 Chrome 测试通过，无跳过项 |
| 独立的 Vue／React 更新 UI Chrome 测试 | 14/14 通过；覆盖默认提示、定制样式、确认／稍后、短暂等待状态及显式刷新 |
| `pnpm docs:build`、`pnpm check:publish` | 均退出 0 |
| `pnpm audit --ignore-registry-errors` | 退出 0；`No known vulnerabilities found` |

受限环境中的早期尝试分别遇到离线 store 缺失、非交互终端构建清理和测试回环端口 `EPERM`；改用冻结安装、`CI=true` 以及允许回环端口的执行环境后，上表门禁全部通过。这些失败未作为产品失败或通过结果隐藏。

## 打包与独立消费

按依赖顺序从干净检出逐包 `pnpm pack`，产物保存在 `/private/tmp/pwa-beta2-clean-pack.8fwScl`。逐包检查 `package.json`、README、LICENSE、全部 `exports` 文件路径与包内依赖：版本均为 beta.2，内部生产依赖已转换为 `0.1.0-beta.2`。九包均未混入 `src`、测试、`.env`、`.npmrc` 或日志文件；私钥标记、npm 令牌标记和本机用户路径扫描无命中。

清洁检出 tarball 与此前用来做独立消费的最终工作区 tarball 逐文件比较：六包逐字节相同；`client-runtime`、`sw-runtime`、`vite` 仅 `package.json` 字段顺序不同，解析后的 JSON 相同，其余文件逐字节相同。下面哈希专指**干净检出**打出的候选 tarball；发布过程会重新打包，需按文件内容核对 registry 产物，不能只依赖压缩包哈希。

| 包 | SHA-256 |
|---|---|
| `@pwa-platform/contracts` | `39d5c47c4c9b62590b5a5ef506eb3611f583fe13200a4c09fd057cecd7d61d46` |
| `@pwa-platform/core` | `3610913d1050c4de00772b8cbd84fad2c3d00d0f7bc0d27d073f60387eceb189` |
| `@pwa-platform/engine-workbox` | `cfc77fabbaf7faa983bd4b9e5167d1ba174e93593734287677dffe34825efea6` |
| `@pwa-platform/build-verifier` | `d540142e72b6eb3df3c3aeaa20222f767e98863a9a76d2071debfc1e3828ff11` |
| `@pwa-platform/sw-runtime` | `263558a35e3d8b057e5fe76c52faa6ac48362e3ac65ae11b727420b942c79004` |
| `@pwa-platform/client-runtime` | `abf5bd717c65b83e84e7c0a45b3156f4e2b9b06e801c8e2293aa972f5921a9f1` |
| `@pwa-platform/vite` | `68d5bbd5bd46f7af1f91f0a0c91104a97fceb0459ed65e820de7e09be15c45be` |
| `@pwa-platform/vue` | `649430173b87644afc3f504c53e461da2587c6e4e5783015fa0593526bb47828` |
| `@pwa-platform/react` | `fd9e9301de8ac8ac5a38e155f8f296370b3d589d44eeb1d2fb8dd0670bbe9115` |

先前的工作区 tarball 经独立临时项目安装和使用；与本表候选包的文件内容及解析后清单一致：

- Node v22.22.0、pnpm 8.6.5、Vite 5.0.0：安装、类型检查、生产构建、开发服务器均通过；构建产生 manifest、主 worker 和恢复 worker。
- 同环境加 Vue 3.4.0、TypeScript 5.2.2：安装、类型检查、生产构建均通过，并输出更新提示所需 JS／CSS。
- Vite 8.3.0 消费项目：安装、类型检查、构建和开发服务器通过。
- React 19 消费项目：从 tarball 安装 `@pwa-platform/react/ui` 并在 Node ESM 中导入成功。
- 九包整体在独立项目以 `file:` 安装，安全的运行时公开入口均可导入。worker 专用入口仍应由构建注入配置后在浏览器 worker 中运行，不能把普通 Node 导入当作其验收。

这些是平台隔离消费证据，不等于私有业务项目的真实构建或部署验收。内部项目的迁移步骤和 AI Skill 分别见[接入作业单](../../docs/guides/vite5-vue34-host-integration.md)及[Skill](../../.agents/skills/pwa-vite5-vue-integration/SKILL.md)。

## Registry 状态与后续发布边界

2026-09-26 04:54 UTC 只读查询公共 npm registry：九包均能查到 beta.1，均未查到 `0.1.0-beta.2`。真正上传前必须重新查版本与 dist-tag；本次未核对发布账号／2FA，也未执行 `pnpm publish`、变更 dist-tag 或部署文档站。

按[package-distribution 规格](../../spec/package-distribution.md)，“实际上传另行执行”，只有所有者明确指示后才按[预发布流程](../../docs/operations/npm-package-release.md)上传九包并逐包核对 registry 内容。私有业务项目尚未提供仓库；它的 PurgeCSS、混淆、真实 scope／origin、旧 PWA 清理和浏览器安装／更新验收需在其仓库依接入 Skill 完成。未经真实域名响应头、离线与恢复演练及发布通道矩阵证据，不宣称该业务项目生产就绪。
