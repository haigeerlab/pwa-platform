# Cloudflare 宿主测试站目标登记

本手册执行 [cloudflare-test-deployment 规格](../../spec/cloudflare-test-deployment.md)和 [ADR-0029](../adr/0029-cloudflare-host-demo-isolation.md)。截至 2026-09-21，React/Vue 两个独立 Pages 项目已有稳定 `main` 和隔离的 `drill` 预览槽位；`pwa-t15-mobile-smoke` 仍作为既有冒烟站。Nuxt Worker 本地启动门禁失败，尚未创建。GitHub 不可用期间使用本地构建与 Direct Upload。PC 是本期优先测试设备；两站桌面 Chrome 原生安装和 Vue 已安装窗口离线重载已有现场证据，H5 与移动端原生安装延后。

## 目标登记

| 目标 | 资源与项目名 | 源与构建 | 上传或静态资源根 | 主槽位与 origin | PWA 身份／基线 | 状态 |
|---|---|---|---|---|---|---|
| `react` | Pages，`pwa-platform-react-demo` | `packages/examples-browser-e2e/apps/react/`，Vite 配置 `apps/react/vite.config.ts` | `build/cloudflare/react/main/site/`，应用在 `site/app/` | `main`；`https://pwa-platform-react-demo.pages.dev` | `pwareactdemo`、`/app/` scope；`react-main` 基线已登记 | 稳定站现为 v2；原生回滚／恢复、受控更新及桌面 Offline 预设下的 v2 重载通过；恢复 worker 另见 drill 证据 |
| `vue` | Pages，`pwa-platform-vue-demo` | `packages/examples-browser-e2e/apps/vue/`，Vite 配置 `apps/vue/vite.config.ts` | `build/cloudflare/vue/main/site/`，应用在 `site/app/` | `main`；`https://pwa-platform-vue-demo.pages.dev` | `pwavuedemo`、`/app/` scope；`vue-main` 基线已登记 | 稳定站现为 v2；原生回滚／恢复、受控更新及桌面 Offline 预设下的 v2 重载通过；恢复 worker 另见 drill 证据 |
| `react-drill` | 同一 React Pages 项目的 `drill` 预览分支，不是 Git 分支 | React 源码，独立 `--slot=drill` 构建 | `build/cloudflare/react/drill/site/` | `https://drill.pwa-platform-react-demo.pages.dev` | `pwareactdrill`、`/app/` scope；`react-drill` 基线 | v1→v2 提示更新、恢复 worker 与再次正常发布通过；当前 v2 |
| `vue-drill` | 同一 Vue Pages 项目的 `drill` 预览分支，不是 Git 分支 | Vue 源码，独立 `--slot=drill` 构建 | `build/cloudflare/vue/drill/site/` | `https://drill.pwa-platform-vue-demo.pages.dev` | `pwavuedrill`、`/app/` scope；`vue-drill` 基线 | 同上；当前 v2 |
| `react-smoke` | Pages，既有 `pwa-t15-mobile-smoke` | 现有 `pnpm build:pages:react` | `packages/examples-browser-e2e/browser-build/react/v1/` | `main`；`https://pwa-t15-mobile-smoke.pages.dev` | 现有共享 `.invalid` fixture 身份，只作冒烟；不作为新站身份基线 | 已存在，维持原职责 |
| `nuxt-ssr` | Worker，候选 `pwa-platform-nuxt-ssr` | `packages/nuxt/browser-tests/site/`；`cloudflare` preset 可构建 | `.output/public` 与 `.output/server/index.mjs`；本地 Worker 启动报 `No such module: node:buffer`，开启 `nodejs_compat` 仍失败 | 无；可行性门禁未通过 | 独立源；不复用 Vite 示例身份 | 门禁不通过，未创建、未部署 |

Next、TanStack Start 和同源多 PWA 目前没有本表的发布目标。它们不随 React/Vue 项目附带上传。

## 名称、身份与槽位

1. 创建前用最小权限凭据查询账户内已有项目。2026-09-21 创建前只看到 `pwa-t15-mobile-smoke`，随后分别创建 React/Vue 项目，并以 Cloudflare 返回的项目名和域名作为身份依据。
2. 创建 Pages 项目后读取 Cloudflare 返回的**实际**项目名与生产域名，再把 `origin` 写入对应测试身份。不要猜测 `<拟名>.pages.dev` 一定可用，也不要在第一次部署后改名迁移已注册身份。
3. `main` 是稳定测试槽位；两个首次部署后的完整身份分别保存在 `packages/examples-browser-e2e/apps/shared/release-baseline/react-main.json` 和 `vue-main.json`。安装、更新与恢复演练使用 Cloudflare `drill` 预览别名；它们是另一个 origin，已分别冻结 `<host>-drill` 身份和基线。Cloudflare 的 `--branch=drill` 是 Pages 预览标签，不创建本地或 Git 分支。仅预览静态页面时，明确关闭 PWA 注册。各槽位基线遵循[身份发布基线规则](identity-release-baseline.md)。
4. 同一个站点供 PC 和 H5 访问，设备、浏览器版本及测试结果在[浏览器证据](browser-release-evidence.md)中区分，不为设备类别建重复 Cloudflare 项目。
5. 真实环境的资源名称、origin、项目负责人和回滚负责人须在第一次上传前登记。当前由项目所有者担任创建与回滚决策人，执行人及时间写入具体部署记录；不把个人账号名称或凭据放入本表。

