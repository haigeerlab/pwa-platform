# 验证记录：cloudflare-test-deployment

## 2026-09-21：T1/T2 本地门禁

- 只读 `wrangler pages project list --json`：当前账户只返回 `pwa-t15-mobile-smoke`；React/Vue 候选项目尚不存在。此列表不能证明名称全局可用。
- `pnpm typecheck --filter @pwa-platform/examples-browser-e2e`：通过；默认共享 fixture 身份未变。
- `node scripts/build-cloudflare-site.mjs --target=react|vue --slot=main --origin=https://<测试 origin>`：两站分别构建成功，各 11 个白名单文件，产物分置 `build/cloudflare/react/...` 与 `build/cloudflare/vue/...`。`.invalid` origin 只用于本地试构建。
- `node scripts/build-cloudflare-site.mjs --target=react --mode=dry-run --origin=https://react.example.invalid`：输出明确的项目、槽位与上传目录；未知目标拒绝。
- `node scripts/deploy-cloudflare-site.mjs --target=react --mode=check`：`.invalid` 构建在读取凭据前拒绝；使用候选 Pages 域名重建后，因项目尚不存在而拒绝；未上传。
- 负向检查：在 staging 中篡改 `_headers` 后，部署前 SHA-256 检查拒绝；即使同时改写本地回执并加入模拟 `app/.env`，独立上传白名单仍拒绝。两次均已还原 staging 与回执。
- `pnpm lint`：修正 ESLint 对新生成目录的扫描后通过。
- `pnpm test:browser --filter @pwa-platform/examples-browser-e2e`：桌面 Chrome 153.0.8010.50，37 passed、2 skipped；跳过项仍是真实 `beforeinstallprompt` 未取得，不计安装通过。
- Wrangler `pages deployment list --json` 在既有冒烟项目的只读查询返回数组，说明首次发布保护所用响应形态与当前 CLI 一致。

## 首次部署时尚缺的证据（以下 T5 记录更新了部分结论）

React/Vue 项目、实际 origin、线上静态响应头与桌面 Chrome 首次在线／离线证据已在下节取得。真实安装 UI、Chrome N-1、旧资产保留、版本更新和恢复演练仍未取得。部署脚本对已有生产部署 fail-closed；T5 完成前不允许再次发布。Nuxt Worker 未通过本地启动门禁，Android 和远端 CI 均无证据。本记录不构成正式 V1 发布批准。

## 2026-09-21：T3/T4 首次线上部署与桌面 Chrome 现场验证

- Cloudflare Pages 使用账户内独立 Direct Upload 项目 `pwa-platform-react-demo` 和 `pwa-platform-vue-demo`，主域名分别为 <https://pwa-platform-react-demo.pages.dev/app/>、<https://pwa-platform-vue-demo.pages.dev/app/>；原 `pwa-t15-mobile-smoke` 未迁移。Wrangler 首次创建时因当前 CLI 从 monorepo 根目录委派到 Workers 检测而失败，按 CLI 明示选项在项目创建命令使用一次 `--force`；此后不再需要该选项。
- `node scripts/build-cloudflare-site.mjs --target=react|vue --slot=main --origin=https://<对应项目>.pages.dev`：使用真实 origin 构建成功，各 11 个文件（包括根级 `_headers`）；`node scripts/deploy-cloudflare-site.mjs --target=react|vue --mode=check` 对项目实际域名、SHA-256、文件白名单和首次生产部署条件通过，然后各执行一次 `--mode=deploy`。Wrangler 每站上传 10 个公开文件及 `_headers`。
- Cloudflare 只读 `pages deployment list --environment=production --json`：React 只有 1 条生产部署，ID `4e5f259f-c985-4c2d-9c76-853c5b33a107`，部署 URL <https://4e5f259f.pwa-platform-react-demo.pages.dev>；Vue 只有 1 条，ID `96522b51-ed42-4d76-b06c-92325d63a909`，部署 URL <https://96522b51.pwa-platform-vue-demo.pages.dev>。两者分支均为 `main`。
- 首次部署成功后将完整且互不重叠的 `test` 身份分别保存为 `packages/examples-browser-e2e/apps/shared/release-baseline/react-main.json` 和 `vue-main.json`；均为 `/app/` scope、`r1` 初始缓存命名空间种子，origin、appId 不同。两份 JSON 以 `@pwa-platform/contracts` 的 `validateIdentity` 验证均为 `ok: true`。后续构建的自动逐字段比较尚未接入当前 Pages 部署门禁，纳入 T5。
- 通过 Node `fetch`（保持 TLS 证书校验）逐项请求两个主域名的 10 个公开文件，均 HTTP 200 且 SHA-256 与各自本地 `build.json` 完全一致。`/app/index.html` 最终 URL 为 `/app/`，`/app/offline.html` 最终 URL 为 `/app/offline`，内容摘要保持一致。HTML、manifest、worker、离线页是 `Cache-Control: no-cache`；带指纹 JS 是 `public, max-age=31536000, immutable`；图标为 `public, max-age=0, must-revalidate`。
- 独立无旧站点数据的 Google Chrome 153.0.8010.50 headless profile：两站 `/app/` 均 HTTP 200，分别渲染 React/Vue 示例，显示 `v1` 和 `registered`，Service Worker 实际取得页面控制权；各自 manifest 的 `id`、`scope`、`start_url` 均为 `/app/`（完整身份还包含独立 origin 和各自 `appId`）。断网刷新预缓存 shell 仍显示 `v1`；断网访问未预缓存 `/app/never-precached` 显示 `You are offline`，不显示 shell；两站均无 pageerror。这证明静态离线兜底，不证明业务 API 运行时缓存。
- 再次执行两站 `node scripts/deploy-cloudflare-site.mjs --target=<host> --mode=check`，均因已存在生产部署且旧资产保留门禁未交付而按预期拒绝，没有再次上传。
- 这次现场浏览器测试没有触发真实 `beforeinstallprompt`，没有 N-1 浏览器、人工安装交互、更新提示、Pages 回滚或恢复 worker 演练。React/Vue 完成的是首发在线／离线冒烟；这些缺项继续由检查点 B/T5 跟踪。
- 初次 Python `urllib` 核验因本机证书存储报 `CERTIFICATE_VERIFY_FAILED`，未作为站点失败。未关闭 TLS 校验；改用系统 Node 证书链的 HTTPS 请求并核对摘要，全部通过。第一次 headless Playwright 默认 Chromium 因本机未安装对应 executable 失败，随后使用现有 Chrome stable channel 完成现场测试。以上是工具环境限制，不计站点失败。

## 2026-09-21：T5 旧资源保留前置检查（演练前记录）

