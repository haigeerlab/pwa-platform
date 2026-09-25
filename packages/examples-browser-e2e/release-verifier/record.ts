// Renders the "机器检查" fields of docs/operations/release-record-template.md as a standalone Markdown fragment
// (module spec, "输出与入口"). Pure formatting over already-computed results; every interpolated value that did not
// originate in this tool's own code (deployment IDs, diagnostic paths) is escaped so it cannot break the table or
// heading structure it is placed into.
import type { PwaVerificationReport } from "@pwa-platform/build-verifier";
import type { PwaAssembleReleaseInputResult } from "./assemble.ts";
import type { PwaReleaseVerdict } from "./verdict.ts";

export type PwaRenderRecordArgs = {
  readonly target: string;
  readonly slot: string;
  readonly asOfMs: number;
  readonly requiredChecks: PwaAssembleReleaseInputResult["requiredChecks"];
  readonly report: PwaVerificationReport;
  readonly verdict: PwaReleaseVerdict;
  /**
   * Present only in pre-deploy mode (module spec, "修订：上线前核验": 记录片段注明"上线前核验：观测对象为预览部署").
   * When omitted, the fragment keeps its original post-deploy note line unchanged.
   */
  readonly preDeploy?: { readonly deploymentId: string; readonly origin: string };
};

export function renderRecord(args: PwaRenderRecordArgs): string {
  const performedChecks = args.report.checks.map((entry) => entry.name);
  const modeNote =
    args.preDeploy === undefined
      ? "上线后核验：仅用于演练。"
      : `上线前核验：观测对象为预览部署 \`${escape(args.preDeploy.deploymentId)}\`（\`${escape(args.preDeploy.origin)}\`）。`;
  const diagnosticLines =
    args.report.diagnostics.length === 0
      ? "（无）"
      : args.report.diagnostics.map((entry) => `- \`${escape(entry.code)}\` at \`${escape(entry.path)}\``).join("\n");
  const missingPlanLines =
    args.verdict.missingPlanDeploymentIds.length === 0
      ? "无"
      : args.verdict.missingPlanDeploymentIds.map((id) => `\`${escape(id)}\``).join(", ");
  const inconsistencyLines =
    args.verdict.historyInconsistencies.length === 0
      ? "无"
      : args.verdict.historyInconsistencies.map((entry) => `\`${escape(entry.deploymentId)}\`：${escape(entry.reason)}`).join("; ");

  return `# 机器发布门禁：${escape(args.target)}/${escape(args.slot)}

${modeNote}

## 已采集机器事实

- 评估时刻（UTC epoch milliseconds）：${args.asOfMs}
- requiredChecks：${args.requiredChecks.map((name) => `\`${name}\``).join(", ")}

## 机器门禁

| 项 | 结果 |
|---|---|
| \`verifyRelease\` 已执行的 checks | ${performedChecks.length === 0 ? "（无）" : performedChecks.map((name) => `\`${name}\``).join(", ")} |
| \`report.ok\` | ${args.verdict.reportOk} |
| \`verifyReleaseGateCoverage\` ok | ${args.verdict.coverageOk} |
| \`verifyReleaseGateCoverage\` missing | ${args.verdict.coverageMissing.length === 0 ? "（无）" : args.verdict.coverageMissing.map((name) => `\`${name}\``).join(", ")} |
| 历史完整性 | ${args.verdict.historyComplete} |
| 缺计划的历史部署 ID | ${missingPlanLines} |
| 无法排序的历史条目 | ${inconsistencyLines} |
| 综合结论 \`pass\` | ${args.verdict.pass} |

## 诊断

${diagnosticLines}
`;
}

/** Escapes a value so it cannot break a Markdown table cell or heading: pipes, and newlines collapsed to spaces. */
function escape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
}
