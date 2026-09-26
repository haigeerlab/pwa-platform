import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ordered = ['contracts', 'core', 'engine-workbox', 'build-verifier', 'sw-runtime', 'client-runtime', 'vite', 'vue', 'react'];
const expected = new Set(ordered.map((name) => `@pwa-platform/${name}`));
const version = '0.1.0-beta.2';
const license = readFileSync(join(root, 'packages', 'contracts', 'LICENSE'), 'utf8');
const published = new Set();
for (const name of ordered) {
  const directory = join(root, 'packages', name);
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  if (pkg.name !== `@pwa-platform/${name}` || pkg.version !== version || pkg.private === true || pkg.license !== 'MIT') {
    throw new Error(`Invalid publish metadata: ${name}`);
  }
  if (pkg.publishConfig?.registry !== 'https://registry.npmjs.org/' || pkg.publishConfig?.access !== 'public' || pkg.publishConfig?.tag !== 'next') {
    throw new Error(`Invalid publish target: ${name}`);
  }
  if (!pkg.files?.includes('dist') || !existsSync(join(directory, 'README.md')) || readFileSync(join(directory, 'LICENSE'), 'utf8') !== license) {
    throw new Error(`Incomplete package files: ${name}`);
  }
  for (const [dependency, range] of Object.entries(pkg.dependencies ?? {})) {
    if (dependency.startsWith('@pwa-platform/')) {
      if (!expected.has(dependency) || !published.has(dependency) || range !== 'workspace:*') {
        throw new Error(`Unpublishable production dependency: ${name} -> ${dependency}`);
      }
    }
  }
  for (const entry of Object.values(pkg.exports ?? {})) {
    const targets = typeof entry === 'string' ? [entry] : Object.values(entry);
    for (const target of targets) {
      if (typeof target === 'string' && !existsSync(join(directory, target))) {
        throw new Error(`Missing export: ${name} ${target}`);
      }
    }
  }
  published.add(pkg.name);
}
for (const name of ['browser-test-harness', 'examples-browser-e2e', 'nuxt', 'push', 'offline-write', 'entry-resilience', 'release-tools']) {
  const pkg = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'));
  if (pkg.private !== true) throw new Error(`Deferred package is public: ${name}`);
}
process.stdout.write(`Publish candidate metadata and built exports verified: ${published.size} packages\n`);
