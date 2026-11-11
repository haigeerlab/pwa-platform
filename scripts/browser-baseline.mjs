// The supported browser floor (ADR-0053), read from the root .browserslistrc so every consumer — the worker build
// target, the TypeScript lib check, the artifact scan — derives from one place instead of repeating version numbers.
import browserslist from 'browserslist';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** browserslist names → the target names Vite (esbuild/Oxc syntax) accepts. */
const TARGET_NAMES = { chrome: 'chrome', edge: 'edge', firefox: 'firefox', safari: 'safari', ios_saf: 'ios' };

/** The floor as browserslist resolves it, e.g. `["chrome 80", ..., "ios_saf 13.4-13.7", "safari 13.1"]`. */
export function readBaseline(queries) {
  return browserslist(queries, { path: root });
}

/**
 * The floor as bundler targets, e.g. `["chrome80", ..., "ios13.4", "safari13.1"]`. A range such as iOS `13.4-13.7`
 * is one release line; its lower bound is the floor. More than one version for a browser means the query is not a
 * floor (for example `chrome >= 80`), so it is refused rather than silently narrowed.
 */
export function baselineTargets(queries) {
  const seen = new Set();
  return readBaseline(queries).map((entry) => {
    const [name, versions] = entry.split(' ');
    const target = TARGET_NAMES[name];
    if (target === undefined) throw new Error(`Unsupported browser in the baseline: ${entry}`);
    if (seen.has(name)) throw new Error(`The baseline must name exactly one version per browser: ${name} repeats`);
    seen.add(name);
    return `${target}${versions.split('-')[0]}`;
  });
}
