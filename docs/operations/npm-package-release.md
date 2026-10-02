# npm 包发布流程

本流程只处理 `@pwa-platform/*` 库包分发，不替代[业务应用生产发布门禁](release-and-incident-runbook.md)。历史版本的证据见 `tasks/package-distribution/release-*.md`。十个公开包共享一个版本；下面是代码已合入 `main` 后的常规正式版路径。

## 快速路径：复用 main 的验证

目标是从**已通过完整 CI 的 `main` 提交**到十包可安装约十分钟；npm 服务延迟与交互式 2FA 会影响实际时间。先核对该提交的完整 CI 结果和 SHA；若最新 `main` 尚未通过，等待它完成。版本分支只含十包版本号和 Vite 随包 skill 版本，不改运行时代码。若还要改源码或公开契约，先经正常 PR 与完整 CI 合入 `main`。

```bash
version=0.3.2  # 换成本次确定的目标版本
pnpm release:branch npm --version "$version" --create
git diff -- packages/*/package.json packages/vite/skills/pwa-onboarding/SKILL.md
git add packages/*/package.json packages/vite/skills/pwa-onboarding/SKILL.md
git commit -m "chore(release): prepare $version packages"
git push -u origin HEAD
```

以下代码块在同一个交互终端中继续执行，以保留 `version`、`out` 和 `names`；换终端时先恢复这三个值。发布负责人对整批发包授权一次，循环中不再逐包请求操作许可。

创建命令会获取最新 `origin/main`，确认十包原版本一致、工作区干净且分支名未占用，然后创建 `release/npm-<版本>` 并改写版本元数据。提交后核对 `git diff origin/main...HEAD --name-only` 只包含上述版本文件；发布时记录 `main` 基点与发布提交 SHA。无需为这次纯版本改动先开 PR、再跑一遍完整 CI。发布后的元数据、文档与发布记录合成**一次 PR** 回到 `main`，该 PR 自身仍遵守 main 的合并门禁。

## 一次本地候选检查

在干净的发布提交上执行以下命令。构建是为了产生要上传的 `dist`；归档安装冒烟会从 `pnpm pack` 生成的 tarball 安装公开入口，覆盖 `workspace:*` 改写、`files` 和 `exports`。`main` CI 已覆盖的 lint、全仓单测、typecheck、Chrome/Edge/WebKit/Firefox、联网套件及审计不在这里重复。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check:publish
pnpm test:onboarding-smoke

out="$(mktemp -d)"
names=(contracts core engine-workbox build-verifier sw-runtime client-runtime vite entry-resilience vue react)
for name in "${names[@]}"; do
  pnpm --filter "@pwa-platform/$name" pack --pack-destination "$out"
done
ls "$out"/*.tgz
shasum -a 256 "$out"/*.tgz
```

发布前只读确认本地 npm 登录账号有组织发布权限、十个目标版本尚未占用，并检查本批 tarball 数量、名称、SHA-256 与发布提交。`@pwa-platform/vite` 随包 skill 的文档链接必须仍可访问；若 `website/` 与线上生产文档不同，先按[文档站流程](documentation-site.md)上线相关内容。网站的“当前 npm 版本”可以在包公开后更新，不因此阻塞包发布。

## 批量提交，再集中验证

先连续提交全部十包，**中途不逐包查询版本或 `latest`**。使用已由 `pnpm pack` 改写依赖的 tarball，不从工作区直接运行 `npm publish`。以下以 npm 暂存发布为例；这是 0.3.1 实际采用的路径。若其中一个提交失败，停止循环，记录已提交项，先只读查明状态，不对未知结果盲目重发。

```bash
for name in "${names[@]}"; do
  npm stage publish "$out/pwa-platform-$name-$version.tgz" --access public --tag latest || break
done
# 整批提交结束后，再查看暂存状态和十个归档的提交结果。
npm stage list
```

暂存版本要通过 `npm stage approve <stage-id>` 才公开。十包全部暂存后，按下方六层依赖顺序批准；每层批准后只确认该层 tarball 返回 HTTP 200，再批准下一层，避免上层已公开而下层尚不可下载。完整版本与 `latest` 检查仍留到整批结束。npm 官方要求**每个**暂存批准都做 2FA；本地登录或一次操作授权不能免除它。若使用直接 `npm publish <tarball>`，也保持同一批量提交顺序，并在全部命令结束后集中验证；直接发布可能产生短暂依赖可下载窗口。

## 顺序

依赖层次为 `contracts`；`core`、`engine-workbox`、`build-verifier`；`sw-runtime`；`client-runtime`；`vite`；`entry-resilience`、`vue`、`react`。

待整批提交和所需批准完成后，一次性核对十个包的版本、`dist-tags.latest`、tarball HTTP 200 与下载内容，并从全新消费项目安装、导入全部公开入口。失败时记录已公开项和待处理项；已发布的同一版本不可覆盖，也不以 `unpublish` 当回滚。最后更新网站当前版本、README、CHANGELOG 与发布记录，合成一次 PR，待 main CI 通过后按文档站流程部署。npm 包全部可安装即为本流程的发布完成点，文档收口单独计时。

## 适用边界

预发布版须按目标 dist-tag 另行核对，不照抄上面的 `latest`。首次公开新包、发布范围变化、依赖或打包规则变化，以及 `main` CI 证据缺失时，按实际差异补做相应验证。业务应用的生产接入仍按 [ADR-0030](../adr/0030-desktop-release-channel.md) 完成对应通道的浏览器、原生安装、真实响应头、部署回滚和恢复演练证据；npm 包可安装不表示业务应用已通过这些门禁。
