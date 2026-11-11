// Artifact layer of the browser floor (ADR-0053): what ships to a browser is checked as built, so syntax and APIs in
// dependencies, bundler output and generated scripts are covered too, not only our source.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { assertCategories, checkFiles, collectModuleClosure, collectPackageDist, extractInlineScripts } from './check-browser-artifacts.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'browser-floor-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const modules = (dir, ...names) => names.map((name) => ({ file: join(dir, name), module: true, category: 'test' }));

test('syntax newer than the floor fails; syntax inside it passes', async () => {
  const dir = fixture({
    'assign.js': 'let p; p ??= 1; export { p };\n',
    'field.js': 'export class E { code = 1; }\n',
    'bigint.js': 'export const big = 10n;\n',
    'ok.js': 'export const a = 1_000; export const b = globalThis.x?.y ?? 2; export const c = Promise.allSettled([]); export const d = [..."ab".matchAll(/a/g)]; export const e = () => import("./x.js");\n',
  });
  const failures = await checkFiles(modules(dir, 'assign.js', 'field.js', 'bigint.js', 'ok.js'));
  assert.deepEqual([...new Set(failures.map((failure) => failure.file.split('/').at(-1)))].sort(), ['assign.js', 'bigint.js', 'field.js']);
});

test('built-ins and listed web APIs newer than the floor fail', async () => {
  const dir = fixture({ 'own.js': 'export const a = Object.hasOwn({}, "a");\n', 'web.js': 'export const a = URL.canParse("/a", "https://x.invalid");\n' });
  const failures = await checkFiles(modules(dir, 'own.js', 'web.js'));
  assert.deepEqual([...new Set(failures.map((failure) => failure.file.split('/').at(-1)))].sort(), ['own.js', 'web.js']);
});

test('a web API inside a generated inline script is caught once extracted', async () => {
  const dir = fixture({ 'page.html': '<!doctype html><script>if (URL.canParse(location.href)) location.reload();</script><script src="/x.js"></script>' });
  const scripts = extractInlineScripts(join(dir, 'page.html'), join(dir, 'extracted'));
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].module, false);
  assert.equal((await checkFiles(scripts)).length, 1);
});

test('package dist follows the browser source map and skips build-time output', () => {
  const dir = fixture({
    'packages/sw-runtime/dist/shared/a.js': 'export {};\n',
    'packages/sw-runtime/dist/build/b.js': 'export {};\n',
    'packages/entry-resilience/dist/index.js': 'export {};\n',
    'packages/entry-resilience/dist/vite/c.js': 'export {};\n',
  });
  const files = collectPackageDist(dir).map((entry) => entry.file.slice(dir.length + 1)).sort();
  assert.deepEqual(files, ['packages/entry-resilience/dist/index.js', 'packages/sw-runtime/dist/shared/a.js']);
});

test('the recovery page module closure follows static imports', () => {
  const dir = fixture({
    'page.html': '<script type="module" src="/app/assets/entry.js"></script>',
    'assets/entry.js': 'import{a}from"./shared.js";import"./side.js";export{a};\n',
    'assets/shared.js': 'import{b}from"./leaf.js";export const a=b;\n',
    'assets/side.js': 'export {};\n',
    'assets/leaf.js': 'export const b=1;\n',
  });
  const closure = collectModuleClosure(join(dir, 'page.html'), dir, '/app/').map((entry) => entry.file.slice(dir.length + 1)).sort();
  assert.deepEqual(closure, ['assets/entry.js', 'assets/leaf.js', 'assets/shared.js', 'assets/side.js']);
});

test('a missing category of input fails instead of passing silently', () => {
  assert.throws(() => assertCategories([{ category: 'worker' }], ['worker', 'inline-script']), /inline-script/);
});
