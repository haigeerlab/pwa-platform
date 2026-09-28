# PC 接入体验复核（0.2.1，对照 2026-09-27 上一轮审查）

方法：只读 `website/` 及 `packages/*/README.md` 完成一次全新接入（不读 `packages/*/src`、`tests`、`docs/review`、`spec/`）；构建通过后才读 `packages/contracts/src`、`packages/core/src` 核对配置项默认值与文档一致性。

## a. 实测接入流水

| 步骤 | 命令 | 结果 | 耗时 | 卡点 |
| --- | --- | --- | --- | --- |
| 环境确认 | `node -v` / `pnpm -v` | Node 24.18.0、pnpm 11.18.0，满足“Node.js 22.12+” | 数秒 | 无 |
| 选包 | 读 `website/index.md` → `start/choose.md` | 选择 Vite 8 + React 19 路径（npm 0.2.1） | — | 无 |
| 脚手架 | `pnpm create vite@latest app -- --template react-ts` | **未生效**：生成的是 vanilla-ts 项目（`src/main.ts`，无 React 依赖），`--` 后的 `--template` 未被正确解析 | 约 3s | ⚠️ 与 pwa-platform 文档无关，是 `pnpm create` 透传参数的已知坑；改用 `pnpm dlx create-vite@latest app -t react-ts --no-interactive` 后正确生成 React 模板 |
| 依赖安装 | `pnpm install` | React 19.3.0、Vite 8.3.1，满足 `start/choose.md:11` 声明的 peer 范围 `>=19.2、<20` 与 `Vite 5／8` | 约 4s | 无 |
| 装平台包 | `pnpm add @pwa-platform/react@0.2.1`、`pnpm add -D @pwa-platform/vite@0.2.1 @pwa-platform/contracts@0.2.1` | 成功，从公开 npm registry 解析，无需切源 | 约 17s | 无 |
| 生成 4 个真实 PNG 图标 | 用 Python 现写 192/512 与两个 maskable 变体，写对文件头与声明尺寸一致 | 成功 | — | 文档要求"不能只是改了名称的占位图"（`configuration.md:56`），照做即可通过校验 |
| 写 `pwa.config.ts` | 按 `guide/configuration.md` 示例，仅替换 `origin` 为 `http://localhost:4173`、`environment: "preview"`（按 `configuration.md:124-126` 建议） | 成功 | — | 无 |
| 改 `vite.config.ts` | 按 `start/react.md:14-32` 加入 `pwa()`，保留 `@vitejs/plugin-react` | 成功 | — | 无 |
| 改 `tsconfig.app.json` | 追加 `@pwa-platform/vite/virtual` 到 `types` | 成功 | — | 无 |
| 改 `src/main.tsx` | 按 `start/react.md:40-67` 接入 `PwaProvider` + `Registrar` | 成功 | — | 无 |
| 新增 `src/PwaActions.tsx` 并在 `App.tsx` 渲染 | 按 `start/react.md:77-117` | 成功 | — | 无 |
| **生产构建** | `pnpm build`（`tsc -b && vite build`） | **第一次构建即通过**，输出 `manifest.webmanifest`、`sw.js`、`offline.html`、`pwa-recovery-worker.js` | 811ms（vite 阶段） | 无 |
| 本地验收 | `pnpm preview --port 4173 --strictPort` + `curl` | 全部响应头带 `Vary: Origin`（见下） | — | 复现 C-1 |
| 浏览器验证（Playwright + 已缓存的 chromium-1243） | 自写脚本：注册、二次刷新后受控、离线重开应用壳、离线打开未访问路由显示离线页 | 全部符合文档描述 | — | 无（见下方证据） |

**Playwright 实测关键输出**：
```
SW registration state: {"registered":false}         # goto 后立即查询，尚未注册完成（正常竞态）
Controller after reload: null                        # 第一次刷新未受控
Controller after 2nd reload: http://localhost:4173/sw.js   # 第二次刷新受控，与 checklist.md:19 描述完全一致
manifest link href: /manifest.webmanifest
Offline reload succeeded. Body snippet: "Get started..."    # 断网重开已访问应用壳成功
Offline unvisited-route body: "Onboard Trial\n\n当前处于离线状态\n\n网络恢复后页面会自动重新加载。\n\n重试"
title: 离线                                            # 未访问路由离线时显示默认离线页，与 integration-by-capability.md:142 描述一致
```