- 新增 `scripts/archive-cloudflare-site.mjs`。以 Cloudflare 当前生产部署 ID、首次构建回执和线上 HTTPS 字节三方核对，分别把 React 与 Vue 首次发布的 1 个带指纹 JS 归档在 `build/cloudflare/<host>/retained/main/`。归档目录不进入上传 staging，也未进入 Git；它只支持当前机器的受控测试，不能作为正式发布的持久制品证据。
- 两站重新构建后，旧指纹资源均被带入隔离 staging；`node scripts/deploy-cloudflare-site.mjs --target=<host> --mode=check` 均通过，返回 `firstDeployment: false`、`retainedAssets: 1`。门禁逐一比对归档记录、当前 Cloudflare 部署 ID、staging SHA-256 与线上旧资源字节。
- React 反向检查：临时移走归档 manifest，`check` 拒绝；临时篡改 staging JS，SHA-256 检查拒绝。两者均在 `finally` 中恢复，未上传。`--mode=deploy` 在所有只读检查通过后仍因隔离更新／恢复演练未完成而拒绝，没有调用 Wrangler 上传。
- **仍缺：** 隔离槽位 v1→v2 更新提示、恢复 worker 接管及缓存清理、再次正常发布、Pages 生产回滚、Chrome N-1、真实安装 UI 和跨机器持久归档。Cloudflare 官方说明[预览部署不能作为生产回滚目标](https://developers.cloudflare.com/pages/configuration/rollbacks/)；两类演练应分开记录。T5 不标记完成，两站现有生产部署未改变。

## Nuxt Workers 可行性门禁（T6 已执行，结果为不通过）

- 当前 Nuxt fixture 在 `packages/nuxt/browser-tests/site/nuxt.config.ts` 设置 `/app/` base、请求时渲染页及预渲染页；现有浏览器测试的服务端入口是 Nitro `node-server`，并无 Cloudflare preset 配置。
- [Cloudflare 官方 Nuxt Workers 指南](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/nuxt/)给出的候选产物为 `.output/server/index.mjs` 与 `.output/public`，要求 `nodejs_compat`，使用 `cloudflare` preset。该指南不证明本仓库的 Nuxt 模块与该 preset 兼容。
- `pnpm build --filter @pwa-platform/nuxt` 通过；`pnpm --filter @pwa-platform/nuxt exec nuxt build browser-tests/site --preset=cloudflare` 在 Nuxt 4.5.2／Nitro 2.13.4 下通过，生成 `.output/server/index.mjs`、`.output/public`，后者包含 `sw.js`、manifest 与离线页。此结果只证明可编译。
- 用本地临时 Wrangler 配置（`nodejs_compat`、2026-09-01、Workers Assets）执行 `wrangler dev --local`，Worker 启动失败：`No such module: node:buffer`。命令行再次显式传入 `--compatibility-flags=nodejs_compat`，错误不变。`wrangler deploy --dry-run` 可以本地打包，但不会启动 Worker；它不能替代运行证据。
- 隔离诊断：使用同一 Wrangler 4.134.0、2026-09-01 兼容日期和 `nodejs_compat` 运行仅导入 `node:buffer` 的临时 ES Module Worker，`GET /` 返回 `node-buffer-ok`（HTTP 200）。直接以现有 Nuxt `.output/server/index.mjs` 和 `.output/public`、相同兼容选项启动，仍报 `No such module: node:buffer`。这将问题收窄为 Nuxt 构建产物与 Wrangler/workerd 的组合，不能归因于本机完全不支持 Node 内建模块。Wrangler `deploy --dry-run --outdir` 仍只证明可以打包；临时探针和打包目录已删除。
- 因 Nuxt Worker 未启动，`/app/` 的静态资源映射、请求时 SSR、响应头与 PWA 恢复均未验证。具体触发点尚未定位，也不能据此断言 Cloudflare 线上必然失败。T6 的可行性检查已执行且结论为不通过；不创建正式 Nuxt Worker，SSR 线上能力仍未验证。

## 2026-09-21：T5 隔离预览更新与恢复演练

- 按 [Cloudflare 预览部署说明](https://developers.cloudflare.com/pages/configuration/preview-deployments/)在原 React/Vue Pages 项目使用 `--branch=drill` Direct Upload；该参数只生成 Pages 预览标签，没有创建 Git 分支。先上传无 SW 的中性引导页，然后以实际别名 <https://drill.pwa-platform-react-demo.pages.dev/app/> 与 <https://drill.pwa-platform-vue-demo.pages.dev/app/> 分别构建 v1。预览身份 `pwareactdrill`、`pwavuedrill` 与主站身份不同；`react-drill.json`、`vue-drill.json` 已冻结，`validateIdentity` 均通过。两个预览页首次受控、静态离线页和全部文件 SHA-256 通过；`X-Robots-Tag: noindex` 在实际静态响应上确认。v1 部署 ID：React `5eaa3d51-1424-4a8e-af45-7cb04d2367ed`；Vue `67e12c1b-8fe4-4a12-bf6d-619cb2e16295`。
- 先归档各站 v1 指纹资产，构建并上传 v2；新旧两份指纹 JS 均随上传继续可访问。受控桌面 Google Chrome 153.0.8010.50 保持 v1 页面打开：两站均检测到 waiting worker 和可见更新按钮；点击后 `controllerchange` 发生但当前页面不自动重载、页面状态保留、提示消失；手动重载后显示 v2，离线导航仍到 `You are offline`，无 `pageerror`。React 此次验证的 v2 部署 ID `c9296e5f-3b56-4f67-a00c-39b09187a992`；Vue 为 `903efa2d-5b42-4560-ac22-a3877e07c23e`。React 曾因测试脚本从 stdin 读取源码又等待 stdin 触发而挂起；终止测试进程、将 React 预览别名重新上传 v1 后，用文件信号重新执行并通过。这是测试协调错误，不是页面更新失败。
- 恢复 worker 分别以 `--release=recovery` 部署到两站独立预览别名；React 部署 ID `e7ac7e55-8f88-4d97-b091-927f0fb73ff9`，Vue 为 `60b2aa55-7e14-48c3-ac9c-c664a17d8f6d`。在受控页面提前建立 `test:r1`、`test:r0` 缓存和同 appId 的 `staging:r1` 旁侧缓存。调用 `registration.update()` 后，两站在 `controllerchange` 即时和约 0.5 秒时仍处于 `activating`，本应用缓存尚在；约 2 秒时状态成为 `activated`，`test:r1`/`test:r0` 已清空、`staging:r1` 仍在；10 秒再次核对结果稳定。React 首轮测试只观察接管瞬间，误报清理失败；有界复测明确了状态时序。Vue 首次访问虽然已有 activated 注册，但无页面 controller；重载后取得受控页面，再完成演练。以上不证明恢复 worker 可清除业务私有数据，当前演练仅针对本应用命名空间缓存。
- 恢复发布后，两站分别归档旧指纹资源并重新 Direct Upload 正常 v2。最终预览部署 ID：React `37de0c78-d26b-400f-8e8c-c0c9bf048bce`；Vue `6d1170ee-f135-4b04-8685-b07b949e6cd4`。归档脚本以当前部署 ID、staging 和线上字节互证，现有 `retained/drill` 各保留 v1/v2 两份指纹 JS。Node HTTPS 校验：两站 `main` 各 10 个文件、`drill` 各 11 个文件均 HTTP 200 且 SHA-256 匹配构建回执。`main` HTML/manifest/worker/offline 为 `no-cache`；`drill` 同样为 `no-cache` 且有 `noindex`；两槽带指纹 JS 均为 `public, max-age=31536000, immutable`。新建 Chrome profile 再访两个 `drill`：均显示 v2、取得 SW 控制权、断网访问未预缓存路径显示 `You are offline`，无 `pageerror`。既有 `main` 一直保持首次 v1，未在此演练中上传。
- **尚缺：** Cloudflare [原生 Pages 生产回滚](https://developers.cloudflare.com/pages/configuration/rollbacks/)没有演练；预览部署不能作为生产回滚目标。当前 `main` 的再次 `--mode=deploy` 仍由脚本阻止。被忽略的本地归档不是可迁移／跨机器的七天持久制品。该次记录时桌面 Chrome N-1、真实安装 UI、Android/iOS、远端 CI 仍无证据；后续 Chrome 152 测试补齐了检查点 B，T5 与正式 V1 门禁仍未完成。

## 2026-09-21：本轮收口检查

- 恢复两站后重新归档当前 `drill` 部署，并各重建一次 v2 staging；两站 `--slot=drill --mode=check` 均通过，`retainedAssets: 2`。两站 `main` 各重建 v1 staging，`--slot=main --mode=check` 均通过，`retainedAssets: 1`；没有向 `main` 再上传。
- `pnpm lint`、`pnpm typecheck --filter @pwa-platform/examples-browser-e2e` 和 `git diff --check` 均通过。两个示例的 `src/version.ts` 仍为 `v1`；Wrangler 生成的空 `.wrangler/tmp` 目录已移除。未提交、推送或触碰旧 tracker 映射。
- Spec Guard `verify-artifacts.sh`：2 通过、0 失败，另提示存在历史状态文件；`phase-guard.sh` 只报告 `LEGACY_TRACKER_RETIRED`，没有读取映射或联系 tracker。`documentation_verification.py --module cloudflare-test-deployment` 返回 `attention`，原因是本模块操作文档交付仍声明 `pending`（Pages 原生生产回滚和持久制品库尚缺），不是脚本执行失败。

- 下载前本机浏览器清单显示稳定 Chrome `153.0.8010.50`、Canary 156 和已缓存的 Chrome for Testing 151/149/148/145，没有 Chrome 152。额外用已安装的 Chrome for Testing `151.0.7922.34` 对两个 `drill` 预览站执行独立 profile 在线 v2、SW 控制、未预缓存离线页测试，均通过且无 `pageerror`。这是较旧桌面版本的兼容性证据，**不等同于计划要求的 N-1（Chrome 152）**。

## 2026-09-21：桌面 Chrome N-1 门禁

- 从 [Chrome for Testing 官方里程碑清单](https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone-with-downloads.json)确定 mac-arm64 的 Chrome `152.0.7977.82`，下载官方 ZIP 到 `/private/tmp`。HTTP `Content-Length` 与本地实际大小均为 `187616945` 字节，`unzip -tq` 报压缩数据无错误；Playwright 启动报告版本 `152.0.7977.82`。没有改依赖、锁文件或正式 Playwright 配置。
- 以 Chrome 152 独立 profile 访问 React/Vue 的 `main` 和 `drill` 四个真实 HTTPS 槽位：四项均 HTTP 200，分别渲染预期 v1/v2、取得本 origin 的 SW controller、manifest scope `/app/`、独立 appId 的预缓存，断网访问未预缓存路径显示静态离线页，且无 `pageerror`。Chrome 153 的对应在线／离线证据和四槽实际缓存头、SHA-256 核验见前节。
- 用一次性 Playwright 配置将仓库现有 39 个浏览器场景的 `channel=chrome` 替换为上述 Chrome 152 可执行文件，仅供本次运行，完成后自动删除临时配置。结果：`37 passed`、`2 skipped`，包括两宿主的更新、恢复 worker、离线页与发布检查。两项 skip 是浏览器未自行触发真实 `beforeinstallprompt`；安装 UI 仍无现场通过证据。原配置未修改。
- 因 N/N-1 桌面场景与现场响应头已有证据，检查点 B 标记完成。这是 PC 测试站证据，不补足 Android/iOS、真实安装交互或正式 V1 发布门禁。

## 2026-09-21：持久制品与原生回滚前置核对

- [Cloudflare Pages 官方回滚文档](https://developers.cloudflare.com/pages/configuration/rollbacks/)及[回滚 API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/rollback/)确认：只有先前成功的生产部署能作为原生回滚目标，预览部署不能作为目标；当前 React/Vue `main` 各只有一个生产部署，尚不能形成真实的前后版本回滚测试。
- [Cloudflare R2 官方说明](https://developers.cloudflare.com/r2/buckets/create-buckets/)确认新 bucket 默认私有；[R2 认证说明](https://developers.cloudflare.com/r2/api/tokens/)要求先启用 R2，并支持仅限指定 bucket 的 S3 Object Read & Write 凭据。使用现有 Pages Token 只读尝试 `wrangler r2 bucket list` 返回认证／权限错误，没有创建 bucket 或对象，也没有把 Pages Token 扩权。
- 已在操作手册和 T5 计划记录候选制品先上传并读回、部署 ID 索引、R/R-1/R-2 与至少七天资源保留、原生回滚后核对当前版指纹资源的实施顺序。此处仍是设计和只读前置检查，不能计为持久归档或 Pages 回滚通过。

## 2026-09-21：本地完整发布制品

- 新增 `bundle:cloudflare:site` 和 `restore:cloudflare:site`。打包前核对全部 staging 文件 SHA-256 与冻结身份；包内有完整 `site/`、`build.json`、`identity.json`，输出按 tarball SHA-256 命名，并在写出前执行一次解包、文件清单与字节往返核验。恢复脚本再次核对内容摘要、路径类型、目标、身份、完整文件清单和每个文件摘要，拒绝符号链接。
- React/Vue 的 `main`/`drill` 四槽均打包并通过 `restore --mode=check`，最终规范化制品的大小分别为 React main `180538`、drill `297844`、Vue main `107790`、drill `151955` 字节。React `main` 从包重建本地 staging 后，`deploy-cloudflare-site.mjs --mode=check` 再次通过，`retainedAssets: 1`；没有上传。构造包含跳出目录符号链接的恶意 tarball，恢复检查按预期拒绝，并在测试后删除。`pnpm lint` 已通过。
- 上述包仍只在被忽略的本地 `build/cloudflare/release-bundles/`；尚未上传 R2、没有远端读回、没有部署 ID 索引，不能称为跨机器持久归档。Cloudflare 控制台浏览器仍在登录页，现有 Pages Token 和 Wrangler OAuth 对 R2 查询均返回权限错误；未创建 R2 bucket 或凭据。

- 发现 macOS `tar -czf` 将当前时间写入 gzip 头，导致相同输入重复打包得到不同摘要。改为先规范化临时副本时间戳、生成 tar，再由 Node gzip（零时间戳）压缩；React main 连续两次打包返回同一 SHA-256。四槽最终本地制品摘要：React main `3db84d74126aaa8912422ba7369667f2d2bd2731494c7cc455a3473cbc5d10e1`、drill `647e14c38823d97c715b25420e38fe08c5f0b79dc1e516ec31682d4700437d4f`；Vue main `b9d9a537dc68a666a38777a5560c532fea3642c668fe7f2be029370453f50998`、drill `0114668f16fd429591bfe93cabffb4dcde2c0d62bae6277c9d946149d52bb6f9`。四个最终包均再次通过 `restore --mode=check`，早期重复包已从被忽略的本地目录清理。

- 外发前检查按最小披露原则将包内 `build.json.uploadDirectory` 规范化为相对值 `site`；恢复时再绑定当前工作区路径。四个最终包解压后的字节扫描均未出现本机 `/path/to/user/` 路径、Cloudflare Pages Token 环境变量名、钥匙串服务名或 R2 Secret Key 环境变量名；包内只包含白名单静态站文件、构建回执和冻结身份。此扫描不替代真实 R2 私有读回验证。
- 已准备基于 R2 S3 API 的 `r2:cloudflare:bundle` 传输命令，使用桶级凭据和 curl SigV4，从标准输入传入凭据，支持上传、下载与读回字节比对。缺凭据时按预期拒绝，**尚未对真实 R2 验证签名兼容性或上传任何对象**。

## 2026-09-21：私有 R2 制品库实测

- 用户在 Cloudflare 浏览器中完成 R2 用量计费订阅；同账号账单订阅页显示 R2 Active。R2 主页显示本周期账单用量 `$0.00`、当前无 bucket 与对象；这只是创建前的现场值，不是未来费用保证。官方 Standard 免费额度见[价格页](https://developers.cloudflare.com/r2/pricing/)。
- 浏览器创建 `pwa-platform-release-artifacts` bucket：Standard、APAC、Public Access Disabled；设置页显示无自定义域、公开开发 URL 关闭。与本机 Pages Account ID 钥匙串项做等值比较，结果 `true`；未输出账号 ID 或凭据。
- 创建名称 `PWA Platform release artifacts` 的 R2 Account API Token；Cloudflare 列表显示仅适用于 `pwa-platform-release-artifacts`、`Object Read & Write`、到期 2027-09-21。S3 Access Key ID 与 Secret Access Key 分别写入本机钥匙串并回读核验，剪贴板随后清空；未写入仓库、构建回执或本记录。现有 Pages Token 没有因此扩权。
- `pnpm r2:cloudflare:bundle --target=<host> --slot=<slot> --sha256=<制品摘要> --mode=upload` 对 React/Vue 的 `main`/`drill` 四槽全部返回 `readBackVerified: true`；每槽归档与 JSON 清单各一个对象，脚本对真实 R2 S3 SigV4 PUT、GET 和字节比较均通过。摘要分别为 React main `3db84d74126aaa8912422ba7369667f2d2bd2731494c7cc455a3473cbc5d10e1`、drill `647e14c38823d97c715b25420e38fe08c5f0b79dc1e516ec31682d4700437d4f`，Vue main `b9d9a537dc68a666a38777a5560c532fea3642c668fe7f2be029370453f50998`、drill `0114668f16fd429591bfe93cabffb4dcde2c0d62bae6277c9d946149d52bb6f9`。
- React `main` 的本地归档与清单临时移至系统临时目录，仅由 `--mode=download` 从 R2 重建；下载流程的 `restore --mode=check` 通过，两个重建文件与原件逐字节相同。成功后临时原件自动清理；此次演练未触发失败分支。此为单机模拟跨机器恢复，不等于独立设备或事故演练。
- 未对 Pages `main` 再上传；四槽在线部署 ID 保持原记录。部署 ID→制品索引、远端缺失／篡改反例、保留窗口自动检查与 Pages 原生生产回滚尚未完成，因此 `main` 再次部署门禁保持关闭，T5 未完成。
- 本轮 `pnpm lint` 与 `git diff --check` 均通过；锁文件无新增改动，未提交或推送。R2 控制台在上传后显示本周期 billable usage 为 `$0.00`，A/B 类操作已有计数；账单用量是当时的观察值。

## 2026-09-21：当前 Pages 部署与 R2 制品索引

- 依据[Pages 官方回滚约束](https://developers.cloudflare.com/pages/configuration/rollbacks/)，预览部署不能作为原生生产回滚目标；依据[R2 S3 兼容性](https://developers.cloudflare.com/r2/api/s3/api/)，`PutObject` 支持 `If-None-Match`。新增 `r2:cloudflare:index`：先核验本地及远端制品、当前 Pages 部署 ID、完整归档回执和全部线上公开文件 SHA-256，再以条件写入记录，最后从 R2 读回核对。记录只包含项目、槽位、制品摘要、文件计数及时间，不包含密钥或个人资料。
- React `main` 在索引尚不存在时运行 `--mode=check`，明确报 `R2 deployment index is missing`，且没有写入；故意传入全零的非当前部署 ID 执行 `--mode=record`，在写入前报 `Deployment ID is not current for the registered Pages slot`。
- 四个现有部署均执行 `--mode=record` 并返回 `indexVerified: true`：React main `4e5f259f-c985-4c2d-9c76-853c5b33a107` 对应 `3db84d74126aaa8912422ba7369667f2d2bd2731494c7cc455a3473cbc5d10e1`，线上核验 10 文件；React drill `37de0c78-d26b-400f-8e8c-c0c9bf048bce` 对应 `647e14c38823d97c715b25420e38fe08c5f0b79dc1e516ec31682d4700437d4f`，11 文件；Vue main `96522b51-ed42-4d76-b06c-92325d63a909` 对应 `b9d9a537dc68a666a38777a5560c532fea3642c668fe7f2be029370453f50998`，10 文件；Vue drill `6d1170ee-f135-4b04-8685-b07b949e6cd4` 对应 `0114668f16fd429591bfe93cabffb4dcde2c0d62bae6277c9d946149d52bb6f9`，11 文件。根级 `_headers` 不是可直接请求的公开文件，单独由包内回执和归档校验覆盖。
- 此次没有向 Pages 上传或执行回滚。已有索引只覆盖当前四个部署；候选制品先归档、Pages 上传后立即建索引、保留窗口与原生回滚的串行门禁尚未实现，`main` 重复部署仍阻断。

## 2026-09-21：两站 main v2 发布与 Pages 原生回滚

- [Cloudflare Pages 官方文档](https://developers.cloudflare.com/pages/configuration/rollbacks/)说明回滚目标须为先前成功的生产部署；经 Pages 部署详情 API 读取，React v1 `4e5f259f-c985-4c2d-9c76-853c5b33a107` 与 v2 `18824a5c-9103-41a5-953b-0efaedf4360a` 的 `latest_stage.status` 均为 `success`，环境均为 `production`。Vue v1/v2 也通过各自 R2 索引的生产成功状态核验。
- React `pnpm build:cloudflare:site --target=react --slot=main --release=v2` 生成 12 文件，含原 v1 指纹脚本。候选制品 SHA-256 为 `886a7412eea09101d52478dec569fad76728e49bc8027fdfef1fa42f148618c9`，R2 上传读回与 `deploy --mode=preflight` 均通过。Pages Direct Upload 创建 v2 部署 `18824a5c-9103-41a5-953b-0efaedf4360a`；`r2:cloudflare:index --mode=record` 核验 11 个公开文件并写入索引；`archive:cloudflare:site` 保留 v1/v2 两个指纹脚本。
- React 调用 Pages 官方回滚 API 指向 v1 后，主域名 `/app/index.html` 的 SHA-256 为 v1 回执值 `52a47cb501030df460e79e1bbad710e8400fe8721ad689916b22781cce0ec113`；另用完整 v1 制品回执验证 10 个线上公开文件。v1 指纹脚本及后来 v2 指纹脚本均返回 HTTP 200 且 SHA-256 匹配各自回执；桌面 Chrome 重载显示 `v1`。再以同一 API 指向 v2，Pages 项目的 `canonical_deployment.id` 恢复为 `18824a5c-9103-41a5-953b-0efaedf4360a`；v2 索引的 11 个线上文件核验通过，Chrome 重载显示 `v2`。
- 原 `r2:cloudflare:index --mode=check` 在 React 回滚到 v1 后误报：Wrangler 部署列表第一条仍是按创建时间排序的 v2，并非当前生产部署。Pages 项目 API 显示 `latest_deployment.id` 为 v2，而 `canonical_deployment.id` 为 v1；因此修正索引、部署预检、资产归档脚本：`main` 用 `canonical_deployment` 和成功状态判断当前版本，`--mode=history` 核验历史版成功状态与 R2 制品。回到 v2 后，索引 `--mode=check` 重新通过。错误发生在核验脚本，未影响已经成功的 Pages 回滚或 v1 文件逐项核验。
- Vue `pnpm build:cloudflare:site --target=vue --slot=main --release=v2` 生成 12 文件并保留 v1 指纹脚本。候选制品 SHA-256 为 `f360576124bfcab370c5e7f2cdffec36aba2b35009fd11a039a70d2e1ad2b94b`，R2 上传读回和部署预检通过。新部署 `5f1ac456-9416-4c35-bf72-b4b782d13e66` 的索引核验 11 个公开文件，归档含 v1/v2 两个指纹脚本；桌面 Chrome 重载显示 `v2`。
- Vue 原生回滚至 v1 `96522b51-ed42-4d76-b06c-92325d63a909` 后，`r2:cloudflare:index --mode=check` 以 `canonical_deployment` 确认当前部署并逐项验证 10 文件。主域名的 v1 `app/index.html`、v1 指纹脚本 `index-BnUQ36ol.js` 和 v2 指纹脚本 `index-BmhQk3Lq.js` 均返回 HTTP 200，SHA-256 与归档相符；桌面 Chrome 显示 `v1`。再用原生 API 恢复 v2，索引逐项验证 11 文件，Chrome 显示 `v2`。
- 两站最后均按当前 v2 的本地资产归档重新构建 staging，`deploy:cloudflare:site --mode=check` 通过且保留资产计数为 2。两站现有 `/app/`、manifest、worker、离线页经 HTTPS 检查均为 HTTP 200；HTML、manifest、worker、离线页均返回 `Cache-Control: no-cache`，manifest 与 worker 类型正确。实际上传时的构建回执仍在各自 R2 v2 制品内；重新构建的本地 `build.json` 已供下一次候选使用，不能当作本次上传回执。
- 两站回滚／恢复后，桌面 Chrome 都曾显示 “A new version is ready”。由于这可能是反复切换期间的等待中 Service Worker，本轮**没有点击确认更新、没有取得接管版本证明**；不将该提示单独写成正常 v1→v2 更新提示通过。正常更新与恢复 worker 证据仍以隔离 `drill` 的既有记录为准。主站 v2 的断网启动、真实安装和移动端验证本轮未执行。
- 本次 R2 与 Pages 访问使用本机独立钥匙串凭据；命令和记录均未输出 Token。原生回滚未产生新的部署 ID，故六个实际部署索引覆盖两站 main v1/v2 和两站 drill v2。未来发布仍缺上传后自动索引／资产归档、七天保留窗口检查及独立机器恢复演练。
- 修正后执行反例：在 Vue 当前 canonical 为 v2 时，强制将 v1 部署 ID 以 `--mode=check` 当作当前版本，命令明确报 `Deployment ID is not the active Pages production deployment`；该反例没有写入或覆盖 R2 对象。相同 v1 ID 作为 `--mode=history` 时成功。`history` 模式已限制为生产 `main` 槽位。
- 收口检查：`pnpm lint`、`git diff --check`、四份受影响文档的相对链接检查通过；React/Vue 临时 v2 构建均恢复 `src/version.ts`，`pnpm-lock.yaml` 无改动。Spec Guard `phase-guard.sh` 只报告 `LEGACY_TRACKER_RETIRED`；`verify-artifacts.sh` 为 2 通过、1 条历史状态提示、0 失败，没有读取旧映射或联系 tracker。`documentation_verification.py --module cloudflare-test-deployment` 返回 `attention`，仅因计划中明确声明操作文档交付仍为 `pending`（后置门禁和真实设备证据未交付）。本轮未提交、推送或调用 GitHub。

## 2026-09-21：main v2 桌面受控更新与离线模拟补验

- 在桌面 Chrome 的 React/Vue 主站打开 DevTools Network `Offline` 预设，原先经历 v2→v1→v2 回滚的浏览器离线重载仍显示缓存中的 `v1`，同时出现 “A new version is ready”。分别点击示例自身的更新按钮后，提示消失、已打开页面保持 v1（没有强制全局刷新）；再次离线重载后均显示 `v2` 且 `registered`。Network 面板显示文档和 v2 指纹脚本由 Service Worker 提供；这给出两站主站在该桌面浏览器中的受控更新和 v2 离线启动证据。
- 在同一 `Offline` 预设中，React/Vue 分别直接打开 `/app/offline`，页面显示 `You are offline`，Network 面板的文档请求标为 `200`、`(ServiceWorker)`。随后两站均恢复 `No throttling`，关闭 DevTools，返回 `/app/`，确认仍显示 `v2` 和 `registered`；没有给用户留下离线调试设置。
- React 在 `Offline` 预设下请求未缓存的 `/app/offline-check` 得到 404，Network 面板显示 Service Worker 内部 fetch 收到 404。当前运行时设计对任何已收到的 HTTP 4xx/5xx 保留网络响应，仅在网络请求失败时使用离线兜底。因此本次**没有证明未知路径在真正网络失败时回退到静态离线页**；DevTools 预设下 Service Worker 内部仍有 HTTP 响应，不能把这一结果写成兜底页失败或通过。真实断网的未知路径导航仍需独立演练。离线期间 manifest 请求曾返回 `ERR_INTERNET_DISCONNECTED`，但已安装页面的 shell、脚本和静态离线页可由 Service Worker 打开；离线安装能力不在本次验收范围。

## 2026-09-21：React main 上传后自动索引／归档门禁

- `deploy-cloudflare-site.mjs` 对现有 `main` 重复上传增加强制后置步骤：Wrangler 上传成功后从 Pages 项目 API 取得新的 `canonical_deployment.id`，确认不是旧 ID，再对本次候选 R2 制品运行部署索引 `--mode=record`，随后运行 `archive:cloudflare:site`。任一步失败都会返回非零并标明新部署可能已上线、必须先恢复或补完；不自动吞掉失败，也不自动进行未经验证的回滚。首次 `main` 部署、`drill` 预览仍保持各自原流程。
- 用 React 同版 v2 维护部署现场验证：当前本地归档源为初次 v2 部署 `18824a5c-9103-41a5-953b-0efaedf4360a`，两版指纹脚本仍在 staging。新候选制品 SHA-256 `520c2425018ce99de6f957c7916a9648d23051e9ae68d4b72afeda322a7cb1e8`，R2 上传与读回 `readBackVerified: true`，`deploy --mode=preflight` 通过。Wrangler Direct Upload 生成部署 `784a59f7-0bc7-479f-88d8-5f178772e919`；同一部署命令自动记录索引，线上 11 文件匹配，随后归档两个指纹脚本，最终返回 `postDeployIndexedAndArchived: true` 和退出码 0。
- 独立再运行当前索引 `--mode=check`，11 文件和 R2 索引读回均通过；先前 v2 部署以 `--mode=history` 核验通过。桌面 Chrome 重载仍显示 `v2 registered`，未产生行为版本变化。将本地 React staging 按新的当前归档再构建，`deploy --mode=check` 通过，保留资产计数 2；临时 `version.ts` 与锁文件均未留下改动。
- 当前共有七个 Pages 部署索引；自动后置门禁已经在 React `main` 实测，但单次上传与后续 R2 写入不是 Cloudflare 跨服务原子事务，后置失败仍需值守和恢复。Vue `main` 使用同一部署脚本，尚未以新版本实测这条自动后置路径；`drill` 仍为人工索引／归档。

## 2026-09-21：Vue 自动后置门禁、生产历史保留审计与真实断网导航

- 新增 `audit:cloudflare:retention`。它按 [Pages 部署列表 API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/list/) 每页 25 条读取成功的 `main` 生产历史，选择当前 canonical、最新三次和滚动七天内全部成功部署的并集；逐个从 R2 下载部署索引、manifest 与 tarball，校验 SHA-256、目标身份、构建回执、索引摘要链和当前线上文件，最后请求并集里的全部指纹资源。`deploy:cloudflare:site` 的 `main` 重复发布在预检和上传后均调用此审计。
- React 独立审计返回：生产历史 3、必需部署 3、版本深度 3、七天窗口部署 3、远端制品 3、当前公开文件 11、线上保留指纹 2，`retentionAuditPassed: true`。Vue 初次审计为生产历史 2；随后用候选 SHA-256 `a42be74a88c7bc5690f6dd36261f7ec3c676c3b06505a674a04082776ad7326e` 执行同版 v2 维护发布，新部署 `224d7b68-dc16-467c-9394-9c4ddc4eaf17` 自动完成索引、归档和保留审计，最终返回 `postDeployIndexedAndArchived: true`、`retentionAudited: true`。发布后 Vue 独立审计也返回 3/3/3/3、远端制品 3、当前文件 11、指纹 2。截至该次记录共有八个 Pages 部署索引。
- 时间边界：当前两个站的三次生产部署都位于七天窗口内，证明选择规则和当前对象完整性；它们尚未经历完整七个自然日，不能据此声称对象已经存活七天。Bucket 未启用 Object Lock；索引的不可覆盖性来自脚本 `If-None-Match: *` 条件写入，不是存储层绝对不可变。
- 安全反例未改动真实对象：对确定不存在的部署索引键执行签名只读 GET 返回 HTTP 404；复制 React 当前本地制品并追加一个字节后，`restore:cloudflare:site --mode=check` 以摘要不匹配拒绝，临时副本随后清理。它们分别证明缺失对象可观察及恢复校验拒绝损坏字节；没有删除或篡改 R2 实际制品。
- 桌面 Chrome Network `Offline` 下，以此前未访问的唯一查询参数导航：React `/app/?offline-probe=20260921` 返回 200，文档和指纹脚本显示 `(ServiceWorker)`，页面为 `v2 registered`；Vue 同路径的内部 fetch 明确记录 `(failed) net::ERR_INTERNET_DISCONNECTED`，顶层文档由 Service Worker 返回 200 并显示预缓存的 `You are offline`。随后两站均恢复 `No throttling`、关闭 DevTools 并返回在线 `/app/`；两页显示 `v2 registered`。
- Vue 下一版 staging 已从新 canonical `224d7b68-dc16-467c-9394-9c4ddc4eaf17` 重新构建，保留两个指纹资源，`deploy --mode=check` 通过。此次没有发布行为版本、没有改动 `version.ts` 或锁文件。独立机器恢复、移动端和远端 CI 仍无本轮证据。
- 收口重跑 `pnpm lint`、全 workspace `pnpm typecheck` 与 `pnpm test`：lint 和类型检查通过，130 个测试文件共 1602 项通过；Nuxt 输出既有构建警告，没有失败。React/Vue 保留审计再次各返回 3 个必需部署、3 个远端制品、11 个当前文件、2 个线上指纹资源和 `retentionAuditPassed: true`。Spec Guard `phase-guard.sh` 只报告 `LEGACY_TRACKER_RETIRED`；`verify-artifacts.sh` 为 2 通过、1 条历史状态提示、0 失败，未读取旧映射或联系 tracker；文档验证保持 `attention`，原因是计划按事实声明独立机器恢复和完整七日时间跨度仍为 `pending`。

## 2026-09-21：桌面 Chrome 原生安装与已安装窗口离线重载

- React 主站页面触发真实安装按钮后，Chrome 安装确认框显示 `PWA Platform Example` 和 `pwa-platform-react-demo.pages.dev`；完成安装后生成新的 Chrome 应用 ID `gnaioiedojpgpkkjjbmbkhckniddkeki`。按该精确 ID启动的独立窗口位于 `https://pwa-platform-react-demo.pages.dev/app/`，显示 `v2 registered installed`。
- Vue 主站以相同流程安装，确认框显示 `pwa-platform-vue-demo.pages.dev`，生成独立应用 ID `echimdikjbkcoalacaabgelfcipfckfc`；精确 ID启动的窗口位于 Vue origin，并显示 `v2 registered installed`。旧冒烟站仍是第三个独立 ID `dbpbandcpkaefdjillpfcdaglgcffgml`。这证明三个 origin 的 Chrome 安装 identity 没有合并。
- 三个 Manifest 的 `id`、`start_url` 与 `scope` 都是 `/app/`，由浏览器结合各自 origin 形成不同安装 identity；但三站 `name` 都是 `PWA Platform Example`。macOS 按显示名启动时第一次命中了旧冒烟站 v1，只有按精确应用 ID才能无歧义选择 React/Vue。**推断：** 这是测试站展示名称冲突，不是 Manifest identity 合并；它会妨碍并排演示和人工验收，正式产品应使用业务自己的唯一名称，测试站后续也应改成可辨识名称。
- Vue 已安装独立窗口在 DevTools Network `Offline` 下重载：顶层 `/app/` 与 `index-BmhQk3Lq.js` 均为 200、`(ServiceWorker)`，内部 `/app/` fetch 与 manifest 请求记录 `net::ERR_INTERNET_DISCONNECTED`，窗口仍显示 v2 应用壳。随后恢复 `No throttling`、关闭 DevTools 并在线重载成功。React 已安装窗口本轮只验证在线启动；其独立窗口离线重载可作为补充对称证据，但共享运行时和 React 标签页已有断网 Service Worker 证据。
- 本轮没有卸载三个 PWA，避免删除既有本地应用数据；移动端仍按项目所有者要求延后。PC 原生安装由“未验证”更新为“有条件通过”：安装 identity、独立窗口和 Vue 离线重载通过；该次发现的显示名冲突随后由下一节记录的重新部署解决。

## 2026-09-21：Cloudflare 安装显示名隔离与重新部署

- Cloudflare 构建身份层新增宿主与槽位显示名覆盖：React `main` 使用 `PWA Platform React Demo` / `React Demo`，Vue `main` 使用 `PWA Platform Vue Demo` / `Vue Demo`；`drill` 使用对应的 `Drill` 名称。本地与既有共享 fixture 未设置 Cloudflare 环境时继续使用原 `INSTALL`，不改变本地浏览器测试基线。构建脚本新增目标与槽位名称检查，错误名称会在上传前被拒绝。
- React 候选制品 SHA-256 为 `9e34788c79bfd11ce553f9725c830e0d8c3fe3a84ef258d1785dc4b94297335d`，Vue 为 `e99636b9d181fee90f8521b396ffb5246dd5fc5f1055d82140689fec5a201f8e`；两者均已上传私有 R2 并读回验证。上传前分别以当时 current 制品 `520c2425018ce99de6f957c7916a9648d23051e9ae68d4b72afeda322a7cb1e8` 和 `a42be74a88c7bc5690f6dd36261f7ec3c676c3b06505a674a04082776ad7326e` 完成预检。
- React 新部署 `74c83661-8f62-44a1-9620-75ff3a05b8fc`，Vue 新部署 `f1cf4dcb-fecc-49e7-a426-42a183b0a149`。两次命令均自动完成部署索引、资产归档和保留审计，返回 `postDeployIndexedAndArchived: true` 与 `retentionAudited: true`。发布后各站生产历史 4、必需部署 4、七天窗口部署 4、远端制品 4、当前公开文件 11、保留指纹 2；当前共十个 Pages 部署索引。
- 线上 Manifest 读回分别显示 React `PWA Platform React Demo` / `React Demo` 和 Vue `PWA Platform Vue Demo` / `Vue Demo`，`id`、`start_url` 与 `scope` 仍为 `/app/`，没有迁移安装 identity。既有 React/Vue 安装出现 Chrome “应用有更新”提示；接受名称更新后关闭窗口，再按精确应用 ID 冷启动，窗口和应用菜单分别显示新名称并指向正确 origin，页面仍为 `v2 registered installed`。未卸载应用或清除其数据。
- 重新构建两站本地 `main` staging 后，构建回执分别绑定上述最新 canonical 部署，均保留两个指纹资源；`deploy:cloudflare:site --mode=check` 通过。最终独立保留审计再次返回各站生产历史 4、必需部署 4、远端制品 4、当前文件 11、线上保留指纹 2，`retentionAuditPassed: true`。`pnpm lint`、示例包类型检查、5 项单元测试和 `git diff --check` 通过；Spec Guard 为 2 通过、1 条历史状态提示、0 失败，文档验证因独立机器恢复和完整七日时间跨度仍为 `pending` 而保持 `attention`。
- 结论：先前记录的启动器显示名冲突已在 React/Vue 稳定测试站解决；旧冒烟站仍保留原名称和独立 ID。移动端按项目所有者要求继续延后，独立机器事故恢复和完整七日时间跨度证据仍待交付。

## 2026-09-21：T7 文档收口与 Spec Guard 只读核验

- 本地提交：npm 分发 `a50a7d7` 与 Cloudflare 部署 `130df35` 已从工作区拆分提交并快进合入本地 `main`；GitHub 不可用，未推送，无远端 CI。
- 操作手册新增“维护者最短路径”和“当前状态：PC 试点与正式 V1 门禁”，Nuxt 登记行改为门禁不通过、未创建。相对链接与锚点检查（手册、规格、计划、验证记录、ADR-0029、文档基线）0 处失效。
- 合并前在最终内容上重跑 `pnpm lint`、全 workspace `pnpm typecheck`、`pnpm test`（130 个测试文件、1602 项通过）、`pnpm check:publish`（9 包）与 `git diff --check`，均通过。本轮未重跑需 R2 凭据的保留审计，最近一次结果见上节。
- Spec Guard 0.16.6 `verify-artifacts.sh`：2 通过、1 警告（历史 tracker 状态文件）、0 失败。`documentation_verification.py`：本模块 `attention`，唯一原因是 `cloudflare-test-deployment` 文档交付声明为 `pending`。
- 回归修正：本模块向文档基线新增 `package-distribution`、`cloudflare-test-deployment` 两行后，`offline-write-extension`（合并前为 `ready`）与 `package-distribution` 因缺少对应决策变为 `invalid`；两份 spec 已补 `follow` 决策，复核均为 `ready`。其余旧模块 spec 没有 Documentation impact 表，属于既有状态，本轮未改。
- MCP `spec-guard verify` 仍按已退役的 GitHub tracker 约定报告 issue 投影与 `todo.md` 并存等 4 项失败；它们不属于本模块改动，本轮未处理。
- 结论：T7 的手册、基线、验证记录和只读核验已收口；模块文档交付保持 `pending`，直到完整七日时间跨度与独立机器事故恢复证据取得。本记录不构成正式 V1 发布批准。

## 2026-09-21：本机 PC 补测——Chrome 已安装窗口离线重载与 macOS Safari 渐进兼容

- 环境：macOS 15.7.3，Google Chrome 153.0.8010.50，Safari 18.6；两站 `main` 当前部署为 React `74c83661-8f62-44a1-9620-75ff3a05b8fc`、Vue `f1cf4dcb-fecc-49e7-a426-42a183b0a149`，未发布新版本。
- **Chrome 已安装窗口（React/Vue）：** Playwright 1.63 以 Chrome stable 启动全新临时配置，通过 CDP `PWA.install` 安装（`PWA.getOsAppState` 可识别）、`PWA.changeAppUserSettings` 设为 standalone、`PWA.launch` 打开应用窗口，并断言 `display-mode: standalone` 为真。两站依次：在线 v2 且受控；`setOffline(true)` 后重载为 HTTP 200、`fromServiceWorker: true`，仍显示 v2 应用壳；未访问过的唯一查询参数导航为 200、由 Service Worker 返回“You are offline”；恢复在线后正常。测试结束以 `PWA.uninstall` 卸载并删除临时配置。
- 边界：该安装由 CDP 触发，不经过 Chrome 安装确认框，页面也不会收到 `appinstalled`，因此示例页未显示 `installed`；用户配置中经真实安装框安装的 React 窗口仍只有在线启动证据。桌面控制工具对浏览器只授予只读权限，Apple Events 在当前执行环境中对 Finder、System Events 与 Safari 均超时，故未在用户配置里驱动离线操作。
- 与此前记录的差异：此前普通标签页中 React 对唯一查询参数离线导航返回缓存应用壳；本轮 React 在应用窗口与 Safari 中均返回预缓存离线页。两种结果都属于安全的静态离线兜底，未发生业务数据缓存；原因未单独定位。
- **macOS Safari 18.6（渐进兼容档）：** 通过 `safaridriver`（WebDriver，自动化会话与日常浏览数据隔离）驱动。两站首次访问后注册 Service Worker，重载后 `controller` 为真、注册为 `activated`，显示 v2。随后由项目所有者关闭 Wi-Fi，本地脚本以 `curl https://1.1.1.1` 连接失败判定断网（15:05:11Z–15:05:36Z），期间两站：`/app/` 重载显示 v2 应用壳，导航 `transferSize` 为 0（在线时为 532）；唯一查询参数与 `/app/never-precached` 均显示预缓存的“You are offline”。恢复网络后两站在线重载正常。
- Safari 期间 `navigator.onLine` 始终为 `true`，不能作为断网依据；断网以系统层连接失败与离线兜底页出现为准。本轮未测 Safari 更新提示（需要发布新版本）和“添加到程序坞”安装。
- 结论：本机 PC 上 Chrome（含已安装窗口）与 Safari 的在线、离线应用壳和静态离线兜底均已取得证据。Safari 仍属渐进兼容说明，不构成 V1 通用保证；移动端、独立机器恢复和完整七日时间跨度仍未交付。

## 2026-09-22：两站 main 更新横幅示例重新部署

- 源码为本地 `main` `ca740b5`（examples-browser-e2e T15/T16：横幅式更新提示、30 分钟定时检查）。构建脚本仅支持 `v1`／`v2`／`recovery` 标签，本次仍以 `--release=v2` 构建；界面与 worker 字节已变化，线上版本标签仍显示 `v2`。
- React：`deploy --mode=check` 通过（保留指纹 2）；候选制品 `f8e5736210d736deb570ff5f564d9957ce4a1955ed8ba0e98d9b7f740e0829ad` 上传 R2 并读回；当前版 `74c83661-8f62-44a1-9620-75ff3a05b8fc` 的索引（`9e34788c…`）核对通过；preflight 通过后部署 `edc7d9a1-af82-4fa2-a915-46696724598d`，返回 `postDeployIndexedAndArchived: true`、`retentionAudited: true`；保留审计：生产历史 5、必需部署 5、远端制品 5、当前文件 12、线上保留指纹 3。
- Vue：同一流程，候选 `97a456fb9ba79a1c135b85c6e6090ff5a63b4a46e82bd7962414e0db6a6985ea`，当前版 `f1cf4dcb-fecc-49e7-a426-42a183b0a149`（`e99636b9…`）核对通过；部署 `3a9b5ee5-f38d-4a2d-9515-7b9420b0cd72`，自动后置步骤与保留审计通过，计数与 React 相同。R2 部署索引累计十二个。
- 线上核验：两站当前入口脚本含 `A new version is available`、`Reload to use the new version`、`Update failed` 与 `UPDATE_CHECK_INTERVAL_MS = 18e5`；Manifest `id`／`scope`／`start_url` 仍为 `/app/`，显示名不变；`/app/sw.js` 为 `Cache-Control: no-cache`。全新 Chrome 153 配置访问两站：受控、显示 v2、无更新横幅。
- 本轮未在浏览器中演示“旧版页面 → 新版横幅”的现场更新：已打开旧版页面的用户运行旧代码，看到的是旧的单按钮提示；刷新后才使用新横幅。横幅交互的浏览器证据来自 examples-browser-e2e 本地 E2E。

## 2026-09-22：React drill 已安装窗口更新横幅演示

- 以 `ca740b5` 的新示例代码向 React `drill` 依次部署 v1（`61ab9fad-d6be-453c-9865-62baf5d1742a`）与 v2（`be04582a…`，别名 `https://drill.pwa-platform-react-demo.pages.dev`），每次先归档当前部署、构建并 `--mode=check`。首次归档 `37de0c78-d26b-400f-8e8c-c0c9bf048bce` 时脚本报 `Deployment is already archived`（此前演练已归档）；因输出经管道截断，该失败未中止后续命令，随后核实原因无害，第二次起改用 `pipefail`。`drill` 的 R2 索引仍按人工流程，本次未写入。
- 独立 Chrome 153 临时配置经 CDP `PWA.install`／`PWA.launch` 打开 standalone 窗口，截图记录：v1 → 部署 v2 后出现 `A new version is available` 横幅 → Later 隐藏 → **刷新后页面已显示 v2 而横幅仍提示新版本** → Update 后提示 `Reload to use the new version`（页面已是 v2）→ Reload 后 v2、横幅消失。
- 发现：示例应用壳导航为 `network-first`，在线刷新即取得新代码，而新 worker 仍在等待，原横幅文案与页面状态不符。已由 examples-browser-e2e 规格“补充修订：区分‘页面已是新代码’”（任务 17）处理；两个 `main` 站点同样存在该现象，待任务 17 完成后重新部署。

## 2026-09-22：页面新旧判断版本部署（两站 main 与两个 drill）

- 源码为本地 `main` `5c2433e`（examples-browser-e2e 任务 17：页面已是新代码时使用离线更新文案、接管后不提示刷新）。仍以 `--release=v2` 构建，全程 `pipefail`。
- React `main`：候选 `4464679a95d470e589e729fe0e43736df3f7602a7086f70da2d65d81ddabdab3` 上传 R2 并读回；当前版 `edc7d9a1-af82-4fa2-a915-46696724598d`（`f8e57362…`）索引核对与 preflight 通过；部署 `5c17e435-57ec-4faa-ad2b-7288cfd84333`，自动后置步骤与保留审计通过（生产历史 6、必需部署 6、远端制品 6、当前文件 13、线上保留指纹 4）。
- Vue `main`：候选 `14088b6838b9809ad006883123851bc631c618404774d0c7d6b49de747f6768a`；当前版 `3a9b5ee5-f38d-4a2d-9515-7b9420b0cd72`（`97a456fb…`）核对与 preflight 通过；部署 `e05fd502-8cf1-4e21-a610-8011c7346c49`，自动后置步骤与保留审计通过，计数同 React。R2 部署索引累计十四个。
- `drill`：React 归档 `be04582a-2e4b-4698-bf67-db8161100118` 后部署 `03d3de0a-166a-4fe5-9269-a071ad8db5bb`；Vue 当前 `6d1170ee-f135-4b04-8685-b07b949e6cd4` 已归档过（脚本明确识别 `Deployment is already archived` 后继续，其他错误中止），部署 `bc3a7991-897d-41e8-a282-fb43a4c6e724`。两者均先 `--mode=check`；`drill` 的 R2 索引仍按人工流程，本次未写入。
- 线上核验：四个 origin 的入口脚本均含 `An update is ready for offline use` 与 `PAGE_CURRENCY_CHECK_DELAY_MS = 100`；Manifest `id`／`scope` 仍为 `/app/`，显示名分别为 React／Vue Demo 与 React／Vue Drill。本轮未重复浏览器现场演示；新行为的浏览器证据来自 examples-browser-e2e 本地 E2E（43 passed、2 skipped）。

## 2026-09-22：React drill 离线更新横幅演示（页面新旧判断版本）

- 源码 `8b756ad`（含任务 17）。每次 drill 部署前均归档当前部署并 `--mode=check`，全程 `pipefail`；`drill` 的 R2 索引仍按人工流程，本次未写入。
- **第一次尝试未完成**：部署 v1 `f23e9a5b-c574-44cb-a72c-91701d7eba80` 并在独立 Chrome 153 standalone 窗口打开后，部署 v2 `c9d04474-26b9-4497-9e23-6904d40c0327`，调用 `registration.update()` 后 30 秒内未出现 `#update-banner`，脚本超时退出。该次未记录注册状态，**原因未查明**；随后在线探测页面新旧判断请求：对 `/app/` 的 `no-store` 请求 19 ms 返回 200，入口脚本解析与比较正常，排除该请求挂起。
- **第二次（带诊断）通过**：部署 v1 `924901b6-5951-420a-9f4e-6d82041e68c3`，安装为 standalone 窗口；部署 v2 `edb5e3e7…` 后 `update()` 正常返回，t+0 s 新 worker `installing`，t+1 s `waiting: installed`、横幅出现（页面 v1，文案 `A new version is available`）；Later 隐藏横幅；刷新后页面为 v2，横幅文案 `An update is ready for offline use`；点击 Update 后横幅消失、无 `#update-reload`、注册中无 waiting。控制台无 `pageerror`。
- 边界：演示当时页面新旧判断的请求没有超时，若请求挂起横幅会一直不显示；本轮未观察到该情况，第一次失败的原因仍未查明。随后 examples-browser-e2e 为该请求加入 5 秒超时（超时按旧代码处理）并补 E2E，见其验证记录。

## 2026-09-22：判断超时版本部署（两站 main 与两个 drill）

- 源码为本地 `main` `e7458f3`（页面新旧判断 5 秒超时）。仍以 `--release=v2` 构建，全程 `pipefail`。
- React `main`：候选 `46a92945bc33a3def2874e48871090cc28f100f9b681ee754609222ee06ec1c6` 上传 R2 并读回；当前版 `5c17e435-57ec-4faa-ad2b-7288cfd84333`（`4464679a…`）索引核对与 preflight 通过；部署 `8589bf50-b6d2-493f-9551-ea4b7dd8adec`，自动后置步骤与保留审计通过（生产历史 7、必需部署 7、远端制品 7、当前文件 14、线上保留指纹 5）。
- Vue `main`：候选 `ac96fc601d8539904e0237af539e97f7758ca9e65cb010ab4402dfd8c2e2808e`；当前版 `e05fd502-8cf1-4e21-a610-8011c7346c49`（`14088b68…`）核对与 preflight 通过；部署 `8472fc4d-ca25-45ca-a4f1-1237db6be642`，自动后置步骤与保留审计通过，计数同 React。R2 部署索引累计十六个。
- `drill`：React 归档 `edb5e3e7-fbed-4fe2-8817-9b4d519d447e` 后部署 `5ff086ae-f636-4325-bfaa-dbbee56d31d7`；Vue 归档 `bc3a7991-897d-41e8-a282-fb43a4c6e724` 后部署 `7d18b1da-7d16-48da-86c2-c190e0e6faf0`；均先 `--mode=check`，R2 索引仍按人工流程未写入。
- 线上核验：四个 origin 的入口脚本均含 `An update is ready for offline use` 与 `PAGE_CURRENCY_TIMEOUT_MS = 5e3`；Manifest `id` 仍为 `/app/`，显示名不变。本轮未做浏览器现场演示；超时行为的浏览器证据来自 examples-browser-e2e 本地 E2E。

## 2026-09-22：React drill 判断超时现场演示

- 源码 `7ce3470`（含 5 秒超时）。归档 `5ff086ae-f636-4325-bfaa-dbbee56d31d7` 后部署 v1 `c82cdf4a-1f37-4284-a0e5-85455e2be409`，独立 Chrome 153 临时配置经 CDP 安装为 standalone 窗口；归档 v1 后部署 v2 `4e76e339…`。两次均先 `--mode=check`，`drill` 的 R2 索引按人工流程未写入。
- 演示期间以 `context.route` 拦住页面对 `/app/` 的 `fetch`（`resourceType() === "fetch"`）不作应答，导航请求放行。`update()` 后 t+2 s：新 worker `waiting: installed`，拦截命中 1 次，横幅未显示；5966 ms 时横幅出现，文案 `A new version is available`（按旧代码处理，页面确为 v1）。解除拦截后点击 Update 出现 `#update-reload`，点击 Reload 后显示 v2。
- 结论：判断请求挂起时，横幅在超时后仍会出现，不再无限期隐藏。drill 当前停在 v2 `4e76e339…`。

## 2026-09-22：Vue drill 判断超时现场演示

- 源码 `c89ab78`。归档 `7d18b1da-7d16-48da-86c2-c190e0e6faf0` 后部署 Vue drill v1 `45a91a30-a319-4b0d-ad7a-f30a834a921f`，独立 Chrome 153 临时配置经 CDP 安装为 standalone 窗口；归档 v1 后部署 v2 `1574cbf2…`。两次均先 `--mode=check`，`drill` 的 R2 索引按人工流程未写入。
- 与 React 演示相同，拦住页面对 `/app/` 的 `fetch` 不作应答：`update()` 后 t+2 s 新 worker `waiting: installed`、拦截命中 1 次、横幅未显示；5633 ms 时横幅出现，文案 `A new version is available`（页面为 v1）。解除拦截后 Update → `#update-reload` → Reload 后显示 v2。截图确认为 Vue 示例页面。
- 结论：Vue 与 React 行为一致。Vue drill 当前停在 v2 `1574cbf2…`。

## 2026-09-22：M7 机器发布门禁上线后核验（React/Vue `main`）

- 工具：`claude/cloudflare-release-verifier` 分支 `95617cc`（工作区干净），`pnpm verify:cloudflare:release`；模式为**上线后核验，仅用于演练**，不构成生产发布证据。证据目录在仓库外 `~/Documents/haigeer-labs/pwa-release-records/m7-release-verifier-2026-09-22/`。
- 候选：线上两站均为 `e7458f3` 以 `--release=v2` 构建的版本。在本分支以 `--release=v2` 重新构建（`e7458f3` 之后应用目录只多了计划采集插件），两站 15 个文件与主目录暂存回执逐字节一致，且构建记录含经 `validatePlan` 校验的计划；无需重新部署。工具的线上字节比对再次确认线上即此候选（未触发拒绝）。
- 历史导出：项目所有者同意后以本机凭据运行 `audit-cloudflare-retention.mjs --export-history`，只发 Pages API 与 R2 的 GET。React 7 次成功生产部署，当前 `8589bf50-b6d2-493f-9551-ea4b7dd8adec`；Vue 7 次，当前 `8472fc4d-ca25-45ca-a4f1-1237db6be642`；每次部署都查到发布包摘要。导出文件只含格式字段，SHA-256：React `dfd3f75adcca5e2c8a884905b6ee619ebf0ce199dcfec78fcb7f9b4117fd2987`，Vue `3e690cf68caa87e9358e66d58bf1ce5f9e28e2c06f3b0404749c70b18e54cfe1`。历史发布包从主目录只读复制进 worktree 供工具读取。
- 结果（两站相同）：`artifacts`、`response-headers`、`identity-baseline` 均通过，`report.ok = true`；响应头观测 worker、manifest、带指纹主 JS 共 3 个路径，无失败。`release-retention` 未执行：6 个历史部署的发布包都没有计划（原因均为"Release bundle has no plan (built before plan capture)"），工具按规格不以截短历史调用保留检查，覆盖结果 `missing: ["release-retention"]`。**结论 `pass: false`，退出码 1。**
- 报告文件 SHA-256（前 16 位）：React `facts.json` `b64f02cf8c6eb462`、`report.json` `3d0061fa1892e9ad`、`coverage.json` `a4b1125b471e9e78`、`verdict.json` `8252038e82853992`、`record.md` `49aa51e5b1c70615`；Vue `facts.json` `a5bfe8a03de92e13`、`report.json` `3d0061fa1892e9ad`、`coverage.json` `a4b1125b471e9e78`、`verdict.json` `db72270cf19e17be`、`record.md` `bd21247402936358`。两站 `report.json` 与 `coverage.json` 相同，因为三项检查均无诊断，报告不含站点相关的值。终端打印的哈希与磁盘文件一致；事实文件不含响应体与令牌。
- 何时能通过：此后的发布都会在构建记录与发布包中带计划；当保留窗口（最近两个旧版本加七天内的版本）内不再有缺计划的部署时，同一工具无需改代码即可执行保留检查。
- 已知限制：发布手册要求公开 HTML 带 `no-cache`，但 `build-verifier` 的响应头检查只覆盖 worker、manifest 与带指纹资源，HTML 仍需人工核对。`release-verifier/test/run.test.ts` 的"两次运行结果一致"曾在 M6 子代理处失败一次，之后十余次未复现，原因未查明，列为待观察。

## 2026-09-22：P5 上线前核验（React/Vue `main` 候选的 `candidate` 预览部署）

- 工具：`claude/predeploy-verification` 分支（`c40c562` 之后的工作区，未改代码）。**只上传到 `candidate` 预览分支，没有上传 `main`**；预览地址上未做任何浏览器、安装或恢复验收（部署契约第 4 条例外）。证据目录在仓库外 `~/Documents/haigeer-labs/pwa-release-records/p5-predeploy-2026-09-22/`。
- 候选：在本分支以 `--release=v2` 重建，两站 15 个文件与主目录生产暂存回执逐字节一致，构建记录含计划。保留资产归档与历史发布包从主目录只读复制进 worktree。上传前先以 `--mode=check` 只读预检，两站通过。
- 预览上传（项目所有者同意后执行，Cloudflare 写操作，只写预览环境）：`deploy-cloudflare-site.mjs --mode=preview-candidate`。React 部署 `70a40c96-09e1-4d59-839d-61321e46dcec`，Vue 部署 `e51571e7-10cd-450a-bb4a-5e00cfe29784`；Pages API 读回均为环境 `preview`、分支 `candidate`，返回地址 `https://70a40c96.pwa-platform-react-demo.pages.dev`、`https://e51571e7.pwa-platform-vue-demo.pages.dev` 与按部署 ID 推算的唯一地址一致。**"唯一地址 = 部署 ID 前 8 位加项目域名"对预览部署同样成立。** 暂存回执 SHA-256：React `002ab695a6b5e7359a5e34443110bbcfddc46081aee3b15f15afc7c9531c0957`，Vue `f2e06b9d88d71cebfc947471c1e82e4031f689363efced22d3e5110294678898`。
- 生产未受影响：随后导出的生产历史中，当前生产部署仍为 React `8589bf50-b6d2-493f-9551-ea4b7dd8adec`、Vue `8472fc4d-ca25-45ca-a4f1-1237db6be642`，各 7 次，不含上述两个预览部署。历史文件 SHA-256：React `62c6daa597575f57d74e1b2327a6721c2bd2055e62cf529cea459b18803a6825`，Vue `7aa54d359a6b463edf92c44b260c5e2480092466fb33b4d83afd0d53a538e115`。
- 结果（两站相同）：线上字节比对通过（预览即候选）；`_headers` 与回执一致且只含路径规则；`artifacts`、`response-headers`、`identity-baseline` 通过。预览上 worker 与 manifest 为 `no-cache`，带指纹主 JS 为 `public, max-age=31536000, immutable`，与生产要求一致，证实路径规则在预览上同样生效。预览在三个路径上都额外返回 `X-Robots-Tag: noindex`（Cloudflare 文档所述），已记入事实文件，不影响结论。`release-retention` 未执行：上线前模式把全部 7 个生产部署都视为之前的版本，它们的发布包都没有计划。**结论 `pass: false`，退出码 1，符合预期。**
- 报告文件 SHA-256（前 16 位）：React `facts.json` `6e600b9b54623504`、`report.json` `3d0061fa1892e9ad`、`coverage.json` `a4b1125b471e9e78`、`verdict.json` `c90473d198b45a2d`、`record.md` `3c21343827651710`；Vue `facts.json` `dbfb26d6194d8e2e`、`report.json` `3d0061fa1892e9ad`、`coverage.json` `a4b1125b471e9e78`、`verdict.json` `e305ddc653859336`、`record.md` `bf09822544b808a3`。`report.json` 与 `coverage.json` 与 M7 上线后核验相同。终端打印与磁盘文件一致。
- 两个预览部署仍在线且可公开访问，内容与当前生产版本相同；本修订不清理预览部署。

## 2026-09-22：`drill` 槽位按模板的恢复演练（桌面发布演练清单第 6 项）

- 按[恢复演练](../../docs/operations/recovery-drill.md)与本规格部署契约第 7 条（恢复演练在隔离槽位进行）在 React/Vue 的 `drill` 预览分支执行；`drill` 与 `main` 身份隔离（`pwareactdrill`／`pwavuedrill`，环境 `test`，种子 `r1`）。浏览器为 desktop 通道必测范围：Chrome 153.0.8010.53（N）与 Chrome for Testing 152.0.7977.82（N-1），各用全新临时配置。驱动脚本 `pwa-release-records/tools/recovery-drill-driver.mjs`（SHA-256 前缀 `aeaefa8a967cfc44`）让两个浏览器在两次上传之间保持打开，以信号文件衔接步骤；只记录缓存名、条目数、路径、worker 状态与版本。项目所有者批准 `drill` 预览写操作，生产与 `main` 未改动。
- **React 第一次运行无效。** 驱动把异步谓词传给 Playwright `page.waitForFunction`，它把 Promise 当作真值立即返回（本地复现 19 ms 返回，条件仍为假），第 3 步在恢复 worker 接管前就执行：N 的新 worker 仍为 waiting，N-1 仍在 activating。已停止驱动，归档恢复部署 `546dac30-bd55-4062-8d54-6212b72c32d3` 后以正常 v2 重新部署（`af8025ef-91e5-4b2f-bddd-4bb01c2ea5bb`，`sw.js` 与演练前相同）；驱动改为在 Node 端轮询（本地复现确认等到条件为真，1510 ms）。原始文件与说明保留在证据目录 `react/`。项目所有者同意后重做。
- **React（重做）：通过。** 被测 v2 `af8025ef…` → 恢复 worker 部署 `46ef49fe-95f5-4bf0-b9d7-83fcaee630f7`（`sw.js` `8b0dbdc93b464fad…`）→ 修复后 v2 `b435dd5e…`（`sw.js` `4d2cdbed7d0b557d…`，计划预缓存 3 条）。子记录 `recovery-drill-2026-09-22/react-run2/recovery-drill-record.md`（SHA-256 前缀 `f27960f0729e920a`）。
- **Vue：通过。** 被测 v2 `1574cbf2-0aca-478e-9760-0524d9bc58fd` → 恢复 worker 部署 `4eb15750-f2ac-408e-9fcb-e9fad577e1aa`（`sw.js` `ec503864d19ccfdb…`）→ 修复后 v2 `394afa95…`（`sw.js` `39e08abcd90cb9c8…`，计划预缓存 3 条）。子记录 `recovery-drill-2026-09-22/vue/recovery-drill-record.md`（SHA-256 前缀 `81431fbae4a99a11`）。
- 两站、两个浏览器结果相同：恢复 worker 在页面调用 `registration.update()` 后接管，无用户点击；在线请求 `fromServiceWorker` 为 false（第 1 步平台 worker 下同一资源为 true）；断网请求得到网络错误；删除集合恰为 `appCachePrefix` 下的两个缓存（当前 `r1` 预缓存与旧 revision `r0`），保留集合（其他环境 `staging`、前缀重叠的其他应用 `…drillx`、非平台缓存）名称与条目数不变；修复后 worker 经更新提示 `#apply-update` 激活，预缓存重新填充为计划的 3 条，断网重载应用壳正常显示 v2。"恢复 worker 未注册 fetch 监听"由 `packages/sw-runtime/test/worker/recovery-worker.test.ts:137` 证明，在 main `41d4ee1` 上运行通过。
- 演练结束后两站 `drill` 均为正常 v2，未留恢复 worker。证据目录在仓库外 `~/Documents/haigeer-labs/pwa-release-records/recovery-drill-2026-09-22/`。

## 2026-09-22：DR3 `drill` 上传前预检与上传后自动步骤实测（React）

- 代码：修订"`drill` 上传前预检与上传后自动步骤"的 DR2（`8dd8501`），经项目所有者同意先合入 `main`（`12c843c`），再在主目录运行（运营状态 `build/cloudflare/` 在主目录）。
- 顺序：最后一次人工归档当前 `drill` 部署 `b435dd5e-a471-4ff8-a220-21001fa80ca3` → 以 `--release=v2` 构建（`sw.js` `4d2cdbed7d0b557d…`，与此前相同，含计划）→ 打包，候选 SHA-256 `ffcde55d82ea38d75258923303fae062ad19d83135a60990283061db826c3220`（1011021 字节）→ 上传 R2 并读回（`readBackVerified: true`）→ `--mode=check` → `--mode=deploy --artifact-sha256=<候选>`。
- 结果：新代码自动识别新部署 `ae41ddfd-6f1a-4a8e-91cb-ba25c4511852`，自动写 R2 部署索引并归档 8 个带指纹资源，输出 `postDeployIndexedAndArchived: true`。独立核对：`r2:cloudflare:index --mode=check` 读回 `indexVerified: true`（线上 17 个文件）；本地归档清单的 `deploymentId` 为新部署；`drill` 别名 `sw.js` 为正常 v2。执行后主目录工作区干净。
- 执行中的一次失误：准备归档时误运行了一条带不完整部署 ID（`b435dd5e-`）的归档命令。归档脚本在参数检查阶段即拒绝（"A registered target and full deployment ID are required"），核对确认归档清单与仓库均未改动，随后以完整 ID 正常归档。
- Vue 的 `drill` 本次未实测，下一次 Vue `drill` 上传即走同一路径。

## 2026-09-22：RC3 从 R2 恢复运营状态的隔离模拟（React/Vue `main`）

- **性质：同机隔离模拟，不等于独立机器。** 在本机临时目录全新克隆 `claude/machine-recovery` 分支，执行前确认克隆中没有 `build/`，`pnpm install --frozen-lockfile` 后仍没有；恢复只用 R2 与本机钥匙串凭据，全程只发 GET 请求。它证明恢复不依赖主目录的 `build/`，但不能证明换机器后凭据配置、Node 版本等环境差异不会出问题。
- **第一次运行（克隆 `76073f1`）暴露了规格设计错误。** 前四步（导出历史、下载发布包、恢复暂存目录、重建归档）成功，恢复结果与主目录一致；第五步 `deploy --mode=check` 失败（"Retained assets do not match the current production deployment"）。原因：该检查针对**基于当前部署归档构建的新候选**（回执 `retention.sourceDeploymentId` 须为当前部署），而恢复出的是当前部署自身，回执指向上一次部署 `5c17e435…`。经项目所有者同意，规格改为：脚本最后一步用 `r2:cloudflare:index --mode=check` 只读核对，"可以继续发布"由恢复后构建新候选再 `deploy --mode=check` 证明（`48be60b`）。
- **状态保护的真实环境验证**：把上述已有 `build/` 的克隆更新到 `48be60b` 后运行恢复，脚本在读取凭据与调用任何其他脚本之前拒绝（"Operational state already exists …"）。
- **第二次运行（全新克隆 `48be60b`）：两站通过。** React：当前部署 `8589bf50-b6d2-493f-9551-ea4b7dd8adec`，发布包 `46a92945bc33a3def2874e48871090cc28f100f9b681ee754609222ee06ec1c6`；Vue：当前部署 `8472fc4d-ca25-45ca-a4f1-1237db6be642`，发布包 `ac96fc601d8539904e0237af539e97f7758ca9e65cb010ab4402dfd8c2e2808e`；两站各重建 5 个归档资源，R2 索引核对 `indexVerified: true`（线上 14 个文件）。
- **与主目录只读比对（两站相同）**：构建回执除 `uploadDirectory` 外完全相同；15 个暂存文件逐字节相同；归档对应同一部署，5 个资源哈希全部相同，资源集合无差异。两边回执都没有 `plan`，因为当前生产部署早于 M2 构建。
- **可以继续发布**：在克隆中以 `--release=v2` 构建新候选，两站回执的 `retention.sourceDeploymentId` 均为当前生产部署，`deploy --mode=check` 均通过；克隆工作区保持干净。
- 主目录 `build/` 在模拟期间未被改动（此前 22:16 前后的改动全部属于 DR3 的 React `drill`）。模拟日志存于仓库外 `pwa-release-records/machine-recovery-2026-09-22/`（SHA-256 前缀：`recover2-react.log` `f631ee47adba4f76`、`recover2-vue.log` `adea00084e3afd6b`、`build-react.log` `2994b827596b3935`、`build-vue.log` `bf3b817993f8c964`、`check-react.log` `9b411e20b2b9ed54`、`check-vue.log` `b2b154e00549a652`），不含凭据。临时克隆已删除。

## 2026-09-22：HC4 核验工具采集公开 HTML 响应头的真实运行（React/Vue）

- 工具：`claude/cloudflare-html-headers` 分支 `3763c0e`（源码工作区干净）。四次运行均为只读：生产 `main` 各一次上线后核验，P5 留下的 `candidate` 预览部署（React `70a40c96-09e1-4d59-839d-61321e46dcec`、Vue `e51571e7-10cd-450a-bb4a-5e00cfe29784`）各一次上线前核验；没有上传、部署或 R2 写操作。证据目录在仓库外 `~/Documents/haigeer-labs/pwa-release-records/hc4-html-headers-2026-09-22/`。
- 候选：保留归档与历史发布包从主目录只读复制进 worktree，以 `--release=v2` 重建；两站 15 个文件与主目录生产暂存回执逐字节一致，身份一致，构建记录含计划。
- 历史导出：项目所有者同意后以本机凭据运行 `--export-history`，只发 GET。两站当前部署与 M7 相同（React `8589bf50-…`、Vue `8472fc4d-…`），各 7 次，每次都查到发布包摘要。SHA-256：React `fa9e58314a64f64d72007e4b3f0dca310bae8eb7a6001cbe7290c8a0b923e6ee`，Vue `e308be19e128d0729a83cd8894509f79228d44b53cc2582e6e67b203c7f944c8`。
- 结果（四次相同）：`artifacts`、`response-headers`、`identity-baseline`、`html-headers` 均通过且无诊断，`report.ok = true`；必需集五项，覆盖结果 `missing: ["release-retention"]`，历史缺计划的原因与 M7、P5 相同。**结论 `pass: false`，退出码 1，符合预期。**
- 公开 HTML（四次相同）：`/app/` 直接 200；`/app/index.html` 经 308 到 `/app/`，`/app/offline.html` 经 308 到 `/app/offline`；三个最终响应均为 `Cache-Control: no-cache`，重定向链记入 `htmlHeaderObservations`，无未采集路径。上线前核验中 HTML 路径也返回 `X-Robots-Tag: noindex`，已记入 `previewRobotsTag`，不影响结论。
- 报告文件 SHA-256（前 16 位）：React 上线后 `facts.json` `a86168771f3331f0`、`record.md` `f8f59b927ed4d2c2`；Vue 上线后 `facts.json` `fa58d4adb6d4e8d8`、`record.md` `9034bf985da6937e`；React 上线前 `facts.json` `ddd976aa0ff467e3`、`record.md` `feb98d69511b837d`；Vue 上线前 `facts.json` `f88bdf2ddf84a389`、`record.md` `1c32cc579569d303`。四次 `report.json` 均为 `e8a77f4ae2f999af`，`coverage.json` 均为 `a4b1125b471e9e78`。终端打印与磁盘文件一致；事实文件、日志与历史导出中不含令牌，事实文件不含响应体。
- 观察：`coverage.json` 只含 `ok` 与 `missing`，与 M7 逐字节相同；必需集列在 `record.md` 中（五项）。这是 M 系列以来的既有格式，本修订未改。
- 公开 HTML 的 `no-cache` 从此由机器检查覆盖；私有 HTML 仍无机器检查（本测试站没有私有页面）。

## 2026-09-23：`coverage.json` 补上必需集

- 规格要求 `coverage.json` 含"覆盖结果与必需集"，但工具此前只写 `verifyReleaseGateCoverage` 的结果（`ok`、`missing`）。M7 按四项必需集、HC4 按五项必需集运行，两次的 `coverage.json` 却逐字节相同（`a4b1125b471e9e78`），单看该文件无法区分当时要求了哪些检查。
- 工具改为写出 `{ requiredChecks, ok, missing }`；集成测试钉住上线后"全部通过"与上线前"历史不完整"两个场景的完整内容。包内 192 项测试连续两次通过，typecheck 与 lint 通过。
- 已存档的 M7、P5、HC4 证据不改；它们的必需集以同目录的 `record.md` 为准。此后的运行，`coverage.json` 自身即可说明必需集。

## 2026-09-25：免费额度与部署控制复核（F1a）

- Cloudflare 控制台显示 Workers 当前方案为 Free；Billable Usage 的当前周期为 2026-09-21 至 10-20，已观测 9-21 至 9-25，费用与预测费用均为 $0.00。R2 账户 Class A 为 86 次、Class B 约 1.14k 次，账单表的存储量四舍五入显示 0 GB-months；这些是截至查询时的读数，不是未来费用上限。
- 私有 `pwa-platform-release-artifacts` 桶的默认存储类别为 Standard，Public Access 为 Disabled，桶大小 10.02 MB；桶页显示 Class A 71 次、Class B 约 1.14k 次。账户账单与桶指标的统计范围不同，不应相加。
- Pages 项目 API 显示 React、Vue 和既有移动冒烟站均为 Direct Upload（无 Git source）、`uses_functions=false`；当前成功生产部署分别是 `8589bf50-b6d2-493f-9551-ea4b7dd8adec`、`8472fc4d-ca25-45ca-a4f1-1237db6be642`、`5c65b498-31e7-4770-b237-1d79ade5a172`。四个 Pages 项目的历史部署记录数为文档站 22、React 36、Vue 19、冒烟站 15，共 92 条；记录数不能直接当作每月构建额度已使用数。
- 文档站 Git 集成原先虽有 `production_deployments_enabled=false`、`preview_deployment_setting=none`，总开关 `deployments_enabled` 仍为 `true`。版本分支推送、发布记录分支推送和合并到 `main` 各留下 `github:push`、`is_skipped=true`、`idle` 的预览记录；没有产生新的成功生产部署。按 Cloudflare Pages API 的开关说明将总开关设为 `false`，随即独立 GET 确认三个开关分别为 `false`、`false`、`none`，生产分支仍为 `docs/v2026.09.25-2`，canonical 部署仍为 `69f08e16-03d4-4cdf-a9e1-427ca8a7fc79` 且成功。审计分支首次正常推送后再次 GET：部署记录总数仍为 22，最新 ID 仍为 `49c25e30-b3ee-45f6-a440-b3747c0193e8`（此前的 skipped 记录）；本次分支推送未留下新记录。合并到 `main` 后还需再核对一次，不为此额外推送。
- React/Vue 当前生产部署均创建于 2026-09-22（UTC），完整七日存活证据尚不能由今天的审计得出；F2 继续 pending。F3 所需的真正第二台机器没有参与此次核验，继续 pending。本轮没有 Pages 上传、R2 对象写入或测试站身份变更。
- Spec Guard 本地 `verify-artifacts` 为 2 通过、0 警告、0 失败；本模块 `documentation_impact` 为 `valid`，`documentation_verification` 因 F2/F3 仍待证据而为 `attention`，未提升交付状态。另对 `platform-governance` 运行的文档核验报 `invalid`：其规格已有两个 Documentation impact 表；本轮未改该规格，待该模块单独修复。
