# 验证记录：production-readiness-documentation

本记录随实施阶段递增。日期：2026-09-27。

## 阶段二：首页与能力对比

- `pnpm docs:build`：通过；VitePress 2.0.0-alpha.20、Vite 8.3.0，客户端／服务端 bundle 与页面渲染完成。
- `git diff --check`：通过。
- 首页已覆盖安装、Vue／React、两步更新、离线冷启动、离线页自动恢复、公共读取缓存、缓存拒绝、恢复 worker、入口恢复、中英文和主题；PC 与手机使用 E4／E3／未验证的不同状态。
- 应用对比核查了 Elk、Home Assistant frontend、Proton WebClients、Mastodon、Excalidraw、Squoosh、Pinafore、Immich 与 tldraw 的官方仓库固定提交。每个项目在详情页给出提交和源文件链接；无法确认的格子保留“未确认”。
- 1280×900 Chrome：首页 `documentElement.clientWidth=1280`、`scrollWidth=1280`；五张表的 client width 均为 1152，最宽表内容 1291，只在表内滚动。
- 375×812 Chrome：首页 `documentElement.clientWidth=375`、`scrollWidth=375`；五张表的 client width 均为 327，内容宽度 354–1407，只在表内滚动。应用对比详情页和跨平台证据页同样保持文档宽度 375，表格 `overflow-x:auto`。
- 无站点脚本错误或警告。测试浏览器扩展自身产生 `MaxListenersExceededWarning` 与 `ObjectMultiplex` 告警，来源为扩展 URL，不归因于文档站。
- 视觉抽查：首页 375px 下标题、图例和测试矩阵可读；表格首列与状态列按预期显示，剩余列可横向滑动。

## 阶段三：十个正式包 README

- 十个 npm 0.1.0 正式包均补齐 README：contracts、core、engine-workbox、build-verifier、sw-runtime、
  client-runtime、vite、entry-resilience、vue、react。
- 每份 README 都说明用途、直接受众、公开入口或 API、最小用法、非目标与安全／生命周期边界；业务入口
  包给出可复制示例，底层包明确普通业务不应直接依赖的原因。
- 逐项对照十个 `package.json` exports、源码公开类型和现有消费测试；未把工作区私有的 Push／离线写
  包写成 0.1.0 公开接入面。
- `pnpm build`：通过，16 个工作区项目构建完成。
- `pnpm typecheck`：通过，16 个工作区项目及 examples-browser-e2e 全部完成类型检查。
- `pnpm check:publish`：通过，输出 `Publish candidate metadata and built exports verified: 10 packages`。
- Vite 5.0.0 独立 tarball 消费：TypeScript 5.2.2 检查、生产构建和开发模式
  `virtual:pwa-config` 加载均通过。
- Vue 3.4.0 + Vite 5.0.0 独立 tarball 消费：类型检查与生产构建通过，CSS 产物随构建输出。
- React 19.3.0 + Vite 8.3.0 独立 tarball 消费：Provider、hook、可选 UI 和 CSS 的类型检查与生产构建通过。

## 阶段四：按功能接入指南

- 新增 `website/guide/integration-by-capability.md`，按六条开发者目标组织：原生壳无缓存、用户确认更新、
  应用壳离线、离线页与弱网回退、公共读取缓存、恢复 worker 与入口恢复。
- 明确空 `resources` 不产生业务资源缓存，也不会可靠地把普通业务发版转化为 worker 更新提示；更新路径
  必须把应用壳纳入预缓存。
- 多语言与主题表区分三个独立界面：更新提示支持运行时 messages，离线页和入口恢复页的语言在构建时
  固定；manifest theme color 不是运行时主题开关。
- 恢复章节明确恢复 worker 是原 worker URL 上的事故清理产物，入口恢复是业务供给清单、用户确认后
  跨 Origin 跳转；平台不认证清单来源，也不搬移登录状态。
- 配置参考、包选择、首页、包参考和 VitePress 导航已互链；包参考列出十个 README 的统一阅读大纲。
- `pnpm docs:build`：最终构建通过，VitePress 2.0.0-alpha.20 与 Vite 8.3.0 完成客户端／服务端构建和
  页面渲染。

## 最终质量门禁

- `pnpm test`：默认沙箱第一次仅因测试服务器无法监听 `127.0.0.1` 而失败；在允许回环监听后按相同命令
  重跑通过。16 个工作区项目测试全部通过，包括 examples-browser-e2e 247 项、entry-resilience 274 项、
  vite 226 项、sw-runtime 321 项等；Nuxt 构建夹具保留既有非阻断警告。
- `git diff --check`：通过。
- 本次没有修改运行时代码、公开类型、identity、缓存准入、worker scope 或发布契约；变更集中在规格、
  审核、README、文档站与验证记录。

## 关键指南视觉验证

- 1280×900：`documentElement.clientWidth=1280`、`scrollWidth=1280`；三张表宽度 624，代码块在内容区内，
  无整页横向溢出。
- 375×812：`documentElement.clientWidth=375`、`scrollWidth=375`；表格宽度 327，其中多语言／主题表的
  内容宽度 476，`display:block; overflow-x:auto`，仅表内滚动；11 个代码块均保持局部 `overflow-x:auto`。
- 浏览器控制台没有 warning 或 error。检查中发现 Markdown 表格内的联合符号会截断单元格，已改成
  “light、dark 或 system”并复核该行稳定为三个单元格。

## 仍然成立的限制

- 正式包可用于生产接入不等于移动发布通道通过；Android 只有单机真机证据，iPhone 属渐进兼容，详见
  首页矩阵和生产就绪审核。
- 仍没有完整的性能预算、WCAG／axe 门禁、生产遥测和另一台机器事故恢复证据；这些缺口没有被 README
  或首页文案改写成已通过。
- 首次接入的业务应用仍须验证自身 HTTPS 部署、真实响应头、私有数据分类、旧资源保留、回滚与真机行为。

## Spec Guard

- documentation baseline：`valid`；模块 documentation impact：`valid`。
- documentation verification：`ready`，四个需交付关注点均声明 `delivered`，`attention` 为空。
- `verify-artifacts`：2 通过、0 警告、0 失败。
- `phase-guard`：项目级提示为 `SPECED`，并给出“创建模块计划”的通用下一步。当前模块实际已经有
  `tasks/production-readiness-documentation/plan.md` 和 `todo.md`；该工具不选择活动模块，因此此提示不表示
  本模块缺失计划，也不影响上述模块级 documentation verification 的 `ready` 结果。

## 最终复核

- `pnpm lint`：通过。
- 最后一次 `pnpm docs:build`：通过；在校正根入口、能力规格和离线页旧状态后重新构建成功。
- 最后一次 `git diff --check`：通过。
- 生产就绪结论保持保守：正式包和桌面 Chrome 通道可供采用，Android／iPhone 仍不写成完整生产门禁通过。
- 本模块文档基线已更新为 `verified`；这只代表本次文档交付完成，不提升其他模块的业务发布状态。
