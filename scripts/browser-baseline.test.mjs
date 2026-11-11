import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baselineTargets, readBaseline } from './browser-baseline.mjs';

test('reads the supported floor from the root .browserslistrc', () => {
  assert.deepEqual(readBaseline(), ['chrome 80', 'edge 80', 'firefox 74', 'ios_saf 13.4-13.7', 'safari 13.1']);
});

test('converts the floor to bundler targets', () => {
  assert.deepEqual(baselineTargets(), ['chrome80', 'edge80', 'firefox74', 'ios13.4', 'safari13.1']);
});

test('rejects a query that resolves to more than one version per browser', () => {
  assert.throws(() => baselineTargets(['chrome >= 80']), /exactly one version per browser/);
});
