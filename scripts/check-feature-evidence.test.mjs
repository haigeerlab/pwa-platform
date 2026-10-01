import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { validateHistoricalEntry, validateLedger, validateLocalLinks } from './check-feature-evidence.mjs';

const path = '/repo/docs/review/2026-10-01/03-feature-evidence.md';
const source = '[source](../../../packages/vite/src/offline-page.ts)';
const testLink = '[test](../../../packages/vite/browser-tests/offline-page.spec.ts)';
const row = (number, evidence = `${source}、${testLink}`, status = '0.2.5；默认关') =>
  `| ${number} 离线页 | ${status} | ${evidence} | C自；手机未验 | 真实弱网未验 |`;
const ledger = (...rows) => `当前台账共 **${rows.length} 项**。\n| # 功能/用途 | 发布；默认/开启配置 | 实现与自动化断言 | 浏览器/手机证据 | 缺口或边界 |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`;

test('accepts complete consecutive rows and an explicitly unavailable feature', () => {
  const unavailable = row(2, source, '**不提供**；无配置');
  assert.deepEqual(validateLedger(ledger(row(1), unavailable), path), []);
});

test('reports a missing row, stale count and incomplete columns at their locations', () => {
  const missing = ledger(row(1), row(3)).replace('**2 项**', '**3 项**');
  assert.match(validateLedger(missing, path).join('\n'), /expected feature #2, found #3/);
  assert.match(validateLedger(missing, path).join('\n'), /declared 3 features, found 2/);
  assert.match(validateLedger(ledger('| 1 离线页 | 0.2.5 | source | C自 |'), path).join('\n'), /five nonempty columns/);
});

test('requires separate implementation and automated test links for implemented rows', () => {
  assert.match(validateLedger(ledger(row(1, testLink)), path).join('\n'), /missing implementation source link/);
  assert.match(validateLedger(ledger(row(1, source)), path).join('\n'), /missing automated test link/);
});

test('checks local file targets while leaving URL and fragment links to other review', () => {
  const markdown = '[exists](./here.md#section) [missing](./gone.md) [web](https://example.com) [anchor](#heading)';
  const exists = (target) => target === resolve('/repo/docs/here.md');
  assert.deepEqual(validateLocalLinks(markdown, '/repo/docs/page.md', exists), [
    '/repo/docs/page.md: missing local link ./gone.md',
  ]);
});

test('requires the historical notice to point to the current ledger', () => {
  const historical = '/repo/docs/operations/feature-evidence-ledger.md';
  assert.deepEqual(validateHistoricalEntry('[current](../review/2026-10-01/03-feature-evidence.md)', historical, path), []);
  assert.match(validateHistoricalEntry('[old](../review/2026-09-27/README.md)', historical, path).join('\n'), /must link/);
});
