# npm 包发布流程

本流程只处理库包分发，不替代[业务应用生产发布门禁](release-and-incident-runbook.md)。首批范围与版本见[规格](../../spec/package-distribution.md)和[ADR-0028](../adr/0028-npm-prerelease-distribution.md)。首批九包已于 2026-09-20 发布，实际结果见[发布记录](../../tasks/package-distribution/release-2026-09-20.md)；后续的 [beta.1](../../tasks/package-distribution/release-2026-09-24.md) 与 [beta.2](../../tasks/package-distribution/release-2026-09-26-beta2.md) 各有发布记录。`0.1.0` 正式版增加 `entry-resilience`，十包实际发布与读回结果见[正式版发布记录](../../tasks/stable-release-qualification/release-0.1.0.md)，验收依据[正式版规格](../../spec/stable-release-qualification.md)和[验证记录](../../tasks/stable-release-qualification/verification.md)。`0.2.0` 的发布与核对结果见[0.2.0 发布记录](../../tasks/package-distribution/release-0.2.0.md)，后续见 [0.2.1](../../tasks/package-distribution/release-0.2.1.md) 与 [0.2.3](../../tasks/package-distribution/release-0.2.3.md) 发布记录（0.2.2 已准备但未发布）。以下门禁用于后续版本。

## 候选门禁

