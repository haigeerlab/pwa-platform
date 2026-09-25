# 实现计划：release-gate-contract

## 概览

在 `@pwa-platform/build-verifier` 增加一个纯函数，确认 `verifyRelease` 报告中实际出现了发布方声明的必需检查。它不重新执行检查、不访问部署环境，也不把覆盖完整等同于检查通过。决定见 [ADR-0025](../../docs/adr/0025-release-gate-completeness-and-external-orchestration.md)。

## 任务 1：覆盖结果契约与实现

**文件：**

- `packages/build-verifier/src/release-gate.ts`（新增）
- `packages/build-verifier/src/index.ts`

**实现：**

- 导出 `PwaReleaseGateCoverage`，字段固定为 `ok` 与 `missing`；`missing` 按调用方声明的 `required` 顺序列出。
- 导出 `verifyReleaseGateCoverage(report, required)`；只检查 `report.checks` 的名称是否覆盖 `required`。
- `required` 为空合法；重复名称或不在 `VERIFICATION_CHECKS` 中的名称抛出不回显宿主内容的 `TypeError`。
- 不修改 `verifyRelease`、`PwaVerifyReleaseInput` 或现有诊断码。

**验收：** 空报告不能满足非空必需集；覆盖结果不因任一已执行检查失败而被误判为通过。

## 任务 2：契约测试与公开面守卫

**文件：**

- `packages/build-verifier/test/release-gate.test.ts`（新增）
- `packages/build-verifier/test/public-exports.test.ts`
- `packages/build-verifier/test/import-safety.test.ts`（仅在新源文件需要守卫条目时）

**测试：** 全覆盖、单项/多项遗漏、额外检查、空必需集、空报告、重复和未知必需名称，以及“覆盖完整但 `report.ok` 为 false”的组合。

**验收：** 新函数有明确的正反例；入口导出与零 Node 内建模块依赖守卫通过。

## 任务 3：规格与交付核验

**文件：**

- `spec/build-verifier.md`
- `docs/architecture/package-boundaries.md`
- `docs/DOCUMENTATION-BASELINE.md`
- `tasks/release-gate-contract/verification.md`

**验收：** 文档明确“完整性”与“通过”是两个结论；文档基线保持 `target` 直到质量门禁的真实证据取得。

## 验证顺序

1. `pnpm --filter @pwa-platform/build-verifier test`
2. `pnpm --filter @pwa-platform/build-verifier typecheck`
3. `pnpm lint`
4. `pnpm build`
5. `pnpm test`
6. `pnpm typecheck`

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 调用方把覆盖完整当作报告通过 | 测试专门钉住 `coverage.ok === true` 与 `report.ok === false` 可同时成立；文档重复说明二者必须合取。 |
| 新函数悄悄演化出部署策略 | 只接受检查名列表，不读取 identity、拓扑或环境；具体集合留给发布协议。 |

## Task List

- [x] T1 覆盖结果契约与实现
- [x] T2 契约测试与公开面守卫（依赖 T1）
- [x] T3 规格、验证记录与文档基线（依赖 T2）