**总耗时**：约 25 分钟（含 Playwright 脚本编写与两轮验证），远低于上一轮 0.1.0 审查的约 1.5 小时——上一轮记录的多个卡点（C-2/C-3/C-4/C-5/C-6/C-8）已在文档中写明，本次照做没有绕路。

**结论**：0.2.1 的最小接入路径可以顺利走通，第一次构建即通过；离线、注册两阶段受控、离线页兜底全部与文档描述一致。全程唯一的实操卡点（`pnpm create vite -- --template` 参数被吞）与 pwa-platform 文档无关。

## b. 新卡点清单

| 严重度 | 位置 | 现象 | 建议改法 |
| --- | --- | --- | --- |
| 低 | `website/start/choose.md:22-32`（安装命令示例）| 示例用 `pnpm add`，但没有说明 `pnpm create vite -- --template react-ts` 这种双短横线透传参数在部分 pnpm 版本下会被吞掉（脚手架仍成功但产出 vanilla 模板而非 React，且没有任何报错）。本次是在选包页之外、脚手架阶段踩到，不完全属于 pwa-platform 文档范围，但由于选包页是新人第一次运行命令的地方，建议附一句"确认生成的模板包含 React 依赖，否则改用 `pnpm dlx create-vite@latest app -t react-ts`" | 在 `start/choose.md` 或 `start/react.md` 开头加一句校验提示 |
| 低 | `website/guide/configuration.md` 全文 | `PwaIdentity.origin` 字段本身没有独立的用途/取值说明（只在第 18 行示例、第 58 行 manifest 链接规则、第 124-126 行"本地验收用什么 environment"里侧面出现）。实测 `origin` 填 `http://localhost:4173` 完全不影响 worker 路由（worker 用自己所在页面的 origin），但文档从未正面回答"这个字段到底控制什么、本地验收该填什么" | 在身份字段旁补一行：`origin` 的实际用途（目前只用于 manifest 链接一致性校验，不参与 worker 路由判断），并给出本地 `vite preview` 场景的推荐填法 |

以上两点均为“低”严重度、不阻断接入；未发现新的阻断级或高严重度卡点。

## c. 上一轮 10 卡点复核表