1. 确认本地 npm 身份为组织有权发布的账号，组织方案允许公开包，2FA 可用于发布；不要把令牌或 `.npmrc` 写入仓库。
2. 从干净副本执行 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm test:browser`、`pnpm test:onboarding-smoke`、`pnpm test:browser:engines`（不阻塞，ADR-0042）、`pnpm test:browser:network`（不阻塞，需联网）和 `pnpm audit --ignore-registry-errors`，记录环境、退出码与跳过项。浏览器测试需要本机回环端口。
3. 执行 `pnpm check:publish`。逐包 `pnpm pack --pack-destination <临时目录>`，检查包内 `package.json`、README、LICENSE、所有 `exports` 路径与依赖版本；扫描敏感信息与多余文件。从独立项目安装全部 tarball，再导入公开入口。
4. 确认本次目标版本（如 `@pwa-platform/*@0.1.0`）未在 registry 存在，审核最终 tarball 哈希和包列表。若任何包失败，停止整批发布并记录已发布项；同一版本不可覆盖，不用 `unpublish` 当回滚。
5. 正式版发布使用 `pnpm publish --access public --tag latest`，按下列依赖顺序逐包执行并完成 2FA；不要直接从工作区运行 `npm publish`，因为 `workspace:*` 需要 pnpm 打包转换。发布源码必须是已审核的干净提交；若本次确有不提交 Git 的明确要求，才从与审核源码一致的临时副本使用 `--no-git-checks`，并记录两者差异核对。每步查询 registry，确认 tarball 版本与标签符合记录。
6. **逐包等待可下载再发下一包**（2026-09-28 补充，见 [0.2.0 发布记录](../../tasks/package-distribution/release-0.2.0.md)）：registry 登记是异步的，0.2.0 中 `sw-runtime` 报告成功后约 5 分钟才可下载，而依赖它的包已经发布并把 `latest` 指向新版本，窗口内安装失败。每个包 `publish` 后，先确认 `https://registry.npmjs.org/@pwa-platform/<包>/-/<包>-<版本>.tgz` 返回 200，再发布依赖它的下一个包。发布循环开始前还要检查克隆中的版本号等于目标版本，否则不开始。
7. **暂存发布需要逐包批准**（2026-09-28 补充，见 [0.2.1 发布记录](../../tasks/package-distribution/release-0.2.1.md)）：npm 可能把 `publish` 先作为暂存版本，发布者在 npm 上认证批准后才公开；`Published package` 的输出不代表已公开，暂存期间 tarball 为 404。**按上面的依赖顺序批准**，公开顺序由批准顺序决定。已暂存的版本不能再次 `publish`（409），只能批准；不要为提速中断后重发。
8. **暂存状态的三种报错都表示“已提交过”**（2026-09-28 补充，见 [0.2.3 发布记录](../../tasks/package-distribution/release-0.2.3.md)）：非交互 shell 中 `pnpm publish` 报 `ERR_PNPM_OTP_NON_INTERACTIVE` 时版本可能已进入暂存；之后再发会得到 `409 ... previously staged`，批准后再发得到 `403 ... previously published`。遇到这三种情况都去 npm 批准或跳过该包，不要重发。发布须在交互终端中进行，以便完成 2FA。
9. **批量提交时，批准顺序就是公开顺序**（同上）：为提速可先把各包提交进暂存、再统一批准，但这放弃了第 6 条的逐包等待。此时必须严格按下方依赖顺序批准，且在被依赖的包可下载之前不要批准依赖它的包；0.2.3 中 `vite`、`vue`、`react` 先于 `sw-runtime` 公开，造成约 9 分钟 `npm install` 失败；0.2.4（约 4 分钟）与 0.2.5（约 2 分钟，`core` 最后公开）再次出现。**一次只批准一层**：批准后等该层每个包的 tarball 返回 200，再批准下一层（层次即下方“顺序”的六组）；不要在 npm 页面上一次性全部批准。
10. **引导 skill 的版本要跟着包走**（[ADR-0045](../adr/0045-ai-onboarding-skill-shipped-in-vite-package.md)）：升级 `@pwa-platform/vite` 的版本号时，同一提交里修改 `packages/vite/skills/pwa-onboarding/SKILL.md` 的 `metadata.version`，使两者相等；忘记时 `pnpm test` 里 `packages/vite` 的 skill 版本测试会变红。`pnpm check:publish` 还会核对只有 `@pwa-platform/vite` 的 `files` 含 `skills`、其余包与所有 `exports` 都不暴露它。
11. **文档站先于 `@pwa-platform/vite` 上线**（2026-09-29，[ai-onboarding](../../spec/ai-onboarding.md)）：清单只带文档站链接，文档不随包发布（离线时助手改读仓库副本，见 ADR-0045 的 2026-09-30 增补），文档站是助手与安装说明读者的首要来源，而文档站不随合并自动部署（见[文档站构建与部署](documentation-site.md)）。发布 `vite` 之前逐项核对，任一不满足就先按文档站流程从本次发布提交建立新的 `docs/v…` 版本分支并部署，不发布 `vite`：
    - 当前文档站生产分支与本次发布提交的 `website/` 没有差异；
    - `SKILL.md` 里的每个文档站链接返回 200；
    - 线上《选择接入包》含"用 AI 引导接入"一节（`id="ai-onboarding"`）。

    ```bash
    # DOCS_BRANCH 为文档站当前生产分支，如 docs/v2026.09.27-2
    git diff --stat "origin/$DOCS_BRANCH" HEAD -- website/
    grep -oE 'https://pwa-platform-docs\.pages\.dev/[a-z/-]+' packages/vite/skills/pwa-onboarding/SKILL.md | sort -u \
      | while read -r url; do echo "$(curl -s -o /dev/null -w '%{http_code}' "$url") $url"; done
    curl -s https://pwa-platform-docs.pages.dev/start/choose | grep -c 'id="ai-onboarding"'
    ```

    第一条输出为空、第二条全是 200、第三条不为 0 才算通过，结果写进本次发布记录。

## 顺序

1. `contracts`
2. `core`、`engine-workbox`、`build-verifier`
3. `sw-runtime`
4. `client-runtime`
5. `vite`
6. `entry-resilience`、`vue`、`react`

此前 beta 使用 `next`，而 npm `latest` 曾指向旧 beta。正式版逐包读回时要确认 `latest` 改指本次版本，`next` 的历史含义保持可追溯。真实项目生产接入前，仍须按发布通道（[ADR-0030](../adr/0030-desktop-release-channel.md)）补齐该通道的浏览器 N/N-1、原生安装、真实域名响应头、部署回滚和恢复演练证据：`desktop` 通道为 Chrome 桌面端，`desktop+android` 通道另加 Chrome Android。未经这些证据，不宣称业务应用已具备生产发布证据；在首次以 `desktop+android` 通道发布之前，不宣称 Android 是已通过门禁的支持平台。
