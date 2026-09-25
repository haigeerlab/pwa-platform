// Every log's fixed six-line header (ADR-0031): binding the log to the commit and environment it ran under is
// what lets a log's SHA-256 be trusted as evidence, so the format is a single pure function both the executor
// (task G3) and its tests share.
export type PwaGateLogHeaderFields = {
  readonly commit: string;
  readonly node: string;
  readonly pnpm: string;
  readonly utc: string;
  readonly chrome: string;
  readonly command: string;
};

const FIELD_ORDER: readonly (readonly [keyof PwaGateLogHeaderFields, string])[] = [
  ["commit", "commit"],
  ["node", "node"],
  ["pnpm", "pnpm"],
  ["utc", "utc"],
  ["chrome", "chrome"],
  ["command", "command"],
];

export function logHeader(fields: PwaGateLogHeaderFields): string {
  for (const [key, label] of FIELD_ORDER) {
    if (fields[key].includes("\n")) {
      throw new TypeError(`Log header field "${label}" must not contain a newline`);
    }
  }

  return FIELD_ORDER.map(([key, label]) => `# ${label} ${fields[key]}\n`).join("");
}
