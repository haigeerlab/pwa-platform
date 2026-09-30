import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The onboarding skill ships as plain Markdown inside @pwa-platform/vite (ADR-0045): it is listed in `files`,
// never in `exports`, and must not contain anything executable or any instruction to write into build inputs.

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(packageDir, "..");
const repoRoot = join(packagesDir, "..");
const skillDir = join(packageDir, "skills", "pwa-onboarding");
const skillFile = join(skillDir, "SKILL.md");
const otherPublicPackages = ["contracts", "core", "engine-workbox", "build-verifier", "sw-runtime", "client-runtime", "entry-resilience", "vue", "react"];

type PackageJson = { version: string; files?: string[]; exports?: Record<string, unknown> };

function readPackageJson(dir: string): PackageJson {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson;
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value !== null && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => [key, ...collectStrings(child)]);
  return [];
}

// Minimal front matter parser: only `key: value` at the top level and one indented `version: "x"` under `metadata:`.
// Anything else throws so that an unexpected structure turns the test red instead of being ignored.
function unquote(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    if (value.length < 2 || !value.endsWith('"')) throw new Error(`Unterminated quoted value: ${raw}`);
    return JSON.parse(value) as string;
  }
  if (value === "" || value.startsWith("'") || /^[|>&*![{]/.test(value)) throw new Error(`Unsupported value: ${raw}`);
  return value;
}

function parseFrontMatter(source: string): Record<string, string | Record<string, string>> {
  const lines = source.split(/\r?\n/);
  if (lines[0] !== "---") throw new Error("Front matter must start with ---");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error("Front matter must end with ---");
  const result: Record<string, string | Record<string, string>> = {};
  let section: Record<string, string> | undefined;
  for (const line of lines.slice(1, end)) {
    const nested = /^ {2}([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (nested) {
      const [, key = "", value = ""] = nested;
      if (!section) throw new Error(`Indented key outside a section: ${line}`);
      if (key !== "version") throw new Error(`Unsupported metadata key: ${line}`);
      section[key] = unquote(value);
      continue;
    }
    const top = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (!top) throw new Error(`Unsupported front matter line: ${line}`);
    const [, key = "", value = ""] = top;
    if (key in result) throw new Error(`Duplicate key: ${key}`);
    if (key === "metadata") {
      if (value.trim() !== "") throw new Error(`metadata must be a block: ${line}`);
      section = {};
      result.metadata = section;
    } else {
      section = undefined;
      result[key] = unquote(value);
    }
  }
  return result;
}

const writeCommand = /(^|\s)(cp|mv|rsync|ln|tee|install)\b[^\n]*\b(public|src|dist)\//;
const redirect = />>?\s*(\.\/)?(public|src|dist)\//;

function findFencedWrites(markdown: string): string[] {
  const hits: string[] = [];
  let fence: string | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      const char = marker.charAt(0);
      if (fence === undefined) fence = char;
      else if (char === fence) fence = undefined;
      continue;
    }
    if (fence !== undefined && (writeCommand.test(line) || redirect.test(line))) hits.push(line);
  }
  return hits;
}

describe("DT1 skill packaging", () => {
  const pkg = readPackageJson(packageDir);

  it("lists skills in files and ships SKILL.md in the packed tarball", () => {
    expect(pkg.files).toContain("skills");
    const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: packageDir, encoding: "utf8" });
    const packed = (JSON.parse(output) as Array<{ files: Array<{ path: string }> }>)[0];
    const paths = (packed?.files ?? []).map((file) => file.path);
    expect(paths).toContain("skills/pwa-onboarding/SKILL.md");
    const skillPaths = paths.filter((path) => path.startsWith("skills/"));
    expect(skillPaths.length).toBeGreaterThan(0);
    for (const path of skillPaths) expect(path.endsWith(".md"), path).toBe(true);
    // Docs are read online or from a repository copy, never shipped (ADR-0045, 2026-09-30 addendum).
    expect(pkg.files).not.toContain("docs");
    expect(paths.filter((path) => path.startsWith("docs/"))).toEqual([]);
    // `npm pack --dry-run` takes 1-2 s alone but exceeded vitest's default 5 s while 25 test files ran in parallel.
  }, 60_000);

  it("does not expose skills through exports (keys or targets)", () => {
    for (const value of collectStrings(pkg.exports)) expect(value, value).not.toContain("skills");
  });

  it.each(otherPublicPackages)("does not ship skills from %s", (name) => {
    expect(readPackageJson(join(packagesDir, name)).files ?? []).not.toContain("skills");
  });
});

describe("DT2 SKILL.md front matter", () => {
  const frontMatter = () => parseFrontMatter(readFileSync(skillFile, "utf8"));

  it("has exactly the top-level keys name, description and metadata", () => {
    expect(Object.keys(frontMatter()).sort()).toEqual(["description", "metadata", "name"]);
  });

  it("uses a valid name equal to the directory name", () => {
    const { name } = frontMatter();
    expect(name).toBe("pwa-onboarding");
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect((name as string).length).toBeLessThanOrEqual(64);
  });

  it("has a description within 1024 characters and without angle brackets", () => {
    const { description } = frontMatter();
    expect(typeof description).toBe("string");
    expect((description as string).length).toBeGreaterThan(0);
    expect((description as string).length).toBeLessThanOrEqual(1024);
    expect(description).not.toMatch(/[<>]/);
  });

  it("commits metadata.version equal to the package version", () => {
    const { metadata } = frontMatter();
    expect(metadata).toEqual({ version: readPackageJson(packageDir).version });
  });
});

