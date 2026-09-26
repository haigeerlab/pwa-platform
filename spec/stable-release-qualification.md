# 规格：stable-release-qualification

## 目标与范围

在发布首个正式 npm 版本前，对用户实际能用到的安装、更新、离线降级和访问入口恢复完成一次可追溯的端到端验收。候选包为已公开的九包（`contracts`、`core`、`engine-workbox`、`build-verifier`、`sw-runtime`、`client-runtime`、`vite`、`vue`、`react`）以及目前私有的 `entry-resilience`。正式版本暂以 `0.1.0` 为候选，必须先审查公开 API 与依赖闭包再锁定。

本模块编排和记录验收，不改变 `PwaIdentity`、Service Worker scope、缓存准入或恢复信任模型。发现缺陷时回到所属模块的规格、ADR 和测试修复，再对同一候选重跑受影响场景。Nuxt、Push、离线写入等其他私有包不在这批 npm 分发范围。

## 环境与证据

- 桌面 Chrome 当前稳定版 N 与 N-1 遵守现有浏览器发布矩阵；Mac Safari、Android Chrome 当前版本和 iPhone Safari 做真实设备兼容性观察。若选择 `desktop+android` 发布通道，Android N-1 必须按既有两台实体设备规则取得；只有一台 Android 时不得标记该通道通过。发布尝试创建时固定通道。
- Vue 与 React 各至少一个公开 HTTPS 隔离槽，真实 v1→v2、两种语言构建及两个独立 Origin。每次云端写入遵守现有免费额度、候选归档、部署索引与恢复流程；不得影响 `main` 槽。先记录被测提交、包版本、构建摘要、部署 ID、设备与浏览器完整版本。
- 浏览器标签页与安装后的独立窗口分别记证据；每格标记通过、失败、未执行或按发布通道标记不适用，不能用自动化、模拟器或另一种浏览器代替真机结论。

## 验收矩阵

1. **安装与启动**：首次在线注册，manifest、worker URL、scope、start URL 与 display mode 正确；Chrome 的安装资格事件与原生安装流程、Safari 的系统安装入口分别检查。从图标启动、重开、基础交互和站点数据隔离正常。Safari 不要求出现 Chrome 的程序化安装事件。
2. **更新**：旧页不刷新时发布新版，发现等待 worker；“稍后”保留旧页并在真实 30 分钟后重新提醒；“更新”只接管，不自动刷新；显式点击刷新后显示新版。覆盖安装窗口、双标签、重复点击、更新失败与重试、离线时已下载更新的接管，及没有新版本时不误报。
3. **离线降级**：业务运行时数据缓存关闭，但应用壳与可选离线页预缓存。在线首访后断网冷启动；未缓存导航显示默认离线页；网络恢复后重试或自动恢复。核对中英文的独立构建、亮暗主题、窄屏、键盘与实际 UI；无缓存的首次离线访问只记录浏览器网络错误，不误判为已安装 PWA 失败。
4. **入口恢复**：插件关闭时不产生恢复入口；开启后分别验证 `normal`、`migrating`、`incident`。先在线保存合法清单，再只让当前 Origin 不可达而保持设备和备用 Origin 联网；恢复页显示通过形状与有效期校验的入口，用户点击之前绝不跳转。核对合法返回路径、非法路径丢弃、低序号/无效/过期清单拒绝、恢复后撤回。设备整体离线且清单为 `normal` 时不得把断网误报成域名故障。中英文、亮暗主题、窄屏和自定义色值均应可用。
5. **交叉边界**：`/` 与 `/m/` 部署的 manifest、scope、缓存及导航互不污染；未分类、私有、写入与流式请求不进入平台缓存；异常 worker 的恢复演练仅清理当前应用命名空间；严格 CSP 下离线页与恢复页可用；更新 UI 的关闭、位置、按钮颜色与未保存数据刷新钩子工作。
6. **分发**：候选源码冻结后完成安装、lint、build、typecheck、单元、真实浏览器、依赖审计与独立项目 tarball 消费。十包版本与依赖闭包一致，README/LICENSE/exports/类型/CSS 齐全，包内无凭据或私有业务数据；入口恢复包的公开 API、许可证、依赖与独立消费方接入单独核对。发布前审阅 changelog、文档站、npm tag 和回退方案；发布后从 registry 取回并比对产物。

## 通过与发布判定

- 本次声明的必测浏览器、各场景及每个发布包均有证据；任何必测失败或未执行都不得写成通过。渐进兼容平台的差异与无法取得的 Android N-1 如实披露，不能据此声称 `desktop+android` 门禁通过。
- 发现缺陷必须修复并复测；允许保留非阻断的已知差异，但要说明影响和适用平台。真实私有业务宿主不在本仓库操作，只使用公开示例与独立 Vite 5/Vue 3.4 消费夹具；业务方可按接入 skill 在私有仓库执行并提供脱敏结果。
- 完成上述证据、版本与 tarball 审阅后，才将正式版本发布到 npm 并核对 `latest`；发布是不可覆盖的外部写入，记录每包结果与实际哈希。任何中途失败停止后续包，并如实记录部分发布状态。

## Documentation impact

| Concern | Decision | Rationale |
|---|---|---|
| capability-map | update | 登记跨模块正式版验收与依赖。 |
| browser-matrix | follow | 不降低 N/N-1 与发布通道要求。 |
| browser-release-evidence | follow | 复用逐平台真实设备记录模板。 |
| package-distribution | update | 扩展入口恢复包和正式版本的分发说明。 |
| entry-resilience | update | 公开分发前核对接入与包边界。 |
| developer-entry | update | 发布后按实际 npm 状态更新。 |
| release-and-incident | follow | 复用恢复、回退与候选归档流程。 |
| stable-release-qualification | create | 新规格、计划、逐项清单与验收证据。 |
