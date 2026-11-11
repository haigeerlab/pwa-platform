// The worker build target in @pwa-platform/vite cannot read .browserslistrc at runtime (it is a published package),
// so it is stated in source and kept equal to the floor here (ADR-0053). Run after `pnpm build`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORKER_BUILD_TARGET } from '../packages/vite/dist/workers.js';
import { baselineTargets } from './browser-baseline.mjs';

test('the worker build target equals the supported floor', () => {
  assert.deepEqual([...WORKER_BUILD_TARGET].sort(), baselineTargets().sort());
});
