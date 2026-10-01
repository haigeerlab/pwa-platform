# 实现计划：stable-release-qualification

## 顺序与验收

1. **冻结范围与测试环境。** 确定十包候选、现有 PR 与基线；检查 Android、iPhone、桌面浏览器和公开隔离槽状态，建立版本/设备/结果矩阵。验证：每个目标有可执行入口，不能执行的目标明确标为未执行。
2. **复用已有证据并补齐浏览器矩阵。** 先核对 Vue/React 既有更新与离线真机记录，再测桌面 Chrome N/N-1、Mac Safari、Android Chrome、iPhone Safari 的浏览器页和独立安装窗口。验证：安装资格、图标启动、manifest/scope、v1→v2 与两标签行为逐项记录。
3. **离线与语言/视觉。** 以不启用业务运行时数据缓存的两个语言构建，在各设备测试离线冷启动、未缓存导航、恢复联网、亮暗模式、窄屏及默认和业务自定义 UI。验证：截图或 DOM 证据与实际行为一致。
4. **入口恢复端到端。** 对两独立 Origin 演练正常、迁移、故障、整体断网、旧 Origin 单独不可达、过期/非法清单、用户确认跳转和返回路径；覆盖中英文及安装窗口。验证：按入口恢复演练模板逐项填写，不将离线页和恢复页混为同一功能。
5. **交叉边界与缺陷修复。** 核对 `/`、`/m/` scope 隔离、缓存拒绝、恢复 worker、严格 CSP 和更新 UI 设置；发现问题在所属模块按适用规格/ADR 修复并做回归。验证：受影响矩阵重跑，所有阻断问题关闭。
6. **正式包候选与发布。** 公开入口恢复包，审查十包版本、依赖闭包与 semver；从干净提交运行质量门禁、pack、独立消费、内容扫描和 npm 可用性检查。按依赖拓扑发布；逐包从 registry 读回并核对 `latest`、哈希与文档。验证：发布记录完整，失败时停止后续包。

## 发布判定

- 使用 `spec/stable-release-qualification.md` 的矩阵与 `docs/operations/browser-release-evidence.md` 的发布通道规则。当前只有一部 Android，可完成真机观察，不能取得 Android N-1 通过证据；若设备条件不变，正式发布只能按 `desktop` 通道判定，Android 结果仍完整记录但不对外宣称已通过 `desktop+android` 门禁。
- npm 包发布与业务应用生产部署分别判定；真实私有业务项目只接收脱敏验收结果，不复制私有源码、名称或配置到公开仓库。
- 每次 Cloudflare 写入先执行现有费用与归档门禁；任何测试结束都把隔离槽恢复到正常可用版本。

## Documentation delivery

| Concern | Planned artifact | Rationale |
|---|---|---|
| stable-release-qualification | `spec/stable-release-qualification.md`、本计划、`todo.md`、`verification.md` | 固定范围、顺序与实测证据。 |
| capability-map | `spec/CAPABILITY-MAP.md` | 登记本模块。 |
| package-distribution | `docs/operations/npm-package-release.md`、发布记录 | 记录十包正式发布门禁、顺序与结果。 |
| entry-resilience | 包 README/LICENSE 与接入说明 | 让独立消费方可安装和接入。 |
| developer-entry | `README.md`、文档站包页、`CHANGELOG.md` | 与 registry 实际状态一致。 |

## 2026-09-27 修订：生产缺口闭合

### 设计决定

- 继续使用本模块闭合 T2–T6，不新建一个会重复浏览器证据职责的模块。
- 把“已有真机观察”和“发布通道通过”分开记录；已有截图、DOM 或自动化结果只能填入它实际覆盖的设备、版本和场景。
- 不把第二台 Android、Apple 发布通道裁决或真实网络故障伪装成仓库内可自动完成的任务。缺少外部条件时保持阻塞项未勾选。
- 性能预算、完整 WCAG 门禁和生产可观测性不是本模块现有规格的一部分；先形成独立 proposal，经能力图评审后再决定是否新增模块，不能顺带塞入 T2–T6。

### 依赖顺序

```text
R1 证据对账
 ├─> R2 现有设备的更新、离线、语言与视觉补测
 ├─> R3 手机入口恢复与单 Origin 故障补测
 └─> R4 scope、缓存拒绝、恢复 worker、CSP 与 UI 交叉边界复核
       ├─> R5 Apple 发布通道裁决
       └─> R6 Android N/N-1 两机门禁
```

R2–R4 可以按 Vue／React 场景分别执行，但同一公开测试槽的部署和恢复必须串行。R5、R6 都消费前面的逐场景证据，不能先写“通过”再补记录。

### R1：对账现有证据并固定剩余矩阵

**描述：** 将 `verification.md` 的实际结果映射回 T2–T6，区分已通过、部分通过、未执行和不在 `desktop` 通道；不重新解释原始证据。

