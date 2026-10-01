import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectAvailability, validateDocs } from './check-doc-public-api.mjs';

const docs = [
  ['guide/portable.md', 'PwaPortableIdentity: npm 0.2.5 不支持，待发布。'],
  ['operations/release.md', 'worker-mime: npm 0.2.5 尚无该检查。'],
];

test('accepts clearly marked features absent from the published types', () => {
  assert.deepEqual(detectAvailability({}), { portable: false, workerMime: false });
  assert.deepEqual(validateDocs('0.2.5', { portable: false, workerMime: false }, docs), []);
});

test('rejects missing status and a stale published claim', () => {
  assert.match(validateDocs('0.2.5', { portable: false, workerMime: false }, [
    ['guide/portable.md', 'PwaPortableIdentity example'], docs[1],
  ])[0], /portable needs an explicit unpublished status/);
  assert.match(validateDocs('0.2.6', { portable: true, workerMime: false }, docs)[0], /published status for npm 0.2.6/);
  assert.match(validateDocs('0.2.5', { portable: false, workerMime: false }, [
    ['guide/portable.md', 'PwaPortableIdentity example。 npm 0.2.5 尚无 worker-mime 检查。'], docs[1],
  ])[0], /portable needs an explicit unpublished status/);
});

test('rejects a partially published API', () => {
  assert.throws(() => detectAvailability({
    'vite/dist/options.d.ts': 'export type PwaPortableViteOptions = { kind: "portable" }',
  }), /only some required declarations/);
});

test('accepts a future release only after every declaration and page status advances', () => {
  const declarations = {
    'vite/dist/options.d.ts': 'export type PwaPortableViteOptions = { kind: "portable" }',
    'contracts/dist/index.d.ts': 'export type { PwaPortableIdentity, PwaPlanV4 }',
    'build-verifier/dist/report.d.ts': '"deployment-origin", "worker-mime"',
    'build-verifier/dist/index.d.ts': 'export { verifyWorkerScriptMime }',
    'build-verifier/dist/release.d.ts': 'readonly workerMimeObserved?: unknown',
  };
  assert.deepEqual(detectAvailability(declarations), { portable: true, workerMime: true });
  assert.deepEqual(validateDocs('0.2.6', { portable: true, workerMime: true }, [
    ['guide/portable.md', 'npm 0.2.6 已支持 PwaPortableIdentity。'],
    ['operations/release.md', 'npm 0.2.6 已支持 worker-mime 检查。'],
  ]), []);
});
