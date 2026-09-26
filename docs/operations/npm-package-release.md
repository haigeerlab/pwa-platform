# npm 包发布流程

本流程只处理库包分发，不替代[业务应用生产发布门禁](release-and-incident-runbook.md)。首批范围与版本见[规格](../../spec/package-distribution.md)和[ADR-0028](../adr/0028-npm-prerelease-distribution.md)。首批九包已于 2026-09-20 发布，实际结果见[发布记录](../../tasks/package-distribution/release-2026-09-20.md)；后续的 [beta.1](../../tasks/package-distribution/release-2026-09-24.md) 与 [beta.2](../../tasks/package-distribution/release-2026-09-26-beta2.md) 各有发布记录。`0.1.0` 正式候选新增 `entry-resilience`，本次验收依据[正式版规格](../../spec/stable-release-qualification.md)和[验证记录](../../tasks/stable-release-qualification/verification.md)。以下门禁用于后续版本。

## 候选门禁

1. 确认本地 npm 身份为组织有权发布的账号，组织方案允许公开包，2FA 可用于发布；不要把令牌或 `.npmrc` 写入仓库。
2. 从干净副本执行 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm test:browser` 和 `pnpm audit --ignore-registry-errors`，记录环境、退出码与跳过项。浏览器测试需要本机回环端口。
3. 执行 `pnpm check:publish`。逐包 `pnpm pack --pack-destination <临时目录>`，检查包内 `package.json`、README、LICENSE、所有 `exports` 路径与依赖版本；扫描敏感信息与多余文件。从独立项目安装全部 tarball，再导入公开入口。
4. 确认本次目标版本（如 `@pwa-platform/*@0.1.0`）未在 registry 存在，审核最终 tarball 哈希和包列表。若任何包失败，停止整批发布并记录已发布项；同一版本不可覆盖，不用 `unpublish` 当回滚。
5. 正式版发布使用 `pnpm publish --access public --tag latest`，按下列依赖顺序逐包执行并完成 2FA；不要直接从工作区运行 `npm publish`，因为 `workspace:*` 需要 pnpm 打包转换。发布源码必须是已审核的干净提交；若本次确有不提交 Git 的明确要求，才从与审核源码一致的临时副本使用 `--no-git-checks`，并记录两者差异核对。每步查询 registry，确认 tarball 版本与标签符合记录。

## 顺序

1. `contracts`
2. `core`、`engine-workbox`、`build-verifier`
3. `sw-runtime`
4. `client-runtime`
5. `vite`
6. `entry-resilience`、`vue`、`react`

此前 beta 使用 `next`，而 npm `latest` 曾指向旧 beta。正式版逐包读回时要确认 `latest` 改指本次版本，`next` 的历史含义保持可追溯。真实项目生产接入前，仍须按发布通道（[ADR-0030](../adr/0030-desktop-release-channel.md)）补齐该通道的浏览器 N/N-1、原生安装、真实域名响应头、部署回滚和恢复演练证据：`desktop` 通道为 Chrome 桌面端，`desktop+android` 通道另加 Chrome Android。未经这些证据，不宣称业务应用已具备生产发布证据；在首次以 `desktop+android` 通道发布之前，不宣称 Android 是已通过门禁的支持平台。