**验收标准：**

- `todo.md` 的每个父任务都有已完成子项与剩余子项，没有空泛的“待补”。
- 与生产就绪审核、首页矩阵和 `desktop` 通道结论一致。
- 不把 Android 单机或 iPhone 渐进兼容记录升级为移动发布门禁通过。

**验证：** `pnpm docs:build`、`git diff --check`，并人工比对 `verification.md` 与生产就绪审核。

**依赖：** 无。
**预计范围：** S（2 个任务文档）。

### R2：补齐现有设备可执行的更新、离线与界面场景

**描述：** 在当前 Android 与 iPhone 实体设备上补齐仍缺的旧 DOM 保留、安装窗口更新、中文离线页、多语言／主题和窄屏可访问性观察；桌面只在候选代码变化后重跑 N/N-1。

**验收标准：**

- Vue／React 的每个目标场景分别记录设备、OS、浏览器完整版本、构建语言和结果。
- iPhone 断网恢复后的注册状态差异有可重复步骤，或明确记录为已接受限制。
- 没有新运行时代码时不制造无意义的重复云部署。

**验证：** 逐设备记录、必要的截图／DOM 证据；若修复代码，则运行受影响包测试和 Chrome N/N-1 全回归。

**依赖：** R1。
**预计范围：** M（证据记录；若发现缺陷，按所属模块另立修复切片）。

### R3：补齐移动端入口恢复的故障分支

**描述：** 在当前 Android 与 iPhone 上只让被测 Origin 失效、保持备用 Origin 可达，验证恢复页、用户确认、返回路径、撤回和整体断网区别；真实 DNS／证书故障另行记录，不能用本地双 Origin 自动化代替。

**验收标准：**

- Vue／React、Android／iPhone 的执行范围逐格记录，未执行项保持未通过。
- 点击前绝不跨 Origin 跳转；非法、过期或降序清单继续被拒绝。
- 测试结束后公开隔离槽恢复正常版本，部署与归档记录完整。

**验证：** 设备检查器、公开槽读回、Cloudflare 部署索引与入口恢复记录模板。

**依赖：** R1；与 R2 的云端写入串行。
**预计范围：** M（测试与证据；缺陷修复不并入本任务）。

### R4：复核交叉边界并关闭可在仓库内验证的缺口

**描述：** 复核 `/` 与 `/m/` 隔离、默认缓存拒绝、恢复 worker、严格 CSP、更新 UI 配置和当前公开包门禁。发现缺陷时回到所属模块的规格、ADR 与测试，不在本计划内做跨模块顺手重构。

**验收标准：**

- 每个交叉边界有自动化或明确的人工记录，且能追溯到候选提交。
- 私有、写入、流式、带授权和未分类请求仍不进入平台缓存。
- 若没有阻断缺陷，T6 可关闭；有缺陷则登记所属模块和复测范围。

