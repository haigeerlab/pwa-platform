# npm 预发布记录：0.1.0-beta.2（2026-09-26）

> 状态：**九包已发布到 npm 并完成 registry 内容核验**。文档站尚未部署，真实宿主尚未完成接入验收。

## 范围与源码

九个公开包统一为 `0.1.0-beta.2`：`contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`client-runtime`、`vite`、`vue`、`react`。发布源码为分支 `codex/vite5-update-ui-beta2` 的固定提交 `7dd0b285e939a444517662b5521bf875c4644a0f`。本记录及后续说明是文档提交，不改变该提交的包产物。发布使用 `next` 标签；`latest` 仍为 beta.1。

本版加入 Vite 5 适配、Vue／React 可选更新提示 UI 及业务接入文档与 Skill。对比页在发布前将 beta.1 与候选能力分开描述，发布后已更新为 beta.2 实际状态。更新提示默认不会自动刷新：用户确认后先接管新 worker，再显式刷新；位置、文案、背景／文字色值和刷新处理可由业务配置。Vue／React 在候选验证中还修复了恢复 worker 瞬时等待状态使提示误显示“更新已完成”的问题。

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

这些是平台隔离消费证据，不等于真实宿主的构建或部署验收。通用迁移步骤和 AI Skill 分别见[接入作业单](../../docs/guides/vite5-vue34-host-integration.md)及[Skill](../../.agents/skills/pwa-vite5-vue-integration/SKILL.md)。

## Registry 状态与后续发布边界

2026-09-26 04:54 UTC 和实际上传前，公共 npm registry 的九包均有 beta.1、没有 beta.2。账号所有者确认 npm 已登录并指示继续发布后，`latest`／`next` 均在 beta.1；从上述固定提交的干净检出执行 `pnpm publish --access public --tag next --no-git-checks`。npm 在首包与 `client-runtime` 各要求一次浏览器授权，由账号所有者完成。九包均返回发布成功，按依赖顺序逐包查询 registry；新版本文档曾短暂 404，等待传播后全部可查。

Registry `time` 记录的首末发布时间为 **2026-09-26T05:11:52.834Z–05:20:31.120Z**。九包 `next` 均指向 `0.1.0-beta.2`，`latest` 均仍指向 `0.1.0-beta.1`；没有修改 `latest`。需要 Vite 5 或可选 UI 的业务必须明确安装 beta.2。

逐包 `npm pack @pwa-platform/<包>@0.1.0-beta.2` 从 registry 下载。`contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`vue`、`react` 的压缩包与上文干净检出候选逐字节相同；`client-runtime`、`vite` 的压缩包字节不同，但解包后只在 `package.json` 字段顺序上有差异，解析后的 JSON 完全相同，其余文件逐字节相同。两包 registry tarball SHA-256 分别是 `75cc6c55926d06cf9c2d1d4692fa09a27fb0b70d4a2dc5df82a65996fb8df90f` 与 `5d823e4b000dd987818cad5d800b6e8fb9eda10b133a38f6ab4c661165a8706a`；其余七包哈希见候选表。

额外从 npm 直接安装 `@pwa-platform/vite@0.1.0-beta.2`、`@pwa-platform/vue@0.1.0-beta.2` 到独立 Node v22.22.0／pnpm 8.6.5／Vite 5.0.0／Vue 3.4.0 项目，类型检查、生产构建和 `vite dev` 冒烟均通过；构建产生 manifest、主 worker、恢复 worker 和更新提示 CSS。

已发布 tarball 内的三个包 README 仍写着“beta.1 尚不含 Vite 5／UI”；这是候选打包时漏改的**文档错误**，不影响包内容和上述运行验证，同一 npm 版本不可覆盖。仓库 README 已更正，后续版本的 tarball 需带入更正。文档站本次只更新源码、尚未按[独立发布流程](../../docs/operations/documentation-site.md)部署。

真实宿主的 CSS 清理、混淆、scope／origin、旧 PWA 清理和浏览器安装／更新验收需在其仓库依接入 Skill 完成。未经真实域名响应头、离线与恢复演练及发布通道矩阵证据，不宣称该宿主生产就绪。
