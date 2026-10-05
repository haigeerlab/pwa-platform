# npm 发布记录：0.4.0

> 2026-10-06（Asia/Kuala_Lumpur）：十个公开包已发布到 `latest`，完成公开读回和全新消费；PRE 未升级。版本标识及本记录通过本次独立 PR 收口，文档站最终版本更新待其合入和部署。

## 范围与基点

本版改善导航短暂失败的显式重试、默认暂时不可用提示和有界自动恢复，不新增业务缓存或运行时包。身份、scope、worker URL、缓存准入和更新确认协议不变，见 [ADR-0052](../../docs/adr/0052-offline-experience-resilience.md) 与[升级说明](../offline-experience-resilience/upgrade.md)。

[PR #136](https://github.com/haigeerlab/pwa-platform/pull/136) 合并基点 `650a3076fc43cd1b5a22f395b7321bca7cbb7bb6` 的[完整 CI](https://github.com/haigeerlab/pwa-platform/actions/runs/37350037805) 七项成功：Node 22／24、Windows、Chrome、Edge、WebKit／Firefox 引擎冒烟和真实 FCM。Node 各 2,627 单测；Chrome／Edge 各 327 通过、1 项既有跳过，其他引擎仍有配置和协议范围内跳过。已有开发依赖审计发现保留，未改锁文件或执行自动升级；当前公开包生产依赖未受该私有 Nuxt 开发链影响。

`release/npm-0.4.0` 固定于 `1f22ede82a7df8d2adfb7649e57d7938f7a1aec8`，相对 main 只含十包 package.json 与 Vite onboarding skill 的 11 处版本字段。候选冻结安装、构建、check:publish 和 React 归档接入 Chrome 四项通过；十包 dist 共 483 文件与已验证临时候选逐字节一致。公开注册表此前十包 latest 为 0.3.2；Git 包版本为 0.3.1，不把两者混为当前公开版本。

## 发布与集中读回

所有者批准固定十包 0.4.0、public、latest，后续明确允许 npm CLI 打开官方网页做身份验证。使用 Node 24.18.0／npm 11.16.0 的原生交互式 `npm publish <approved-tarball> --access=public --tag=latest --ignore-scripts`，按 contracts → core/engine-workbox/build-verifier → sw-runtime → client-runtime → vite → entry-resilience/vue/react 顺序连续提交。中途没有逐包查询版本或标签。

此前非交互 OTP 提交被 EOTP 拒绝，首次网页等待按所有者要求取消；分别只读核实十包目标不存在后才重新发起，没有重复发布。新一轮网页验证完成后十包命令均成功。npm 返回处理提示，早期 metadata 部分不可见；等待异步处理后才宣布分发完成，不把 CLI 受理当作全部已可安装。

公共注册表最终读回时间 `2026-10-05T18:50:29.240Z`：十包版本和 latest 均为 0.4.0，tarball 全部 HTTP 200，下面十个 SHA-256 与批准的本地归档相同，平台内部依赖闭包全部为 0.4.0。注册表处理完成顺序不等于 CLI 提交顺序。

| 包 | 已发布归档 SHA-256 |
| --- | --- |
| @pwa-platform/build-verifier | `6e257a46bf8257c1a3476ebeb8d662145568e3c437bdd972cba3528a8886bac5` |
| @pwa-platform/client-runtime | `65dc850822e12e061786f52e6f41adda202ee5dde870d688157fc939686bd20c` |
| @pwa-platform/contracts | `7739afa9f4f6aaee9778b9d9de13c3bd8764ce458e69627f639f7c5fa37e77b9` |
| @pwa-platform/core | `97bd7d0b2a7b66f234b511ac391cc27284719e742834d726f9d447a28f82d0c3` |
| @pwa-platform/engine-workbox | `e356c4e580c5409fecbde1c94cc2830b5e38bfc69813966982a9c9df9e7ca453` |
| @pwa-platform/entry-resilience | `9483d6a43ecaffd48ed7c89ccc7290bb7386165ca587edbfcf7db5a957be411d` |
| @pwa-platform/react | `ebf527c7f32b3173c7ca950a64fe2fdc5fb2f140c93a6ce91d62531874b04e6d` |
| @pwa-platform/sw-runtime | `bfe768e85ca174c91151325f98db5b6eaf1688c23573b5e68b046ea7019d4fdf` |
| @pwa-platform/vite | `51066f5ea5b1cfc4b3fee6ed4f12c6c81ae6c5069819b97ff08ad556792fc93d` |
| @pwa-platform/vue | `431d2ab8e73e90f44ed097f194a352309e74799422e67a5188a0a564ad245424` |

全新临时项目使用独立缓存，从公共 registry 安装十包（无 workspace 或本地 tarball override），十个 ESM 根入口导入通过，锁文件的平台 resolved URL 全部指向官方 registry，无旧版嵌套平台包。消费环境 Node 24.18.0／npm 11.16.0；Vite 8.3.0、Vue 3.5.42、React 19.3.0。Vite 构建通过，生成 worker 含 navigationRetry 和新探测协议，默认页含中性提示且不再使用 HEAD worker 探测。

## 文档与边界

发包前从固定 main 提交部署 122 文件静态文档产物；Cloudflare Pages 项目 pwa-platform-docs，生产 deployment `b3f55304-d5cd-44fa-ac8f-679338a05181`、commit 650a307、状态 success，自动部署保持关闭。十三个随包 onboarding 链接 200，新离线说明和未知路径 404 经 HTTP 读回；搜索、复制等交互沿用该产物的部署前验证。文档当前版本标识和本次发布状态在本 PR 中更新，部署须等合入后的 main CI。

R0 已完成；OE5 剩余原生边界与 R1 宿主现场验收仍保留。四个 Chrome N／N-1 × Vue／React 原生组合基础安装、启动、更新和恢复已补测；900 ms 原生故障窗口、真实隐藏窗口、实体手机、真实丢包、DNS/证书与 PRE 恢复演练等仍未完成。包可安装不代表 V1 业务发布资格通过；没有部署 PRE 或恢复其他暂停模块。