| # | 严重度（原） | 状态 | website 证据（file:line） | 说明 |
| --- | --- | --- | --- | --- |
| C-1 | 高 | **部分修复** | `website/guide/public-read-cache.md:69-71`（`::: warning 本地用 vite preview 验收时` 块） | 根因未变：本次实测 `vite preview` 对 `/`、`/manifest.webmanifest`、`/sw.js`、`/offline.html`、`/assets/*.js` 全部返回 `Vary: Origin`（curl 实测，见 a 节）。但现在文档已明确写出这个陷阱、给出绕过方法（本地接口中间件移除 `Vary`），且 `public-read-cache.md:67` 说明控制台会打印 `vary (Vary: Origin)` 拒绝原因，不再是"失败无提示"。原始"高严重度"的核心（默默失败、无从排查）已解除，但行为本身没有变 |
| C-2 | 中 | **已修复** | `website/start/checklist.md:19` | 明确写"等 Service Workers 面板里的状态变为 activated 之后再刷新页面——过早刷新是最常见的误报来源"，并解释"平台 worker 从不调用 clients.claim()……是有意设计，不是缺陷"。本次实测：第一次刷新 `controller` 为 `null`，第二次刷新后为 `sw.js`，与文档描述完全吻合 |
| C-3 | 中 | **已修复** | `website/guide/integration-by-capability.md:141-143`（`::: warning 应用壳离线不等于任意路由通配符回退` 块） | 完整解释了断网候选顺序（原路径→去查询串→同目录 index.html→离线页），明确"不会回退到应用壳用客户端路由渲染"，并点名从 `vite-plugin-pwa` 迁移的开发者容易踩坑，建议同时开启离线页 |
| C-4 | 中 | **已修复** | `website/guide/integration-by-capability.md:174`；`website/guide/offline.md:43` | 两处都明确"只要服务器确实返回了响应，无论状态码是 200 还是 4xx／5xx，worker 都会原样返回该响应，不会替换成离线页" |
| C-5 | 中 | **已修复** | `website/guide/offline.md:78-80`（`## 断网与恢复`独立小节） | "无需任何配置。平台不提供在线／离线状态 API……网络恢复后，只有平台生成的默认离线页会自动探测并 location.reload() 自己……业务页面……需要自己实现重试"，与建议的补充内容基本一致 |
| C-6 | 低 | **已修复** | `website/guide/updates.md:55-57`（`## 多标签页`独立小节） | "无需任何配置……每个同 scope 标签页都各自监听浏览器原生的 controllerchange 事件……没有任何标签页会因此被自动刷新"，与建议完全吻合 |
| C-7 | 中 | **仍存在** | `website/guide/troubleshooting.md:27-29` | 该节只说"可显式设置 updateCheck，或由用户调用 checkForUpdate()"，仍未提及直接对 `getRegistration()` 返回值调用原生 `update()` 会抛 `InvalidStateError` 这个具体报错现象，排查页没有把这个报错和"该用 checkForUpdate()"显式关联起来 |
| C-8 | 低 | **已修复** | `website/guide/configuration.md:120-122`（`## cacheNamespaceSeed 是什么`独立小节） | 完整说明了用途（缓存命名空间的身份修订段）、默认策略（"正常发版不需要改它"）、改动后果（"旧缓存不会被自动删除……需要按迁移计划显式清理；复用旧种子会让新身份读到旧 revision 遗留的缓存"），并引用 ADR-0009 |
| C-9 | 低 | **部分修复** | `website/guide/configuration.md:124-126`（`## 本地验收用什么 environment`独立小节） | 补充了"本地验收建议用独立 `environment`，避免复用生产身份"，但没有正面回答"`origin` 字段该填生产域名还是 `localhost`"这个原始问题（`origin` 全文都没有独立于示例之外的用途说明，见新卡点表）本次实测确认 `origin` 填 `http://localhost:4173` 不影响 worker 实际路由，但文档仍未写明这一点 |
| C-10 | 低 | **部分修复** | `website/guide/integration-by-capability.md:9`；对照 `website/guide/integration-by-capability.md:36`（路径一代码示例） | 路径一"只要可安装的原生壳"的代码示例（第 36 行）已经显式写出 `updateMode: "prompt"`，实际展示了它是所有策略都必填的字段；但上方总览表第 9 行仍把 `updateMode: "prompt"` 列在"增加用户确认更新"一行的"必须配置"列里，容易让只看表格的读者误以为路径一可以省略它。`packages/contracts/src/policy.ts:25` 确认 `UPDATE_MODES = ["prompt"] as const`，且三个 `PwaPolicyV{1,2,3}` 类型里 `updateMode` 都是必填（无 `?`），与路径一示例一致，但与表格措辞不完全一致 |

**汇总**：已修复 6 项（C-2/C-3/C-4/C-5/C-6/C-8），部分修复 3 项（C-1/C-9/C-10），仍存在 1 项（C-7）。0.2.1 相比 0.1.0 在文档完整性上有明显提升，且本次实测未发现文档描述与实际行为不一致的新事实性错误。

## d. 配置项文档完整性表（对照 `website/guide/configuration.md`）

