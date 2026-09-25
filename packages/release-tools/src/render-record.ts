// Renders a filled-in local gate record matching the fields of docs/operations/local-ci-record-template.md.
// Every value comes straight from the caller's inputs — this module does no I/O and makes no judgment of its own
// beyond what `gateVerdict` already decided, so a record can be diffed against the template by a human reviewer.
import { describeGateFailure, type PwaGateVerdict } from "./gate-verdict.js";

export type PwaGateAvailabilityCheck = {
  readonly command: string;
  readonly output: string;
  readonly exitCode: number;
  readonly utc: string;
};

export type PwaGateRecordMeta = {
  readonly recordId: string;
  /** The commit exactly as requested on the command line, before resolution (B1). */
  readonly requestedCommit: string;
  /** The full 40-char SHA the requested commit resolved to; this is what every round actually checked out. */
  readonly resolvedCommit: string;
  readonly requiredMajors: readonly number[];
  readonly substituteReason: string;
  readonly availabilityCheck: PwaGateAvailabilityCheck;
  readonly signer: string;
  readonly operatingSystem: string;
  readonly chrome: string;
  readonly pnpm: string;
  readonly operator: string;
  readonly startUtc: string;
  readonly endUtc: string;
  /** The gate tool's own commit and whether its working tree was dirty when it ran (S8). */
  readonly toolCommit: string;
  readonly toolDirty: boolean;
  /** N1: the tool's build-time commit/dirty snapshot from `dist/build-info.json`, or `null` when that file is
   * missing — which is itself a `tool-stale` verdict failure, not just an absent field. */
  readonly toolBuild: { readonly commit: string; readonly dirty: boolean } | null;
};

export type PwaGateRecordRow = {
  /** Full Node version for display, e.g. "22.14.0" — distinct from the major-only number gateVerdict uses. */
  readonly nodeVersion: string;
  readonly command: string;
  readonly exitCode: number;
  readonly logSha256: string;
  readonly logPath: string;
};

/** One row per round (S8): what was declared vs. observed, independent of the per-command results table. */
export type PwaGateRecordRoundRow = {
  readonly declaredMajor: number;
  readonly observedNodeVersion: string;
  readonly observedCommit: string;
  readonly pnpmVersion: string;
  readonly chrome: string;
  readonly pathHead: string;
  /** The node `node -p process.execPath` resolves to on the round's own PATH (N2) — not necessarily what `pnpm`
   * itself runs under; see `pnpmRuntime` for that. */
  readonly pathNode: string;
  /** The node pnpm's own shebang resolves to, or "native pnpm binary" when pnpm has none (N2). Replaces a probe
   * that used to be mislabeled "pnpm's Node" while actually measuring `pathNode`. */
  readonly pnpmRuntime: string;
  readonly worktreeRemoved: boolean;
};

/**
 * Markdown table cells cannot contain a literal `|` or an embedded newline (which would otherwise break the row
 * out of the table entirely) — `|` is escaped and a newline becomes `<br>` (S8).
 */
function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