## 构建、发布与验收顺序

React/Vue 稳定站均已发布 v2，并从 v2 原生回滚到 v1、随后恢复 v2。两站的新旧指纹资源已归档到被忽略的本地 `build/cloudflare/<host>/retained/main/`；真实上传制品和部署 ID 索引另存私有 R2。重新构建会携带归档资源，`check` 使用 Pages 项目接口的 `canonical_deployment` 核验当前生产部署及线上旧资源。后续 `main` 上传须提供不同的候选与当前 R2 制品 SHA-256 并通过串行预检；现有 `main` 的 `--mode=deploy` 在上传后自动验证新 canonical 部署、写入 R2 索引、归档指纹资源并运行保留审计；任何后置步骤失败都会返回失败，已上线版本须按手册处理后才可再次上传。本地归档不构成跨机器持久证据；R2 制品已做单机远端下载恢复，滚动七天与 R/R-1/R-2 的自动选择和逐项核验已交付，独立机器事故演练仍未完成。既有[React 冒烟命令](pages-smoke-deploy.md)继续独立使用。

```bash
# 先查看目标、origin 和将上传的目录；不会构建或联网
pnpm build:cloudflare:site --target=react --slot=main --origin=https://pwa-platform-react-demo.pages.dev --mode=dry-run
# 从工作区依赖和 React 源码重建；当前示例版本为 v2，Vue 改为 --target=vue 与 Vue 实际域名
pnpm build:cloudflare:site --target=react --slot=main --origin=https://pwa-platform-react-demo.pages.dev --release=v2
# 只读查询 Pages 的当前 canonical_deployment，核对身份、摘要和旧资源
pnpm deploy:cloudflare:site --target=react --slot=main --mode=check
# 下一版候选先打包、上传并读回 R2；下列摘要分别来自候选和当前版索引
pnpm bundle:cloudflare:site --target=react --slot=main
pnpm r2:cloudflare:bundle --target=react --slot=main --sha256=<候选 SHA-256> --mode=upload
pnpm deploy:cloudflare:site --target=react --slot=main --mode=preflight --artifact-sha256=<候选 SHA-256> --current-sha256=<当前 SHA-256>
# 预检通过后，同一候选才可上传；脚本将自动 record 部署索引、归档当前部署并运行保留审计
pnpm deploy:cloudflare:site --target=react --slot=main --mode=deploy --artifact-sha256=<候选 SHA-256> --current-sha256=<当前 SHA-256>
# 也可独立只读审计当前成功生产历史、R2 制品和线上保留资产
pnpm audit:cloudflare:retention --target=react
```

`build/cloudflare/<host>/<slot>/build.json` 是本地构建回执，位于上传目录之外；`site/` 才是 Wrangler 的上传根。部署前检查独立复核文件白名单、SHA-256、冻结的身份基线、项目实际域名与生产部署列表。有生产部署时，还要求本地归档记录的部署 ID 等于 Pages 当前 `canonical_deployment` ID，旧指纹资源同时存在于新 staging 和当前线上。缺档或字节不一致即拒绝。归档命令为 `pnpm archive:cloudflare:site --target=react --deployment-id=<完整生产部署 ID>`；该命令核对当前生产部署、staging 与线上资源后才写入本地归档。`main` 重复上传的预检还要求候选制品已在 R2 读回验证，并且当前生产部署的 R2 索引与线上文件一致。`drill` 通过预览槽位门禁后可重复 Direct Upload；预览别名公开可访问，`_headers` 额外设置 `X-Robots-Tag: noindex`，这不是访问控制。使用 `.invalid` 的本地试构建不能发布。

