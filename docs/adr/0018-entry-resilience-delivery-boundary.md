# ADR-0018：入口恢复的交付边界

## 状态

已接受（2026-09-17，项目所有者）。按 [ADR-0006](0006-optional-shared-origin-and-push-modules.md) 的方式做成可选模块；信任模型见 [ADR-0017](0017-entry-manifest-trust-model.md)，依赖 [ADR-0015](0015-vite-plugin-build-pipeline.md) 2026-09-17 增补的只读计划 API。

## 背景

浏览器的同源隔离意味着 Service Worker、Cache Storage、IndexedDB、Cookie 与安装身份都无法带到新 Origin。平台能做的只剩"引导"。问题在于引导放在哪一层、从哪里触达用户，以及它允许改动多少已交付的契约。

三个事实决定了边界：

- **Origin 不可达时，用户看到的是应用自己。** 平台 worker 的导航策略是网络有任何响应就用网络（含 4xx 与 5xx），网络层失败才回退到同路由的预缓存页（`packages/sw-runtime/src/worker/decide.ts`）。已安装应用在旧 Origin 挂掉时会从缓存正常启动，屏幕上没有任何平台自己的页面，入口必须由某一层主动提供。
- **`PwaPlan` v1 是封闭形状**，只有 15 个字段，契约校验会拒绝未知字段。把入口恢复配置塞进计划，就要升计划版本并写迁移，同时修改 contracts、core 与 build-verifier。
- **大多数应用不需要这项能力。** 与同源拓扑、Push 一样，它不应成为所有消费方的运行时负担。

## 决策

- **独立的可选包 `@pwa-platform/entry-resilience`，自带版本化契约。**
  - `PwaPlan` v1 不变，contracts、core、build-verifier、client-runtime、sw-runtime 与两个框架绑定都不修改。
  - 包内 `src/` 环境中立：不导入 `node:` 模块，不依赖任何第三方包。

- **诊断使用本包自己的 `entry.*` 码表，不追加进 contracts 的 `DIAGNOSTIC_CODES`。** 这与 [ADR-0014](0014-build-verification-boundary-and-report.md) 的做法不同：那里 build-verifier 是所有发布都要经过的门禁，诊断需要与校验、编译统一消费；本模块是可选能力，把它的码追加进公共枚举，等于为少数应用改动所有人依赖的已交付契约。形态保持一致：只含码与路径，不回显任何输入值。

- **入口由应用调用查询函数触达。** 应用在自己认为合适的位置调用 `checkEntryRecovery()`：
  - 结果只含状态、原因、有效期与**平台恢复页的链接**，**绝不含备用入口地址**，应用无法绕过确认步骤直接跳转；
  - 函数从不抛出；
  - 当前 Origin 或时钟不可用时，在任何存储与网络访问之前失败即关闭。

- **展示规则。**
  - `migrating`（计划迁移）与 `incident`（故障）由清单声明，直接展示，不发任何探测。
  - `normal` 状态仅在"主入口探测于网络层失败，且至少一个备用入口可达"时展示为**未经确认**的疑似故障。
  - 设备离线时两者都失败，不展示任何入口，离线用户不会被误导成"域名故障"。

- **确认与导航只在平台恢复页上发生。** 恢复页独立重新执行选择与校验，展示目标主机、原因与有效期；用户点击后才做顶层导航，没有任何自动跳转，也不使用 `window.open`。页面不含内联脚本，所有文本经 `textContent` 写入。

- **跨 URL 边界只允许经过校验的返回路径。** 返回路径必须是 scope 之内的相对路径，并拒绝 `//`、反斜杠、控制字符，以及解码一次后的同类绕过。令牌、Cookie、个人数据一律不出现在 URL 中。**本期不做一次性交接码**：故障期间旧 Origin 的服务端本身不可用，无从签发；它又是唯一可能让凭据跨 URL 的形态，推迟到有真实需求、服务端契约明确时再单独评审。

- **最后已知清单存于 IndexedDB 的独立库**（`pwa-entry:<appId>:<environment>`），不在缓存命名空间之下，因此 [ADR-0005](0005-update-prompt-and-recovery-worker.md) 的恢复 worker 删除应用缓存时不会连带删除它（真实浏览器实测）。清单是公开数据，登出时不清除。

- **构建集成是与 `pwa()` 并列的独立 Vite 插件 `pwaEntryResilience()`。** 它发布恢复页、指纹脚本与虚拟配置模块，并通过 `pwa()` 暴露的只读计划 API，在 `writeBundle` 中确认恢复页已进入 `plan.precache`；否则构建失败。它不重新编译计划，也不解析 worker 产物。