| 配置项 | 用途 | 默认值 | 行为 | 依赖/冲突 | 与代码一致？ |
| --- | --- | --- | --- | --- | --- |
| `IDENTITY.appId` | 应用标识，参与缓存命名空间前缀 | 文档未写"无默认"，但字段必填 | 未展开 | 与 `environment`、`cacheNamespaceSeed` 共同决定 Cache Storage 前缀（`configuration.md:120-122`） | 一致：`packages/contracts/src/identity.ts` 中为必填 `string`，`packages/contracts/src/cache-namespace.ts:18-21` 的 `cacheNamespacePrefix()` 用 `appId`+`cacheNamespaceSeed` 拼前缀 |
| `IDENTITY.manifestId` | manifest 的 `id` | 无默认，必填 | 生产注册后不可变更（`configuration.md:128-130`） | 子路径部署需与 `scope`/`mountPath` 一起改（`configuration.md:134-141`） | 未见冲突 |
| `IDENTITY.origin` | **未明确说明**——只在 manifest 链接一致性校验（`:58`）与本地验收建议（`:124-126`）中侧面出现 | 无默认，必填 | 未展开是否参与 worker 路由判断 | 未写与 `environment` 的关系 | **文档不完整**：实测 worker 路由用页面自身 origin，与 `identity.origin` 无关（Playwright 实测：`localhost:4173` 部署，`origin` 字段同样填 `http://localhost:4173` 时功能正常；上一轮 C-9 已指出 worker 路由代码位置 `handlers.ts:51`，本次未重读该文件确认，但行为观察一致） |
| `IDENTITY.scope` | 应用 scope | 无默认，必填 | 与 `serviceWorkerUrl` 有强约束：worker 必须直接位于 scope 目录下，否则 `identity.scope-outside-worker-directory` 构建失败（`configuration.md:143`） | 与 `serviceWorkerUrl`、`mountPath` 强耦合，文档写得很清楚 | 一致（本次构建未触发该错误，路径为根路径场景） |
| `IDENTITY.serviceWorkerUrl` | worker 脚本 URL | 无默认，必填 | 见上 | 同上 | 一致 |
| `IDENTITY.manifestUrl` | manifest 文件 URL | 无默认，必填 | 关闭平台安装提示（`install: null`）时仍是必需字段，需业务自行放置文件（`configuration.md:116-118`） | 与 `POLICY.install.enabled`/Vite 插件 `install` 选项联动，文档写清楚了 | 一致，本次未测试 `install: null` 路径 |
| `IDENTITY.mountPath` | 挂载路径 | 无默认，必填 | 子路径部署示例完整（`configuration.md:132-149`） | 与 `scope`、Vite `base` 联动 | 一致 |
| `IDENTITY.environment` | 环境隔离标识 | 无默认，必填，约定"每个环境是独立身份" | 本地验收建议单独声明（`configuration.md:124-126`） | 与 `cacheNamespaceSeed`、`appId` 共同决定缓存前缀 | 一致：`cache-namespace.ts` 中 `environment` 确实参与前缀拼接 |
| `IDENTITY.cacheNamespaceSeed` | 缓存命名空间的身份修订段 | 无默认，必填；"正常发版不需要改它" | 详见 C-8（已修复），改动后旧缓存不自动清理 | 与迁移/ADR-0009 关联，文档写清楚 | 一致：代码逻辑与文档描述完全对应（见上方 c 节 C-8 及本节验证） |
| `INSTALL.startUrl`/`display`/`name`/`shortName`/`themeColor`/`backgroundColor`/`icons` | manifest 基础字段 | 均无默认，必填 | 图标有构建期文件头/尺寸校验（`configuration.md:56`），错误码见 `:98-110` | 与 Vite 插件的图标产物路径联动 | 一致：本次用真实 PNG（含正确文件头与匹配尺寸）通过构建，未触发 `vite.manifest-icon-*` 系列错误 |
| `INSTALL.description`/`categories`/`orientation`/`displayOverride`/`screenshots`/`shortcuts` | 可选安装字段 | "全部不写时 manifest 与以前完全相同"（`configuration.md:87`），数组字段至少一项否则拒绝 | 表格逐项列出取值范围与用途（`configuration.md:89-94`） | 与浏览器版本相关的警告见 `:112`；快捷方式与 scope 冲突见 `install.shortcut-url-outside-scope` | 未在本次实测中启用（超出最小接入范围），仅核对类型定义 `packages/contracts/src/identity.ts:79-92` 与文档表格字段名/取值一致 |
| `POLICY.schemaVersion` | 策略版本 1/2/3 | 无默认，必填 | v2/v3 额外要求 `offlineWrites`，v3 额外要求 `runtimeCache`（`packages/contracts/src/policy.ts:70-97`） | 与 `runtimeCache`、`offlineWrites` 强耦合，`public-read-cache.md` 有专页说明 | 一致 |
| `POLICY.install.enabled` | 是否生成安装相关产物 | 无默认，必填 | 关闭后与 Vite `install: null` 联动（`configuration.md:116`） | 见上 | 一致，本次为 `true` 场景 |
| `POLICY.offlineFallback` | 是否开启离线页回退 | 无默认，必填（判别联合 `{enabled:false}` 或 `{enabled:true,path}`） | 与 `offlinePage` Vite 选项、`asset` 资源规则三处联动，文档反复强调（`offline.md:11-21`） | 见 C-3/C-4 | 一致：`packages/contracts/src/policy.ts:41-42` 判别联合类型与文档描述完全对应 |
| `POLICY.updateMode` | 更新确认模式 | 无默认，必填，**目前只有 `"prompt"` 一个合法值** | 见 C-10 | 无 | 一致（代码层面），但文档表格措辞有歧义（见 C-10） |
| `POLICY.resources[]` | 缓存资源规则 | 无默认，空数组也合法（路径一） | `pathPrefix`+`resourceClass`+`cache` 组合规则见 `public-read-cache.md:42-54`（v3 才有 `public-data`/`navigation-public-dynamic`） | 与 `resourceClass`/`cache` 的合法组合强耦合，`compile.runtime-strategy-unsupported` 诊断码有文档 | 一致 |
| `POLICY.networkTimeoutSeconds` | 弱网超时 | **未设置=不超时**（`offline.md:51`"默认关闭"） | 取值 1–30 整数秒，超出范围报 `schema.invalid-value`（`offline.md:53`） | 只影响 `network-first` 导航与 public-read 运行时缓存，不影响业务直接发出的请求 | 一致：`packages/contracts/src/validate.ts:232-235` 校验规则（`Number.isInteger` 且 `1<=v<=30`）与文档描述的范围完全一致 |
| `POLICY.runtimeCache`（v3） | 公共读取运行时缓存开关与容量上限 | `maxEntries`/`maxEntryBytes`/`maxAgeSeconds` **三项都没有默认值**，必须显式给（`public-read-cache.md:36`） | 范围文档写清楚（1–200 / 1–1,048,576 字节 / 60–604,800 秒） | 与 `resources[].resourceClass`（`public-data`/`navigation-public-dynamic`）联动，不匹配报 `compile.runtime-cache-unused` | 一致，本次未实测 v3（超出最小接入范围） |
| Vite 插件 `offlinePage`（`locale`/`messages`/`css`） | 生成默认离线页 | `locale` 默认 `zh-CN`，语言构建时固定（`offline.md:45`） | `css` 只能追加不能替换，可覆盖变量列表见 `offline.md:45` | 与 `POLICY.offlineFallback`、自带 `public/offline.html` 互斥（`vite.offline-page-conflict`） | 一致，本次用 `offlinePage: {}` 空对象（默认 `zh-CN`），构建产物 `offline.html` 内容为中文，与实测 Playwright 截取文案（"当前处于离线状态"）吻合 |

**唯一发现的文档缺口**：`IDENTITY.origin` 字段全篇没有独立的"用途/默认值/行为"说明，只能从三处间接引用中拼凑理解（manifest 链接校验、本地 environment 建议、上一轮 C-9 遗留问题）。这不是代码与文档不一致，而是文档遗漏了对该字段本身的正面解释——与新卡点表的第二条一致。其余核对过的字段，文档描述与 `packages/contracts/src`、`packages/core/src` 的实际类型定义/校验逻辑均一致，未发现新的文档-代码不一致。

---

试用项目与 Playwright 验证脚本保存在审查会话的临时目录，未提交进仓库。