1. 从当前锁文件和工作区包新构建目标应用，产物放进该目标、该槽位的隔离 staging 根。确认根中只含待公开静态文件：`site/app/`、根级 `_headers` 等必要配置，不含源码、环境文件、令牌、测试结果或另一宿主产物。
2. 对照构建计划核查 manifest ID、scope、worker URL、origin 和预缓存列表；检查当前及保留窗口所需的带指纹资产均可继续提供。缺失旧资产归档时停止稳定槽位上传。
3. Pages 只上传 `site/` 根，明确指定项目名及 `main` 分支。首次 v1 部署 ID：React `4e5f259f-c985-4c2d-9c76-853c5b33a107`；Vue `96522b51-ed42-4d76-b06c-92325d63a909`。当前 v2 部署 ID：React 判断超时部署 `8589bf50-b6d2-493f-9551-ea4b7dd8adec`（此前页面新旧判断部署 `5c17e435-57ec-4faa-ad2b-7288cfd84333`、更新横幅部署 `edc7d9a1-af82-4fa2-a915-46696724598d`、显示名隔离部署 `74c83661-8f62-44a1-9620-75ff3a05b8fc`、同版维护部署 `784a59f7-0bc7-479f-88d8-5f178772e919`，初次 v2 为 `18824a5c-9103-41a5-953b-0efaedf4360a`）；Vue 判断超时部署 `8472fc4d-ca25-45ca-a4f1-1237db6be642`（此前页面新旧判断部署 `e05fd502-8cf1-4e21-a610-8011c7346c49`、更新横幅部署 `3a9b5ee5-f38d-4a2d-9515-7b9420b0cd72`、显示名隔离部署 `f1cf4dcb-fecc-49e7-a426-42a183b0a149`、同版维护部署 `224d7b68-dc16-467c-9394-9c4ddc4eaf17`，初次 v2 为 `5f1ac456-9416-4c35-bf72-b4b782d13e66`）。真实上传时的完整 `build.json` 已封装在各自 R2 制品中；本地 staging 此后可能为下一次构建而改变。实际 URL 见登记表；云端上线是独立操作，不由本地 dry-run 自动触发。
4. 在真实 HTTPS URL 检查 `/app/`、manifest、worker、离线页、指纹资源的状态码、内容类型与缓存头。Pages 对 `.html` 可能重定向为扩展名省略路径，离线页要检查源路径和最终响应。动态 SSR 响应头由 Worker 实际返回，不套用 Pages `_headers`。
5. 分别完成 React/Vue 桌面在线、离线、提示更新与恢复演练；记录浏览器完整版本和失败／跳过项。更新提示、恢复 worker 和离线启动已在 `drill` 通过；两个 `main` 现为 v2，原生 Pages v2→v1→v2 回滚、受控更新、桌面 Chrome Offline 预设下的 v2 重载和静态离线页打开均已观察。带唯一查询参数的导航在 Network `Offline` 下均由 Service Worker 返回 200；Vue 同时记录到内部请求 `ERR_INTERNET_DISCONNECTED` 并显示预缓存离线页，React 返回缓存应用壳。React/Vue 均已从真实 Chrome 安装确认框安装为独立应用 ID，并在独立窗口核对各自 origin、v2、注册和 installed 状态；Vue 已安装窗口的断网重载由 Service Worker 提供应用壳与指纹脚本。Cloudflare 构建分别覆盖唯一显示名 `PWA Platform React Demo` 与 `PWA Platform Vue Demo`，本地共享 fixture 保持原名；既有安装接受 Chrome 的应用名称更新后，按精确 ID 冷启动均显示新名称和正确 origin。Android、移动端原生安装和远端 CI 未完成时不写成 V1 发布通过。

## 隔离预览槽位的重复部署与恢复

首次使用先向各 Pages 项目的 `drill` 预览标签上传不注册 Service Worker 的中性页，再以该标签的**实际**别名 origin 构建 v1、执行 `--slot=drill --mode=check`、部署并冻结 `<host>-drill` 身份。该引导步骤已完成，不能在有已注册 worker 的预览 origin 上重新当成首次部署。

**2026-09-22 起，已有基线的 `drill` 与 `main` 一样自动完成上传前预检与上传后步骤**（[模块规格](../../spec/cloudflare-test-deployment.md)"修订：`drill` 上传前预检与上传后自动步骤"）：`--mode=deploy` 必须带 `--artifact-sha256`（参数缺失或格式错误在读取凭据之前拒绝），上传前比对本地发布包并校验 R2 制品；上传后比较部署列表自动识别新部署的完整 ID，写 R2 部署索引并归档该部署的带指纹资源。`drill` 不做保留审计。一次正常发布的顺序如下：

```bash
# host=react 或 vue；origin 对应目标登记中的 drill 别名
pnpm build:cloudflare:site --target=react --slot=drill --origin=https://drill.pwa-platform-react-demo.pages.dev --release=v2
pnpm bundle:cloudflare:site --target=react --slot=drill                 # 输出候选 SHA-256
pnpm r2:cloudflare:bundle --target=react --slot=drill --sha256=<候选 SHA-256> --mode=upload
pnpm deploy:cloudflare:site --target=react --slot=drill --mode=check
pnpm deploy:cloudflare:site --target=react --slot=drill --mode=deploy --artifact-sha256=<候选 SHA-256>
# 成功时输出 {"deploymentId": "<新 ID>", "postDeployIndexedAndArchived": true}；可用下面这条读回核对索引
pnpm r2:cloudflare:index --target=react --slot=drill --sha256=<候选 SHA-256> --deployment-id=<新 ID> --mode=check
```

