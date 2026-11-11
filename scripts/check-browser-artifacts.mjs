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
import ts from 'typescript';
import { BROWSER_SOURCE, BUILD_TIME_SOURCE, readBaseline, RESTRICTED_PROPERTIES, RESTRICTED_SYNTAX } from './browser-baseline.mjs';
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
      .map((file) => ({ file, module: true, category: 'package-dist', source: name }));
  });
}

/** The `<script>` elements of an HTML file with their attributes (any order, spacing or case) and inline text. */
function scriptElements(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map((match) => {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      attributes[attribute[1].toLowerCase()] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
    }
    return { attributes, text: match[2] };
  });
}

const isModule = (attributes) => (attributes.type ?? '').trim().toLowerCase() === 'module';

/** Writes each inline `<script>` of an HTML file to its own file, so it can be checked like any other script. */
export function extractInlineScripts(htmlFile, outDir) {
  mkdirSync(outDir, { recursive: true });
  return scriptElements(readFileSync(htmlFile, 'utf8'))
    .filter((element) => element.attributes.src === undefined)
    .map((element, index) => {
      const file = join(outDir, `${basename(htmlFile, '.html')}-inline-${index}.js`);
      writeFileSync(file, element.text);
      return { file, module: isModule(element.attributes), category: 'inline-script', source: htmlFile };
    });
}

/**
 * The module scripts an HTML page loads, plus everything they import or re-export statically, resolved inside
 * `outDir`. Import specifiers come from TypeScript's pre-processor, which skips comments and strings; paths starting
 * with the page's `base` are site-root references.
 */
export function collectModuleClosure(htmlFile, outDir, base = '/') {
  const resolveFrom = (from, specifier) => {
    if (specifier.startsWith(base)) return join(outDir, specifier.slice(base.length));
    if (specifier.startsWith('/')) return join(outDir, specifier.slice(1));
    return join(dirname(from), specifier);
  };
  const pending = scriptElements(readFileSync(htmlFile, 'utf8'))
    .filter((element) => element.attributes.src !== undefined && isModule(element.attributes))
    .map((element) => resolveFrom(join(outDir, 'index.html'), element.attributes.src));
  const seen = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`Module referenced from ${basename(htmlFile)} is missing: ${relative(outDir, file)}`);
    seen.add(file);
    for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
      if (/^(?:\.{1,2}\/|\/)/.test(fileName)) pending.push(resolveFrom(file, fileName));
    }
  }
  return [...seen].map((file) => ({ file, module: true, category: 'recovery-module', source: htmlFile }));
}

/**
 * Fails unless every expected input is present: each category, each browser package, and each source within a
 * category (each example's workers, inline scripts and recovery modules), with no empty file. A scan that silently
 * lost one package or one example would otherwise still pass on the rest.
 */
export function assertInputs(entries, { categories = REQUIRED_CATEGORIES, packages = Object.keys(BROWSER_SOURCE), sources = [] } = {}) {
  const missing = [
    ...categories.filter((category) => !entries.some((entry) => entry.category === category)),
    ...packages.filter((name) => !entries.some((entry) => entry.category === 'package-dist' && entry.source === name)).map((name) => `package ${name}`),
    ...sources.filter(([category, source]) => !entries.some((entry) => entry.category === category && entry.source === source)).map(([category, source]) => `${category} from ${source}`),
  ];
  const empty = entries.filter((entry) => !existsSync(entry.file) || statSync(entry.file).size === 0).map((entry) => entry.file);
  if (missing.length > 0) throw new Error(`No files found for: ${missing.join(', ')} — the scan would pass without checking them`);
  if (empty.length > 0) throw new Error(`Missing or empty files: ${empty.join(', ')}`);
}

function run(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: root });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => resolveRun({ code: -1, output: `could not start ${command}: ${error.message}` }));
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
      { files: ['**/*.js'], rules: { 'no-restricted-properties': ['error', ...RESTRICTED_PROPERTIES], 'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX] } },
    ],
  });
}

async function webApis(entry, linters) {
  const [result] = await linters[entry.module ? 'module' : 'script'].lintText(readFileSync(entry.file, 'utf8'), {
    filePath: join(root, 'browser-floor-scan', basename(entry.file)),
  });
  const problems = result.messages.filter((message) => ['compat/compat', 'no-restricted-properties', 'no-restricted-syntax'].includes(message.ruleId) || message.fatal);
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
        for (const check of [esCheck, webApis]) {
          // One file's error is recorded as that file's failure; the scan carries on so every result is reported.
          const reason = await check(entry, linters).catch((error) => `check failed to run: ${error.message}`);
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
  const apps = buildExamples(outDir);
  for (const appOut of apps) {
    for (const name of ['sw.js', 'pwa-recovery-worker.js']) entries.push({ file: join(appOut, name), module: false, category: 'worker', source: appOut });
    for (const html of readdirSync(appOut).filter((name) => name.endsWith('.html'))) {
      entries.push(...extractInlineScripts(join(appOut, html), join(outDir, 'inline', basename(appOut))));
    }
    entries.push(...collectModuleClosure(join(appOut, 'pwa-entry.html'), appOut, base(appOut)));
  }
  const sources = apps.flatMap((appOut) => [['worker', appOut], ['inline-script', join(appOut, 'offline.html')], ['recovery-module', join(appOut, 'pwa-entry.html')]]);
  assertInputs(entries, { sources });
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