/** The longest run of backticks appearing in `content`, or 0 if it contains none. */
function longestBacktickRun(content: string): number {
  const runs = content.match(/`+/g) ?? [];
  return runs.reduce((max, run) => Math.max(max, run.length), 0);
}

/**
 * A fenced block whose fence is one backtick longer than the longest backtick run inside `content` (S8, at
 * least 3 backticks either way) — so a body that itself contains a line of ``` (e.g. captured command output
 * that printed a fenced block) can never prematurely close the record's own fence.
 */
function fencedBlock(content: string): string {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
  return `${fence}\n${content}\n${fence}`;
}

/** Inline code whose backtick delimiter is longer than any backtick run inside `value` (S8). */
function inlineCode(value: string): string {
  const fence = "`".repeat(longestBacktickRun(value) + 1);
  return `${fence}${value}${fence}`;
}

function headerTable(meta: PwaGateRecordMeta): string {
  const rows: readonly (readonly [string, string])[] = [
    ["发布提交", `${meta.resolvedCommit}（请求值：${meta.requestedCommit}）`],
    ["所需 Node 大版本", meta.requiredMajors.join(", ")],
    ["替代原因", meta.substituteReason],
    [
      "可用性检查",
      `${inlineCode(meta.availabilityCheck.command)}（退出码 ${meta.availabilityCheck.exitCode}，UTC ${meta.availabilityCheck.utc}），完整输出见下方`,
    ],
    ["签署人", meta.signer],
    ["操作系统", meta.operatingSystem],
    ["Chrome 桌面端（N）", meta.chrome],
    ["pnpm", meta.pnpm],
    ["执行者", meta.operator],
    ["开始 / 结束（UTC）", `${meta.startUtc} / ${meta.endUtc}`],
    ["门禁工具自身提交", `${meta.toolCommit}${meta.toolDirty ? "（工作区有未提交改动）" : ""}`],
    [
      "门禁工具构建快照（dist/build-info.json）",
      meta.toolBuild === null ? "缺失（tool-stale）" : `${meta.toolBuild.commit}${meta.toolBuild.dirty ? "（构建时工作区有未提交改动）" : ""}`,
    ],
  ];
  return ["| 字段 | 值 |", "| --- | --- |", ...rows.map(([field, value]) => `| ${cell(field)} | ${cell(value)} |`)].join("\n");
}

function resultsTable(rows: readonly PwaGateRecordRow[]): string {
  const lines = rows.map((row) => `| ${cell(row.nodeVersion)} | ${inlineCode(row.command)} | ${row.exitCode} | ${cell(row.logSha256)} | ${cell(row.logPath)} |`);
  return ["| Node | 命令 | 退出码 | 日志 SHA-256 | 日志位置 |", "| --- | --- | --- | --- | --- |", ...lines].join("\n");
}

/** Node declared/observed, observed commit, pnpm, Chrome, PATH head, the node on PATH and pnpm's own runtime, one
 * row per round (S8, N2). `pathNode` and `pnpmRuntime` are deliberately separate columns: the former is whatever
 * `node` resolves to on the round's own PATH, the latter is what `pnpm` itself actually runs under — they can
 * differ, which is exactly the bug N2 fixes a mislabeled probe for. */
function roundsTable(rows: readonly PwaGateRecordRoundRow[]): string {
  const lines = rows.map(
    (row) =>
      `| ${row.declaredMajor} | ${cell(row.observedNodeVersion)} | ${cell(row.observedCommit)} | ${cell(row.pnpmVersion)} | ${cell(row.chrome)} | ${cell(row.pathHead)} | ${cell(row.pathNode)} | ${cell(row.pnpmRuntime)} | ${row.worktreeRemoved ? "是" : "否"} |`,
  );
  return [
    "| Node（声明） | Node（观测） | 观测提交 | pnpm | Chrome | PATH 首项 | PATH 上的 node | pnpm 的运行时 | worktree 已移除 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...lines,
  ].join("\n");
}

function failuresSection(verdict: PwaGateVerdict): string {
  if (verdict.failures.length === 0) return "无。";
  return verdict.failures.map((failure) => `- ${describeGateFailure(failure)}`).join("\n");
}

function conclusionTable(verdict: PwaGateVerdict): string {
  const rows: readonly (readonly [string, string])[] = [
    ["结论", verdict.pass ? "通过" : "未通过"],
    ["证据形式", "本地替代（ADR-0031），不是 CI 运行"],
    ["GitHub 恢复后的补跑", "未到期"],
  ];
  return ["| 检查 | 结论 |", "| --- | --- |", ...rows.map(([check, value]) => `| ${cell(check)} | ${cell(value)} |`)].join("\n");
}

export function renderRecord(
  meta: PwaGateRecordMeta,
  rows: readonly PwaGateRecordRow[],
  roundRows: readonly PwaGateRecordRoundRow[],
  verdict: PwaGateVerdict,
): string {
  return [
    `# 本地门禁记录：${meta.recordId}`,
    "",
    headerTable(meta),
    "",
    "可用性检查输出：",
    "",
    fencedBlock(meta.availabilityCheck.output),
    "",
    "## 按轮次执行环境",
    "",
    roundsTable(roundRows),
    "",
    "## 执行结果",
    "",
    resultsTable(rows),
    "",
    "## 失败项",
    "",
    failuresSection(verdict),
    "",
    "## 结论",
    "",
    conclusionTable(verdict),
  ].join("\n");
}
