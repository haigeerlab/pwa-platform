<!-- BEGIN:spec-guard-codex-convention -->
## Spec Guard 项目约定

> 由 `setup-convention local --host=codex` 生成。

- 能力图：`spec/CAPABILITY-MAP.md`；模块 spec：`spec/<module-id>.md`
- 每个模块隔离使用 `tasks/<module-id>/plan.md` 和 `tasks/<module-id>/todo.md`
- 活跃模块在 `.agent/state.json` 的 `activeModule`；不要共用 `tasks/plan.md`
- 阶段交接或停止时，加载 `spec-guard:spec-guard-ops` 的共享检查点规则，预告已授权下一步。
<!-- END:spec-guard-codex-convention -->

## 项目规则

编辑代码前，阅读 `CLAUDE.md`、`docs/architecture/overview.md`、当前模块 Spec 及其计划。`PwaIdentity`、缓存准入、Service Worker scope 和公开契约均属于安全敏感面；相关变更必须遵循适用 ADR 与验收矩阵。

代码变更在推送 Ready PR 或触发完整合并门禁 CI 前，完成覆盖当前差异的代码自审；之后为修复 CI 追加提交时，在推送前复审受影响的差异。交付时报告审查结论、验证结果和未验证项。完整 CI 通过后核对最终提交与已审范围一致，直接报告可合并状态，不把常规代码评审作为新增的后续阶段。合并后发现的问题按新的修复处理。