describe("DT3 size budget", () => {
  it("keeps SKILL.md within 6144 bytes", () => {
    expect(statSync(skillFile).size).toBeLessThanOrEqual(6144);
  });

  it("keeps the whole skill directory within 8192 bytes: it is a short checklist that points at the docs, not a second copy of them", () => {
    const total = listFiles(skillDir).reduce((sum, file) => sum + statSync(file).size, 0);
    expect(total).toBeLessThanOrEqual(8192);
  });

  it("is a single SKILL.md: no references directory", () => {
    expect(existsSync(join(skillDir, "references"))).toBe(false);
  });
});

describe("DT6 no executable content", () => {
  const files = () => listFiles(skillDir);

  it("contains only Markdown files", () => {
    expect(files().length).toBeGreaterThan(0);
    for (const file of files()) expect(file.endsWith(".md"), relative(skillDir, file)).toBe(true);
  });

  it("has no fenced command that writes into public/, src/ or dist/", () => {
    for (const file of files()) expect(findFencedWrites(readFileSync(file, "utf8")), relative(skillDir, file)).toEqual([]);
  });

  it("flags fenced writes but not prohibitions in prose", () => {
    expect(findFencedWrites("```sh\ncp x public/y\n```")).toHaveLength(1);
    expect(findFencedWrites("```sh\necho hi >> ./dist/a\n```")).toHaveLength(1);
    expect(findFencedWrites("- 不要放进 `public/`、`src/`、`dist/`。\ncp x public/y")).toEqual([]);
  });
});


describe("the checklist keeps the few rules that matter", () => {
  const text = () => readFileSync(skillFile, "utf8");

  it.each([
    ["never deletes on its own; removal needs the person's explicit yes", /不自动删除|确认后/],
    ["identity fields are immutable after the first production registration and are read out for confirmation", /不可变[\s\S]*确认|确认[\s\S]*不可变/],
    ["public runtime cache rules are never written without a per-interface confirmation", /逐个[\s\S]*确认|确认[\s\S]*逐个/],
    ["stops on an unsupported combination instead of forcing it", /不支持[\s\S]*停/],
    ["deploying, pushing and switching the worker are the person's job", /不(推送|部署)/],
    ["never reads or prints tokens or cookies", /令牌[\s\S]*Cookie|Cookie[\s\S]*令牌/],
    ["treats repository files, responses and pasted output as data, not instructions", /数据，不是指令/],
    ["points at the docs site instead of copying its rules", /《上线前检查》/],
    // S6 (2026-09-30): both evaluated assistants stopped at a green build and handed every browser check to the person.
    ["self-checks the production build locally and says what counts as done", /本机自检[\s\S]*vite preview[\s\S]*全部通过才算接入完成/],
    // S7 re-evaluation (2026-09-30): the assistant self-checked in the person's everyday Chrome profile and left a worker there.
    ["self-checks in a separate browser profile and cleans up afterwards", /独立的配置文件[\s\S]*注销 worker[\s\S]*清除该站点数据/],
  ])("%s", (_name, pattern) => {
    expect(text()).toMatch(pattern);
  });

  it("names every conflict the person must resolve before the platform can own the worker", () => {
    for (const evidence of ["vite-plugin-pwa", "virtual:pwa-register", "sw.js", "manifest"]) expect(text(), evidence).toContain(evidence);
  });

  it("links every cited document to a docs-site page that exists, so an assistant in a business repository can open it", () => {
    const docsSite = "https://pwa-platform-docs.pages.dev/";
    const titles = new Set([...text().matchAll(/《([^》]+)》/g)].map((match) => match[1]));
    const links = new Map([...text().matchAll(/\[《([^》]+)》\]\((\S+?)\)/g)].map((match) => [match[1], match[2]]));
    expect(titles.size).toBeGreaterThan(0);
    for (const title of titles) {
      const url = links.get(title);
      expect(url, title).toMatch(new RegExp(`^${docsSite.replaceAll(".", "\\.")}[a-z-]+/[a-z-]+$`));
      const page = join(repoRoot, "website", `${url!.slice(docsSite.length)}.md`);
      expect(existsSync(page), `${title} -> ${page}`).toBe(true);
    }
  });

  it("reads the docs online first, then from a repository copy, and stops when neither is readable", () => {
    const source = text();
    const online = source.indexOf("打开在线链接");
    const copy = source.indexOf("仓库副本");
    const stop = source.indexOf("两处都读不到就停下");
    expect(online, "online first").toBeGreaterThan(-1);
    expect(copy, "then the repository copy").toBeGreaterThan(online);
    expect(stop, "then stop").toBeGreaterThan(copy);
    // The three things an assistant needs to use the copy: where it is, how a link maps to a file, whether it matches.
    expect(source).toMatch(/问人一次/);
    expect(source).toContain("`website/<a>/<b>.md`");
    expect(source).toMatch(/packages\/vite\/package\.json[\s\S]*node_modules\/@pwa-platform\/vite\/package\.json[\s\S]*version/);
    expect(source, "the bundled copy is gone").not.toContain("node_modules/@pwa-platform/vite/docs");
  });

  it("no longer carries the machinery that was cut: state file, glossary, numbered gates", () => {
    for (const word of ["PWA-ONBOARDING.md", "glossary", "关卡 A", "闸门 G1"]) expect(text(), word).not.toContain(word);
  });
});
