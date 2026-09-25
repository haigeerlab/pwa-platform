// The fixed set of Cloudflare test-deployment targets this tool may observe (module spec, "采集输入": "观测地址固定
//为目标登记中该槽位的生产 origin，不接受任意地址"). Mirrors `targets` in scripts/build-cloudflare-site.mjs; a test
// reads that script's source text to keep the two in sync without importing an .mjs script into a .ts module.

export const CLOUDFLARE_TARGETS = ["react", "vue"] as const;

export type PwaCloudflareTarget = (typeof CLOUDFLARE_TARGETS)[number];

export const CLOUDFLARE_SLOTS = ["main", "drill"] as const;

export type PwaCloudflareSlot = (typeof CLOUDFLARE_SLOTS)[number];

/** Pages project name by target, exactly as registered in docs/operations/cloudflare-test-deployment.md. */
const PROJECTS: Readonly<Record<PwaCloudflareTarget, string>> = {
  react: "pwa-platform-react-demo",
  vue: "pwa-platform-vue-demo",
};

export function isCloudflareTarget(value: string): value is PwaCloudflareTarget {
  return (CLOUDFLARE_TARGETS as readonly string[]).includes(value);
}

export function isCloudflareSlot(value: string): value is PwaCloudflareSlot {
  return (CLOUDFLARE_SLOTS as readonly string[]).includes(value);
}

export function projectFor(target: PwaCloudflareTarget): string {
  return PROJECTS[target];
}

/**
 * Whether `project` is one of the registered Cloudflare Pages project names (the values of `PROJECTS`, e.g.
 * `"pwa-platform-react-demo"` — not a target key like `"react"`). Used by `uniqueDeploymentOrigin` so the pre-deploy
 * origin formula can only ever be evaluated against a project this tool actually knows about.
 */
export function isRegisteredProject(project: string): boolean {
  return CLOUDFLARE_TARGETS.some((target) => PROJECTS[target] === project);
}

/**
 * The registered production origin for `target`'s `slot`: `main` is the project's own `pages.dev` domain, `drill`
 * is its `drill` preview alias (see the target registry's "目标登记" table). This is the only origin the tool will
 * ever validate a candidate against or (absent a test-only override) fetch from.
 */
export function registryOrigin(target: PwaCloudflareTarget, slot: PwaCloudflareSlot): string {
  const project = PROJECTS[target];
  return slot === "main" ? `https://${project}.pages.dev` : `https://drill.${project}.pages.dev`;
}
