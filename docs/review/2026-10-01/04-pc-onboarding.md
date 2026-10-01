# 04 · PC Web 首次接入体验审查

## 路径与实测边界

从 [README](../../../README.md) → [选择接入包](../../../website/start/choose.md) → [Vue](../../../website/start/vue.md)／[React](../../../website/start/react.md) → [字段参考](../../../website/guide/configuration.md) → [按功能接入](../../../website/guide/integration-by-capability.md) → [服务器/CDN](../../../website/operations/hosting.md) → [上线前检查](../../../website/start/checklist.md)重走文档。以 Vue/React + Vite 5/8 桌面 Web 为目标，先做安装、应用壳、离线页与用户确认更新。`0.2.5` 发布后的公开 registry 新建 Vue 3.4/Vite 5 与 React 19/Vite 5 消费项目：类型检查、构建、manifest 唯一性和四个产物已在[发布记录“读回”](../../../tasks/package-distribution/release-0.2.5.md#读回)逐项通过；**该读回没有浏览器预览**。本轮从当前工作区打包的接入冒烟在 Chrome 154 下 4/4 通过，覆盖 manifest 链接、注册/scope、重载受控、离线壳/离线页及 AI 清单不进产物；它的包字节不等于 registry 0.2.5，也不能代替任意业务项目接入验收。

| 环节 | 当前判断 | 具体证据/卡点 |
| --- | --- | --- |
| 入口与包选择 | 可找到 | README、选择页明确 Vite Vue/React、Nuxt 私有、Next/Start 未覆盖；固定 `0.2.5` 同版本安装 |
| 初始化与身份 | 可执行但认知负担高 | 九字段首次生产注册后冻结；子路径、预览身份需分别处理。字段表给用途/规则/默认/诊断；必须先知道最终真实 Origin、scope、图标 |
| 最小安装路径 | 文档给完整配置 | [按功能接入“路径一”](../../../website/guide/integration-by-capability.md#路径一只要可安装的原生壳不启用缓存)给空 `resources`；不会承诺离线或业务更新提示 |
| 应用壳、离线页 | 可执行，语义需细读 | 路径三/四明确导航规则、预缓存资产、离线页文件三者关系；未受控首访和 SPA 深链不通配已说明 |
| UI/默认值 | 已有字段和场景说明 | 默认提示必须主动挂载；`updateCheck` 默认关；离线/恢复页语言构建期固定，提示运行时切换 |
| 开发/构建/部署 | 步骤完整 | `vite dev` 不生成 worker；预览身份、`dist-preview`、真实 HTTPS 重新构建和 CDN 头逐项说明 |
| 故障排查 | 有诊断索引 | [诊断码索引](../../../website/reference/diagnostics.md)和[常见问题](../../../website/guide/troubleshooting.md)覆盖常见构建/注册问题；实际业务响应仍需宿主取证 |

## 接入卡点与当前状态

| ID/严重度 | 触发步骤与可复现表现 | 原因和修正建议 |
| --- | --- | --- |
| O1 / P2 基线发现，已修复 | 原[可移植部署](../../../website/guide/portable-deployment.md)示例启用离线页但缺公共导航规则，断网访问未缓存导航会透传 | 当前示例已补 `{pathPrefix:"/",resourceClass:"navigation-public-static",cache:"network-first"}`；[组合 E2E](../../../packages/vite/browser-tests/portable-deployment.spec.ts)以根路径、`install:null`、宿主 manifest、生成离线页验证离线回退。A6 双真实 HTTPS 验证的是另一份 `/app/` 夹具，尚未把该根路径组合原样部署 |
| O2 / P2 基线发现，已修复 | 原页面给出 `deployment:{kind:"portable"}`，却没明确公开 0.2.5 尚无此 API | [页面](../../../website/guide/portable-deployment.md)、[字段入口](../../../website/guide/configuration.md)和[发布入口](../../../website/operations/release.md)现均注明 0.2.5 不支持、首个支持版本待发布；CI 核对公开包声明。正式发布后仍须填写实际版本 |
| O3 / P2 | 业务把 `vite preview` 构建成功当作已接入 | 发布读回只核到构建；浏览器仍需验证首次控制、冷启动、更新/恢复；[Vue 的五项本机验收标准](../../../website/start/vue.md#本机验收通过的标准)已写，但接入完成口径应一直链接它，避免构建通过即结案 |
| O4 / P3 | Vue 3.4 微前端反复挂载/卸载 | [Vue 接入](../../../website/start/vue.md)已警告 facade 不释放；若目标是此形态，需要升级 Vue 3.5+ 或应用级复用，不属于一般单次挂载路径 |
| O5 / P3 | 第一次照“恢复”接入，误把恢复 worker 当成自动访问旧源不可达时的恢复页 | [按功能接入](../../../website/guide/integration-by-capability.md#路径六配置两种恢复能力)已分清；建议在入口表增加“部署时机/对网络的前提”两列 |

## 配置依赖/冲突速查

- `install.enabled:true` 要有 `install` 元数据与真实图标；关掉平台安装元数据也须提供身份指向的 manifest 文件。[配置指南](../../../website/guide/configuration.md)。
- `offlineFallback.enabled:true` 要有已构建且未被拒绝的离线页；**请求进入 worker 的导航分支还需要相应导航规则**，否则页面虽然存在却不可达。
- 业务公共缓存须 v3、`offlineWrites` 全零禁用对象、`runtimeCache.enabled:true`、公共路径与限额；响应的 `private`/`no-store`/`Vary: Cookie`/错误 MIME 会拒绝写缓存。[公共读取文档](../../../website/guide/public-read-cache.md)。
- `updateMode:"prompt"` 是必填唯一模式，不等于默认可见提示；还需壳变化、worker 检查、UI 或自绘事件处理。[更新文档](../../../website/guide/updates.md)。
- 预览 Origin/端口必须与身份相同；`vite dev` 不测试 SW；生产还须实际 HTTP 头与旧资源留存。

## 接入判断

固定 Origin 的标准 Vue/React PC 接入路径可从现有文档完成构建，并有公开包读回支撑。O1/O2 已在本地文档和组合浏览器测试中修复；浏览器、真实 HTTPS 和业务 API 缓存安全性仍必须在接入仓库独立验收，平台示例测试不能代替它们。

**证据边界**：O1 的本地组合用例验证了测试夹具中与文档一致的配置，并未直接运行 Markdown 代码块；O2 的 CI 检查核对发布包类型声明和网站版本文字，不证明新 API 的运行行为。当前处理见[建议记录](07-recommendations.md#本轮后续处理2026-10-01-本地复核)。
