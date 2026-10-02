import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'node:test';
import { releaseBranchName } from './release-branch.mjs';

const script = fileURLToPath(new URL('./release-branch.mjs', import.meta.url));
const day = new Date('2026-10-01T17:00:00Z'); // 2026-10-02 in Kuala Lumpur

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

test('names unversioned docs releases from the Kuala Lumpur date and completed deployment count', () => {
  assert.equal(releaseBranchName({ kind: 'docs', completedToday: 0, now: day }), 'release/docs-2026-10-02');
  assert.equal(releaseBranchName({ kind: 'docs', completedToday: 1, now: day }), 'release/docs-2026-10-02-1');
  assert.equal(releaseBranchName({ kind: 'docs', completedToday: 2, now: day }), 'release/docs-2026-10-02-2');
});

test('uses explicit docs and npm versions without a date suffix', () => {
  assert.equal(releaseBranchName({ kind: 'docs', version: 'v2026.10.02-0.3.0', now: day }), 'release/docs-v2026.10.02-0.3.0');
  assert.equal(releaseBranchName({ kind: 'npm', version: '0.3.1', now: day }), 'release/npm-0.3.1');
  assert.equal(releaseBranchName({ kind: 'npm', version: '0.4.0-beta.1', now: day }), 'release/npm-0.4.0-beta.1');
});

test('requires an explicit deployment count or npm version and rejects unsafe names', () => {
  assert.throws(() => releaseBranchName({ kind: 'docs', now: day }), /completed-today/);
  assert.throws(() => releaseBranchName({ kind: 'docs', completedToday: -1, now: day }), /completed-today/);
  assert.throws(() => releaseBranchName({ kind: 'npm', now: day }), /version/);
  assert.throws(() => releaseBranchName({ kind: 'npm', version: 'next', now: day }), /version/);
  assert.throws(() => releaseBranchName({ kind: 'docs', version: 'a/b', now: day }), /version/);
  assert.throws(() => releaseBranchName({ kind: 'docs', version: 'a..b', now: day }), /version/);
});

test('creates a local branch at fetched origin/main and refuses dirty or occupied names', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-branch-'));
  const remote = join(directory, 'remote.git');
  const work = join(directory, 'work');
  try {
    run('git', ['init', '--bare', remote], directory);
    run('git', ['init', '-b', 'main', work], directory);
    run('git', ['config', 'user.name', 'Test'], work);
    run('git', ['config', 'user.email', 'test@example.com'], work);
    writeFileSync(join(work, 'README.md'), 'release branch test\n');
    for (const name of ['contracts', 'core', 'engine-workbox', 'build-verifier', 'sw-runtime', 'client-runtime', 'vite', 'entry-resilience', 'vue', 'react']) {
      mkdirSync(join(work, 'packages', name), { recursive: true });
      writeFileSync(join(work, 'packages', name, 'package.json'), JSON.stringify({ name: `@pwa-platform/${name}`, version: '0.3.0' }));
    }
    mkdirSync(join(work, 'packages/vite/skills/pwa-onboarding'), { recursive: true });
    writeFileSync(join(work, 'packages/vite/skills/pwa-onboarding/SKILL.md'), '---\nmetadata:\n  version: "0.3.0"\n---\n');
    run('git', ['add', '.'], work);
    run('git', ['commit', '-m', 'Initial'], work);
    run('git', ['remote', 'add', 'origin', remote], work);
    run('git', ['push', '-u', 'origin', 'main'], work);

    writeFileSync(join(work, 'packages/react/package.json'), JSON.stringify({ name: '@pwa-platform/react', version: '0.2.9' }));
    run('git', ['add', '.'], work);
    run('git', ['commit', '-m', 'Inconsistent versions'], work);
    run('git', ['push', 'origin', 'main'], work);
    const inconsistent = spawnSync(process.execPath, [script, 'npm', '--version', '0.3.1', '--create'], { cwd: work, encoding: 'utf8' });
    assert.notEqual(inconsistent.status, 0);
    assert.match(inconsistent.stderr, /differs from/);
    assert.equal(run('git', ['branch', '--show-current'], work), 'main');
    writeFileSync(join(work, 'packages/react/package.json'), JSON.stringify({ name: '@pwa-platform/react', version: '0.3.0' }));
    run('git', ['add', '.'], work);
    run('git', ['commit', '-m', 'Align versions'], work);
    run('git', ['push', 'origin', 'main'], work);
    const alignedMain = run('git', ['rev-parse', 'origin/main'], work);

    const created = run(process.execPath, [script, 'npm', '--version', '0.3.1', '--create'], work);
    assert.match(created, /Created release\/npm-0\.3\.1/);
    assert.equal(run('git', ['branch', '--show-current'], work), 'release/npm-0.3.1');
    assert.equal(run('git', ['rev-parse', 'HEAD'], work), alignedMain);
    for (const name of ['contracts', 'core', 'engine-workbox', 'build-verifier', 'sw-runtime', 'client-runtime', 'vite', 'entry-resilience', 'vue', 'react']) {
      assert.equal(JSON.parse(run('git', ['show', `HEAD:packages/${name}/package.json`], work)).version, '0.3.0');
      assert.equal(JSON.parse(readFileSync(join(work, 'packages', name, 'package.json'), 'utf8')).version, '0.3.1');
    }
    assert.match(readFileSync(join(work, 'packages/vite/skills/pwa-onboarding/SKILL.md'), 'utf8'), /version: "0\.3\.1"/);
    run('git', ['add', '.'], work);
    run('git', ['commit', '-m', 'Prepare release'], work);

    const duplicate = spawnSync(process.execPath, [script, 'npm', '--version', '0.3.1', '--create'], { cwd: work, encoding: 'utf8' });
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /already exists/);

    run('git', ['push', 'origin', 'main:refs/heads/release/docs-1.0.0'], work);
    const remoteDuplicate = spawnSync(process.execPath, [script, 'docs', '--version', '1.0.0', '--create'], { cwd: work, encoding: 'utf8' });
    assert.notEqual(remoteDuplicate.status, 0);
    assert.match(remoteDuplicate.stderr, /already exists on origin/);

    writeFileSync(join(work, 'untracked.txt'), 'dirty\n');
    const dirty = spawnSync(process.execPath, [script, 'npm', '--version', '0.3.3', '--create'], { cwd: work, encoding: 'utf8' });
    assert.notEqual(dirty.status, 0);
    assert.match(dirty.stderr, /clean worktree/);
    assert.equal(run('git', ['branch', '--show-current'], work), 'release/npm-0.3.1');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
