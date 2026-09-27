# 正式 npm 版本验收记录（0.1.0 已发布）

> 本页只记录本次候选的实际证据。历史 beta 与演练记录仅作基线，不能自动算作本次正式版通过。任何空白或“未执行”都不是通过。

## 候选与范围

| 项 | 当前事实 |
|---|---|
| 工作分支 | `codex/stable-release-qualification`，从 `faea0084bcac34f22bb82c9edff3606e9ca2da5a` 开始 |
| 依赖 PR | [#15](https://github.com/haigeerlab/pwa-platform/pull/15)，2026-09-26 查询为 OPEN/MERGEABLE；含 React/Vue 真机更新演练记录 |
| 已发布包 | 九个既有包＋首次公开的 `@pwa-platform/entry-resilience`，共十个 `0.1.0`；npm `latest`、完整性与归档文件逐包读回通过，详见[发布记录](release-0.1.0.md) |
| 发布通道 | `desktop`；Android 仅一台，不宣称 `desktop+android` N/N-1 门禁通过 |
| 私有宿主 | 不在本仓库访问；只核对公开 Vite 5 / Vue 3.4 夹具并等待脱敏宿主反馈 |

## 环境盘点（2026-09-26 UTC）

| 平台 | 观察 | 本次作用 |
|---|---|---|
| Mac | macOS 15.7.3；本机 Google Chrome 153.0.8010.53；Safari 18.6 | Chrome 153 现为桌面 N-1；Safari 渐进兼容观察 |
| 桌面 N | [Chrome for Testing 官方通道数据](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json) 2026-09-26T10:17:54Z 显示 Stable 154.0.8037.57 | 下载官方 154 候选后重跑，不沿用 153/152 的旧 N/N-1 结论 |
| Android | 实体 23127PN0CC，Android 16，USB 可连接；初始 Chrome 152.0.7977.82，经用户授权从 Google Play 更新为 153.0.8010.53 | Google Play 当前只提供 153，按官方 Chrome 154 稳定版算 N-1；154 的 Android N 与双机轮换证据尚不可得 |
| iPhone | 实体 iPhone 16 Pro、iOS 27.0；USB 信任配对及 Safari 网页检查器现已连接 | Vue 正式候选已覆盖 Safari 更新、主屏幕安装、离线与入口恢复；React 正式候选演练进行中 |

## 本次执行记录

| 检查 | 状态 | 证据与限制 |
|---|---|
| `pnpm build` | 通过 | Node 24.18.0、pnpm 11.18.0；包括 `entry-resilience` |
| 正式候选冻结安装与构建 | 通过 | `CI=true pnpm install --frozen-lockfile` 使用原锁文件成功，749 包由本机存储复用；首次默认沙箱尝试因无 TTY 与 registry DNS 失败，重试在授权环境成功。`CI=true pnpm build` 成功；构建日志 `/private/tmp/pwa-stable-candidate-build.log` SHA-256 `a3940bd034df8075f7b5acc2776efa24bf9d1a8923a40b5131581dfaa031f107`。 |
| 正式候选静态质量 | 通过 | `CI=true pnpm lint` 成功，日志 `/private/tmp/pwa-stable-candidate-lint.log` SHA-256 `050c69da23536758722729aeda55a8d0fb9d557495ef6d33d70873a3b64a71c1`；`CI=true pnpm typecheck` 成功，日志 `/private/tmp/pwa-stable-candidate-typecheck.log` SHA-256 `836d7ca3cbb7e90d6e8d7892d5a7fe4ad4088c8a581b16503986d5beaa99f27c`；`pnpm audit --ignore-registry-errors` 输出 `No known vulnerabilities found`。 |
| 正式候选单元测试 | 通过 | 默认沙箱首次因 localhost 监听 `EPERM` 失败；授权回环端口后发现入口恢复包两条旧断言仍要求 `private=true`、Vite peer `^8`，与此次公开 Vite 5 候选相冲突。更新断言后包内单测及完整 `CI=true pnpm test` 均成功；完整日志 `/private/tmp/pwa-stable-candidate-test-final.log` SHA-256 `4d1014226c58bbf3cc5fc770bb08ef1e09c48d054a0bc41b0610f290e8e91029`。 |
| Chrome 153 完整浏览器回归 | 通过（当前源码基线） | 9 个含浏览器场景的包共 223 项通过、0 失败、0 跳过；日志 `/private/tmp/pwa-stable-browser-n.log` SHA-256 `186f12776e5c9a84ec57477b54b5b84c3a946d4e20adb57cc3478bc8bed96fc2`；实际版本 153.0.8010.53，按 N-1 记录。 |
| Chrome 153 正式候选浏览器回归 | 通过 | 冻结十包 `0.1.0` 元数据后重跑全仓，9 个浏览器套件共 223 项通过、0 失败、0 跳过，命令退出 0；日志 `/private/tmp/pwa-stable-candidate-browser-153.log` SHA-256 `76a3bdb34d590453511b8351b659bc8a4a7fef2fc2ff220c0f3dde548e19e9f7`。 |
| Chrome 154 完整浏览器回归 | 通过（当前源码基线） | 官方 ZIP HTTP 200、实际大小 191429663 字节，SHA-256 `0e6b3439469c1b8b95b2e89c72ea29f7af00fb2c28a8878358a0b6002b6d3a64`，`unzip -tq` 通过；可执行文件报 154.0.8037.57。首轮在 `sw-runtime` 49 项中 47 通过、2 失败（`/private/tmp/pwa-stable-browser-154.log`）；两项单独重复各 3/3、5/5 通过。调整测试等待与请求过滤后，完整回归 9 个包共 223 项通过、0 失败、0 跳过；日志 `/private/tmp/pwa-stable-browser-154-rerun.log` SHA-256 `598f4454e25825b3e6701646ada76bcbd67a9d2097d6eadc6f5a020842e10135`。正式候选有代码变更后须重跑。 |
| Chrome 154 正式候选浏览器回归 | 逐项复核后通过；总命令退出码不可信 | `CI=true PWA_HARNESS_CHROME_PATH=<官方 154>` 执行总命令返回 0，但日志 `/private/tmp/pwa-stable-candidate-browser-154.log` SHA-256 `8eaab380985aeb4ff93c07b45ce7404e890bd5313d6ee5a0520d449ffec90ac1` 中，私有 Nuxt 适配器有 1/12 项在 `browser.newContext` 设置阶段超时（11/12 通过），其余套件通过。单独重跑 Nuxt `CI=true ... pnpm --filter @pwa-platform/nuxt test:browser` 后 12/12 通过（`/private/tmp/pwa-stable-nuxt-browser-154-rerun.log`）。因总命令错误地掩盖内部失败，不能仅以退出码作验收；待查门禁传播问题。 |
| Chrome 154 正式候选干净重跑 | 通过 | 在无并发重负载时，用官方 154.0.8037.57 重跑全仓：9 个浏览器套件共 223 项通过、0 失败、0 跳过；命令退出 0。日志 `/private/tmp/pwa-stable-candidate-browser-154-clean.log` SHA-256 `602a4162c19a41508b811ac63ee8ba9346992aea9b0a26c52392f48c257cf4ca`。前次 Nuxt 设置超时属偶发资源争用，保留原失败记录。 |
| 公开示例语言一致性修正 | 本地及两站真机英文展示通过 | 检查发现 React/Vue 两站的离线页为英文，但入口恢复页和 drill 的可选更新卡片沿用中文默认文案。两站恢复插件显式设 `locale: "en"`，更新组件共用英文 `messages`；包默认中文及宿主覆盖 API 不变。Chrome 154 示例套件新增真实恢复页标题／`lang` 断言后 53/53 通过；示例类型检查和 `pnpm docs:build` 退出 0。Android 的 React/Vue 安装窗口及 iPhone Vue 安装窗口已观察英文更新卡片、离线页和入口恢复页；iPhone React Safari 标签页的英文更新卡片也已确认。中文构建的真机展示另列待测。 |
| 最新源码的构建与静态门禁 | 通过 | 在语言修正、十包元数据及 Cloudflare 在线校验重试之后，`CI=true pnpm build`、`CI=true pnpm typecheck`、`CI=true pnpm lint`、`CI=true pnpm docs:build`、`CI=true pnpm check:publish` 均退出 0；十包 metadata 与构建导出再次通过。新增在线校验单测 3/3。`CI=true pnpm test` 首次在默认沙箱因 localhost `EPERM` 失败，授权回环端口后完整全仓单测退出 0；失败归因环境监听限制，不计为代码通过证据。官方 Chrome 154.0.8037.57 的最新源码全仓浏览器回归 9 个套件、225 项通过、0 失败、0 跳过；日志 `/private/tmp/pwa-stable-final-browser154.log` SHA-256 `46c64e21599a193ba1af821914ea7641504f4d1c27763bfeb668456d7f2c3bf1`。 |
| Android Chrome 153 Vue Drill 安装 | 通过（本次旧候选冒烟） | 在公开 `drill` Vue 站观察到安装按钮，点击后出现 Chrome 原生安装确认卡片；确认后网页显示 `installed`。新 WebAPK `org.chromium.webapk.a5be8b3d54eb30ac0_v2` 首次安装时间 2026-09-26 19:09:33（手机当地时间）；从该包启动后无 Chrome 地址栏，CDP 对对应页面读到 `display-mode: standalone = true`、`/app/` 页面 v2/registered。只证明这部设备上安装与启动；版本更新仍待本次补测。 |
| Mac Safari 18.6 Vue/React 添加到程序坞 | 通过（本次旧候选冒烟） | Safari “文件 → 添加到程序坞”分别为公开 Vue Drill 和 React Drill 出现系统确认表单，名称和 `/app/` URL 正确；点“添加”后以新建的“Vue Drill”“React Drill”网页 App 启动。两窗口均无 Safari 地址栏，页面显示 v2/registered。React 的 `kind` 初始短暂 `no-registration`，随后变成 `prompt`；未将瞬态误记为安装失败。此次尚未测这两个 Mac 网页 App 的断网冷启动或更新。 |
| Mac Safari 18.6 已安装窗口再次核对 | 在线启动、基础交互、真实更新、Vue／React 离线导航与恢复、用户手工物理断网冷启动均通过 | React/Vue v2 候选部署后，Mac 的独立“React Drill”和“Vue Drill”窗口均能打开公开 `/app/`，窗口无 Safari 地址栏，界面显示 v2/registered、基础按钮可见。2026-09-26 在 React Drill 独立窗口点击 `Bump` 后计数由 0 变为 1，交互正常；2026-09-27 又完成两框架真实 v1→v2 双窗口提示、单点接管与逐窗口显式刷新。React 安装窗口完成物理 Wi-Fi 断网下的未缓存导航、默认离线页和联网自动恢复；Vue 安装窗口随后通过仅针对本 Origin 的 hosts 阻断，取得同等的默认离线页与撤销阻断后自动恢复证据。两站联网预热、完成最新 worker 接管并完全退出后，用户手工关闭 Mac Wi-Fi，分别从网页 App 图标冷启动；两者离线与联网表现一致，均正常显示 v2，无白屏。该冷启动结果为用户手工实机观察，不冒充自动化截图证据。 |
| Mac Chrome 153 React 原生安装 | 通过（本次旧候选冒烟） | 公开 React Drill 页面提供应用内 `Install` 和 Chrome 工具栏原生“安装”入口；后者弹出系统“安装应用”对话框，列出名称、Origin、说明和截图。确认安装后系统新增并启动 `PWA Platform React Drill` 独立应用窗口，没有浏览器地址栏；显示 v2/registered，页面状态含 `installed`。本项证明真实桌面 Chrome 153 的 React 安装，不代表 Chrome 154 或 Vue 都取得本次原生安装实证。 |
| Mac Chrome 153 Vue 已安装应用复核 | 独立窗口运行通过；安装流程未重新取证 | 本机既有 `com.google.Chrome.app.ggagoahmihncfeecmgbpfnamjelclfaj` 应用包由稳定版 Chrome 153 创建；2026-09-27 从该应用包启动后窗口无地址栏，公开 `/app/` 显示 v2/registered、`kind: none`，`Bump` 与 `Log out` 按钮可见。此项证明既有安装结果当前可启动，不把应用包存在反推为本轮已重做原生安装确认流程。 |
| Mac Chrome 154 Vue 原生安装 | 安装、DevTools 离线恢复和用户手工物理断网冷启动通过；真实更新待补 | 官方 Chrome for Testing 154.0.8037.57 使用新的本地未登录配置打开 Vue Drill v2/registered，工具栏出现原生“安装 PWA Platform Vue Drill”按钮，页面自身也显示 `Install`。原生安装对话框显示应用名、公开 Origin、说明及桌面截图，点“下一步 → 安装”后显示“已成功安装”。从新建 `com.google.chrome.for.testing.app.ggagoahmihncfeecmgbpfnamjelclfaj` 应用窗口打开 `/app/`，无浏览器地址栏，显示 v2/registered、页面状态 `installed`。安装窗口的 DevTools 离线导航与自动恢复另有通过记录；在线预热并完全退出后，用户关闭 Mac Wi-Fi、从应用图标冷启动，观察到与联网时一致的 v2 页面正常显示。本项物理断网结果是用户手工观察，不冒充自动化截图；真实更新仍待补。 |
| Mac Chrome 154 React 原生安装 | 安装、DevTools 离线恢复和用户手工物理断网冷启动通过；真实更新待补 | 同一官方 Chrome for Testing 154.0.8037.57 打开 React Drill v2/registered，工具栏出现原生“安装 PWA Platform React Drill”按钮，页面自身也显示 `Install`。系统对话框显示公开 Origin、说明和桌面截图，点“下一步 → 安装”后显示成功；新建 `com.google.chrome.for.testing.app.mnnogjmmdlkcjijdpmmihilinmbdfjbi` 独立应用窗口打开 `/app/`，没有地址栏，显示 v2/registered，页面状态含 `installed`。安装窗口的 DevTools 离线导航与自动恢复另有通过记录；在线预热并完全退出后，用户关闭 Mac Wi-Fi、从应用图标冷启动，观察到与联网时一致的 v2 页面正常显示。本项物理断网结果是用户手工观察，不冒充自动化截图；真实更新仍待补。 |
| 独立安装窗口更新、30 分钟重提醒、双标签稳定性 | 已执行设备范围通过 | Android Vue／React 安装窗口已完成真实更新接管和显式刷新，React 已重新取得旧 v1 DOM 保持证据；桌面 Chrome React 已完成真实 30 分钟重提醒与双标签隔离；iPhone Vue／React 主屏幕安装窗口已完成在线及已下载后断网更新，Safari 普通浏览器已完成同 scope 双标签协调；Mac Safari 18.6 的 Vue／React 安装窗口已完成真实 v1→v2 与双窗口协调。 |
| Android Chrome 153 Vue Drill 离线 | 英文通过；中文未执行 | 手机 Wi-Fi 关闭且移动数据原为关闭，安装窗口 `navigator.onLine=false`；结束 WebAPK 并由图标断网冷启动显示 v2/registered。独立窗口断网访问未缓存 `/app/never-precached`：受 `/app/sw.js` 控制，页面 `lang=en`、标题 `Offline`、正文 `You're offline`、说明及 `Try again` 按钮；截图 `/private/tmp/pwa-android-vue-offline-fallback.png` 显示深色、窄屏布局正常。测后已将 Wi-Fi 从 0 恢复为 1。此项只验证公开示例英文构建，不代表中文及正式候选。 |
| Android Chrome 153 React Drill 安装与离线 | 英文通过；中文未执行 | 公开 React `drill` 页显示原生安装提示，确认后安装 WebAPK `org.chromium.webapk.a79c749fa7b1c369e_v2`（手机本地时间 2026-09-26 19:24:58）。从图标启动 `/app/`，CDP 读到 `display-mode:standalone=true`、v2/registered 与本源 `/app/sw.js` 控制。移动数据原为关闭且 Wi-Fi 关闭时，结束 WebAPK 再从图标启动，`navigator.onLine=false` 仍显示 v2/registered；未缓存路径出现英文离线页与重试按钮，截图 `/private/tmp/pwa-android-react-offline-fallback.png`。测后 Wi-Fi 恢复为 1。 |
| Android 非 Chrome 浏览器冒烟 | 小米浏览器完整通过；Firefox 与夸克浏览器模式通过，安装能力有限 | 同一实体 23127PN0CC、Android 16 上，Firefox `156.0.1` 在线显示 Vue v2/registered，菜单同时出现“添加快捷方式”和“添加应用到主屏幕”；精确点击安装项后没有确认框，启动器及系统快捷方式记录都没有新增 PWA，因此不能记作安装通过。真实关闭 Wi-Fi 后，Firefox 对未缓存且线上存在的 JSON 导航显示平台英文离线页，联网后自动恢复为 `sequence: 1 / status: normal`。小米系统浏览器 `20.16.1020421` 在线显示 v2/registered，原生确认框正确读取 Vue Drill 名称、图标、start URL 与 scope，固定快捷方式成功；从新图标进入 `PWAActivity` 独立窗口，断网冷启动仍显示 v2/registered，浏览器未缓存 JSON 导航显示平台离线页，恢复 Wi-Fi 后自动回到线上 JSON。夸克 `10.16.0.1135` 同样完成浏览器页、离线回退和自动恢复，但完整菜单未发现安装入口。Chrome 继续是 Android 主发布门禁；这些补充结果不替代第二台 Android 的 N/N-1 要求。 |
| Android Chrome 153 React 入口恢复 | 计划迁移与点击跳转通过；断网/无效清单等未执行 | 本机公开 `drill` React Origin 在 Chrome 标签页用常驻公开测试钩子交入序号 2、`migrating`、目标为公开 Vue Drill Origin 的合法清单，结果 `accepted=true`；`checkEntryRecovery({returnPath})` 给出 `available` 与本源恢复页链接，结果对象未给出目标 Origin。恢复页显示中文 `lang=zh-CN`、目标主机、有效期与按钮；截图 `/private/tmp/pwa-android-react-recovery.png`，显示深色窄屏布局。页面未自动跳转；点击后 Android 提示是否打开已安装 Vue App，选择“本次允许”后进入 Vue 独立窗口，`pwa-return` 与传入的路径一致。最后交入更高序号 3 的 `normal` 空入口清单，`checkEntryRecovery()` 回到 `none`。此次仅是公开站点旧候选实测。 |
| Android Chrome 153 Vue 入口恢复与离线区别 | 通过（本次旧候选场景）；域名独立阻断未执行 | Vue Drill 已存序号 1 `normal` 空入口清单；整机断网后 `navigator.onLine=false`，`checkEntryRecovery()` 返回 `none`，不把设备断网误报为域名故障。恢复联网后交入序号 2 的 `migrating` 合法清单，目标为公开 React Drill Origin，`checkEntryRecovery({returnPath})` 返回 `available`。再次断网后打开带 `?return=` 的 `/app/pwa-entry.html`，由 Vue 自己的 `/app/sw.js` 接管，显示 `lang=zh-CN` 的中文备用入口页及目标按钮，而不是通用离线页；截图 `/private/tmp/pwa-android-vue-recovery-offline.png`。该步只证明已存迁移清单与恢复页的离线展示，断网时未点击目标按钮（目标也离线）。测后恢复 Wi-Fi 并交入更高序号 3 `normal` 空入口清单；`checkEntryRecovery()` 回到 `none`。 |
| 离线页中英文与移动端 UI | 英文移动端及中文桌面、Android、iPhone 安装窗口通过 | Android Vue/React 和 iPhone Vue 英文离线页已在安装窗口观察；Chrome 154 中文构建已完成原生安装窗口、离线页和手动恢复实测。Android 16 + Chrome 153 与 iPhone 16 Pro + iOS 27 中文构建均完成安装、离线页和自动恢复；手机证据仍是单设备 E3，不代表移动发布通道通过。 |
| 入口恢复移动端与安装窗口 | Android 单 Origin 故障分支通过；iPhone 待补 | Android Vue/React 与 iPhone Vue 的英文安装窗口恢复页及跨公开 Origin 跳转有实证；Android React WebAPK 已补当前 Origin 超时、备用 Origin 可达、预缓存恢复页和实体点击跳转。iPhone 单 Origin 故障、中文 UI 及 Mac 桌面仍待补。用户最后提供的 iPhone 截图是 Vue 入口恢复页，前一张才是离线页。 |
| 十包 tarball 与独立消费 | 本地候选通过；registry 分发未执行 | `entry-resilience` 已补公开元数据、MIT LICENSE、接入 README，Vite peer `^5.0.0 || ^8.0.0`。`CI=true pnpm check:publish` 显示 10 包元数据与导出通过。十个 `0.1.0` 最终本地 tarball 在 `/private/tmp/pwa-stable-tarballs-final`；解包核对 497 个文件，均限 `dist/`、README、LICENSE、package.json，十包 metadata、MIT 文本、内部运行时依赖统一 `0.1.0`、导出存在且常见敏感内容模式扫描通过。隔离项目从最终十包本地 tarball 安装（未从 npm 安装尚未发布的 `0.1.0`），Node 22.22.0 + Vite 5.0.0 + Vue 3.4.0 + TypeScript 5.2.2 的类型检查和真实 Vite 构建退出 0，生成 Vue 更新提示 CSS、manifest、worker、预缓存的 `pwa-entry.html` 与脚本。首轮项目误用 React 19.0.0，与公开 peer `^19.2.0` 冲突；改用 React 19.3.0 后不跳过 peer 校验地安装成功。 |
| npm 账号与目标版本 | 预检通过，尚未发布 | `npm whoami` 已读到已登录账号；对十包逐一查询 npm registry，`@0.1.0` 均返回不存在。此检查仅防止版本冲突，不能代替发布后读回。 |
| Cloudflare 隔离槽费用预检 | 通过（部署前只读核对） | 2026-09-26 20:24 MYT，控制台当前账期总费用、预测费用、日均费用均 $0.00；Billable usage 显示 R2 Data Storage 0 GB-months（界面取整）、Class A 88、Class B 1.14k，三项可计费使用量为 0。Workers plans 显示 Free 为 Current plan；私有 Standard 桶页面显示 20.92 MB、Class A 116、Class B 1.34k、Public Access Disabled。两页面统计口径／刷新时间不同，均远低于免费用量；本项只放行计划中的小规模候选归档，不构成费用硬上限。 |
| React drill 正式候选 v1 部署 | 通过，v2 更新演练进行中 | 本地构建 `v1` 公开文件 34 个，`offline.html` 与 `pwa-entry.html` 均为英文；候选归档 SHA-256 `89c683d147ca0ef4c791b256a30b4b566ee0d30de2baad7205e4d25e65651877`，1,621,150 字节；私有 R2 读回通过，部署预检通过。Node 初次预检因系统 CA 未纳入内建信任库而报 TLS 证书链错误；改用 Node 官方 `--use-system-ca` 后保持 TLS 校验并通过。Pages `drill` v1 部署 `80bbb1a0-92ec-4dd2-ab24-8f0868155e8d`，33 个在线文件索引读回通过，20 个保留资产已归档；公开 HTTPS HTML 与恢复页已读回。桌面 Chrome 153 普通刷新得到 v1/registered、英文更新卡片，确认接管后仍为 v1 且出现英文 Reload 卡片，显式刷新后 v1/registered 且无卡片；此段是旧 v2→新 v1 基线切换，不能算 v1→v2 验收。Chrome 154.0.8037.57 独立上下文已打开并保持 v1/registered、无等待 worker、未刷新标记在页面内。 |
| React drill v2 恢复候选 | 已部署并归档 | 本地 `v2` 候选 35 个文件、1,748,883 字节，归档 SHA-256 `6b03c9e17581b9c9fdcb34af3e316fb74094abadbc59d18fc4c81433ba74be07`，私有 R2 读回通过；Pages 部署 ID `33c1bc28-35da-47d6-b312-4b838a21cb6c`。部署后自动在线索引首次报告一个 JS 文件与候选不符；随后同一别名和部署 URL 的 HTTPS 读回均与本地 SHA-256 相同，手动重跑索引成功（34 个在线文件），21 个保留资产归档成功。疑似 Pages 别名短暂传播；为索引 `record` 增加最多 30 秒的逐文件重试，每次仍需严格匹配哈希，针对性单测 3/3 通过；全仓检查待完成。公开槽当前是正常 v2。 |
| Chrome 153 React 真实 v1→v2，双标签与稍后 | 通过 | 旧标签在 v1/registered 且不刷新；公开槽切换 v2 后，新标签显示 v2，旧标签出现英文 `A new version is available` 卡片且仍显示 v1。2026-09-26 12:44:07 UTC 在旧标签点 `Later`，卡片隐藏且页面仍 v1。13:14:07 UTC 旧标签自然重新显示同一提示，旧页仍 v1；点击 `Update` 后出现 `Update complete / Reload page`，旧页仍 v1；显式点 `Reload page` 后显示 v2/registered，提示消失。证明真实 30 分钟重提醒、双标签旧页保持及“先接管、再刷新”分步行为。 |
| Android Chrome 153 React 更新提示分步 | 通过 | 早期轮次已验证提示、接管与显式刷新，但新导航先读到 v2，因此没有把它当作旧 DOM 证据。2026-09-27 在同一实体设备和 React WebAPK 上重新建立无 waiting 的 v1 基线，再部署真实 v2；标准 `ServiceWorkerRegistration.update()` 下载新 worker 后，页面仍为 v1、waiting 为 installed 并显示更新卡片。点击 `Update` 后 active 已接管、waiting/installing 为空，页面仍为 v1 且只显示 `Reload page`；显式点击后才进入 v2。完整版本与部署记录见后文。 |
| Android Chrome 153 React 候选英文入口恢复 | 计划迁移与单 Origin 超时分支通过 | 正式候选 v2 的恢复页在无清单时 `lang=en`、标题 `Alternative entry`、英文无入口说明，页面受本源 `/app/sw.js` 控制。先以 `migrating` 清单验证页面不自动跳转、系统确认、跨 Origin 返回路径与撤回；随后在同一 React WebAPK 用 `normal` 清单和 Chrome 按 URL 网络条件只延迟 React Origin，Vue 备用 Origin 保持可达。主入口探测约 5.155 秒超时后返回 `available / unconfirmed-outage`，预缓存恢复页完整显示英文说明、有效期和 Vue 按钮。实体点击后 MIUI 仅获“本次允许”，落到 Vue standalone PWA，`pwa-return=/app/orders/42?tab=1` 原样保留。最后交入序号 301 的 `normal` 空入口清单撤回。非法路径、过期清单与真实 DNS／证书故障仍未执行。 |
| Android Chrome 153 React 候选英文离线页 | 通过；恢复行为符合本次探测路径 | 交入 `normal` 空入口清单后，确认蜂窝数据关闭，短暂关闭 Wi-Fi，在 Chrome 访问本源未缓存的 `/app/never-precached`。页面 `navigator.onLine=false`、`lang=en`、标题 `Offline`，由本源 `/app/sw.js` 控制；显示 `You're offline`、自动恢复说明和 `Try again`，窄屏深色 UI 可读，截图 `/private/tmp/pwa-android-react-candidate-offline.png`。测试后恢复 Wi-Fi 并确认设备连接；页面自动重载后到达服务器的 HTTP 404，因为探测路径本来不存在。只证明自动重载发生，不证明存在的业务路由恢复成功。 |
| Vue drill 正式候选 v1→v2 部署 | 通过，测试槽已恢复 v2 | 公开 Vue v1 候选 R2 SHA-256 `3a45442625bc96e7c5c8d7bdc08a351b0ea839fcc1e608d785cd9c4db01849db`，519,918 字节，上传读回和部署预检通过；Pages 部署 ID `e2b018ec-0119-47fd-8315-9b69c03323ae`，26 个在线文件索引通过，13 个保留资产归档。恢复候选 v2 R2 SHA-256 `f8ec24ddb36f7014c9bfc90021e614ba4cfe070aa18d232c0775d90917f35910`，573,065 字节，上传读回和部署预检通过；Pages 部署 ID `d22e522e-46fe-4239-8f4d-1c7bcb8e0188`，27 个在线文件索引通过，14 个保留资产归档。两个上传都只作用于 `drill`，`main` 未变。 |
| Android Chrome 153 Vue 安装窗口 v1→v2、离线刷新 | 通过 | Vue Drill WebAPK `org.chromium.webapk.a5be8b3d54eb30ac0_v2` 从系统启动器进入独立窗口，`standalone=true`；切到 v1 后显式刷新，确认窗口 v1/registered、无 waiting worker。部署 v2 后主动调用标准 `registration.update()`，随后旧窗口仍显示 v1，waiting worker 为 installed，出现英文 `A new version is available` 卡片；截图 `/private/tmp/pwa-android-vue-standalone-v1-update.png`，业务定制绿色主按钮在窄屏可读。点 `Update` 后 worker 接管，旧 DOM 仍 v1，卡片改为 `Update complete / Reload page`。关闭 Wi-Fi（蜂窝数据已关闭）确认 `navigator.onLine=false`，再点 `Reload page`，同一独立窗口离线显示 v2/registered、worker 控制且卡片消失。随后 Wi-Fi 已恢复开启。此项同时验证“先更新资源，再由用户刷新”的真实两步语义。 |
| Android Chrome 153 Vue 候选英文入口恢复 | 安装窗口展示通过；独立故障阻断待补 | Vue v2 已安装独立窗口在线交入事先由 `parseEntryManifest` 校验的序号 100 `migrating` 清单，目标为公开 React Drill，`accepted=true`、`checkEntryRecovery` 返回 `available` 与合法返回路径。独立窗口打开恢复页后 `standalone=true`、`lang=en`、标题 `Alternative entry`、由 Vue 本源 worker 控制；英文迁移说明、UTC 有效期与蓝色按钮可读，截图 `/private/tmp/pwa-android-vue-standalone-recovery-en.png`，未点击前未导航。返回主窗口后交入序号 101 `normal` 空入口清单，结果回到 `none`。本次未点击 Vue→React 按钮（React→Vue 的按钮与返回路径已在同机实测），也未只阻断 Vue Origin。 |
| iPhone Safari Vue 正式候选 v1→v2 | 通过；断网状态信号有差异 | USB 配对并在 iPhone 重新开启网页检查器后，Mac Safari 检查器读取到物理 iPhone 的公开 Vue 标签页。隔离槽部署 v1：R2 SHA-256 `03d983df55c3a7e65fbc7828735e563b30d8d2743135fb9593142fd6b14b50fd`，Pages ID `1c1cb465-38fb-46dd-ab45-58e92026e260`，27 个在线文件哈希索引通过，14 个保留资产归档。通过旧页的 `Update`/刷新建立 `v1 / registered`、本源 worker 接管、无 waiting 的干净基线。隔离槽部署 v2：R2 SHA-256 `a8402689c9f05f3a9657138821b74c94da7c5945ddcc25c7344c580dfd1317b1`，Pages ID `93533c21-1071-44be-8d6c-90a37ef6954c`，27 个在线文件索引通过，14 个保留资产归档。旧页不刷新执行标准 `registration.update()` 后仍为 v1，waiting worker=`installed`，出现英文 `A new version is available / Update / Later` 卡片。用户在 iPhone 点 `Update` 后，检查器读到旧 DOM 仍 v1、卡片变 `Update complete / Reload page`、waiting 消失且新 worker 已 active。用户关闭 Wi-Fi 和蜂窝数据后点 `Reload page`，检查器读到 v2/registered、本源 worker 控制、卡片消失。Safari 的 `navigator.onLine` 此刻仍报 true，独立同源根路径的 `cache:no-store` 请求在 3 秒内 `AbortError`；离线状态以用户无线开关操作和网络请求超时为证，不能声称 `navigator.onLine=false`。当前公开槽为 v2，`main` 未变。 |
| iPhone Vue 主屏幕安装窗口 | 在线与断网冷启动通过；恢复联网边界待修复/定性 | 用户在 iPhone Safari 使用系统“共享 → 添加到主屏幕”且开启“作为网页 App 打开”，从图标进入。Mac Safari 开发菜单将该页面列在物理 iPhone 的“主屏幕网页App”组；其独立检查器读到 `display-mode: standalone=true`、路径 `/app/`、页面 `v2 / registered`、注册 scope `/app/` 且 active worker 为 `activated`。首次启动时页面未立即被 worker 控制；在线重载后 `navigator.serviceWorker.controller` 指向本源 `/app/sw.js`，仍为 v2/registered。用户关闭 Wi-Fi/蜂窝数据、结束安装窗口、从图标冷启动后仍显示 v2/registered、standalone=true、本源 worker 控制；同源 scope 外的网络探测在 3 秒内 `AbortError`。在离线页后用户恢复网络，立即手工导航回 `/app/` 曾显示 v2/`not registered`，虽已有 active worker/controller 且根路径在线请求返回 HTTP 404；同页 `serviceWorker.register()` 和 `registration.update()` 超过 5 秒未完成。再次在线结束并从图标启动后恢复 v2/registered。此边界尚待根因和发布判定，不当作稳定通过。 |
| iPhone Vue 英文离线页 | 通过；自动恢复待定 | 已安装独立窗口在实体断网时访问未缓存的 `/app/never-precached-ios`，由本源 worker 提供 `title=Offline`、`lang=en`、英文说明与 `Try again` 按钮；402×812 视口内文档宽度 402，无水平溢出，按钮 x=24、宽354、高48，深色背景 `rgb(15,20,25)`、按钮蓝色 `rgb(76,147,255)`。用户提供的真机截图仅含公开测试页，视觉上留白、对齐、文字与按钮均可读；截图来源为本次对话附件。恢复网络后页面没有在观察窗口内自动跳转回有效主页面，手工导航到未缓存探测路径会是服务器 404；自动恢复机制需进一步核对，不能记为通过。 |
| iPhone Vue 英文入口恢复页 | 展示、手动跳转与撤回通过；单独 Origin 故障仍待补 | 在在线 Vue 独立窗口，初始 `__entryCheck()` 返回 `kind:none`。用公开测试 hook 交入序号1000、有效期24小时、`migrating`、备用公开 React Drill Origin 的合法清单后返回 `accepted:true`；`__entryCheck({returnPath:'/app/'})` 返回 `available` 与本源恢复页 URL。独立窗口显示 `title=Alternative entry`、`lang=en`、英文说明、有效期和唯一的公开 React 域名按钮；`standalone=true`、本源 worker 控制、402px 视口无水平溢出，按钮 x=24、宽354、高72。用户提供的真机深色截图显示排版可读、长域名在按钮内换行。用户点击后，检查器实际读到目标 `https://drill.pwa-platform-react-demo.pages.dev/app/?pwa-return=%2Fapp%2F`，页面为 React v2/registered、`standalone=true`，由目标 Origin 自己的 `/app/sw.js` 控制。返回 Vue Origin 后交入更高序号1001的 `normal` 空入口清单，`__entryCheck()` 回到 `kind:none`。本次未单独阻断 Vue Origin；以合法迁移清单而非真实故障验证了用户确认后的跳转。 |
| iPhone Safari React 正式候选 v1→v2 | 两步更新和离线刷新通过 | React 隔离槽 v1 包 SHA-256 `daef92c7f07488cab812a8205fa205b0c226c0df460859314d18e5b727ddfc62`，Pages `9c13743a-4426-4ea7-bab4-71c492fae467`；R2 读回、34 个在线文件校验和 21 个保留资产归档通过。iPhone Safari 旧页经过两次既有等待 worker 的接管与刷新后建立 v1/registered、无提示基线。v2 包 SHA-256 `46bd6265969ebb4bafa589dc1c35c682452ad7cf55cb41d306f4a34261bb56c8`，Pages `6b3559c8-632b-4b58-9813-f08a60427411`，相同部署读回/归档通过。旧页调用标准 `registration.update()` 后仍显示 v1/registered，worker active=activated、waiting=installed，并显示英文更新卡片；通过检查器模拟点击 `Update` 后，waiting 消失、active=activated，旧 DOM 仍是 v1，卡片变英文 `Update complete / Reload page`。用户关闭 Wi-Fi 与蜂窝数据后，同源 scope 外 `cache:no-store` 探测在 3 秒内以 `AbortError` 结束；检查器点 `Reload page`，同一 Safari 标签在断网状态进入 v2/registered、无更新卡片，继续由本源 `/app/sw.js` 控制。公开测试槽已恢复正常 v2；这是 Safari 标签页实证，不等于 React 主屏幕安装窗口已验收。 |
| iPhone React 主屏幕安装窗口 | 在线安装与断网冷启动通过；联网恢复待补 | 用户在 Safari 普通标签页将 React Drill 添加到主屏幕并开启作为网页 App 打开，从图标进入。Mac Safari 将新页列为物理 iPhone 的 `Web` 检查对象；窗口路径 `/app/`、`display-mode: standalone=true`、`lang=en`，显示 v2/registered。首次启动时 controller 尚未赋值；在线重载后由 React 本源 `/app/sw.js` 接管，仍为 v2/registered。用户关闭 Wi-Fi/蜂窝数据、结束安装窗口并从图标断网冷启动后，页面仍显示 v2/registered、standalone=true，受本源 worker 控制；同源 scope 外 `cache:no-store` 网络探测在 3 秒内 `AbortError`。 |
| iPhone React 英文离线页 | 离线展示通过；自动恢复未通过 | 同一 React 主屏幕安装窗口保持断网，访问未缓存 `/app/never-precached-react-ios`，本源 worker 提供 `title=Offline`、`lang=en`、英文标题、说明与 `Try again`。页面 `standalone=true`，402px 视口内文档宽度为 402，没有水平溢出。用户恢复 Wi-Fi/蜂窝数据、保持页面打开且不点按钮后，离线页未自动重载；同一页对 scope 外同源根路径的新请求返回 HTTP 404，证明网络已恢复且请求成功到达服务器。此时 `navigator.onLine=true`、`visibilityState=visible`。手工导航回 `/app/` 立即显示 v2/registered，仍由 React 本源 worker 控制。由于探测路径本身不存在，不能把未重载后的服务器 404 当作产品缺陷；真正缺陷是文案承诺自动重载却在此次 iPhone 恢复网络时没有触发。 |
| iPhone React 英文入口恢复页 | 展示、跨 Origin 跳转与撤回通过；单独 Origin 故障待补 | 在线独立窗口初始 `__entryCheck()` 为 `kind:none`。交入序号2000、24小时、`migrating`、仅一个公开 Vue Drill Origin 的合法清单后 `accepted:true`，返回本源 `/app/pwa-entry.html?return=%2Fapp%2F`。恢复页仍在 React Origin，`title=Alternative entry`、`lang=en`、`standalone=true`、本源 worker 控制；402px 视口文档宽度402，无水平溢出，英文标题、到期时间和仅一个目标域名按钮可读。模拟点击该按钮后实际进入 `https://drill.pwa-platform-vue-demo.pages.dev/app/?pwa-return=%2Fapp%2F`，显示 Vue v2/registered、standalone=true；点击前没有自动导航。返回 React 后交入更高序号2001 `normal` 空清单，`__entryCheck()` 回到 `kind:none`。未只阻断 React Origin，不能以迁移场景代替真实故障恢复实证。 |
| iPhone 离线页自动恢复缺陷定位与修复候选 | Vue/React 真机复测通过 | Vue/React 安装窗口的原离线页只监听 `online`。iPhone iOS 27 实体断网时 `navigator.onLine=true`；恢复网络后离线页仍停留，即使根路径同源新请求已返回 HTTP 404。React 主页面临时监听 `online`、`offline`、`focus`、`blur`、`visibilitychange` 后，用户打开并收起控制中心没有收到任何事件。对当前控制它的公开 worker 脚本做同源、`no-store` 的 `HEAD`：真机断网 3 秒 `AbortError`，恢复联网 HTTP 200；平台路由对非 GET 请求按既有规则透传。仅默认离线页固定脚本新增可见时每 10 秒 HEAD、3 秒超时、仅 2xx 刷新；保留手动与 `online` 路径。Vite 单测 226/226、官方 Chrome 154 浏览器测试 30/30，新增场景屏蔽 `online` 后仍由探测自动刷新。React drill 修复版 v2 归档 SHA-256 `249df9ef4536921f550d98caa08ca2017835cc70bf1ce098e22d664ecdcf5c8a`，Pages 部署 `4a062ed6-a835-4ac3-8d26-24d71f4c6c36`，R2 读回、34 个在线文件哈希及 21 个保留资产归档通过。iPhone React 独立窗口完成新 worker 接管，预缓存离线页正文包含 HEAD 逻辑；实体断网时进入未缓存 `/app/never-precached-react-ios-repair`，检查器读到 `title=Offline`、含 HEAD 脚本、本源 controller、`standalone=true`。用户只恢复网络、不点按钮也不刷新；随后检查器记录该 URL 的服务器 HTTP 404、页面不再有离线页标题，`performance` 导航类型为 `reload`。探测 URL 原本不存在，404 正是自动重载到线上后的预期结果；手工返回 `/app/` 即刻显示 v2/registered、仍由本源 worker 控制。Vue drill 修复版 v2 归档 SHA-256 `7ff5547f17d1ed1f4cec465f7613a0ae7794f639076d7f83d27ca10612f5035a`，Pages 部署 `e65966ae-e91d-4d16-a15c-c4fbb5ea57f7`，R2 读回、27 个在线文件哈希和 14 个保留资产归档通过。iPhone Vue 独立窗口点击 Update 后卡片变 Reload page，点击后新离线页已在缓存；实体断网打开未缓存 `/app/never-precached-vue-ios-repair`，读到 `title=Offline`、含 HEAD 脚本、本源 controller、`standalone=true`。首次恢复开关后，HEAD 和同源根路径请求仍超时，不能算在线；用户确认 Safari 普通标签能在线打开同一公开站点后，未点击重试也未手动刷新，离线页自动重载到探测 URL，服务器返回预期 HTTP 404，`performance` 导航类型为 `reload`。返回 `/app/` 后立即显示 v2/registered、本源 worker 控制。 |

| 离线页修复后的全仓回归 | 通过 | `CI=true pnpm typecheck`、`CI=true pnpm lint`、`CI=true pnpm docs:build`、`CI=true pnpm check:publish` 均退出 0。`CI=true pnpm test` 全仓通过，日志 `/private/tmp/pwa-stable-post-fix-test.log` SHA-256 `a26b953993a49c05d9e0155277b2539a90bf12283b70077011ec1f47f93137f0`。官方 Chrome 154.0.8037.57 全仓浏览器回归九套件共 226 项通过、0 失败、0 跳过，日志 `/private/tmp/pwa-stable-post-fix-browser154.log` SHA-256 `3fb5346ff543dcb0d46c678f7842f4f013c1824740d770b819c0ae6de33d6605`；不能只根据总命令退出码判断，逐套件计数已复核。文档随后补写了 Vue 真机结果，需再构建文档。 |
| Android 早到的 `online` 事件与最终连通性修复 | Vue/React 真机通过；最终 iPhone 待复测 | 先前的 iPhone 修复版对 `online` 事件仍直接刷新。Android 真实断网的离线页上提前派发 `online`，官方 Chrome 154 的新增回归测试立刻观察到错误重载，复现为红；改为事件和 10 秒定时器调用同一 `HEAD` 探针后，聚焦测试 1/1 通过。首次 Android 真机用本来不存在的 `/app/never-precached-*` 测试，恢复网络后显示 Chrome 自带的 404 页面；此页面不能用于断言联网失败，故改用线上 HTTP 200、离线未缓存的公开 `/app/entry-manifest.json` 消除歧义。Vue 最终修复包 SHA-256 `4920c0c8cf00f4f534015abdcf0f26d0fdc31a5e29c8de0e86983f1847d8c7f0`、Pages `966c55d2-9e74-4251-be3b-ffc63ce2544f`，R2 读回、27 个在线文件索引和 14 个旧资产归档通过；React 对应 SHA-256 `0ea904a7f6f6e95feac34541d23f035418faa2cfe9e96178b397a564b9e05e9c`、Pages `d6b670fd-3158-496e-8177-8d510bae15c2`，R2 读回、34 个在线文件索引和 21 个旧资产归档通过。Android 两个已安装独立窗口分别完成 Update→Reload，预缓存离线页含 `online`→探针的最终脚本；蜂窝数据和 Wi-Fi 都关时访问未缓存的上述 JSON URL，显示英文 Offline、`standalone=true`、本源 worker 控制。实体离线时手动派发早到的 `online` 后停留在离线页；恢复 Wi-Fi 后不点重试或刷新，自动进入线上 `application/json` 页面（`sequence:1`、`status:normal`），非 Chrome 错误页。导航回 `/app/` 均显示 v2/registered、worker 控制、Wi-Fi 已恢复。最终脚本的 iPhone 回归仍待执行；此前 iPhone 通过的是仅定时器补强、`online` 仍直接刷新的上一版。 |

| iPhone 最终离线脚本复测（Vue、React） | 两站真实断网与自动恢复通过；注册状态边界待定性 | Mac Safari 的设备列表中同名的 Mac 安装窗口曾被误选，所见 HTTP 200 读数已作废；随后明确选中窗口标题含 `iPhone` 的真实设备检查器。Vue 与 React 的独立窗口均为 `standalone=true`、v2/registered、本源 `/app/sw.js` 控制，预缓存离线页包含最终 `window.addEventListener("online", probeConnection)` 脚本。手机 Wi-Fi 与蜂窝数据关闭时，对带新查询参数的 worker 发 `HEAD`、`cache:no-store` 均 3 秒 `AbortError`。断网访问线上 HTTP 200 且未预缓存的 `/app/entry-manifest.json` 均显示英文 Offline 页；手动派发过早 `online` 事件后仍停留在离线页，导航类型仍为 `navigate`。仅恢复网络、不点重试或手动刷新，两站均自动重载为线上 JSON（`sequence:1`、`status:normal`，导航类型 `reload`），避免了先前不存在路由的 404 歧义。手机最后已恢复联网。 |
| iPhone 断网恢复后注册状态 | Safari 兼容性差异，未按正常注册判通过 | Vue、React 从上述线上 JSON 手动返回 `/app/` 后，页面均显示 v2/`not registered`，但 `navigator.serviceWorker.controller` 仍是本源 worker，`getRegistration()` 返回 activated。Vue 的原生 `register()` 和 `registration.update()` 调用分别超过 5 秒未返回，尽管同源 worker 的 `HEAD` 与完整 `GET` 均 HTTP 200；直接刷新页面仍未恢复。结束对应主屏幕 App、保持联网、再从图标启动后，两站均恢复 v2/registered、standalone 与 worker 控制。不能据此断定 WebKit 根因，也不能把短暂挂起记作正常；在桌面发布通道中记录为 iPhone 渐进兼容差异。 |
| 最终修复版自动化门禁 | 桌面 Chrome N/N-1 全通过 | 修正离线页过早 `online` 后，`CI=true pnpm build`、`typecheck`、`lint`、`docs:build`、`check:publish` 退出 0；`pnpm audit --ignore-registry-errors` 为 `No known vulnerabilities found`。完整 `CI=true pnpm test` 首轮有 release-tools 的一个 5 秒 worktree 集成用例因并行负载超时（116/117），单包重跑 117/117 通过；随后全仓无外部构建竞争重跑全部包通过，日志 `/private/tmp/pwa-stable-final-gated-test-serial.log` SHA-256 `e23e1f01ccfb4a49313da02e9a1ff1fc4196495bdb3d8b4e071bee5dff5805d3`。官方 Chrome 154.0.8037.57 全仓九套件 227/227 通过，日志 `/private/tmp/pwa-stable-final-gated-browser154.log` SHA-256 `6bbf8db63474ff5d8f698bae73bd4e59f114c878c75d849908e96ff699ef12f1`；Chrome 153.0.8010.53 九套件 227/227 通过，日志 `/private/tmp/pwa-stable-final-gated-browser153.log` SHA-256 `5a66d6524f84c1259f75b56495563de1236aae8f4f8a2d0d068b132bfaf0d3d2`。两次逐套件检查无失败和跳过，未仅凭总命令退出码判断。 |

| Chrome 154 Vue／React 原生安装窗口离线恢复 | 两站通过（DevTools 离线模拟） | 官方 Chrome for Testing 154.0.8037.57 中，两个已安装独立窗口均先显示 v2/registered。各自在 DevTools Network 设为 Offline 后导航到线上有 HTTP 200、未预缓存的 `/app/entry-manifest.json`，页面显示英文 `Offline / You're offline / Try again`，Network 中应用导航由本源 Service Worker 提供 HTTP 200、实际网络请求 `ERR_INTERNET_DISCONNECTED`。Network 恢复为 No throttling 后，离线页未手工重试即重载到线上 JSON（`sequence:1`、`status:normal`），再返回 `/app/` 显示 v2/registered。此项为桌面安装窗口真实浏览器、模拟断网，不等于设备物理断网。 |
| Mac Chrome 154 物理断网冷启动 | Vue／React 均通过（用户手工观察） | Codex 控制通道与被测 Mac 共用 Wi-Fi，自动化无法在物理断网期间继续操作或回传证据；网络已恢复后取得的早期 Vue 截图已作废。随后先在线确认两个 Chrome 154 独立应用均为 v2/registered，再完全退出；用户手工关闭 Mac Wi-Fi，分别从应用图标冷启动 Vue、React，反馈离线与联网表现一致，两个应用都能正常显示 v2 页面，随后恢复网络。此项明确标为用户手工实机观察；DevTools 未缓存导航离线页与自动恢复仍由上一项提供自动化证据。 |
| 当前 Origin 单独失效、备用 Origin 仍可达 | Chrome 154 和 153 各 1/1 通过 | `entry-resilience/browser-tests/scenarios.spec.ts` 新增双 Origin 场景：先安装当前 Origin 的 worker 并交入 `normal` 合法清单，当前 Origin 可达时 `checkEntryRecovery()` 为 `none`；只关闭当前 fixture server，备用 fixture server 保持可达，检查返回 `available / unconfirmed-outage`。当前 Origin 的恢复页仍由预缓存打开，不在用户点击前导航；点击后进入备用 Origin 的 `/app/`，合法 `pwa-return` 保留。官方 Chrome 154.0.8037.57 与 Chrome 153.0.8010.53 均通过。此为真实浏览器和真实双本地 Origin，尚未在手机上模拟云端单域故障。 |
| 最终归档的独立宿主消费 | Node 22 + Vite 5 通过 | 十个 0.1.0 最终候选 tarball 从同一编译源码打包，并扫描 497 个归档文件；未见私有项或额外工作区文件。独立目录 `/private/tmp/pwa-stable-consumer-final-gated` 安装 tarball 与 Node 22.22.0、Vite 5.0.0、Vue 3.4.0、React 19.3.0；`tsc --noEmit` 与 `node build.mjs` 均退出 0。此为公开夹具，不涉及私有宿主项目。 |
| 发布前最后一轮浏览器与文档回归 | Chrome N/N-1 各 228/228 | 新增单 Origin 故障用例后，全仓九套件在 Chrome 154 与 153 各 228 项通过，0 失败、0 跳过；日志 `/private/tmp/pwa-stable-release-browser154.log` SHA-256 `d9c9cfa0975fd42d2aad0070baf22d3ccef1c09320d43e32317be43987e6d296`，`/private/tmp/pwa-stable-release-browser153.log` SHA-256 `20dcce3e2cd66a077f0d20227d24d93c4d92e97006e7c53897ccbaf440d21b8e`。文档口径更新后 `pnpm docs:build`、`pnpm lint`、入口恢复包 `typecheck`、`pnpm check:publish` 和 `git diff --check` 退出 0。 |
| npm 正式版与独立消费 | 十包发布及读回通过 | 2026-09-26 UTC 从提交 `870bf93a3ac78e4593f0916192a34448fd09e270` 逐包发布十个 `0.1.0`；每包 npm `latest`、下载内容及 `dist.integrity` 核对通过。全新目录 `/private/tmp/pwa-stable-registry-consumer` 直接从 npm 安装十包，在 Node 22.22.0、Vite 5.0.0、Vue 3.4.0、React 19.3.0 环境中，`npm install`、`tsc --noEmit`、Vite 生产构建均退出 0。完整散列与限制见[发布记录](release-0.1.0.md)。 |

## R2 桌面 UI 证据与当前真机可用性（2026-09-27）

本轮没有运行时代码变化，也没有为取证制造新的 Cloudflare 部署。先检查当前设备条件：`adb devices -l` 返回空设备列表；Xcode 仍识别物理 iPhone 16 Pro（iOS 27.0，USB 接口），但设备状态为 unavailable，并明确要求解锁后连接线缆或处于同一局域网。因此本轮没有新增 Android／iPhone 通过结果，R2、T3 的移动更新矩阵和 T4 的中文移动安装窗口矩阵继续保持未完成；桌面中文安装窗口已在本地候选构建上补齐。

在不依赖真机和云端写入的范围内，补齐了三个自动化 UI 场景及桌面中文安装窗口实测。所有对比度断言都读取浏览器最终计算色，不只比对源代码常量，并以 WCAG AA 普通文本阈值 `4.5:1` 为最低要求；算法收敛到私有 `@pwa-platform/browser-test-harness`，其单元测试 68/68 通过。完整 WCAG 审核仍不在本次范围内。

| 场景 | 可追溯证据 | 结果与边界 |
|---|---|---|
| 中文默认离线页 | `packages/vite/browser-tests/offline-page.spec.ts` | Chrome 153.0.8010.53 中验证 `lang=zh-CN`、内置中文文案、320px 窄屏无横向溢出、键盘 `Tab` 可聚焦重试按钮；亮／暗主题的正文、弱化正文和按钮文字对比度均不低于 `4.5:1`。完整 Vite 浏览器套件 33/33 通过。桌面、Android 与 iPhone 安装窗口的实测分别见后续记录。 |
| Chrome 154 中文构建原生安装、离线与恢复 | 本地 `site-offline-zh` 候选构建；Chrome for Testing 154.0.8037.57 独立配置 | Chrome 原生菜单显示“将网页作为应用安装”，安装向导显示 `Vite Fixture`，完成“下一步 → 安装”后创建独立应用窗口；窗口没有地址栏并打开 `/app/` 的 v1 shell。按宿主公开契约调用 `client.register()`、刷新至 `/app/sw.js` 接管后，关闭本地 Origin 并进入未缓存路由，独立窗口显示 `lang=zh-CN` 的“当前处于离线状态／网络恢复后页面会自动重新加载。／重试”。恢复只读 SPA 服务后点击“重试”，同一路由回到 v1 shell。首次未调用 `register()` 就断站时无 controller、只得到浏览器网络错误，直接证明接入文档必须把注册步骤列为必需条件。该轮验证了手动恢复。原测试夹具的 1×1 占位图缺陷随后已修正并增加构建期回归校验；本项保留为修正前桌面行为记录，图标质量证据以后续 Android 记录为准。 |
| 入口恢复页 | `packages/entry-resilience/browser-tests/styling.spec.ts` | Chrome 153.0.8010.53 中对 320px 恢复页验证亮／暗主题、无横向溢出、键盘 `Tab` 可聚焦备用入口按钮，以及正文、到期说明、按钮文字的 `4.5:1` 对比度下限。完整入口恢复浏览器套件 20/20 通过。 |
| Vue／React 更新提示 | `packages/examples-browser-e2e/ui-browser-tests/update-notice.spec.ts` | 两框架都在亮／暗主题读取计算色并验证正文、次要文字和主按钮文字的 `4.5:1` 对比度下限；既有 320px 布局和键盘焦点场景继续通过。完整 UI 套件 14/14 通过。 |
| 已安装桌面 React PWA 当前状态 | macOS 可访问性树只读观察 | Chrome for Testing 安装窗口仍打开公开 React Drill `/app/`，显示 `v2 / registered`、无地址栏并保留基础交互按钮。本项只确认在线安装窗口未损坏，不补算离线、更新或中文证据。 |

默认受限环境首次运行浏览器套件时，Chrome 终止和 localhost 监听分别被 `kill EPERM`、`listen EPERM` 拒绝；在获授权的隔离浏览器环境重跑后得到上述通过结果。入口恢复新增用例第一次完整套件运行暴露渲染等待不足，聚焦运行虽通过但全套出现空元素；增加对到期说明与按钮可见性的显式等待后，完整 20/20 稳定通过。该测试修正没有改动运行时代码或公开契约。

## R2 Android 中文安装窗口与图标缺陷（2026-09-27）

设备为实体 23127PN0CC、Android 16、Chrome 153.0.8010.53。通过 USB reverse 打开本地 `site-offline-zh` 的 `http://localhost:51251/app/`；Chrome 把 `localhost` 视为可信来源，运行时 `isSecureContext=true`，公开 `client.register()` 后 `/app/sw.js` 为 activated/controller，因此首次“无法安装此应用”不是 HTTP 导致。

根因是 manifest 声明四个 192×192／512×512 PNG，源文件却都只有 1×1。替换为真实尺寸并加 `packages/vite/test/fixture-icons.test.ts` 后，Android 原生安装入口恢复可用，最终安装 WebAPK `org.chromium.webapk.a26b75328c3f9eda4_v2`。从系统启动器进入后，CDP 读到 `display-mode: standalone=true`、本源 `/app/sw.js` 控制及应用 shell；安装时间为手机本地 2026-09-27 14:17:37。

停止 Origin 后在安装窗口打开未缓存地址，页面 `title=离线`、`lang=zh-CN`，显示“当前处于离线状态／网络恢复后页面会自动重新加载。／重试”，`standalone=true`、controller 保持、400px 视口与文档宽度一致；截图 `/private/tmp/pwa-android-zh-installed-offline.png` 无地址栏、无裁切。随后改用线上存在但离线未缓存的 `/app/manifest.webmanifest?android-zh-installed=1` 排除 404 歧义，恢复 Origin 后不点“重试”：服务器记录 `HEAD /app/sw.js 200`，页面自动 `GET` 同一 manifest 并显示在线 JSON；返回 `/app/` 仍为 standalone、worker 控制和 shell。该闭环证明中文离线页的自动探针恢复，而不是手工刷新。

缺陷属于测试夹具和构建期反馈，不是 Service Worker 运行时或公开配置形状错误。按项目所有者要求，Vite 插件新增主图标存在性、常用位图 MIME 与实际尺寸校验：旧实现放过的 1×1、缺文件、类型错配和损坏文件先由红测复现；实现后相关聚焦用例 10/10、Vite 单测 241/241 通过。校验规则、错误码与排障方法已写入 ADR-0040、Vite README、manifest 字段指南及 Vite 5 业务接入作业单。iPhone 中文安装窗口随后按下一节完成实测。

## R2 Android React 旧 v1 DOM 保持重新取证（2026-09-27）

设备为实体 23127PN0CC、Android 16、Chrome 153.0.8010.53；已安装 React WebAPK 为 `org.chromium.webapk.a79c749fa7b1c369e_v2`，绑定专用 React drill HTTPS Origin。最终验收轮次使用 v1 bundle SHA-256 `be65b3d03b195ca85c74e3dcd8b6f7ee9e4437aa1bcb36b1eff4bc6debc5b79c`、Pages `748cf229-f2d5-4cd6-944f-eb2247a80ddd`，以及基于该部署重新构建的 v2 bundle SHA-256 `661c3f356be3d89ea6fdec1b3fffc8200cd2524ff987ffbaa395cc139ac1030e`、Pages `d80a9d93-373c-4edf-be9c-d1cee036c57b`。两版均完成私有 R2 回读、34 个线上文件哈希核对和 21 个保留资产归档。

WebAPK 先建立无残留提示的干净 v1 基线：`standalone=true`、本源 worker 控制、active 为 activated，waiting/installing 为空。v2 部署后只在这个既有窗口调用浏览器标准的 `ServiceWorkerRegistration.update()`，不导航、不刷新 DOM；调用前为 v1／无 waiting，调用后仍为 v1，新 worker 为 `waiting: installed`，英文 `A new version is available` 卡片随后出现。实体界面控件树同时读到版本 `v1` 与可点击 `Update`，排除了仅由检查器返回的假象。

通过 ADB 对实体界面点击 `Update` 后，页面仍为 v1，卡片变为 `Update complete / Reload page`；检查器读到 active 为 activated、waiting/installing 为空、standalone 与 controller 均保持。只有继续点击实体界面的 `Reload page` 后页面才显示 v2，且更新卡片消失，最终 active 为 activated、waiting/installing 为空。该结果补齐了早期“新导航先读到 v2、无法证明旧 DOM 保持”的唯一缺口。

准备阶段曾尝试在 Chrome 新开同源页面触发检查，但 Android 将该 HTTPS Intent 直接路由回已安装 WebAPK，使 DOM 先读取 v2；该轮观察明确作废，没有计入验收。最终轮次重新从当前线上归档生成 v1/v2，并采用不导航的标准 registration update 取得上述证据。公开 React drill 测试槽最终保持正常 v2。

## R2 iPhone 中文安装窗口、网络超时与自动恢复（2026-09-27）

设备为实体 iPhone 16 Pro、iOS 27.0，使用 Safari 主屏幕网页 App 和网页检查器。测试使用当前合并代码生成的临时生产构建，通过临时 HTTPS 入口访问；没有新增正式部署。manifest 的 `name` 为“PWA 中文测试”、`short_name` 为“中文测试”，四个主图标的实际尺寸与声明一致。用户经“共享 → 添加到主屏幕”安装，系统名称显示“中文测试”；从图标启动后 `display-mode: standalone` 为真，视口为 402×812、无水平溢出，页面由本源 `/app/sw.js` 控制。

先保留导航 `network-first`、但不设置 `networkTimeoutSeconds` 作为对照。实体断网后结束网页 App 并从图标冷启动，窗口约 60 秒保持白屏，随后才显示已缓存应用壳；网页检查器记录 `responseStart=60022ms`、`DOMContentLoaded=60040ms`、`transferSize=0`。这不是 HTTPS、图标或预缓存失败，而是 Safari 的网络请求在浏览器自行超时前一直挂起，不能作为可接受的生产体验。

随后只为临时测试构建增加 `networkTimeoutSeconds: 5` 并更换缓存命名空间种子。新 worker 进入 waiting 后，公开 `applyUpdate()` 路径产生 `update-applied`，最终 active worker 为 activated、waiting 为空，新预缓存生效。再次实体断网冷启动，用户观察不到 5 秒即显示页面；检查器记录 `responseStart=5031ms`、`DOMContentLoaded=5047ms`、`transferSize=0`，证明显式超时把同一设备的离线等待从约 60 秒收敛到约 5 秒。

保持断网时，用户实际点击临时同源探测链接，未缓存导航由 worker 返回中文默认离线页：`title=离线`、`lang=zh-CN`，正文为“PWA 中文测试／当前处于离线状态／网络恢复后页面会自动重新加载。／重试”；页面保持 standalone、本源 controller 和 402px 无横向溢出，按钮位于 x=24、宽 354、高 48，白字蓝底可读。该导航约 5.014 秒得到回退。用户随后只恢复网络，没有点击“重试”；离线页自动重载原目标，导航类型为 `reload`，`responseStart=972ms`、`DOMContentLoaded=1009ms`、`transferSize=587`，并显示线上 manifest JSON。最终出现 JSON 是因为探测目标本来就是 `manifest.webmanifest`，是自动恢复成功的预期结果，不是业务首页被替换。临时静态服务器未给 webmanifest 响应声明字符集，Safari 原始 JSON 查看器曾按 GBK 解码中文；这是测试服务器的展示限制，不计为平台离线页缺陷。

本轮仍保留既有 Safari 兼容性边界：断网恢复后，`registration.update()`／重新 `register()` 曾长时间不返回，结束网页 App、保持联网并从图标重开后恢复。截至本小节的结论仅为“iPhone 中文安装、5 秒离线回退、中文离线页与自动恢复在该设备通过”；更新矩阵在后续小节补齐，Apple 发布通道和单 Origin 故障场景仍未通过。

## R2 iPhone Vue／React 真实 v1→v2 更新（2026-09-27）

部署前再次只读核对 Cloudflare：当前账期总费用、预测费用和日均费用均为 `$0.00`，Workers 仍为 Free，R2 的 billable storage 为 0 GB-month、Class A 173、Class B 1.56k，私有归档桶保持 Standard 且 Public Access Disabled。该结果只说明本轮小规模测试部署仍处于免费用量内，不构成费用上限承诺；记录不包含账号标识或凭据。

本轮使用实体 iPhone 16 Pro、iOS 27.0 的主屏幕网页 App 与 Safari 网页检查器。检查器窗口标题明确包含该 iPhone，页面视口为 402×812；此前误选到同名 Mac 安装窗口的观察已作废，没有计入以下真机证据。两站都先部署真实 v1，再部署真实 v2；测试期间只调用浏览器标准的 `ServiceWorkerRegistration.update()` 立即检查服务器上的新 worker。该调用与公开客户端的主动检查语义一致，不修改 DOM、不伪造提示；只有真实 v2 worker 下载并进入 `waiting` 后，SDK 才显示更新卡片。

| 站点 | v1 候选 | v2 候选 | iPhone 安装窗口结果 |
|---|---|---|---|
| React | bundle SHA-256 `cdc7dcb4a087cb6d15db59077206acdaf0df199ed1a5b31fe5283abb082d3fa8`；Pages `00e5db22-a669-4139-955b-8f6ac4c6438a` | bundle SHA-256 `ca1054e1e0421fd23a0ebccc029ecea33a8d2f80463325348eed1560929b1e70`；Pages `c794c4e7-7c8d-4448-a5b4-8bdee6492bff` | v2 部署后，仍打开的窗口保持 `v1`，新 worker 为 `waiting: installed` 并显示 `A new version is available`。用户点击 `Update` 后，worker 变为 `active: activated`、`waiting/installing: null`，页面仍为 `v1`，卡片变为 `Update complete / Reload page`；只有用户点击 `Reload page` 后页面才显示 `v2`，且无残留更新卡片。全过程 `standalone=true`、本源 worker 控制。 |
| Vue | bundle SHA-256 `1893fbcdec8c33f8f868f67d3c9624a06771fb515788d342a7d4e75c42be1dab`；Pages `ec8a3157-c37d-4b6d-b783-a27763c812e1` | bundle SHA-256 `92e3fee67523b5fd92556b3a7303e2bdd915d821dd8f143b23d562b93636cd45`；Pages `5bd4640f-6ad8-4bc8-a3b7-cc1816fbcd92` | 与 React 相同：真实 v2 下载完成时旧窗口为 `v1`、`waiting: installed` 并出现更新提示；点击 `Update` 后 active 已切换且旧 DOM 仍为 `v1`，显示 `Reload page`；显式点击后页面变为 `v2`。最终检查器读到 `standalone=true`、`controlled=true`、`active: activated`、`waiting/installing: null`，正文无更新卡片。 |

四个候选均完成私有 R2 读回、公开在线文件哈希核对和旧资产归档：React 每版 34 个在线文件、21 个保留资产，Vue 每版 27 个在线文件、14 个保留资产。该闭环证明 iPhone 单个已安装窗口中的“真实更新提示 → 用户确认接管 → 旧 DOM 不被强制刷新 → 用户显式刷新进入 v2”在 Vue／React 均通过。

随后单独补测 React 安装窗口的“v2 已下载后断网”分支。为保持保留资源门禁，未复用基于旧部署打包的候选，而是从当前线上归档重新构建：v1 bundle SHA-256 `0154d0ca8429c370f1154040c9dbe104bde260a394041d756c9401fa49ab5efc`、Pages `43dcfbc8-836e-47ea-a666-d6ff0be2d012`；v2 bundle SHA-256 `cfaf22c912c734f7600c0a7e364e62e33b23e36e632b9375440c20cc59cc3a30`、Pages `f912c2b3-c53d-49f5-a059-717f05fbbb02`。两版均完成 R2 读回、34 个线上文件哈希和 21 个保留资产核对。iPhone 主屏幕 App 先建立 `v1`、无 waiting 的干净基线；v2 部署后调用标准 `registration.update()`，旧 DOM 仍为 `v1`，worker 为 `waiting: installed` 并显示真实更新卡片。

用户关闭 Wi-Fi 和蜂窝数据后，同源 `/app/sw.js` 的 `HEAD`、`cache: no-store` 请求在 3 秒内以 `AbortError` 结束，作为真实断网证据；没有采用 iOS 上不可靠的 `navigator.onLine`。保持断网点击 `Update` 后，检查器读到新 worker `active: activated`、`waiting/installing: null`，旧 DOM 仍为 `v1`，卡片变为 `Update complete / Reload page`。继续断网点击 `Reload page`，页面从预缓存显示 `v2/registered`，保持 `standalone=true`、本源 controller 和 402×812 视口；刷新后的第二次同源无缓存探测仍为 `AbortError`，排除了恰好恢复联网的假阳性。

Vue 安装窗口随后执行同一分支。为避免旧部署候选与当前保留资源不一致，重新构建并归档：v1 bundle SHA-256 `db8e985112e8487cfc849d2da7fd66b9ca3224039de12c27412525c320ab23af`、Pages `b9736147-adce-4f39-8a63-6271f56f34ac`；v2 bundle SHA-256 `4467f898d0e72741f8765403db86f42ea972a808e73575f3ba6f440222f2990a`、Pages `70cf4626-1ccd-40f7-a6af-425393d325c5`。两版均完成 R2 读回、27 个线上文件哈希和 14 个保留资产核对。iPhone 主屏幕 App 从无 waiting 的 `v1` 基线发现真实 v2，旧 DOM 仍为 `v1`，worker 为 `waiting: installed` 并显示更新卡片。

用户关闭 Wi-Fi 和蜂窝数据后，同源无缓存 `HEAD` 请求在 3 秒内以 `AbortError` 结束。保持断网点击 `Update`，页面仍为 `v1` 并显示 `Update complete / Reload page`；检查器读到新 worker `active: activated`、`waiting/installing: null`。继续断网点击 `Reload page` 后，预缓存页面显示 `v2/registered`，保持 `standalone=true`、`controlled=true`、402×812 视口且无更新卡片；最终 worker 仍为 `active: activated`、无 waiting/installing，第二次同源无缓存探测仍为 `AbortError`。

因此 Vue／React 安装窗口的“v2 已下载后断网接管并离线显式刷新”均通过。

随后在 iPhone Safari 普通浏览器中补齐同 scope 双标签协调。iPhone 不提供同一个主屏幕网页 App 的双窗口 UI，因此该形态按平台不适用记录；测试没有用 Safari 标签页替代安装窗口的 standalone 结论，只验证同一 Safari 存储分区内两个受控页面对共享 Service Worker 注册的协调。每个框架均先部署真实 v1，并在标签 A 完成既有 worker 的确认与刷新，建立无残留提示的 v1 基线；再打开标签 B，确认同为 v1 且无更新提示。

| 站点 | 双标签 v1 候选 | 双标签 v2 候选 | iPhone Safari 结果 |
|---|---|---|---|
| Vue | bundle SHA-256 `a73f51cbaf5bfded037963db404758a159d60cf8a064aecaa625b2e1470a118a`；Pages `127f8678-a19a-42af-b397-38c87e315c84` | bundle SHA-256 `18a49dd916a38c4719d2958bcb514a07f61825aa3f47da3871229f78a979180e`；Pages `dc5bc257-052f-404b-b669-c1d6b7a9b1ce` | 保持 A、B 两个 v1 标签不刷新，临时打开 C 取得 v2 页面并触发 worker 检查；关闭 C 后，A、B 均仍为 v1 且出现更新提示。在 B 单独点击 `Update` 后，A、B 均保持 v1 并同步显示 `Reload page`。只刷新 B 时，B 进入 v2 且提示消失，A 仍为 v1 并保留 `Reload page`；最后显式刷新 A 后两标签均为 v2。 |
| React | bundle SHA-256 `b87755ce71ed87e3c2dc5091c86652a8fedffc497ece40fe5ea2feefa19d2422`；Pages `fee590a5-13f7-44f3-8bfd-561afb235a5a` | bundle SHA-256 `9d8cde0c56d5871ebaf07c1d964a549f348704c8dcc627299ffee0a795bd46e5`；Pages `87b664f2-abf7-4409-978f-3fda04b570a9` | 与 Vue 相同：A、B 两个 v1 标签共同收到等待更新提示；只在 B 确认后，两个旧 DOM 都保持 v1 并同步进入 `Reload page`；只刷新 B 不会强制刷新 A；最后分别显式刷新后均为 v2。 |

Vue 两版均完成私有 R2 读回、27 个线上文件哈希和 14 个保留资产核对；React 两版均完成私有 R2 读回、34 个线上文件哈希和 21 个保留资产核对。该闭环证明一个标签确认接管后，所有同 scope 标签通过浏览器原生 `controllerchange` 收敛，但平台不会强制刷新任何标签，刷新仍由各标签中的用户操作决定。iPhone 可执行的 Vue／React 多标签矩阵通过；Apple 发布通道结论继续为渐进兼容。

## R2 Mac Safari 18.6 Vue／React 真实 v1→v2 更新（2026-09-27）

本轮使用 macOS 15.7.3、Safari 18.6 已添加到程序坞的“Vue Drill”和“React Drill”网页 App。测试前只读复核专用 R2 桶：Standard、Public Access Disabled，桶大小约 34.68 MB，Class A 158、Class B 1.56k；仅执行小规模 drill 候选部署。两站都从当前线上归档重新构建真实 v1，再基于该 v1 的 Pages 部署构建真实 v2；每版均先上传私有 R2 并回读校验，再通过 Pages 预检、公开文件哈希索引和旧资产归档。

| 站点 | v1 候选 | v2 候选 | Mac Safari 安装窗口结果 |
|---|---|---|---|
| Vue | bundle SHA-256 `74fee2df589f7488f8c2591bd8dcd0beccc0cf3dca663432aefb8542c98ee7eb`；Pages `32f690e5-1025-4404-8da9-84d96b689944` | bundle SHA-256 `2bd51308245f13d8c2030c28747762e0f68f63ed8652661f63ce6abfcd578134`；Pages `33c6b84f-ef61-42af-b677-dc2095df462e` | 安装窗先建立无残留提示的 v1 基线。v2 部署后从“文件 → 新建窗口”打开同一网页 App 的第二个受控窗口，两个窗口仍显示 v1，随后出现真实 `A new version is available`。只在前台窗口点击 `Update` 后，两个窗口都保持 v1 并显示 `Update complete / Reload page`；只刷新一个窗口时该窗口进入 v2，另一窗口仍保持 v1 和 Reload 卡片；最后显式刷新另一窗口后两者均为 v2。 |
| React | bundle SHA-256 `6cbc249292c7e53eb981a5374d7c63f2ac7ea7c56bad0571d6bbe49ba7532962`；Pages `828aa2e6-66ad-4180-b4b3-fb2d6ba7775f` | bundle SHA-256 `08bbea2cbce1912294aade783145954db63b2f0f18b96ad5289d42c814a5465f`；Pages `6683bb91-f352-483d-be43-4801c88cc90e` | 与 Vue 相同：新建第二个安装窗触发 Safari 的标准导航更新检查，两个旧 DOM 均为 v1；提示出现后单点确认使两窗口同步进入 Reload 状态，但不会强制刷新。逐一点击 `Reload page` 后两个窗口分别进入 v2，React 的推送订阅区域与基础按钮仍正常呈现。 |

Vue 两版均完成私有 R2 读回、27 个线上文件哈希和 14 个保留资产核对；React 两版均完成私有 R2 读回、34 个线上文件哈希和 21 个保留资产核对。此次没有调用检查器脚本、没有改写 DOM，也没有注入更新提示：第二窗口的真实导航触发浏览器检查，只有新 worker 下载并进入 waiting 后 SDK 才显示卡片。结果证明 Mac Safari 安装网页 App 的同 scope 双窗口共享 Service Worker 注册，接管状态会同步，但每个窗口仍由用户独立决定何时刷新。本轮更新测试未执行断网冷启动；后续已按下节手工实机步骤补齐，不从更新结果本身外推。

### Mac Safari 18.6 安装窗口离线导航与恢复

在 React Drill 已安装网页 App 保持前台时，通过其 Safari 网页检查器安排导航到线上 HTTP 200、带唯一查询参数且此前未缓存的 `/app/entry-manifest.json`；随后物理关闭 Mac Wi-Fi 30 秒并由命令陷阱保证重新开启。断网导航由本源 Service Worker 返回英文默认离线页，独立窗口标题为 `Offline`，显示 `You're offline`、自动恢复说明与 `Try again`，地址仍保留原 JSON 目标。Wi-Fi 恢复后没有点击按钮或手工刷新，约 8 秒内页面自动重载为线上 JSON，内容为 `sequence: 1`、`status: normal`，证明最终脚本在 Safari 18.6 安装窗口完成真实离线回退与联网探针恢复。

Vue Drill 初次使用同一 HTTP 200 JSON 目标对照时，只在联网恢复后取得最终页面，没有可靠捕获断网窗口，因此当时未把 React 证据外推到 Vue。后续使用可回滚的单 Origin 故障模拟补齐：仅在 `/etc/hosts` 临时将 `drill.pwa-platform-vue-demo.pages.dev` 指向 `127.0.0.1`，`curl` 连接失败确认阻断生效；再通过容器路径精确识别并重启只属于 `com.apple.Safari.WebApp.7D7346AA-6634-4D7F-B48C-3B43C287D4DA` 的 WebKit Networking 子进程，避免复用阻断前的 Cloudflare 连接。对保持原未缓存 JSON 目标的安装窗口执行重载后，Safari 标题为 `Offline`，可访问性树与可见页面同时显示 `PWA Platform Vue Drill`、`You're offline`、`This page will reload when your connection is back.` 和 `Try again`，地址仍保留原 JSON 目标。

随后精确删除该 hosts 记录并刷新 DNS；系统网络环境重新解析到 Cloudflare IPv4／IPv6，对同一 JSON 的 `curl` 返回 HTTP 200。没有点击 `Try again`、没有人工刷新，Vue 离线页随后自动回到 `sequence: 1 / status: normal`的线上 JSON。该场景证明“本 Origin 失效 → 默认离线页 → 联网探针恢复”，并不伪称为整机物理断网；两框架的物理断网冷启动另见下段。

随后单独执行断网冷启动：Vue／React 网页 App 先在联网状态打开，两者都显示 v2/registered 并出现真实更新提示；分别点击 `Update` 后提示消失，确认最新 worker 已接管，然后完全退出两个网页 App。由于关闭 Mac Wi-Fi 会同时中断 Codex 控制通道，之后由用户手工关闭 Wi-Fi，从 Finder 中的 `/Users/vilin/Applications/Vue Drill.app` 和 `/Users/vilin/Applications/React Drill.app` 分别冷启动。用户报告两者离线与联网表现一致，均正常显示 v2，无白屏。这是用户手工实机观察，不冒充自动化截图；它补齐两框架的安装窗口冷启动证据，但不补算 Vue 未缓存导航的断网页面可见证据。

### Android 非 Chrome 浏览器冒烟（2026-09-27）

设备为实体 23127PN0CC、Android 16；移动数据保持关闭，断网步骤真实关闭设备 Wi-Fi，并在每次测试结束后确认重新连接 `tralala5G`。目标使用公开 Vue Drill `/app/` 与线上存在、带唯一查询参数的 `/app/entry-manifest.json`，避免把服务器 404 或历史缓存误当成恢复成功。

| 浏览器 | 在线与 Service Worker | 安装入口 | 真实断网与恢复 | 判定 |
|---|---|---|---|---|
| Firefox `156.0.1` | 页面显示 v2、registered、`kind: none` | 菜单同时显示“添加快捷方式”和“添加应用到主屏幕”；点击后没有出现可确认安装对话框，当前启动器页及 Firefox 快捷方式列表均未取得新图标证据 | 未缓存 JSON 导航显示 `PWA Platform Vue Drill / You're offline / Try again`；恢复 Wi-Fi 后无手工刷新自动显示 `sequence: 1 / status: normal`。截图：`/private/tmp/pwa-android-firefox-vue-offline.png`、`/private/tmp/pwa-android-firefox-vue-recovered.png` | 浏览器运行、离线回退、自动恢复通过；安装最终固定待确认 |
| 夸克 `10.16.0.1135` | 页面显示 v2、registered、`kind: none` | 展开完整菜单后仅见书签、下载、刷新、分享等入口，未发现“安装应用”或“添加到桌面” | 同一类未缓存 JSON 导航显示平台英文离线页；恢复 Wi-Fi 后无手工刷新自动显示 `sequence: 1 / status: normal`。截图：`/private/tmp/pwa-android-quark-vue-offline.png`、`/private/tmp/pwa-android-quark-vue-recovered.png` | 浏览器模式补充兼容通过；不具备本次可见的 PWA 安装入口 |
| 小米系统浏览器 `20.16.1020421` | 页面显示 v2、registered、`kind: none` | 浏览器自动显示“是否将该网站添加到桌面以便离线查看”，名称为 Vue Drill、图标正确；确认后系统登记 pinned shortcut，清单包含正确 `startUrl`、`scope`、`displayMode` 和 192 图标。从新图标启动进入 `com.android.browser.webapps.pwa.PWAActivity`，没有浏览器地址栏 | 蜂窝数据关闭且 Wi-Fi 关闭后，结束浏览器并从新图标冷启动，独立窗口仍显示 v2/registered。另在普通浏览器窗口导航未缓存 JSON，显示平台英文离线页；恢复 Wi-Fi 后无手工刷新自动显示 `sequence: 1 / status: normal`。截图：`/private/tmp/pwa-android-mi-standalone-offline-cold.png`、`/private/tmp/pwa-android-mi-browser-offline.png`、`/private/tmp/pwa-android-mi-browser-recovered.png` | 添加桌面、独立窗口、断网冷启动、离线回退和自动恢复通过 |

三个浏览器的离线页面都来自平台 Service Worker，而不是浏览器自己的网络错误页；恢复后都到达线上实际 JSON 内容，因此“离线回退 → 联网探针 → 自动重载”链路有实体证据。安装支持必须按浏览器分别描述：小米浏览器已完成固定快捷方式和独立窗口；Firefox 仅确认安装入口可见，点击后没有系统或启动器结果；夸克未发现入口。它们不属于既定 Android Chrome 发布门禁，不能用来升级 `desktop+android` 通道结论。

## R3 Android 单 Origin 故障恢复（2026-09-27）

设备为实体 23127PN0CC、Android 16、Chrome 153.0.8010.53；测试入口为已安装的 React WebAPK `org.chromium.webapk.a79c749fa7b1c369e_v2`，备用入口为已安装的 Vue Drill。两站均保持公开 v2。React 侧先交入序号 300 的 `normal` 清单，唯一入口指向 Vue `/app/`；两个 Origin 正常时，`checkEntryRecovery({ returnPath: "/app/orders/42?tab=1" })` 返回 `kind:none`，确认不会因存在备用入口而误提示。

故障阶段使用 Android Chrome 153 的 `Network.emulateNetworkConditionsByRule`，只对 `https://drill.pwa-platform-react-demo.pages.dev/*` 注入 60 秒延迟；Vue Origin 不匹配规则并保持可达，`navigator.onLine` 继续为 `true`。React 的主入口探测按公开 5 秒超时结束，实测约 5.155 秒，随后备用探测成功并返回 `available / unconfirmed-outage`；结果只包含本源 `/app/pwa-entry.html?return=...`，没有把目标 Origin 暴露给业务页面。该模型验证的是“当前 Origin 请求超时、设备和备用 Origin 仍在线”，不是整机断网。

保持故障条件导航恢复页后，页面由本源 Service Worker 控制并从预缓存完整启动；地址保留 `return=/app/orders/42?tab=1`，先显示 `Checking for alternative entries…`，随后显示英文 `The usual address may be unreachable (unconfirmed)`、UTC 有效期和唯一的 `Go to drill.pwa-platform-vue-demo.pages.dev` 按钮。页面没有自动跳转。通过 DOM 只读测得按钮为 352×72 CSS px，再由 ADB 对实体界面点击；MIUI 弹出“Chrome 想要打开 Vue Drill”，只选择“本次允许”，未授予永久权限。最终落到 `https://drill.pwa-platform-vue-demo.pages.dev/app/?pwa-return=%2Fapp%2Forders%2F42%3Ftab%3D1`，Vue 页面为 v2、`standalone=true`、由 Vue 本源 worker 控制。

测试结束后清除网络条件，并在 React 侧交入序号 301、`normal`、空入口清单；更新返回 `accepted:true`，再次检查为 `kind:none`。准备阶段两种不完整方法均明确作废：只对页面会话使用 `Network.setBlockedURLs` 会在 Service Worker 介入前阻断恢复页子资源，得到空白页；只对 worker 会话使用该命令又不能让页面侧主入口探测失败。两者都没有计入通过证据。当前结论只覆盖 Android 上的受控单 Origin 超时；真实 DNS／证书错误以及 iPhone 的同等分支仍待执行，R3 总项保持未完成。

## R3 iPhone 单 Origin 故障恢复未完成记录（2026-09-27）

设备为实体 iPhone 16 Pro、iOS 27.0；目标是已安装并以独立窗口运行的 React Drill，备用 Origin 为公开 Vue Drill。先在标题明确包含 `vilin的iPhone` 的页面检查器目标上核对 402×874 屏幕、402×812 视口、`display-mode: standalone`、本源 `/app/sw.js` HTTP 200、active registration 与 controller；普通 Safari 另行打开 Vue `/app/` 显示 v2，证明手机联网与备用 Origin 基线可用。此前误选同名 Mac 目标得到的 1800×1169、`standalone=false` 结果已经作废，不计入本节证据。

React 侧成功交入序号 3100、`normal`、唯一 Vue 备用入口的清单，在线基线 `checkEntryRecovery({ returnPath })` 返回 `kind:none`。随后在 Safari Web Inspector 为一次精确的本源 `__pwa-entry-probe` URL 创建“阻止请求”本地覆盖，并固定该次测试的缓存破坏随机值；覆盖已启用且重载后，请求仍由 Service Worker 返回普通 HTTP 404，约 0.3 秒内检查继续正确返回 `kind:none`。HTTP 404 代表 Origin 已经给出响应，不能作为网络不可达；因此这两次尝试均未计为故障分支通过。测试后两个本地覆盖均已停用。

准备改用仅让当前 React Origin 的探测 `fetch` 抛出 `TypeError`、其他请求继续走真实网络的可还原测试桩时，iPhone Web Inspector 远程求值通道失去响应：`1+1`、`console.log` 和临时 Console Snippet 都只进入检查器历史，不返回求值结果或日志；关闭并重建检查器、重新选择物理 iPhone 的 React 页面目标后现象不变。来源面板仍能读取页面资源且调试器没有暂停，说明阻塞点是本轮远程求值会话，不能把它解释为恢复逻辑失败。由于测试桩没有成功执行，恢复页、用户确认跳转与收尾空清单均没有获得新的 iPhone 证据。

本轮结论为“演练未完成”，不是产品失败，也不是通过。iPhone 既有安装、真实 v1→v2 更新、断网接管、离线页与联网恢复证据继续有效；R3 和 T5 的 iPhone 单 Origin 子项保持未勾选。后续应在远程求值稳定的 Safari 会话、可控制单域名网络层的代理／防火墙环境，或真实 DNS／证书故障窗口中重做，并在完成后交入更高序号的 `normal` 空入口清单收尾。

## R4 交叉边界复核（2026-09-27）

候选基线为 `929ea925c67b9c63adbf6d587a8c51f22a9a0712`；新增的严格 CSP 浏览器回归与本记录位于同一后续提交。审计没有发现运行时代码或公开契约缺陷；发现并关闭的唯一缺口是“文档给出 CSP 哈希、单测证明哈希计算正确，但没有真实浏览器以响应头执行”的证据缺口。

| 边界 | 可追溯证据 | 本次结果 |
|---|---|---|
| `/` 与 `/m/` scope 隔离 | `packages/vite/browser-tests/shared-origin-registration.spec.ts`、`shared-origin-isolation.spec.ts`、`shared-origin-recovery.spec.ts` | Vite 单元 226/226、Chrome 153.0.8010.53 浏览器 32/32；根／子应用控制器、跨 scope fetch、离线导航及两侧恢复 worker 均保持隔离。 |
| 默认缓存拒绝 | `packages/sw-runtime/browser-tests/offline.spec.ts`、`runtime-cache.spec.ts`、`range-request.spec.ts` | sw-runtime 单元 321/321、浏览器 49/49；`no-store`、`private`、`Vary: Cookie`、错误 MIME、超限响应、带 `Authorization` 请求、未分类与拒绝路径均未写入缓存；Range 请求继续走真实网络 206。 |
| 恢复 worker | `packages/sw-runtime/browser-tests/lifecycle.spec.ts`、`runtime-cache.spec.ts`、`offline-write.spec.ts`，以及上述 shared-origin 恢复测试 | 只清理目标应用的 precache、runtime cache、expiration 记录和离线写入库；其他应用／环境缓存保留，恢复 worker 不提供内容。相关 sw-runtime 49/49、Vite 32/32。 |
| 严格 CSP | 新增 `packages/vite/browser-tests/offline-page.spec.ts` 与 `packages/entry-resilience/browser-tests/scenarios.spec.ts` 的 strict CSP 场景 | 真实 `Content-Security-Policy` 响应头下，离线页发布的 `style-src`／`script-src` 哈希可执行，入口恢复页的样式哈希及 `script-src 'self'` 外链模块可执行；两页均为 0 条 `securitypolicyviolation`，且在断网预缓存路径中完成交互。Vite 32/32、entry-resilience 19/19。 |
| 更新 UI 个性化 | `packages/examples-browser-e2e/ui-browser-tests/update-notice.spec.ts` | Vue／React 的位置、主题覆盖、窄屏、组件级颜色覆盖、稍后提醒、失败重试、显式刷新，以及桌面亮／暗主题的计算色对比度共 14/14 通过。 |
| 公开包门禁 | `pnpm check:publish`；本页“npm 正式版与独立消费”及[发布记录](release-0.1.0.md) | 当前源码再次核对 10 个包的 metadata 与构建导出通过；已发布 `0.1.0` 的 registry 读回和独立 Vite 5 消费证据保持有效。 |

本次直接执行命令：

```text
pnpm --filter @pwa-platform/vite test
pnpm --filter @pwa-platform/entry-resilience test
pnpm --filter @pwa-platform/vite test:browser
pnpm --filter @pwa-platform/entry-resilience test:browser
pnpm --filter @pwa-platform/sw-runtime test
pnpm --filter @pwa-platform/sw-runtime test:browser
pnpm --filter @pwa-platform/examples-browser-e2e exec playwright test --config playwright.ui.config.ts
pnpm check:publish
```

默认受限环境首次启动 Chrome 时全部在浏览器启动阶段以 `kill EPERM` 失败；在获授权的本机浏览器环境重跑后得到上表结果。该环境失败没有被记为产品测试通过或失败。

收口门禁：`pnpm lint`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm docs:build`、`pnpm check:publish` 与 `git diff --check` 全部退出 0；`pnpm test:browser` 的 9 个套件共 230/230 通过、0 失败、0 跳过（Chrome 153.0.8010.53）。本次只新增测试与验收记录，运行时源码、公开 API 和已发布 `0.1.0` 包内容均未改变；既有 Chrome 154/153 各 228/228 的发布前证据仍对应已发布运行时代码，新 CSP 用例的本次新增执行证据为 Chrome 153。

## 待处理的已知边界

- `@pwa-platform/entry-resilience@0.1.0` 已发布并完成 registry 读回、Vite 5 独立消费和双 Origin 真实浏览器故障演练。Android 已完成受控的当前 Origin 超时、备用 Origin 可达分支；iPhone 本轮只完成在线基线，Safari 本地覆盖未能穿透 Service Worker，随后 Web Inspector 远程求值无响应，因此单 Origin 分支仍未执行完成。真实 DNS／证书故障与该 iPhone 分支都不计入 `desktop` 通道通过证据。
- 一台 Android 无法满足现有 `desktop+android` 通道对 Chrome N/N-1 的两机要求。任何手机测试都会照实记录，但不得升级为该通道通过证据。

## R5 Apple 发布通道裁决（2026-09-27）

依据本记录已经取得的 Mac Safari 与 iPhone Safari 实证，项目所有者于 2026-09-27 接受 [ADR-0041](../../docs/adr/0041-keep-apple-as-progressive-compatibility.md)：`0.1.x` 暂不新增 Apple 生产发布通道，macOS Safari 与 iPhone Safari 作为两个独立的渐进兼容证据面继续逐场景记录。Mac 端已经覆盖 Vue／React 的安装、真实更新、离线启动、默认离线页和自动恢复；iPhone 也覆盖了大量安装、更新和离线分支，但仍缺当前 Origin 单独失效的入口恢复实证，并存在恢复联网后 active worker/controller 仍在、SDK 却显示 `not registered`、注册／更新调用挂起直至退出重开的差异。

裁决把“离线页已经自动恢复”和“恢复后的注册／更新就绪”拆开判定：前者保留通过，后者记为部分通过并阻止 iPhone 晋级。它不修改现有 `desktop`／`desktop+android` 门禁，也不扩大首页、README、浏览器矩阵或公开生产声明。R5 至此关闭；iPhone 单 Origin 故障仍作为渐进兼容缺口保留，不阻塞 `desktop` 通道。