恢复演练时，把第一行的 `--release=v2` 换成 `--release=recovery` 走同样的步骤发布恢复 worker，在浏览器确认 activated、缓存清理和旁侧缓存保留后，再按上面的顺序发布正常 v2；不让恢复 worker 长驻别名。上传后若报"部署已上线，但某一步失败"，先按报错中的部署 ID 处理（补写索引或归档），再做下一次上传。2026-09-22 之前的 `drill` 部署没有 R2 索引，也不补写。

`--release=v2` 可用于当前的 `main` 与 `drill` 测试版：构建脚本暂时替换示例页面版本标签，结束时恢复源码；`--release=recovery` 把恢复 worker 发布在同一 `/app/sw.js`。每次重新构建都会把本机归档中的旧指纹资源带入新上传。归档必须在**当前**预览部署和线上旧资产都可核验时执行；部署后先查询完整 ID 再归档。若恢复发布或浏览器断言失败，也要保留证据、归档当前部署并重新上传正常 v2，随后验证 HTTPS 字节和离线页。

桌面 Chrome 测试应在已有受控页面上调用 `registration.update()`；首次访问仅出现 `activated` 注册但页面没有 controller 时先重载。恢复 worker 的 `controllerchange` 可先于清理完成，须等待注册状态 `activated` 再检查本应用缓存已清空、旁侧环境缓存仍在。预览部署完成后的正常发布与离线启动已在两站实测；详见[验证记录](../../tasks/cloudflare-test-deployment/verification.md)。

## 稳定槽位放行前的制品归档（部分完成）

