import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ledgerPath = join(root, 'docs/review/2026-10-01/03-feature-evidence.md');
const historicalPath = join(root, 'docs/operations/feature-evidence-ledger.md');
const linkPattern = /!?(?:\[[^\]]*\])\(([^)]+)\)/g;

function localLinks(markdown) {
  return [...markdown.matchAll(linkPattern)]
    .map((match) => match[1].split('#')[0])
    .filter((target) => target && !/^[a-z][a-z\d+.-]*:/i.test(target));
}

/** Checks file targets only. Fragment IDs, external URLs and claim truth require separate review. */
export function validateLocalLinks(markdown, path, exists = existsSync) {
  const errors = [];
  for (const target of localLinks(markdown)) {
    const decoded = decodeURIComponent(target);
    const absolute = resolve(dirname(path), decoded);
    if (!exists(absolute)) errors.push(`${path}: missing local link ${target}`);
  }
  return errors;
}

/** Check that each maintained feature has a complete row and separate implementation/test references. */
export function validateLedger(markdown, path) {
  const errors = [];
  const declared = markdown.match(/当前台账共\s*\*\*(\d+) 项\*\*/);
  if (!declared) errors.push(`${path}: missing declared feature count`);

  const lines = markdown.split('\n');
  const header = lines.findIndex((line) => line.startsWith('| # 功能/用途 |'));
  if (header < 0 || !lines[header + 1]?.startsWith('| ---')) {
    return [...errors, `${path}: missing current feature table`];
  }

  let count = 0;
  for (let index = header + 2; index < lines.length && lines[index].startsWith('|'); index += 1) {
    const cells = lines[index].slice(1, -1).split('|').map((cell) => cell.trim());
    const location = `${path}:${index + 1}`;
    if (cells.length !== 5 || cells.some((cell) => !cell)) {
      errors.push(`${location}: expected five nonempty columns`);
      continue;
    }
    const match = cells[0].match(/^(\d+)\s+\S/);
    if (!match) {
      errors.push(`${location}: missing numbered feature`);
      continue;
    }
    count += 1;
    if (Number(match[1]) !== count) errors.push(`${location}: expected feature #${count}, found #${match[1]}`);
    const links = localLinks(cells[2]);
    if (!links.some((link) => /\/packages\/[^/]+\/(?:src\/|package\.json$)/.test(link))) {
      errors.push(`${location}: missing implementation source link`);
    }
    if (!cells[1].includes('不提供') && !links.some((link) => /(?:\/test\/|\/browser-tests(?:-[^/]+)?\/|\/ui-browser-tests\/|\.spec\.[cm]?[jt]s$|\.test\.[cm]?[jt]s$)/.test(link))) {
      errors.push(`${location}: missing automated test link`);
    }
  }
  if (count === 0) errors.push(`${path}: feature table has no valid rows`);
  if (declared && count !== Number(declared[1])) errors.push(`${path}: declared ${declared[1]} features, found ${count}`);
  return errors;
}

export function validateHistoricalEntry(markdown, path, currentPath) {
  const targets = localLinks(markdown.split('\n').slice(0, 5).join('\n'));
  return targets.some((target) => resolve(dirname(path), decodeURIComponent(target)) === currentPath)
    ? []
    : [`${path}: historical notice must link to the current feature ledger`];
}

function checkRepository() {
  const errors = [];
  const ledger = readFileSync(ledgerPath, 'utf8');
  errors.push(...validateLedger(ledger, ledgerPath));
  errors.push(...validateHistoricalEntry(readFileSync(historicalPath, 'utf8'), historicalPath, ledgerPath));
  const reviewDirectory = dirname(ledgerPath);
  for (const name of readdirSync(reviewDirectory).filter((name) => name.endsWith('.md'))) {
    const path = join(reviewDirectory, name);
    errors.push(...validateLocalLinks(readFileSync(path, 'utf8'), path));
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkRepository();
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Feature evidence ledger: rows, references and local links pass.\n');
  }
}
