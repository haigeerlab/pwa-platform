// The fixed command set ADR-0031 requires, in run order. This is the single place that spells the exact commands
// out, so the CI-parity test (test/gate-commands.test.ts) has one list to diff against .github/workflows/ci.yml
// and nothing else in the package needs to repeat the strings.
export type PwaGateCommand = {
  readonly command: string;
  /** Only the dependency audit is non-blocking (ADR-0031): its exit code is recorded but never fails the gate. */
  readonly blocking: boolean;
};

export const GATE_COMMANDS: readonly PwaGateCommand[] = [
  { command: "pnpm install --frozen-lockfile", blocking: true },
  { command: "pnpm lint", blocking: true },
  { command: "pnpm build", blocking: true },
  { command: "pnpm test", blocking: true },
  { command: "pnpm typecheck", blocking: true },
  { command: "pnpm test:browser", blocking: true },
  { command: "pnpm audit --ignore-registry-errors", blocking: false },
];
