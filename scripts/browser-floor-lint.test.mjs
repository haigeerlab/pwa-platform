// Lint layer of the browser floor (ADR-0053): eslint-plugin-compat plus the restricted-properties list apply to
// browser-side source only, and the list of browser source matches what the floor type check compiles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { BROWSER_SOURCE, BUILD_TIME_SOURCE } from './browser-baseline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: root });
const SAMPLE = 'export const cloned = structuredClone({});\nexport const ok = URL.canParse("/a", "https://x.invalid");\n';

async function ruleIds(path) {
  const [result] = await eslint.lintText(SAMPLE, { filePath: join(root, path) });
  return [...new Set(result.messages.map((message) => message.ruleId))].sort();
}

test('tsconfig.floor.json includes match the browser source list', () => {
  for (const [name, dirs] of Object.entries(BROWSER_SOURCE)) {
    const path = join(root, 'packages', name, 'tsconfig.floor.json');
    const config = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8')).config;
    assert.deepEqual(config.include.filter((glob) => glob.endsWith('**/*.ts')).map((glob) => glob.replace('/**/*.ts', '')).sort(), [...dirs].sort(), name);
    assert.deepEqual((config.exclude ?? []).map((glob) => glob.replace('/**', '')), BUILD_TIME_SOURCE[name] ?? [], name);
  }
});

test('browser source: the compat plugin and the restricted list both report', async () => {
  for (const [name, dirs] of Object.entries(BROWSER_SOURCE)) {
    assert.deepEqual(await ruleIds(`packages/${name}/${dirs[0]}/__lint_fixture__.ts`), ['compat/compat', 'no-restricted-properties'], name);
  }
});

test('build-time source is not held to the browser floor', async () => {
  for (const path of ['packages/vite/src/__lint_fixture__.ts', 'packages/entry-resilience/src/vite/__lint_fixture__.ts', 'packages/sw-runtime/src/build/__lint_fixture__.ts', 'packages/push/src/server/__lint_fixture__.ts']) {
    assert.deepEqual(await ruleIds(path), [], path);
  }
});
