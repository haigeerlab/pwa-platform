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