**验证：** `pnpm lint`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm test:browser`、`pnpm check:publish`。

**依赖：** R1；代码修复后阻塞 R5、R6 最终裁决。
**预计范围：** M。

### R5：定义 Apple 平台发布通道

**描述：** 基于 R2、R3 的实证，决定是否新增 Apple 渐进兼容通道及其必测范围。该决定涉及发布承诺，必须先修订规格并新增或更新 ADR，由项目所有者评审后才能落地。

**验收标准：**

- 明确 macOS Safari 与 iPhone Safari 是否属于同一通道，以及安装、更新、离线、恢复的阻塞项。
- 明确如何处理断网恢复后的 `not registered`／active controller 差异。
- 未获评审前，公开文档继续维持“渐进兼容／部分通过”。

**验证：** Spec、ADR、浏览器矩阵、证据模板和公开文案一致性检查。

**依赖：** R2、R3、R4。
**预计范围：** M（设计与治理文档）。

### R6：取得 Android N/N-1 两机门禁

**描述：** 按既有两台实体设备轮换规则执行 `desktop+android` 通道必测矩阵；不通过侧载或模拟器替代 Google Play 稳定版本证据。

**验收标准：**

- 两台设备分别记录型号、Android、Chrome 完整版本、更新来源、日期和逐场景结果。
- Vue／React 的安装、更新、离线、恢复和清理场景全部无空项。
- 任一必测失败或未执行时，`desktop+android` 继续不通过。

**验证：** `docs/operations/browser-release-evidence.md` 的完整记录与项目所有者签署。

**依赖：** R2、R3、R4；外部依赖为第二台可控 Android 设备。
**预计范围：** M（真实设备验收）。

### R7：补齐桌面 Edge、Safari、Firefox 的真实浏览器证据（2026-09-30）

**描述：** 按 [ADR-0047](../../docs/adr/0047-local-real-safari-and-firefox-webdriver-runs.md) 在 harness 中新增 W3C WebDriver 适配层，让现有浏览器用例在本机真实 Safari 18.6 与 Firefox 157 上运行；按 ADR-0044 在本机真实 Edge 上运行完整 `test:browser`，并补 Edge 原生安装的人工记录。目标是桌面三列不再有 ○，▲ 升为真实浏览器证据；不改变 `desktop` 通道定义。

**验收标准：**

- harness 在 `PWA_REAL_BROWSER=safari|firefox` 下以 WebDriver 会话运行用例，调用未实现的能力时报明确错误；Chrome 门禁不受影响。
- sw-runtime、client-runtime、examples-browser-e2e、vite、entry-resilience 与更新提示 UI 套件都能在两款真实浏览器上运行；跳过项逐条写明原因。
- 为移植而改写的用例（`setOffline`、`page.route`、假时钟）在 Chrome 阻塞门禁中继续通过。
- 本机 Edge 完整 `test:browser` 结果与 Edge 原生安装人工观察写入 verification.md。
- 跨平台测试证据页按实际结果更新，每格可追溯到记录。

**验证：** `pnpm test:browser`（Chrome，阻塞）；`test:browser:real` 两款浏览器各一次完整运行；`PWA_BROWSER_CHANNEL=msedge pnpm test:browser`；文档构建。

**依赖：** 无代码依赖；外部依赖为本机 `geckodriver`、Safari 远程自动化和完整安装的 Edge。
**预计范围：** L（harness 适配层 + 五个包的移植与取证）。

### R8：真机 Android Chrome 自动化证据（2026-09-30）

**描述：** 按 [ADR-0048](../../docs/adr/0048-android-real-device-chrome-automation.md) 在 harness 中新增真机 Android 模式，经 USB 连接 Xiaomi 14（Android 16，Chrome 153）上的 Chrome，在独立浏览器上下文中运行现有浏览器用例，补齐矩阵 Android 列的 ○ 与缺口。不改变 `desktop+android` 通道的 N/N-1 要求。

**验收标准：**

- harness 在 `PWA_ANDROID_SERIAL` 下连接真机 Chrome、每个测试使用独立上下文、自动建立与撤销端口映射；不修改手机 Chrome 设置；Chrome 门禁不受影响。
- 接入 `test:browser` 的各包在真机上运行，跳过项逐条写明原因。
- 为移植而改写的用例在 Chrome 阻塞门禁中继续通过。
- 结果写入 verification.md，跨平台测试证据页 Android 列按实际结果更新。

**验证：** `pnpm test:browser`（Chrome，阻塞）；`test:browser:android` 各包在真机上完整运行两次；文档构建。

**依赖：** 以 USB 连接并开启 USB 调试的实体 Android 设备。
**预计范围：** M（harness 连接层 + 各包接入与取证）。

### R9：真机 iPhone Safari 自动化证据（2026-10-01）

**描述：** 按 [ADR-0049](../../docs/adr/0049-iphone-real-device-safari-automation.md) 在 harness 中新增真机 iPhone 模式（复用 ADR-0047 的 WebDriver 适配层 + 局域网 HTTPS 转发），在 iPhone 16 Pro（iOS 27.0.1）的真实 Safari 上运行现有浏览器用例，补齐矩阵 iPhone 列。不改变 ADR-0041 的渐进兼容结论。

**验收标准：**

- harness 在 `PWA_IOS_UDID`／`PWA_IOS_LAN_IP`／`PWA_IOS_TLS_DIR` 下连接真机 Safari，fixture 服务器经局域网 HTTPS 转发访问，断网时得到网络错误；会话总是正常结束；每个测试结束清理该来源的 worker、缓存与存储；Chrome 门禁与 R7 真实浏览器运行不受影响。
- 接入 `test:browser` 的各包在真机上运行，跳过与“无法验证”逐条写明原因。
- 结果写入 verification.md，跨平台测试证据页 iPhone 列按实际结果更新。

**验证：** `pnpm test:browser`（Chrome，阻塞）；`test:browser:ios` 各包在真机上运行两次；R7 Safari／Firefox 回归；文档构建。

**依赖：** 经 USB 连接、开启远程自动化并信任测试根证书的实体 iPhone，与 Mac 同一 Wi‑Fi。
**预计范围：** M。

### 检查点

- **R1 后：** 文档构建通过，任务清单和原始证据一致，再开始任何新真机写入。
- **R2–R4 后：** 运行完整质量门禁；阻断缺陷必须回到所属模块修复并复测。
- **R5–R6 后：** 只有相应发布通道全部必测项通过并经人工评审，才更新首页和生产就绪结论。

### 后续 proposal（不在本修订执行）

- 性能预算：包体、首次启动、worker 安装、离线启动和运行时缓存开销。
- 可访问性门禁：axe 自动化、键盘、对比度与至少一种辅助技术的人工记录。
- 可观测性：宿主接入事件、指标、SLO、隐私边界和告警责任。