`main` 的重复上传现需通过候选制品与当前部署 R2 索引的双重预检；本次两站 v2 均按此流程发布并完成原生回滚演练。2026-09-21 已在与 Pages 相同的 Cloudflare 账号中创建私有 R2 Standard bucket `pwa-platform-release-artifacts`，位置为 APAC；公开访问关闭，未设置公开开发 URL 或自定义域。对象键按 `react|vue / main|drill` 分隔，不按 PC/H5 分桶。Cloudflare 的 [R2 免费额度与超额价格](https://developers.cloudflare.com/r2/pricing/)按账号用量和月度周期计算，不能将测试规模的 $0 估算当作费用上限。现有 Pages Token 仍无 R2 权限；单独创建的桶级 Account API Token 仅有此桶的 Object Read & Write 权限，有效期至 2027-09-21，S3 凭据保存在本机钥匙串。

本地全量制品命令如下：

```bash
pnpm bundle:cloudflare:site --target=react --slot=main
# 从上条命令输出取得 SHA-256；默认只做解包与校验，不覆盖 staging
pnpm restore:cloudflare:site --target=react --slot=main --sha256=<64 位摘要> --mode=check
# 仅在恢复演练或事故需要重建 staging 时显式使用
pnpm restore:cloudflare:site --target=react --slot=main --sha256=<64 位摘要> --mode=restore
```

制品为 `build/cloudflare/release-bundles/<host>/<slot>/<sha256>.tar.gz`，旁有 JSON 摘要与目标元数据；它们都被 Git 忽略。打包对临时副本规范化时间戳，并使用零时间戳 gzip；相同输入重复打包得到同一 SHA-256。本地命令逐项检查 staging 哈希和冻结身份，打包后立即解包复核；恢复命令再次拒绝危险路径、链接、身份不符或字节不符。`restore` 会替换该槽位的本地 staging，并把构建回执的上传路径绑定到当前工作区，之后仍须运行 `deploy:cloudflare:site --mode=check`。四个当前槽位的本地往返、R2 上传和读回验证均已完成；React `main` 还在临时移走本地制品后从 R2 下载重建，并与原件逐字节核对。此演练证明远端可恢复当前归档，不替代独立机器和事故现场演练。

R2 上传／下载／读回命令已在私有桶上实测：

```bash
pnpm r2:cloudflare:bundle --target=react --slot=main --sha256=<64 位摘要> --mode=upload
pnpm r2:cloudflare:bundle --target=react --slot=main --sha256=<64 位摘要> --mode=verify
# 新机器可先下载，再执行 restore:cloudflare:site --mode=restore
pnpm r2:cloudflare:bundle --target=react --slot=main --sha256=<64 位摘要> --mode=download
```

传输只接受固定的私有 bucket `pwa-platform-release-artifacts`。账号 ID 取环境变量或现有钥匙串；桶级 S3 Access Key ID 与 Secret Access Key 分别取 `PWA_PLATFORM_R2_ACCESS_KEY_ID`、`PWA_PLATFORM_R2_SECRET_ACCESS_KEY` 或同名用途钥匙串项。不要把密钥传入命令行参数。2026-09-21 四槽 S3 SigV4 写入与读回均返回成功并逐字节匹配本地归档；凭据不得通过命令行参数、日志或仓库传递。

十六个 Pages 部署（React main v1、六次 v2、drill v2；Vue main v1、六次 v2、drill v2）已按完整部署 ID 在 R2 写入由客户端条件写入保护的制品索引，并读回核对。记录脚本先验证归档在 R2、Pages 槽位当前部署 ID 及全部线上公开文件的 SHA-256，再使用 R2 `PutObject` 的 `If-None-Match: *` 条件写入；已有索引只能由该脚本核对，不能通过该路径覆盖。Bucket 未启用存储层 Object Lock，因此不能把客户端约束表述为存储层不可变：

```bash
pnpm r2:cloudflare:index --target=react --slot=main --sha256=<64 位摘要> --deployment-id=<完整部署 ID> --mode=record
pnpm r2:cloudflare:index --target=react --slot=main --sha256=<64 位摘要> --deployment-id=<当前完整部署 ID> --mode=check
# 回滚前核查历史生产部署，只验证成功状态和归档，不误当作当前线上内容
pnpm r2:cloudflare:index --target=react --slot=main --sha256=<历史 SHA-256> --deployment-id=<历史完整部署 ID> --mode=history
```

索引对象键为 `deployments/<host>/<slot>/<deployment-id>.json`。当前索引对应 React main v1 `4e5f259f-c985-4c2d-9c76-853c5b33a107`、初次 v2 `18824a5c-9103-41a5-953b-0efaedf4360a`、同版维护部署 `784a59f7-0bc7-479f-88d8-5f178772e919`、显示名隔离部署 `74c83661-8f62-44a1-9620-75ff3a05b8fc`、更新横幅部署 `edc7d9a1-af82-4fa2-a915-46696724598d`、页面新旧判断部署 `5c17e435-57ec-4faa-ad2b-7288cfd84333`、当前判断超时部署 `8589bf50-b6d2-493f-9551-ea4b7dd8adec`、drill `37de0c78-d26b-400f-8e8c-c0c9bf048bce`；Vue main v1 `96522b51-ed42-4d76-b06c-92325d63a909`、初次 v2 `5f1ac456-9416-4c35-bf72-b4b782d13e66`、同版维护部署 `224d7b68-dc16-467c-9394-9c4ddc4eaf17`、显示名隔离部署 `f1cf4dcb-fecc-49e7-a426-42a183b0a149`、更新横幅部署 `3a9b5ee5-f38d-4a2d-9515-7b9420b0cd72`、页面新旧判断部署 `e05fd502-8cf1-4e21-a610-8011c7346c49`、当前判断超时部署 `8472fc4d-ca25-45ca-a4f1-1237db6be642`、drill `6d1170ee-f135-4b04-8685-b07b949e6cd4`。现有 `main` 的部署命令自动完成上传后的索引记录、本地资产归档和保留审计；`drill` 的后置步骤仍按人工流程执行。

归档契约固定为：

1. 构建后、Pages 上传前，将完整 `site/`、`build.json`、冻结身份基线和文件摘要清单打成内容寻址的候选制品；先上传私有存储，再重新下载核对字节摘要，失败则停止 Pages 发布。对象键包含宿主、槽位和制品 SHA-256，已有键不得覆盖。
2. Pages 上传后，以实际完整部署 ID 写入从部署到候选制品摘要的索引，保存记录时间、origin 和线上文件字节核验结果。当前十六个实际部署已有索引；`main` 的上传后索引、资产归档和保留审计已经自动串行，React/Vue 显示名隔离部署与当前更新横幅部署均返回 `postDeployIndexedAndArchived: true` 与 `retentionAudited: true`。`drill` 仍需手工记录；每次发布仍须记录执行人及浏览器现场结果。索引写入／读回失败即暂停下一次发布并进入恢复流程。`main` 与 `drill` 的记录互不替代。
3. 保留审计从 Pages 官方部署列表分页读取成功的 `main` 生产历史，选取当前 canonical、按创建时间最新三次（R/R-1/R-2）及滚动七天内所有成功部署的并集；再从 R2 下载每个索引、manifest 与 tarball，验证摘要链、身份、回执和当前线上文件，并逐项请求并集中的指纹资源。React/Vue 当前各四次生产部署均被选中并通过。这个结果证明**当前**滚动窗口选择与对象可用性，因这些部署尚未经历完整七个自然日，不能写成已经存活七天。暂不设置自动删除生命周期规则。归档是**恢复输入**，不能把 R2 对象直接当成 Pages 对外静态资源。
4. 存储凭据与 Pages 凭据分开：建议使用 [R2 官方说明的仅限该 bucket 的 Object Read & Write S3 凭据](https://developers.cloudflare.com/r2/api/tokens/)；不写入仓库、staging、构建回执或日志。Cloudflare 文档说明这种桶级权限适用于 S3 API，不能直接当成 REST API Token 使用。
5. 回滚先验证目标生产部署 ID、其完整制品和仍需保留的**当前版**指纹资源。Cloudflare [原生回滚 API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/rollback/)只作用于先前成功的生产部署；旧部署不可能预先包含未来版本的指纹资源，因此原生回滚后还须检查这些资源是否可访问。本次 React/Vue v2 资源在回滚 v1 后仍返回正确字节，但这一观察不是未来版本的可用性保证；若缺失，立即用已归档的旧版 shell 与新旧指纹资源组合重新 Direct Upload。恢复 worker 清缓存是另一条独立操作。两站测试站已各完成一次 v2→v1→v2 原生回滚与桌面页面核验；此结果只支持测试站重复部署，不代表正式生产发布门禁通过。

实际回滚顺序：先对当前版运行 `r2:cloudflare:index --mode=check`，对目标历史版运行 `--mode=history`；由项目所有者通过 Pages 控制台或官方 `POST /accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id}/rollback` 切换生产部署。随后以 Pages 项目 API 的 `canonical_deployment.id` 确认指向目标，运行目标版索引 `--mode=check` 并逐项请求仍需保留的新旧指纹资源，最后在桌面浏览器确认页面版本。需要恢复新版本时，对它的历史索引先运行 `--mode=history`，再调用同一回滚 API 指向新部署；恢复后重新验证 `canonical_deployment`、线上文件和浏览器。`wrangler pages deployment list` 仍按创建时间排序，回滚后列表第一条不代表当前生效部署，不能用它作放行依据。API Token 只从本机钥匙串或环境变量注入，不写进 URL、命令行参数或日志。

私有存储与十六个实际部署的制品、部署 ID 索引读回已运行；两站 Pages 原生生产槽位回滚及恢复也已演练。两站当前成功生产历史的滚动七天与 R/R-1/R-2 审计通过，缺失对象 404 与本地损坏制品拒绝反例通过；完整七日的时间跨度仍需自然经过后重跑。后续正式发布仍需独立机器恢复演练和真实设备证据；`drill` 的发布索引／归档尚未自动化。

## 机器发布门禁（上线后核验，仅用于演练）

按[模块规格](../../spec/cloudflare-test-deployment.md)的"修订：线上发布事实采集与机器发布门禁"，对已上线的 `main` 或 `drill` 运行 `build-verifier` 的机器发布门禁。分两步，第一步需要凭据，第二步不需要：

```bash
# 1. 带凭据导出成功生产部署历史（只发 Pages API 与 R2 的 GET；输出文件须在仓库及所有 worktree 之外，且不得已存在）
node scripts/audit-cloudflare-retention.mjs --target=react --export-history=<仓库外目录>/history-react.json

# 2. 不需要凭据：比对线上字节、采集响应头与可用性、调用 verifyRelease 与覆盖判定（--out 须在仓库外且不得已存在）
pnpm verify:cloudflare:release --target=react --slot=main --history=<仓库外目录>/history-react.json --out=<仓库外目录>/react
```

- 候选取自本地 `build/cloudflare/<host>/<slot>/build.json`，必须含 `plan`（构建时自动保存）；线上字节与候选不一致时拒绝出报告。历史计划从本地 `build/cloudflare/release-bundles/<host>/<slot>/` 的发布包取回，找不到或发布包没有计划的部署按"缺计划"处理。
- 退出码：`0` 通过；`1` 跑完但未通过，报告照常写出；`2` 拒绝运行，不写任何报告。
- 产出 `facts.json`、`report.json`、`coverage.json`、`verdict.json`、`record.md`，终端打印各自 SHA-256。`coverage.json` 含必需集 `requiredChecks` 与覆盖结果 `ok`、`missing`。结论三个分量分别给出：`report.ok`、覆盖结果、历史是否完整。
- 2026-09-22 首次运行结果见[验证记录](../../tasks/cloudflare-test-deployment/verification.md)：两站均因此前的发布没有保存计划而未通过保留检查。这是如实结论；此后的发布都带计划，保留窗口内不再有缺计划的部署后即可通过。
- 公开 HTML：工具对入口、启动地址、离线页与预缓存中带 revision 的 `.html` 逐个请求，只跟随同源、同协议的重定向（Cloudflare 会把 `/app/index.html` 308 到 `/app/`、`/app/offline.html` 308 到 `/app/offline`），以最终 200 响应的头执行 `html-headers`（[ADR-0032](../adr/0032-html-response-header-check.md)），重定向链记入事实文件；重定向响应本身的头不参与判定。必需集为 `artifacts`、`response-headers`、`identity-baseline`、`release-retention`、`html-headers`。

## 上线前核验（预览部署）

按[模块规格](../../spec/cloudflare-test-deployment.md)的"修订：上线前核验"，在候选上线之前，把同一份 `main` 暂存目录上传到预览分支 `candidate`，在这次预览部署的唯一地址上运行机器门禁。只用于 `main` 槽位。

```bash
# 1. 只读预检（与原流程相同）
node scripts/deploy-cloudflare-site.mjs --target=react --slot=main --mode=check

# 2. 上传到预览分支 candidate（Cloudflare 写操作，只写预览环境；需项目所有者同意）
node scripts/deploy-cloudflare-site.mjs --target=react --slot=main --mode=preview-candidate

# 3. 带凭据导出生产历史（同上一节第 1 步）
node scripts/audit-cloudflare-retention.mjs --target=react --export-history=<仓库外目录>/history-react.json

# 4. 不需要凭据：以第 2 步输出的部署 ID 核验预览部署
pnpm verify:cloudflare:release --target=react --slot=main --pre-deploy=<部署 ID> --history=<仓库外目录>/history-react.json --out=<仓库外目录>/react
```

- 第 2 步只接受 `--slot=main`，分支固定为 `candidate`，不进入 `main` 的重复发布预检、R2、归档或审计。上传后以 Pages API 读回，要求环境为 `preview`、分支为 `candidate`、返回地址等于按部署 ID 推算的唯一地址 `https://<部署 ID 前 8 位>.<项目>.pages.dev`；输出部署 ID 与暂存回执 SHA-256。上传后若报错，报错会说明预览部署已创建，先检查 `candidate` 分支再重试。
- 第 4 步的观测地址只由部署 ID 推算，不接受任意地址；分支别名 `candidate.<项目>.pages.dev` 会随下一次上传移动，不用于观测。暂存目录的 `_headers` 必须与回执一致且只含路径规则。预览额外返回的 `X-Robots-Tag: noindex` 记入事实文件，不影响结论。
- 上线前模式把历史中的**全部**生产部署视为之前的版本；历史为空时判为不完整。
- **不得**在 `candidate` 预览地址上做安装、浏览器或恢复验收，也不得以它声称任何安装验收通过（部署契约第 4 条的例外只允许机器检查）。
- 核验之后如需上线，把**同一份**暂存目录按原流程上传 `main`，再运行上一节的上线后核验；两份报告中的候选暂存回执 SHA-256 必须一致，与两次部署 ID 一起写入发布记录。当前部署脚本不强制先做上线前核验。
- 2026-09-22 首次运行见[验证记录](../../tasks/cloudflare-test-deployment/verification.md)：唯一地址规律对预览部署成立，预览上的缓存头与生产要求一致；结论因历史缺计划未通过。

## 从 R2 恢复运营状态

机器损坏或更换时，`main` 的运营状态（暂存目录与构建回执、旧资源归档、当前部署的发布包）可以只凭仓库代码、R2 与凭据恢复（[模块规格](../../spec/cloudflare-test-deployment.md)"修订：从 R2 恢复运营状态"）：

```bash
pnpm install --frozen-lockfile
pnpm recover:cloudflare:site --target=react   # 或 vue；槽位固定为 main
```

- 脚本依次：从 R2 部署索引查出当前生产部署及其发布包摘要 → 下载并校验发布包 → 恢复暂存目录与构建回执 → 重建旧资源归档 → 以 `r2:cloudflare:index --mode=check` 只读核对发布包、线上字节与索引一致。成功时输出 `{"deploymentId": …, "bundleSha256": …, "retainedAssets": …, "indexVerified": true}`。
- **只读**：不上传、不部署、不写索引。
- **不会覆盖运营中的状态**：`build/cloudflare/<host>/main/` 或 `build/cloudflare/<host>/retained/main/` 已存在时，在读取凭据之前拒绝；需要重新恢复时先把现有状态移开。
- **恢复出的是当前部署本身**，它不能通过 `deploy --mode=check`（该检查针对基于当前归档构建的新候选）。下一次发布照常先构建新候选，再运行 `deploy --mode=check`。
- 只恢复当前部署的发布包；上线前后核验需要的历史发布包可按需用 `r2:cloudflare:bundle --mode=download` 逐个取回。`drill` 按原流程重新部署即可恢复。
- 2026-09-22 在本机临时目录的全新克隆中演练（**同机隔离模拟，不等于独立机器**），两站均恢复成功且与主目录逐字节一致，随后构建的新候选通过 `deploy --mode=check`；见[验证记录](../../tasks/cloudflare-test-deployment/verification.md)。

## 凭据与回滚边界

沿用[既有 Pages 冒烟站](pages-smoke-deploy.md)的最小权限 API Token 与本机钥匙串／环境变量注入方式。部署脚本不得回显 Token、账户 ID 或 Wrangler 登录缓存。Nuxt Workers 需要独立核对所需权限，不借用 Pages Token 假定可用。

Cloudflare 原生 Pages 回滚只接受先前成功的**生产**部署，不能把预览部署当作生产回滚目标。`drill` 上重新 Direct Upload 正常 v2 是恢复演练，不是 Cloudflare 原生回滚；后者已在 React/Vue 两个测试项目以 v2→v1→v2 实测。Pages 部署回滚只能恢复某次静态部署；故障 worker 的清理仍要按[发布与事故手册](release-and-incident-runbook.md#回滚)部署恢复 worker，并核验只清理本应用缓存。两类操作分别记部署 ID。Pages 不保证历史部署中的指纹资源永久可用，因此新上传必须携带保留窗口内的资产并由线上请求核验。目前本机归档仍被 `.gitignore` 排除；四槽基础制品、两站初次 main v2 制品、同版维护制品、显示名隔离制品、更新横幅制品、页面新旧判断制品及判断超时制品、共十六个部署 ID 索引已另存 R2 并读回，`main` 自动保留审计已接入。迁移机器、清理 `build/` 或事故恢复前，要按制品摘要下载并校验，不能仅依赖本地目录。

## 维护者最短路径

1. 在[目标登记](#目标登记)中选一个目标，确认其项目名、槽位、origin 与上传根；Nuxt 与 Next/Start 当前没有可发布目标。
2. 只对该目标构建，只上传该目标、该槽位的 `build/cloudflare/<host>/<slot>/site/`，命令见[构建、发布与验收顺序](#构建发布与验收顺序)与[隔离预览槽位](#隔离预览槽位的重复部署与恢复)。
3. 当前完整部署 ID 以 Pages 项目 API 的 `canonical_deployment.id` 为准，历史 ID 见 R2 索引 `deployments/<host>/<slot>/` 与[验证记录](../../tasks/cloudflare-test-deployment/verification.md)；不要用 `wrangler pages deployment list` 的第一条代替。
4. 静态回滚走[实际回滚顺序](#稳定槽位放行前的制品归档部分完成)，故障 worker 清理走恢复 worker；两者分别记录部署 ID。

## 当前状态：PC 试点与正式 V1 门禁

截至 2026-09-21，本模块完成的是 **PC 桌面 Chrome 测试部署试点**，不是正式 V1 发布批准。

| 项目 | 状态 | 证据或缺口 |
|---|---|---|
| React/Vue 独立 Pages 站、身份与缓存命名空间隔离 | 已取得 | 验证记录 T3/T4 |
| 桌面 Chrome 在线、离线兜底、提示更新、恢复 worker | 已取得 | 验证记录 T5 演练 |
| Pages 原生 v2→v1→v2 回滚与线上指纹资源核验 | 已取得 | 两站 `main` |
| 桌面 Chrome 原生安装、独立窗口、唯一显示名 | 已取得 | 用户配置中的 React/Vue 安装已核对；已安装窗口断网重载：Vue 在用户配置中，React/Vue 另在独立配置经 CDP 安装后复测 |
| macOS Safari 渐进兼容（在线、受控、离线重载与离线兜底） | 已取得 | Safari 18.6 经 WebDriver；更新提示与“添加到程序坞”未测 |
| 私有 R2 制品、部署索引、R/R-1/R-2 与滚动七天选择审计 | 已取得 | 十六个部署索引；`main` 后置步骤自动化 |
| 完整七个自然日的制品存活 | **pending** | 相关部署自然满七日后重跑 `audit:cloudflare:retention` |
| 独立机器下载、校验与事故恢复 | **pending** | 一条命令恢复脚本已交付；2026-09-22 在同机全新克隆中隔离模拟通过（不等于独立机器）；真正的第二台机器尚未验证 |
| `drill` 上传后索引、归档与审计自动化 | 已取得（审计除外） | 2026-09-22 起上传前预检与上传后索引、归档自动完成，React `drill` 部署 `ae41ddfd…` 实测；`drill` 按规格不做保留审计 |
| Nuxt SSR Worker | **不通过** | 本地启动门禁失败；不得宣称支持 |
| H5、Android、iOS 实机与移动端原生安装 | 延后 | 项目所有者要求 PC 优先 |
| 远端 GitHub CI | 缺失 | GitHub 暂不可用，仅有本地 lint、typecheck、test |

正式 V1 发布仍以[生产发布浏览器证据](browser-release-evidence.md)和[发布与事故手册](release-and-incident-runbook.md)为准，其中 Android N/N-1、移动端原生安装与远端 CI 不能由本表的桌面结果替代。

## 官方依据

- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)：单目录上传、预览别名、Direct Upload 项目不能原地改成 Git 集成。
- [Cloudflare Pages Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)：HTML 路由与历史资产可用性边界。
- [Cloudflare Pages Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)：预览别名与公开可访问性。
- [Cloudflare Pages Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)：仅生产部署能作为回滚目标，预览部署不能用作生产回滚。
- [Cloudflare Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/)：`_headers` 只覆盖静态响应。
- [Cloudflare Pages deployment list API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/list/)：按生产环境分页读取部署历史，供滚动保留审计选取候选集合。
- [Cloudflare Workers Nuxt](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/nuxt/)：Nuxt SSR 的候选部署路径，仍需本仓库现场验证。
