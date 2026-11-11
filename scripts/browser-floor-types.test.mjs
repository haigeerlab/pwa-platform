// Type layer of the browser floor (ADR-0053): every package's tsconfig.floor.json compiles only browser-side source
// with `lib` limited to the baseline. Each program is checked as TypeScript really builds it — with the package's
// real dependencies — so a dependency that pulls a newer lib in through `/// <reference lib>` is caught too.
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { BASELINE_ES_LIB } from './browser-baseline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NEWER_LIB = /[\\/]lib\.(?:es202[1-9]|es20[3-9]\d|esnext)[^\\/]*\.d\.ts$/i;
/**
 * Newer libs a package may load because a dependency references them, each with the reason. Only nuxt has one: its
 * runtime plugin imports `nuxt/app`, whose types pull in @types/node, which references these two narrow libs
 * (`Symbol.dispose`/`using`; `Float16Array`/`Math.f16round`). The project owner accepted this on 2026-11-11 (ADR-0053
 * type layer); the lint and artifact layers still cover these APIs, and the fixture below must still fail in nuxt.
 */
const ALLOWED_NEWER_LIBS = {
  nuxt: ['lib.esnext.disposable.d.ts', 'lib.es2025.float16.d.ts'],
};
const FIXTURE = [
  'export const own = Object.hasOwn({}, "a");',
  'export const replaced = "a".replaceAll("a", "b");',
  'export const last = [1].at(-1);',
].join('\n');

const floors = readdirSync(join(root, 'packages'))
  .map((name) => join(root, 'packages', name, 'tsconfig.floor.json'))
  .filter((path) => existsSync(path));

function program(configPath, extra) {
  const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => assert.fail(ts.flattenDiagnosticMessageText(d.messageText, '\n')) });
  const host = ts.createCompilerHost(config.options);
  if (extra) {
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, ...rest) =>
      fileName === extra.fileName ? ts.createSourceFile(fileName, extra.text, languageVersion) : original(fileName, languageVersion, ...rest);
    const exists = host.fileExists.bind(host);
    host.fileExists = (fileName) => fileName === extra.fileName || exists(fileName);
  }
  return { config, program: ts.createProgram([...config.fileNames, ...(extra ? [extra.fileName] : [])], config.options, host) };
}

test('every browser package has a floor type check', () => {
  const names = floors.map((path) => path.split(/[\\/]/).at(-2)).sort();
  assert.deepEqual(names, ['client-runtime', 'engine-workbox', 'entry-resilience', 'nuxt', 'offline-write', 'push', 'react', 'sw-runtime', 'vue']);
});

for (const configPath of floors) {
  const name = configPath.split(/[\\/]/).at(-2);

  test(`${name}: lib is the baseline and the browser source compiles under it`, () => {
    const { config, program: built } = program(configPath);
    assert.ok(config.fileNames.length > 0, 'the floor program includes source files');
    assert.equal(config.options.lib?.[0], `lib.${BASELINE_ES_LIB.toLowerCase()}.d.ts`);
    const errors = ts.getPreEmitDiagnostics(built).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    assert.deepEqual(errors, []);
    const allowed = ALLOWED_NEWER_LIBS[name] ?? [];
    const newer = built.getSourceFiles()
      .map((file) => file.fileName)
      .filter((fileName) => NEWER_LIB.test(fileName))
      .map((fileName) => fileName.split(/[\\/]/).at(-1))
      .filter((libName) => !allowed.includes(libName));
    assert.deepEqual(newer, [], 'no dependency pulls in a lib newer than the baseline');
  });

  test(`${name}: built-ins newer than the baseline fail to type-check`, () => {
    const fileName = join(dirname(configPath), 'src', '__floor_fixture__.ts');
    const { program: built } = program(configPath, { fileName, text: FIXTURE });
    const lines = ts.getPreEmitDiagnostics(built)
      .filter((d) => d.file?.fileName === fileName)
      .map((d) => d.file.getLineAndCharacterOfPosition(d.start).line);
    assert.deepEqual([...new Set(lines)].sort(), [0, 1, 2]);
  });
}
