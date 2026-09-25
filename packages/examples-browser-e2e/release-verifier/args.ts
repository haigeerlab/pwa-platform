// Parses the CLI's own argv, separately from the domain checks in run.ts, so the two can be tested independently.
// pnpm forwards a literal `--` when a caller writes `pnpm verify:cloudflare:release -- --target=react`: it is not
// consumed like npm consumes it, so a leading one has to be stripped here rather than assumed away (verified against
// a throwaway pnpm script while writing this tool).

const REQUIRED_FLAGS = ["target", "slot", "history", "out"] as const;
// `pre-deploy` (module spec, "修订：上线前核验" → "上线前核验模式") is optional: its absence means post-deploy mode,
// unchanged from the previous revision. Whether it may be combined with `--slot=drill` is a domain question, not a
// parsing one, so that refusal lives in run.ts alongside the other domain checks, not here.
const FLAGS = [...REQUIRED_FLAGS, "pre-deploy"] as const;
type Flag = (typeof FLAGS)[number];

export type PwaCliArgs = {
  readonly target: string;
  readonly slot: string;
  readonly history: string;
  readonly out: string;
  readonly preDeploy?: string;
};

export type PwaCliArgsResult = { readonly ok: true; readonly value: PwaCliArgs } | { readonly ok: false; readonly reason: string };

/**
 * Accepts only `--flag=value` for the known flags (the same style `scripts/build-cloudflare-site.mjs` and its
 * siblings use), rejects any other flag, and never accepts an origin/URL flag — the registry in targets.ts is the
 * only source of the address this tool observes (the pre-deploy observation address is derived from `--pre-deploy`'s
 * deployment ID via `uniqueDeploymentOrigin`, never accepted as a literal address here).
 */
export function parseCliArgs(argv: readonly string[]): PwaCliArgsResult {
  const rest = argv[0] === "--" ? argv.slice(1) : argv;
  const values = new Map<Flag, string>();

  for (const item of rest) {
    const match = /^--([a-z-]+)=(.*)$/.exec(item);
    const name = match?.[1];
    const value = match?.[2];
    if (!match || name === undefined || value === undefined || value === "" || !isFlag(name)) {
      return { ok: false, reason: `Unsupported argument: ${item}` };
    }
    values.set(name, value);
  }

  const missing = REQUIRED_FLAGS.filter((flag) => !values.has(flag));
  if (missing.length > 0) return { ok: false, reason: `Missing required argument(s): ${missing.map((flag) => `--${flag}`).join(", ")}` };

  const preDeploy = values.get("pre-deploy");
  return {
    ok: true,
    value: {
      target: values.get("target")!,
      slot: values.get("slot")!,
      history: values.get("history")!,
      out: values.get("out")!,
      ...(preDeploy === undefined ? {} : { preDeploy }),
    },
  };
}

function isFlag(value: string): value is Flag {
  return (FLAGS as readonly string[]).includes(value);
}
