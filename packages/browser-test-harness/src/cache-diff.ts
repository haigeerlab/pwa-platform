/** Cache names of one origin mapped to their entry counts; response bodies are never read. */
export type CacheSnapshot = ReadonlyMap<string, number>;

export type CacheCountChange = { readonly name: string; readonly before: number; readonly after: number };

export type CacheDiff = {
  readonly deleted: readonly string[];
  readonly added: readonly string[];
  /** Caches present in both snapshots whose entry count changed. */
  readonly changed: readonly CacheCountChange[];
};

const byName = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export function diffCacheSnapshots(before: CacheSnapshot, after: CacheSnapshot): CacheDiff {
  const deleted = [...before.keys()].filter((name) => !after.has(name)).sort(byName);
  const added = [...after.keys()].filter((name) => !before.has(name)).sort(byName);
  const changed = [...before]
    .flatMap(([name, count]) => {
      const next = after.get(name);
      return next !== undefined && next !== count ? [{ name, before: count, after: next }] : [];
    })
    .sort((left, right) => byName(left.name, right.name));
  return { deleted, added, changed };
}

/**
 * Asserts that the deleted caches are exactly the caches whose names start with `prefix` (for example a
 * contracts `appCachePrefix`), and that every other cache kept its name and entry count with none added.
 * This matches the recovery drill's step 3, where nothing may be created; a cleanup that also repopulates
 * caches (such as a new worker precaching) needs its additions checked separately.
 */
export function expectDeletedExactlyUnderPrefix(before: CacheSnapshot, after: CacheSnapshot, prefix: string): void {
  if (prefix === "") throw new Error("expectDeletedExactlyUnderPrefix requires a non-empty prefix");
  const diff = diffCacheSnapshots(before, after);
  const expected = [...before.keys()].filter((name) => name.startsWith(prefix)).sort(byName);
  const problems: string[] = [];
  const notDeleted = expected.filter((name) => !diff.deleted.includes(name));
  const outside = diff.deleted.filter((name) => !expected.includes(name));
  if (notDeleted.length > 0) problems.push(`not deleted: ${notDeleted.join(", ")}`);
  if (outside.length > 0) problems.push(`deleted outside the prefix: ${outside.join(", ")}`);
  if (diff.added.length > 0) problems.push(`added: ${diff.added.join(", ")}`);
  if (diff.changed.length > 0) {
    problems.push(
      `entry counts changed: ${diff.changed.map(({ name, before: from, after: to }) => `${name} ${from}→${to}`).join(", ")}`,
    );
  }
  if (problems.length > 0) throw new Error(`Cache deletion under "${prefix}" is not exact: ${problems.join("; ")}`);
}
