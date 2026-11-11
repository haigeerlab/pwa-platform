// Artifact layer of the browser floor (ADR-0053). Checks what actually ships to a browser — package dist, the
// generated service workers, scripts inlined into generated pages, and the recovery page's module graph — against
// .browserslistrc: es-check for syntax and ES built-ins, ESLint's compat rule plus the restricted list for web APIs.
// Usage: node scripts/check-browser-artifacts.mjs   (run after `pnpm build`; builds the React and Vue examples itself)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import compat from 'eslint-plugin-compat';
import { BROWSER_SOURCE, BUILD_TIME_SOURCE, readBaseline, RESTRICTED_PROPERTIES } from './browser-baseline.mjs';
import { spawnPnpm } from './spawn-pnpm.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ES_CHECK = join(root, 'node_modules', 'es-check', 'lib', 'cli', 'index.js');
/**
 * es-check maps the floor to ES2019 and reports every ES2020 feature without browser data. All of them except BigInt
 * (Safari 14) are inside the floor per MDN browser-compat-data 8.1.8: `?.`/`??` (Chrome 80, Safari 13.1, Firefox 74),
 * globalThis (Safari 12.1), Promise.allSettled and String.matchAll (Safari 13), dynamic import (Safari 11.1).
 */
const ALLOW_LIST = 'OptionalChaining,NullishCoalescing,globalThis,PromiseAllSettled,StringMatchAll,DynamicImport';
export const REQUIRED_CATEGORIES = ['package-dist', 'worker', 'inline-script', 'recovery-module'];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Every browser-side `.js` file in package dist, mapped from BROWSER_SOURCE (`src/x` → `dist/x`). */
export function collectPackageDist(base = root) {
  return Object.entries(BROWSER_SOURCE).flatMap(([name, dirs]) => {
    const skip = (BUILD_TIME_SOURCE[name] ?? []).map((dir) => join(base, 'packages', name, dir.replace(/^src/, 'dist')));
    return dirs
      .flatMap((dir) => walk(join(base, 'packages', name, dir.replace(/^src/, 'dist'))))
      .filter((file) => file.endsWith('.js') && !skip.some((dir) => file.startsWith(dir + '/') || file.startsWith(dir + '\\')))
      .map((file) => ({ file, module: true, category: 'package-dist' }));
  });
}

/** Writes each inline `<script>` of an HTML file to its own file, so it can be checked like any other script. */
export function extractInlineScripts(htmlFile, outDir) {
  mkdirSync(outDir, { recursive: true });
  const html = readFileSync(htmlFile, 'utf8');
  return [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].map((match, index) => {
    const file = join(outDir, `${basename(htmlFile, '.html')}-inline-${index}.js`);
    writeFileSync(file, match[2]);
    return { file, module: /type=["']?module/.test(match[1]), category: 'inline-script' };
  });
}

/** The module scripts an HTML page loads, plus everything they import statically, resolved inside `outDir`. */
export function collectModuleClosure(htmlFile, outDir, base = '/') {
  const html = readFileSync(htmlFile, 'utf8');
  const pending = [...html.matchAll(/<script[^>]*type=["']?module["']?[^>]*\bsrc=["']([^"']+)["']/g)].map((match) =>
    join(outDir, match[1].startsWith(base) ? match[1].slice(base.length) : match[1]),
  );
  const seen = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`Module referenced from ${basename(htmlFile)} is missing: ${relative(outDir, file)}`);
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      pending.push(join(dirname(file), match[1]));
    }
  }
  return [...seen].map((file) => ({ file, module: true, category: 'recovery-module' }));
}

export function assertCategories(entries, required = REQUIRED_CATEGORIES) {
  const missing = required.filter((category) => !entries.some((entry) => entry.category === category));
  if (missing.length > 0) throw new Error(`No files found for: ${missing.join(', ')} — the scan would pass without checking them`);
}

function run(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: root });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => resolveRun({ code, output }));
  });
}

async function esCheck(entry) {
  const args = [ES_CHECK, 'checkBrowser', entry.file, '--checkFeatures', '--browserslistPath', join(root, '.browserslistrc'), `--allowList=${ALLOW_LIST}`];
  if (entry.module) args.push('--module');
  const { code, output } = await run(process.execPath, args);
  return code === 0 ? undefined : output.trim();
}

function webApiLinter(sourceType) {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType } },
      { ...compat.configs['flat/recommended'], files: ['**/*.js'], settings: { browsers: readBaseline() } },
      { files: ['**/*.js'], rules: { 'no-restricted-properties': ['error', ...RESTRICTED_PROPERTIES] } },
    ],
  });
}

async function webApis(entry, linters) {
  const [result] = await linters[entry.module ? 'module' : 'script'].lintText(readFileSync(entry.file, 'utf8'), {
    filePath: join(root, 'browser-floor-scan', basename(entry.file)),
  });
  const problems = result.messages.filter((message) => message.ruleId === 'compat/compat' || message.ruleId === 'no-restricted-properties' || message.fatal);
  return problems.length === 0 ? undefined : problems.map((message) => `${message.line}:${message.column} ${message.message}`).join('\n');
}

/** Checks every entry; returns `{ file, reason }` for each failure. */
export async function checkFiles(entries, concurrency = 8) {
  const linters = { module: webApiLinter('module'), script: webApiLinter('script') };
  const failures = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
      while (next < entries.length) {
        const entry = entries[next++];
        for (const reason of [await esCheck(entry), await webApis(entry, linters)]) {
          if (reason !== undefined) failures.push({ file: entry.file, reason });
        }
      }
    }),
  );
  return failures;
}

function buildExamples(outDir) {
  return ['react', 'vue'].map((app) => {
    const out = join(outDir, app);
    const result = spawnPnpm(['--filter', '@pwa-platform/examples-browser-e2e', 'exec', 'vite', 'build', '--config', `apps/${app}/vite.config.ts`, '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`Building the ${app} example failed`);
    return out;
  });
}

function base(appOut) {
  const manifest = JSON.parse(readFileSync(join(appOut, 'manifest.webmanifest'), 'utf8'));
  return new URL(manifest.start_url ?? '/', 'https://x.invalid').pathname;
}

async function main() {
  const outDir = mkdtempSync(join(tmpdir(), 'browser-floor-scan-'));
  const entries = [...collectPackageDist()];
  for (const appOut of buildExamples(outDir)) {
    for (const name of ['sw.js', 'pwa-recovery-worker.js']) entries.push({ file: join(appOut, name), module: false, category: 'worker' });
    for (const html of readdirSync(appOut).filter((name) => name.endsWith('.html'))) {
      entries.push(...extractInlineScripts(join(appOut, html), join(outDir, 'inline', basename(appOut))));
    }
    entries.push(...collectModuleClosure(join(appOut, 'pwa-entry.html'), appOut, base(appOut)));
  }
  assertCategories(entries);
  for (const category of REQUIRED_CATEGORIES) {
    const list = entries.filter((entry) => entry.category === category);
    console.log(`${category} (${list.length}):`);
    for (const entry of list) console.log(`  ${relative(root, entry.file).startsWith('..') ? relative(outDir, entry.file) : relative(root, entry.file)}`);
  }
  const failures = await checkFiles(entries);
  for (const failure of failures) console.error(`\n✖ ${failure.file}\n${failure.reason}`);
  console.log(`\n${entries.length} files checked against ${readBaseline().join(', ')}: ${failures.length} failure(s)`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
