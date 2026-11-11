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

/**
 * The TypeScript `lib` that matches the floor. It cannot be derived from browserslist, so it is stated here and the
 * floor type check asserts every browser program uses it. ES2021 adds `replaceAll`, `Promise.any` and logical
 * assignment; ES2022 adds `Object.hasOwn` and `.at()` — all newer than Safari 13.1. ES2020 still declares BigInt,
 * which Safari 13.1 lacks; BigInt literals are caught by the artifact scan.
 */
export const BASELINE_ES_LIB = 'ES2020';

/**
 * Browser-side source of each package: what runs in a page or worker, as opposed to build-time code. The floor type
 * check (tsconfig.floor.json), the lint rules and the artifact scan all cover exactly these; a test keeps the
 * tsconfig includes equal to this list.
 */
export const BROWSER_SOURCE = {
  'sw-runtime': ['src/worker', 'src/recovery-worker', 'src/entries', 'src/shared', 'src/messages', 'src/push-payload'],
  'engine-workbox': ['src/worker'],
  'client-runtime': ['src/client', 'src/shared'],
  'entry-resilience': ['src'],
  vue: ['src'],
  react: ['src'],
  'offline-write': ['src'],
  push: ['src/client'],
  nuxt: ['src/runtime'],
};

/** Build-time directories inside browser source roots, excluded everywhere the list above is used. */
export const BUILD_TIME_SOURCE = { 'entry-resilience': ['src/vite'] };

/**
 * Web APIs newer than the floor that eslint-plugin-compat misses (its compat data is older than these APIs) or that
 * caused the 0.4.0 white screen. Code that needs one must feature-detect it and disable the rule on that line with the
 * reason. Keep in step with scripts/test-support/legacy-engine.mjs.
 */
export const RESTRICTED_PROPERTIES = [
  { object: 'URL', property: 'canParse', message: 'URL.canParse needs Chrome 120 / Safari 17 / Firefox 115 (ADR-0053); use a try/new URL() helper.' },
  { object: 'AbortSignal', property: 'timeout', message: 'AbortSignal.timeout needs Chrome 103 / Safari 16 / Firefox 100 (ADR-0053); use AbortController with a timer.' },
  { object: 'AbortSignal', property: 'any', message: 'AbortSignal.any needs Chrome 116 / Safari 17.4 / Firefox 124 (ADR-0053).' },
  { object: 'Object', property: 'hasOwn', message: 'Object.hasOwn needs Chrome 93 / Safari 15.4 / Firefox 92 (ADR-0053); use Object.prototype.hasOwnProperty.call.' },
  // Explicit resource management: nuxt's type check is allowed lib.esnext.disposable (see browser-floor-types.test.mjs),
  // so neither the type layer nor es-check stops these; the lint and artifact layers do.
  { object: 'Symbol', property: 'dispose', message: 'Symbol.dispose is newer than the supported floor (ADR-0053).' },
  { object: 'Symbol', property: 'asyncDispose', message: 'Symbol.asyncDispose is newer than the supported floor (ADR-0053).' },
];

/** Syntax newer than the floor that neither es-check 9.8.1 nor the type layer reports. */
export const RESTRICTED_SYNTAX = [
  { selector: "VariableDeclaration[kind='using']", message: '`using` declarations are newer than the supported floor (ADR-0053).' },
  { selector: "VariableDeclaration[kind='await using']", message: '`await using` declarations are newer than the supported floor (ADR-0053).' },
];
