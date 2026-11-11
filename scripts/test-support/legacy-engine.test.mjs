import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPlatformBrowserCaller } from './legacy-engine.mjs';

const stack = (...callers) => ['Error', '    at Object.value (/repo/scripts/test-support/legacy-engine.mjs:40:11)', ...callers.map((frame) => `    at ${frame}`)].join('\n');
const SOURCE = '/repo/packages/sw-runtime/src/shared/url.ts:7:5';

test('a direct call from browser source is platform code', () => {
  assert.equal(isPlatformBrowserCaller(stack(`canParseUrl (${SOURCE})`)), true);
  assert.equal(isPlatformBrowserCaller(stack(`${SOURCE}`)), true);
  assert.equal(isPlatformBrowserCaller(stack(`canParseUrl (file://${SOURCE})`)), true);
  assert.equal(isPlatformBrowserCaller(stack('canParseUrl (C:\\repo\\packages\\sw-runtime\\src\\shared\\url.ts:7:5)')), true);
});

test('a call through a native callback is attributed to the source that set it up', () => {
  assert.equal(isPlatformBrowserCaller(stack('Array.map (<anonymous>)', `check (${SOURCE})`)), true);
  assert.equal(isPlatformBrowserCaller(stack('new Promise (<anonymous>)', 'async Promise.all (index 0)', `check (${SOURCE})`)), true);
});

test('dependencies, build-time code, tests and the runner are not platform code', () => {
  assert.equal(isPlatformBrowserCaller(stack('x (/repo/node_modules/.pnpm/vitest/dist/index.js:1:1)')), false);
  assert.equal(isPlatformBrowserCaller(stack('x (/repo/packages/sw-runtime/src/build/config.ts:1:1)')), false);
  assert.equal(isPlatformBrowserCaller(stack('x (/repo/packages/entry-resilience/src/vite/index.ts:1:1)')), false);
  assert.equal(isPlatformBrowserCaller(stack('x (/repo/packages/contracts/src/validate.ts:1:1)')), false);
  assert.equal(isPlatformBrowserCaller(stack('x (/repo/packages/sw-runtime/test/config.test.ts:1:1)')), false);
  assert.equal(isPlatformBrowserCaller(stack('Array.map (<anonymous>)')), false);
});

test('the wrapped URL constructor still behaves as URL for everything else', () => {
  const url = new URL('https://example.invalid/a?b=1', undefined);
  assert.ok(url instanceof URL);
  assert.equal(url.pathname, '/a');
  assert.equal(new URL('/x', 'https://example.invalid/').href, 'https://example.invalid/x');
  assert.equal(typeof URL.createObjectURL, 'function');
});
