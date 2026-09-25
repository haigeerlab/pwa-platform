# 验证记录：release-gate-contract

## 范围

本模块只为 `@pwa-platform/build-verifier` 增加 `verifyReleaseGateCoverage`：它确认
调用方显式声明的必需检查名是否都出现在 `PwaVerificationReport.checks` 中。实现是零依赖
纯函数，不访问网络、文件、部署环境或发布历史；它不重新执行检查，也不把覆盖完整当作发布
通过。架构决定见 [ADR-0025](../../docs/adr/0025-release-gate-completeness-and-external-orchestration.md)。

## 本地证据

- T1 先以缺失入口的测试获得有效 RED，再实现公开函数；实现后覆盖测试 3/3 通过。
- T2 的 RED 证明伪造的未知报告检查名会被错误接受；实现将必需集与报告检查名都限制为既有且唯一，随后覆盖测试扩展为 5/5 通过。
- 代码完成后的包级验证：`pnpm --filter @pwa-platform/build-verifier test` 通过（12 个测试文件、127 项测试）；`pnpm --filter @pwa-platform/build-verifier typecheck` 通过；`git diff --check` 通过。
- 当前文档交付已通过 `git diff --check` 与 Spec Guard 的产物核验（2 通过、0 失败；仅报告不会读取的遗留 tracker 状态）。本次只改文档，不重复宣称新的代码执行证据。

## 本地模块质量门禁（2026-09-19）

- 审查相对 `main` 的实现、测试、公开面、ADR、规格与验证记录；检查正确性、可读性、架构边界、安全性与性能后无阻断项。实现保持零依赖、零网络、零写入，时间与空间复杂度均为必需集和报告检查数的线性和。
- 审查发现规格所称“真实 `verifyRelease` 报告”的证据原先只手工构造报告，已改为由 `verifyRelease({ plan, published: [], baseline })` 生成失败报告，再证明覆盖完整仍独立于 `report.ok`。该聚焦测试通过（5 项）。
- 包级 `pnpm --filter @pwa-platform/build-verifier test` 通过（12 个测试文件、127 项测试），`pnpm --filter @pwa-platform/build-verifier typecheck` 通过。
- 全工作区 `pnpm lint`、`pnpm build`、`pnpm test`、`pnpm typecheck` 全部通过；提交前 `git diff --check` 通过。

## 未取得的证据与状态

- GitHub 当前不可用；未取得此模块的远端 CI 实跑证据。
- 该函数没有浏览器行为，浏览器矩阵不适用；它也不执行外部发布编排或部署，因此没有生产门禁、部署或保留历史证据。
- Spec Guard 的 `documentation_impact` 与 `documentation_verification` 在本仓库当前无法解析既有基线：工具要求英文 `Concern | Authority | Status | Rationale` 表头及每个模块的影响表，而既有中文基线和模块规格均未采用该 schema。为避免把一次模块文档同步扩大为全仓基线迁移，本次记录该工具限制，不宣称其通过。
- 因此 [文档基线](../../docs/DOCUMENTATION-BASELINE.md)中的 `release-gate-contract` 保持 `target`。本地通过只证明函数契约及类型，不证明发布流程已具备完整质量门禁。
