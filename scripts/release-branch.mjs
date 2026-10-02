import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicPackages = ['contracts', 'core', 'engine-workbox', 'build-verifier', 'sw-runtime', 'client-runtime', 'vite', 'entry-resilience', 'vue', 'react'];

function malaysiaDate(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function releaseBranchName({ kind, version, completedToday, now = new Date() }) {
  if (kind === 'docs') {
    if (version !== undefined) {
      if (completedToday !== undefined) throw new Error('docs version and --completed-today cannot be combined');
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(version) || version.endsWith('.') || version.includes('..') || version.endsWith('.lock')) {
        throw new Error('invalid docs version');
      }
      return `release/docs-${version}`;
    }
    if (!Number.isSafeInteger(completedToday) || completedToday < 0) {
      throw new Error('unversioned docs require --completed-today=<nonnegative count>');
    }
    const suffix = completedToday === 0 ? '' : `-${completedToday}`;
    return `release/docs-${malaysiaDate(now)}${suffix}`;
  }
  if (kind === 'npm') {
    if (completedToday !== undefined) throw new Error('--completed-today is only for docs');
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version ?? '')) {
      throw new Error('npm requires a valid --version (for example 0.3.1)');
    }
    return `release/npm-${version}`;
  }
  throw new Error('kind must be docs or npm');
}

function git(args, allowedStatuses = [0]) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (!allowedStatuses.includes(result.status)) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.error?.message || '').trim()}`);
  }
  return result;
}

function createBranch(name, { kind, version }) {
  if (git(['status', '--porcelain', '--untracked-files=normal']).stdout.trim()) {
    throw new Error('release branch creation requires a clean worktree');
  }
  git(['fetch', '--no-tags', 'origin', 'main']);
  git(['check-ref-format', '--branch', name]);
  if (kind === 'npm') {
    let currentVersion;
    for (const packageName of publicPackages) {
      const manifest = JSON.parse(git(['show', `origin/main:packages/${packageName}/package.json`]).stdout);
      if (currentVersion === undefined) currentVersion = manifest.version;
      if (manifest.version !== currentVersion) {
        throw new Error(`${manifest.name} version ${manifest.version} on origin/main differs from ${currentVersion}`);
      }
    }
  }
  if (git(['show-ref', '--verify', '--quiet', `refs/heads/${name}`], [0, 1]).status === 0) {
    throw new Error(`${name} already exists locally`);
  }
  if (git(['ls-remote', '--heads', 'origin', name]).stdout.trim()) {
    throw new Error(`${name} already exists on origin`);
  }
  git(['switch', '-c', name, 'origin/main']);
  if (kind === 'npm') {
    for (const packageName of publicPackages) {
      const path = `packages/${packageName}/package.json`;
      const source = readFileSync(path, 'utf8');
      const updated = source.replace(/("version"\s*:\s*")[^"]+(")/, (_, before, after) => `${before}${version}${after}`);
      if (updated === source && JSON.parse(source).version !== version) throw new Error(`missing version in ${path}`);
      writeFileSync(path, updated);
    }
    const skillPath = 'packages/vite/skills/pwa-onboarding/SKILL.md';
    const skill = readFileSync(skillPath, 'utf8');
    const updatedSkill = skill.replace(/(metadata:\s*\n\s*version:\s*")[^"]+(")/, (_, before, after) => `${before}${version}${after}`);
    if (updatedSkill === skill && !skill.includes(`version: "${version}"`)) throw new Error(`missing metadata.version in ${skillPath}`);
    writeFileSync(skillPath, updatedSkill);
  }
  return git(['rev-parse', '--short', 'HEAD']).stdout.trim();
}

function parseArgs(args) {
  const [kind, ...flags] = args;
  const options = { kind, create: false };
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === '--create') {
      options.create = true;
    } else if (flag === '--version') {
      options.version = flags[++index];
    } else if (flag === '--completed-today') {
      const count = flags[++index];
      if (!/^(0|[1-9]\d*)$/.test(count ?? '')) throw new Error('invalid --completed-today count');
      options.completedToday = Number(count);
    } else {
      throw new Error(`unknown argument: ${flag}`);
    }
  }
  return options;
}

function main() {
  const { create, ...options } = parseArgs(process.argv.slice(2));
  const name = releaseBranchName(options);
  if (create) {
    const sha = createBranch(name, options);
    process.stdout.write(`Created ${name} from origin/main @ ${sha}${options.kind === 'npm' ? '; updated package and skill versions (commit before publishing)' : ''}\n`);
  } else {
    process.stdout.write(`${name}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
