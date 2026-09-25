// The recovery page's built-in copy tables and the merge helper that applies a host's `messages` override — see
// spec/pwa-entry-resilience.md's "修订：恢复页的构建期语言与文案覆盖". Locale is fixed at build time (no runtime
// switching); `mergeEntryPageMessages` is the one place a host's partial override is combined with the built-in
// table for the chosen locale, so src/vite/index.ts (the virtual module's config) and src/page/render.ts (the
// `zh-CN` table default-tests pin) both go through the same merge.
export type PwaEntryPageLocale = "zh-CN" | "en";

export type PwaEntryPageMessages = {
  readonly documentTitle: string;
  readonly loading: string;
  readonly empty: string;
  readonly headlineMigrating: string;
  readonly headlineIncident: string;
  readonly headlineUnconfirmedOutage: string;
  /** Must contain the literal sequence `{expiresAt}` exactly once — see src/vite/options.ts's validation. */
  readonly expiry: string;
  /** Must contain the literal sequence `{host}` exactly once — see src/vite/options.ts's validation. */
  readonly go: string;
};

/** Every key `PwaEntryPageMessages` has, in the order spec's contract table lists them — the closed set
 *  src/vite/options.ts checks a host's `messages` override's keys against. */
export const ENTRY_PAGE_MESSAGE_KEYS: readonly (keyof PwaEntryPageMessages)[] = [
  "documentTitle",
  "loading",
  "empty",
  "headlineMigrating",
  "headlineIncident",
  "headlineUnconfirmedOutage",
  "expiry",
  "go",
] as const satisfies readonly (keyof PwaEntryPageMessages)[];

/** Built-in copy per locale — spec's contract table, character for character. The `zh-CN` column is exactly the
 *  strings the page rendered before this revision (test/page/messages.test.ts pins this against the previous
 *  hard-coded literals so it cannot drift). */
export const ENTRY_PAGE_MESSAGES: Readonly<Record<PwaEntryPageLocale, PwaEntryPageMessages>> = {
  "zh-CN": {
    documentTitle: "备用入口",
    loading: "正在检查备用入口…",
    empty: "当前没有可用的备用入口",
    headlineMigrating: "应用正在迁移到新地址",
    headlineIncident: "应用当前的入口出现故障",
    headlineUnconfirmedOutage: "主入口可能暂时无法访问（未经确认）",
    expiry: "此通知有效期至 {expiresAt}",
    go: "前往 {host}",
  },
  en: {
    documentTitle: "Alternative entry",
    loading: "Checking for alternative entries…",
    empty: "No alternative entry is available right now",
    headlineMigrating: "This app is moving to a new address",
    headlineIncident: "This app's usual address is having problems",
    headlineUnconfirmedOutage: "The usual address may be unreachable (unconfirmed)",
    expiry: "This notice is valid until {expiresAt}",
    go: "Go to {host}",
  },
};

/** Combines the built-in table for `locale` with a host's (already validated) partial override, one key at a
 *  time — an override key always wins, an absent one falls back to the built-in copy. */
export function mergeEntryPageMessages(
  locale: PwaEntryPageLocale,
  overrides?: Partial<PwaEntryPageMessages>,
): PwaEntryPageMessages {
  return { ...ENTRY_PAGE_MESSAGES[locale], ...overrides };
}
