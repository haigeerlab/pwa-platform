import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const features = {
  portable: {
    docs: /PwaPortableIdentity|deployment\s*:\s*\{\s*kind:\s*["']portable|verify\.deployment-(?:origin|response)/,
    topic: /可移植|portable|PwaPortable|deployment/,
    declarations: [
      ['vite', 'dist/options.d.ts', /export type PwaPortableViteOptions[\s\S]*?kind:\s*"portable"/],
      ['contracts', 'dist/index.d.ts', /\bPwaPortableIdentity\b[\s\S]*?\bPwaPlanV4\b/],
      ['build-verifier', 'dist/report.d.ts', /"deployment-origin"/],
    ],
  },
  workerMime: {
    docs: /worker-mime|workerMimeObserved|verifyWorkerScriptMime/,
    topic: /MIME|mime|Content-Type|worker 主脚本/,
    declarations: [
      ['build-verifier', 'dist/index.d.ts', /\bverifyWorkerScriptMime\b/],
      ['build-verifier', 'dist/release.d.ts', /\bworkerMimeObserved\b/],
      ['build-verifier', 'dist/report.d.ts', /"worker-mime"/],
    ],
  },
};

function markdownFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(path, `${relative}/`);
    return entry.isFile() && entry.name.endsWith('.md') ? [[relative, readFileSync(path, 'utf8')]] : [];
  });
}

function publishedVersion() {
  const packages = readFileSync(join(root, 'website/reference/packages.md'), 'utf8');
  const match = packages.match(/已发布的 <code>(\d+\.\d+\.\d+)<\/code> 正式包/);
  if (!match) throw new Error('website/reference/packages.md must name one published npm version');
  return match[1];
}

function statusNearVersion(markdown, version, published, topic) {
  const prose = markdown.replace(/<[^>]+>/g, ' ').replace(/[`*_]/g, '');
  let index = prose.indexOf(version);
  while (index !== -1) {
    const before = Math.max(prose.lastIndexOf('。', index), prose.lastIndexOf('；', index), prose.lastIndexOf('\n', index));
    const after = prose.slice(index).search(/[。；\n]/);
    const sentence = prose.slice(before + 1, after === -1 ? prose.length : index + after);
    if (topic.test(sentence) && (published
      ? /(?:已支持|已发布|现已提供|已包含)/.test(sentence) && !/不支持|尚未发布/.test(sentence)
      : /(?:不支持|尚不支持|尚无|尚未发布|待发布|不在|没有)/.test(sentence))) return true;
    index = prose.indexOf(version, index + version.length);
  }
  return false;
}

/** Check every page that mentions a new public field/check; do not infer release state from workspace package.json. */
export function validateDocs(version, available, docs) {
  const errors = [];
  for (const [name, feature] of Object.entries(features)) {
    const matches = docs.filter(([, markdown]) => feature.docs.test(markdown));
    if (matches.length === 0) errors.push(`${name}: no website page mentions this API`);
    for (const [path, markdown] of matches) {
      if (!statusNearVersion(markdown, version, available[name], feature.topic)) {
        errors.push(`${path}: ${name} needs an explicit ${available[name] ? 'published' : 'unpublished'} status for npm ${version}`);
      }
    }
  }
  return errors;
}

export function detectAvailability(declarations) {
  const available = {};
  for (const [name, feature] of Object.entries(features)) {
    const matches = feature.declarations.map(([pkg, path, pattern]) => pattern.test(declarations[`${pkg}/${path}`] ?? ''));
    if (matches.some(Boolean) && !matches.every(Boolean)) {
      throw new Error(`${name}: only some required declarations exist in the published packages`);
    }
    available[name] = matches.every(Boolean);
  }
  return available;
}

function registryDeclarations(version) {
  const temporary = mkdtempSync(join(tmpdir(), 'pwa-public-api-'));
  try {
    const declarations = {};
    for (const pkg of ['vite', 'contracts', 'build-verifier']) {
      const output = execFileSync('npm', [
        'pack', `@pwa-platform/${pkg}@${version}`, '--ignore-scripts', '--json', '--pack-destination', temporary,
      ], { encoding: 'utf8' });
      const [packed] = JSON.parse(output);
      if (packed?.version !== version || !packed?.filename) throw new Error(`${pkg}: npm pack did not return ${version}`);
      const archive = join(temporary, packed.filename);
      for (const feature of Object.values(features)) {
        for (const [owner, path] of feature.declarations) {
          if (owner !== pkg || declarations[`${pkg}/${path}`] !== undefined) continue;
          // A missing declaration means an older API. Extraction errors for a listed file are real failures.
          declarations[`${pkg}/${path}`] = packed.files.some((file) => file.path === path)
            ? execFileSync('tar', ['-xOzf', archive, `package/${path}`], { encoding: 'utf8' })
            : '';
        }
      }
    }
    return declarations;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function main() {
  const version = publishedVersion();
  // The website can document an older published release until its owner schedules an update.
  const available = detectAvailability(registryDeclarations(version));
  const errors = validateDocs(version, available, markdownFiles(join(root, 'website')));
  if (errors.length > 0) throw new Error(errors.join('\n'));
  process.stdout.write(`Website API status matches published npm ${version}: ${JSON.stringify(available)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