## 2026-09-23 修订（[ADR-0033](0033-entry-manifest-supplied-by-the-application.md)）

ADR-0033 把清单的取得与验真交给业务应用，本 ADR 的交付边界随之调整；上文其余决定不变。

- **构建集成的选项收窄为 `{ identity, maxValidityDays }`。** `keys`、`seed`、`approvedOrigins`、`discoveryUrl` 已移除，传入其中任一项即构建失败并指向 ADR-0033。插件仍发布恢复页、指纹脚本与虚拟配置模块，仍通过 `pwa()` 的只读计划 API 校验恢复页已进入产物。
- **页面侧从一个函数变为两个**：`updateEntryManifest(data)` 由应用在线时交入清单，`checkEntryRecovery()` 展示时只读本地记录。两者共用一套浏览器端口，都不抛出。
- **发现源请求与构建期种子不再存在**，签名与公钥集也不再存在；因此本 ADR 原先关于"验签后再解析""最后已知可信清单每次重新验签"的表述不再适用。清单的可信度改由应用后端与传输层承担，边界见 ADR-0033。
- **Ed25519 的浏览器支持不再是约束**：包内不再有任何密码学校验。

## 2026-09-23 再修订：恢复页的样式

本 ADR 原先把恢复页定为"平台发布的静态 HTML 加外链脚本，不含内联脚本"，实际交付的页面因此连 class 与样式都没有，呈现为浏览器默认外观。该约束的本意是**不依赖框架与外部资源**，并未要求没有样式；项目所有者 2026-09-23 据此要求默认样式要体面，并允许宿主定制。

- **默认样式以内联 `<style>` 写入恢复页**，不外链 CSS 文件：外链是又一个在域名不可达时可能取不到的资源，也会先闪一屏无样式内容。**"不含内联脚本"这一条不变**，脚本仍是带指纹的外链模块。
- **页面元素获得稳定的 class**（`pwa-entry__headline`、`pwa-entry__button` 等），连同一组 CSS 自定义属性，一并成为公开契约；改名等同破坏性变更。
- **宿主通过插件选项 `css` 提供自己的样式**，构建时追加在默认样式之后，因此同名规则自然覆盖。不提供"替换默认样式"的开关：追加已足以覆盖任何规则，多一个开关就多一条要维护的路径。
- **CSP 以构建日志给出每段内联样式的 `sha256-` 值**，不生成额外产物文件：新增产物会连带要求在 Cloudflare 部署链路的四处白名单登记，代价与收益不成比例。
- 结构、文案、按钮行为与返回路径校验均不变；页面文案仍写死中文，多语言留待后续。
- **恢复页可跟随宿主应用的主题设置，靠的是一个存储键而不是一次函数调用。** 它是独立文档，应用的运行时调用到不了它；同源的 `localStorage` 在首次渲染前同步可读，因此偏好写入 `pwa:theme:<appId>:<environment>`，恢复页读到后在根元素设 `data-theme`。**公开契约是这个键**：恢复页不依赖 `client-runtime` 或任何平台包，将来其他平台界面读同一个键即可。写入用的 `setPwaTheme` 放在 `@pwa-platform/entry-resilience/client`，因为应用已经从那里导入页面侧 API；代价是未接入入口恢复的应用暂时拿不到这个设置入口，若将来确有需要再迁往更通用的位置。

## 影响

- **应用必须接入。** 不调用 `checkEntryRecovery()` 的应用不会展示任何入口，平台不会替应用改写界面或导航。
- **只有网络层不可达会触发疑似故障提示。** 旧 Origin 只要返回任何 HTTP 响应，就不会出现提示；这种情况靠清单的 `migrating` 或 `incident` 状态覆盖，被接管的域名无法覆盖（ADR-0017）。
- **新 Origin 上的登录与数据完全从零开始**，本模块不提供任何迁移。
- **只支持 Vite 构建**；SSR 应用与其他构建器留给后续迭代。
- 真实浏览器证据需要多个 Origin：测试自己启动多台 fixture 服务器（[ADR-0033](0033-entry-manifest-supplied-by-the-application.md) 之后为当前与备用两台，不再需要发现源那一台），先启动、再构建，把真实 Origin 写进构建（模块计划 T2 的实测结论），因此不能使用 harness 自带的 `fixtureServer` fixture。
- 规格见 [spec/pwa-entry-resilience.md](../../spec/pwa-entry-resilience.md)，计划见 [tasks/pwa-entry-resilience/plan.md](../../tasks/pwa-entry-resilience/plan.md)。
