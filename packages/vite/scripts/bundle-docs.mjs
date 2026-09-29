// Generates the offline docs copy that ships inside @pwa-platform/vite (ADR-0045 addendum, 2026-09-29).
// SKILL.md is the single source of which website pages are bundled.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const siteUrl = "https://pwa-platform-docs.pages.dev";

function citedPages(skillSource) {
  const pattern = /https:\/\/pwa-platform-docs\.pages\.dev\/([a-z0-9-]+\/[a-z0-9-]+)(?![a-z0-9/-])/g;
  return [...new Set([...skillSource.matchAll(pattern)].map((match) => match[1]))];
}

function stripFrontMatter(source) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source);
  return match ? source.slice(match[0].length) : source;
}

function rewriteTarget(target, fromPage, pages) {
  const hashAt = target.indexOf("#");
  const path = (hashAt === -1 ? target : target.slice(0, hashAt)).replace(/\/+$/, "").replace(/^\//, "");
  const anchor = hashAt === -1 ? "" : target.slice(hashAt);
  if (pages.has(path)) {
    const relativePath = posix.relative(posix.dirname(fromPage), `${path}.md`);
    return `${relativePath}${anchor}`;
  }
  return `${siteUrl}/${path}${anchor}`;
}

export function bundleDocs({ websiteDir, skillFile, outDir, version }) {
  const pages = new Set(citedPages(readFileSync(skillFile, "utf8")));
  if (pages.size === 0) throw new Error(`No docs pages cited in ${skillFile}`);
  rmSync(outDir, { recursive: true, force: true });
  const titles = new Map();
  for (const page of pages) {
    const source = stripFrontMatter(readFileSync(join(websiteDir, `${page}.md`), "utf8"));
    const body = source
      .replace(/\]\((\/[^)\s]*)/g, (_all, target) => `](${rewriteTarget(target, page, pages)}`)
      .replace(/href="(\/[^"]*)"/g, (_all, target) => `href="${rewriteTarget(target, page, pages)}"`)
      .replace(/^\s+/, "");
    titles.set(page, /^# (.+)$/m.exec(body)?.[1]?.trim() ?? page);
    const header = `<!-- Generated from website/${page}.md for @pwa-platform/vite@${version}. Online: ${siteUrl}/${page} -->\n\n`;
    const file = join(outDir, `${page}.md`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, header + body);
  }
  const list = [...pages].sort().map((page) => `- [${titles.get(page)}](./${page}.md)`);
  writeFileSync(
    join(outDir, "README.md"),
    `# PWA Platform docs for @pwa-platform/vite@${version}\n\nOffline copy of the pages cited by \`skills/pwa-onboarding/SKILL.md\`, generated from \`website/\` at build time. Links to pages not listed here point to ${siteUrl}.\n\n${list.join("\n")}\n`,
  );
  return [...pages].sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { version } = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const emitted = bundleDocs({
    websiteDir: join(packageDir, "..", "..", "website"),
    skillFile: join(packageDir, "skills", "pwa-onboarding", "SKILL.md"),
    outDir: join(packageDir, "docs"),
    version,
  });
  process.stdout.write(`Bundled ${emitted.length} docs pages into ${relative(process.cwd(), join(packageDir, "docs"))}\n`);
}
