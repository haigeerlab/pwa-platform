import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The onboarding skill ships as plain Markdown inside @pwa-platform/vite (ADR-0045): it is listed in `files`,
// never in `exports`, and must not contain anything executable or any instruction to write into build inputs.

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(packageDir, "..");
const skillDir = join(packageDir, "skills", "pwa-onboarding");
const skillFile = join(skillDir, "SKILL.md");
const referencesDir = join(skillDir, "references");
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

  it("keeps each reference within 8192 bytes (passes when references/ is absent)", () => {
    for (const file of listFiles(referencesDir)) expect(statSync(file).size, relative(skillDir, file)).toBeLessThanOrEqual(8192);
  });

  it("keeps the whole skill directory within 61440 bytes", () => {
    const total = listFiles(skillDir).reduce((sum, file) => sum + statSync(file).size, 0);
    expect(total).toBeLessThanOrEqual(61440);
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

// ---- AO5: shared rules, state file, English glossary --------------------------------------------------------------

const stateFile = join(referencesDir, "state-file.md");
const glossaryFile = join(referencesDir, "glossary-en.md");

/** Removes fenced code blocks so that example links and commands inside them are not treated as real ones. */
function withoutFences(markdown: string): string {
  const kept: string[] = [];
  let fence: string | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      const char = marker.charAt(0);
      if (fence === undefined) fence = char;
      else if (char === fence) fence = undefined;
      continue;
    }
    if (fence === undefined) kept.push(line);
  }
  return kept.join("\n");
}

/** Relative link targets (fragment removed) with the line each one is on. */
function relativeLinks(markdown: string): Array<{ target: string; line: string }> {
  const links: Array<{ target: string; line: string }> = [];
  for (const line of withoutFences(markdown).split(/\r?\n/)) {
    for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const raw = match[1] ?? "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#")) continue;
      links.push({ target: raw.split("#")[0] ?? "", line });
    }
  }
  return links;
}

function sectionOf(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) throw new Error(`Missing section: ${heading}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

describe("DT4 references and links", () => {
  const skillText = () => readFileSync(skillFile, "utf8");

  it("resolves every relative link inside the skill directory", () => {
    for (const file of listFiles(skillDir)) {
      for (const { target } of relativeLinks(readFileSync(file, "utf8"))) {
        const resolved = join(dirname(file), target);
        expect(relative(skillDir, resolved).startsWith(".."), `${relative(skillDir, file)} -> ${target} leaves the skill`).toBe(false);
        expect(existsSync(resolved), `${relative(skillDir, file)} -> ${target}`).toBe(true);
      }
    }
  });

  it("leaves no orphan reference file", () => {
    const linked = new Set<string>();
    for (const file of listFiles(skillDir)) {
      for (const { target } of relativeLinks(readFileSync(file, "utf8"))) linked.add(join(dirname(file), target));
    }
    for (const file of listFiles(referencesDir)) expect(linked.has(file), `${relative(skillDir, file)} is not linked`).toBe(true);
  });

  it("says when to read each reference (references are never read automatically)", () => {
    for (const { target, line } of relativeLinks(skillText())) {
      if (target.startsWith("references/")) expect(line, `${target}: the line must say 读取`).toContain("读取");
    }
  });
});

describe("AO5 SKILL.md structure", () => {
  it("has the start-up checks, rules, labels, confirmation gates and gate index", () => {
    const text = readFileSync(skillFile, "utf8");
    for (const heading of ["## 启动检查", "## 通用规则", "## 报告标签", "## 五个人工确认闸门", "## 关卡索引"]) {
      expect(text, heading).toContain(`\n${heading}\n`);
    }
  });

  it("names all five confirmation gates", () => {
    const section = sectionOf(readFileSync(skillFile, "utf8"), "## 五个人工确认闸门");
    for (const gate of ["G1", "G2", "G3", "G4", "G5"]) expect(section, gate).toContain(gate);
  });

  it("covers the four start-up checks: path, version, state file, language", () => {
    const section = sectionOf(readFileSync(skillFile, "utf8"), "## 启动检查");
    for (const word of ["路径自检", "版本自检", "状态文件", "语言"]) expect(section, word).toContain(word);
    expect(section).toContain("metadata.version");
  });
});

describe("DT7 language parity", () => {
  const labels = () =>
    sectionOf(readFileSync(skillFile, "utf8"), "## 报告标签")
      .split(/\r?\n/)
      .flatMap((line) => (/^- `([^`]+)`/.exec(line)?.[1] ? [/^- `([^`]+)`/.exec(line)?.[1] as string] : []));

  it("declares the four outcome labels", () => {
    const declared = labels();
    for (const outcome of ["通过", "不通过", "警告", "无法判定"]) expect(declared, outcome).toContain(outcome);
  });

  it("has an English translation for every report label", () => {
    expect(existsSync(glossaryFile), "references/glossary-en.md must exist").toBe(true);
    const rows = new Map<string, string>();
    for (const line of readFileSync(glossaryFile, "utf8").split(/\r?\n/)) {
      const cells = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
      if (cells && cells[1] !== "中文" && !/^-+$/.test(cells[1] ?? "")) rows.set(cells[1] ?? "", cells[2] ?? "");
    }
    for (const label of labels()) {
      const english = rows.get(label);
      expect(english, `no English translation for ${label}`).toBeDefined();
      expect(english, `${label} -> ${english}`).toMatch(/^[A-Za-z][A-Za-z0-9 ,'/()-]*$/);
    }
  });
});

describe("AO5 state file reference", () => {
  const allowedGateStates = ["pending", "in-progress", "done", "skipped", "blocked"];
  const example = () => {
    const text = readFileSync(stateFile, "utf8");
    const block = /```markdown\r?\n([\s\S]*?)\r?\n```/.exec(text)?.[1];
    if (!block) throw new Error("state-file.md must contain a ```markdown example");
    return block;
  };

  // Front matter of the example: top-level `key: value`, and a `gates:` block of two-space-indented `key: value`.
  function parseExample(block: string): { top: Record<string, string>; gates: Record<string, string> } {
    const lines = block.split(/\r?\n/);
    if (lines[0] !== "---") throw new Error("example must start with ---");
    const end = lines.indexOf("---", 1);
    if (end === -1) throw new Error("example front matter must end with ---");
    const top: Record<string, string> = {};
    const gates: Record<string, string> = {};
    let inGates = false;
    for (const line of lines.slice(1, end)) {
      const nested = /^ {2}"?([A-Za-z0-9]+)"?:\s*(\S+)\s*$/.exec(line);
      if (nested && inGates) {
        gates[nested[1] ?? ""] = nested[2] ?? "";
        continue;
      }
      const flat = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
      if (!flat) throw new Error(`Unsupported line in example: ${line}`);
      inGates = flat[1] === "gates";
      if (!inGates) top[flat[1] ?? ""] = (flat[2] ?? "").trim();
    }
    return { top, gates };
  }

  it("ships a valid example: keys, language, profile and one state per gate", () => {
    const { top, gates } = parseExample(example());
    expect(Object.keys(top).sort()).toEqual(["existingPwa", "language", "packageVersion", "profile", "skillVersion"]);
    expect(["zh-CN", "en"]).toContain(top["language"]);
    expect(["shell-offline-update", "shell-offline-update-runtime-cache"]).toContain(top["profile"]);
    expect(["true", "false"]).toContain(top["existingPwa"]);
    // Integer-like keys ("0"-"6") always precede "A" in a JS object, so compare as a set rather than by order.
    expect(Object.keys(gates).sort()).toEqual(["0", "1", "2", "3", "4", "5", "6", "A"]);
    for (const [gate, state] of Object.entries(gates)) expect(allowedGateStates, `gate ${gate}`).toContain(state);
  });

  it("says what the state file must never contain", () => {
    const text = readFileSync(stateFile, "utf8");
    for (const word of ["令牌", "Cookie", "响应体", "服务器配置"]) expect(text, word).toContain(word);
  });
});

// ---- AO7: gate 0 interview and gate 1 configuration ---------------------------------------------------------------

const repoRoot = join(packageDir, "..", "..");
const gate0File = join(referencesDir, "gate-0-interview.md");
const gate1File = join(referencesDir, "gate-1-configure.md");
const gate1Snippets = ["gate-1-config-file.md", "gate-1-vue.md", "gate-1-react.md"].map((name) => join(referencesDir, name));

type CodeBlock = { text: string; startLine: number };

/** Fenced code blocks of a Markdown document, each with the 1-based line its opening fence is on. */
function codeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let open: { char: string; length: number; start: number; body: string[] } | undefined;
  lines.forEach((line, index) => {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (open === undefined) {
      if (fence) open = { char: fence.charAt(0), length: fence.length, start: index + 1, body: [] };
    } else if (fence && fence.charAt(0) === open.char && fence.length >= open.length) {
      blocks.push({ text: open.body.join("\n"), startLine: open.start });
      open = undefined;
    } else {
      open.body.push(line);
    }
  });
  return blocks;
}

/** Every `<!-- 出处：path -->` marker with the code block that follows it. */
function sourcedBlocks(markdown: string): Array<{ source: string; block: string }> {
  const blocks = codeBlocks(markdown);
  const lines = markdown.split(/\r?\n/);
  const found: Array<{ source: string; block: string }> = [];
  lines.forEach((line, index) => {
    const source = /^<!-- 出处：(\S+) -->$/.exec(line.trim())?.[1];
    if (!source) return;
    const next = blocks.find((block) => block.startLine > index + 1);
    if (!next) throw new Error(`No code block after the source marker for ${source}`);
    found.push({ source, block: next.text });
  });
  return found;
}

describe("AO7 gate 0 interview", () => {
  const text = () => readFileSync(gate0File, "utf8");

  it("has the ten questions, each with a default and an effect", () => {
    const rows = new Map<string, string[]>();
    for (const line of text().split(/\r?\n/)) {
      const cells = line.split("|").map((cell) => cell.trim());
      const id = /^Q(\d+)$/.exec(cells[1] ?? "")?.[1];
      if (id) rows.set(id, cells.slice(2, -1));
    }
    expect([...rows.keys()].sort((a, b) => Number(a) - Number(b))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    for (const [id, cells] of rows) {
      expect(cells.length, `Q${id} needs question, default and effect`).toBe(3);
      for (const cell of cells) expect(cell.length, `Q${id} has an empty cell`).toBeGreaterThan(0);
    }
  });

  it("names the three places the language choice lands, and records the answers", () => {
    for (const word of ["PwaUpdateNotice", "offlinePage", "安装信息", "PWA-ONBOARDING.md"]) expect(text(), word).toContain(word);
  });

  it("stops on requests outside the supported scope (Push, offline writes)", () => {
    for (const word of ["Push", "离线写入", "停"]) expect(text(), word).toContain(word);
  });
});

describe("AO7 gate 1 configuration", () => {
  const text = () => readFileSync(gate1File, "utf8");

  it("covers the diagnostic families and who decides each", () => {
    for (const prefix of ["identity.", "install.", "vite.manifest-icon", "vite.offline-page", "compile.", "schema.", "verify."]) {
      expect(text(), prefix).toContain(prefix);
    }
  });

  it("gates identity fields (G2), asks for real icons and builds for production", () => {
    for (const word of ["G2", "真实", "图标", "生产构建", "不可变"]) expect(text(), word).toContain(word);
    // The word G2 also appears in the diagnostics table, so require it on the step that actually writes the identity.
    const identityStep = text().split(/\r?\n/).find((line) => line.startsWith("2. "));
    expect(identityStep, "the identity step must exist").toBeDefined();
    expect(identityStep, "the identity step must name the G2 gate").toContain("G2");
  });

  it("links the config-file, Vue and React snippet files and says when to read them", () => {
    const links = relativeLinks(text());
    for (const name of ["gate-1-config-file.md", "gate-1-vue.md", "gate-1-react.md"]) {
      const hit = links.find((link) => link.target.endsWith(name));
      expect(hit, name).toBeDefined();
      expect(hit?.line, `${name}: the line must say 读取`).toContain("读取");
    }
  });
});

describe("AO7 snippets stay identical to the official onboarding docs", () => {
  it("carries a source marker on every verbatim block and enough of them", () => {
    const counts = gate1Snippets.map((file) => sourcedBlocks(readFileSync(file, "utf8")).length);
    expect(counts[0], "gate-1-config-file.md").toBeGreaterThanOrEqual(1);
    expect(counts[1], "gate-1-vue.md").toBeGreaterThanOrEqual(4);
    expect(counts[2], "gate-1-react.md").toBeGreaterThanOrEqual(3);
  });

  it("matches a block in the cited document, byte for byte", () => {
    for (const file of gate1Snippets) {
      for (const { source, block } of sourcedBlocks(readFileSync(file, "utf8"))) {
        const docPath = join(repoRoot, source);
        expect(existsSync(docPath), `${source} does not exist`).toBe(true);
        const docBlocks = codeBlocks(readFileSync(docPath, "utf8")).map((candidate) => candidate.text);
        expect(docBlocks, `${relative(skillDir, file)}: block not found in ${source}`).toContain(block);
      }
    }
  });

  it("keeps the periodic update check in the default main entry snippets", () => {
    const vue = readFileSync(join(referencesDir, "gate-1-vue.md"), "utf8");
    const react = readFileSync(join(referencesDir, "gate-1-react.md"), "utf8");
    expect(vue).toContain("updateCheck: { intervalMs: 1_800_000 }");
    expect(react).toContain("updateCheck={{ intervalMs: 1_800_000 }}");
  });
});

// ---- AO9: gate 3 server requirements ------------------------------------------------------------------------------

const gate3File = join(referencesDir, "gate-3-server.md");

describe("AO9 gate 3 server requirements", () => {
  const text = () => readFileSync(gate3File, "utf8");

  it("lists S1-S9 with the stale-while-revalidate addition, each with a consequence and a check", () => {
    const rows = new Map<string, string[]>();
    for (const line of text().split(/\r?\n/)) {
      const cells = line.split("|").map((cell) => cell.trim());
      const id = /^(S\d+(?:-[A-Z]+)?)$/.exec(cells[1] ?? "")?.[1];
      if (id) rows.set(id, cells.slice(2, -1));
    }
    expect([...rows.keys()].sort()).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S9-SWR"]);
    for (const [id, cells] of rows) {
      expect(cells.length, `${id} needs resource, must-include, must-not-include, consequence and check`).toBe(5);
      expect(cells[3]?.length, `${id} has no consequence`).toBeGreaterThan(0);
      expect(cells[4]?.length, `${id} has no check`).toBeGreaterThan(0);
    }
  });

  it("says the source of the rules and that it does not add rules of its own", () => {
    for (const word of ["部署与发布", "build-verifier", "不另立规则"]) expect(text(), word).toContain(word);
  });

  it("explains the three ways an item is undetermined and never counts it as a pass", () => {
    for (const word of ["路径尚不存在", "历史部署", "随时间变化", "无法判定"]) expect(text(), word).toContain(word);
    expect(text()).toContain("不算通过");
  });

  it("checks read-only with curl, without keeping bodies or cookies, and only for the business team's own domain", () => {
    for (const word of ["curl", "-o /dev/null", "只读", "声明属于业务方"]) expect(text(), word).toContain(word);
  });

  it("contains no nginx or CDN configuration samples (server-agnostic requirements only)", () => {
    for (const block of codeBlocks(text())) {
      expect(block.text, "a fenced block looks like server configuration").not.toMatch(
        /\b(add_header|proxy_pass|try_files|location\s+[=~^/]|server\s*\{|expires\s+\d|Header\s+set|_headers)\b/i,
      );
    }
  });
});

// ---- AO10: gate 4 browser verification -----------------------------------------------------------------------------

const gate4File = join(referencesDir, "gate-4-browser.md");

describe("AO10 gate 4 browser verification", () => {
  const text = () => readFileSync(gate4File, "utf8");
  const steps = () => text().split(/\r?\n/).filter((line) => /^\|\s*B\d+\s*\|/.test(line)).map((line) => line.split("|").map((cell) => cell.trim()));

  it("has steps B1-B8, each with an action and what a pass looks like", () => {
    const rows = steps();
    expect(rows.map((cells) => cells[1])).toEqual(["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"]);
    for (const cells of rows) {
      expect(cells.length, `${cells[1]} needs id, topic, action, expected result and where to go back`).toBe(7);
      expect(cells[3]?.length, `${cells[1]} has no action`).toBeGreaterThan(0);
      expect(cells[4]?.length, `${cells[1]} has no "通过时应看到"`).toBeGreaterThan(0);
    }
  });

  it("covers registration, offline reopen, update (installed window and several tabs), weak network and the recovery drill", () => {
    for (const word of ["activated", "controller", "离线", "独立窗口", "多个标签页", "弱网", "恢复 worker"]) expect(text(), word).toContain(word);
  });

  it("does not confuse the offline switch with a weak network", () => {
    expect(text()).toMatch(/弱网[^\n]*(不同于|不等于|区别)[^\n]*(飞行模式|Offline)|(飞行模式|Offline)[^\n]*(不同于|不等于|区别)[^\n]*弱网/);
  });

  it("names its sources by reference instead of copying them", () => {
    for (const word of ["上线前检查", "恢复演练"]) expect(text(), word).toContain(word);
  });

  it("triggers G4 and records device, browser and version", () => {
    for (const word of ["G4", "设备", "浏览器", "版本"]) expect(text(), word).toContain(word);
  });

  it("stops at the first failed required step and never counts an unrun step as passed", () => {
    expect(text()).toContain("停止条件");
    expect(text()).toContain("没做的步骤");
  });
});

// ---- AO11: gate 5 release gate and gate 6 troubleshooting -------------------------------------------------------------

const gate5File = join(referencesDir, "gate-5-release.md");
const gate6File = join(referencesDir, "gate-6-troubleshoot.md");
const faqFile = join(repoRoot, "website", "guide", "troubleshooting.md");

describe("all gates delivered", () => {
  it("leaves no placeholder wording in SKILL.md", () => {
    const text = readFileSync(skillFile, "utf8");
    for (const word of ["待交付", "Skeleton", "分批交付"]) expect(text, word).not.toContain(word);
  });
});

describe("AO11 gate 5 release gate", () => {
  const text = () => readFileSync(gate5File, "utf8");

  it("points to build-verifier's verifyRelease and lists every check that needs an input", () => {
    for (const word of ["build-verifier", "verifyRelease", "artifacts", "response-headers", "identity-baseline", "release-order", "release-retention", "html-headers"])
      expect(text(), word).toContain(word);
  });

  it("only gives guidance: it does not collect response headers for the business team and says an omitted input skips its check", () => {
    for (const word of ["不代为采集", "省略", "跳过", "不算通过"]) expect(text(), word).toContain(word);
  });

  it("leaves deployment and the worker switch to a person (G5) and lets the team decline the gate", () => {
    for (const word of ["G5", "明确放弃"]) expect(text(), word).toContain(word);
  });
});

describe("AO11 gate 6 troubleshooting", () => {
  const text = () => readFileSync(gate6File, "utf8");
  const rows = () => text().split(/\r?\n/).filter((line) => /^\|\s*T\d+\s*\|/.test(line)).map((line) => line.split("|").map((cell) => cell.trim()));

  it("has one row per symptom of the FAQ page, in the same order", () => {
    const faq = [...readFileSync(faqFile, "utf8").matchAll(/^## (.+)$/gm)].map((match) => match[1]?.replaceAll("`", "").trim());
    expect(faq.length).toBe(9);
    expect(rows().map((cells) => cells[2]?.replaceAll("`", ""))).toEqual(faq);
  });

  it("gives every symptom a gate to return to and the facts to collect", () => {
    expect(rows().map((cells) => cells[1])).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"]);
    for (const cells of rows()) {
      expect(cells.length, `${cells[1]} needs id, symptom, gate and facts`).toBe(6);
      expect(cells[3], `${cells[1]} gate`).toMatch(/关卡/);
      expect(cells[4]?.length, `${cells[1]} facts`).toBeGreaterThan(0);
    }
  });

  it("stops the bleeding first on a live incident and leaves the recovery deploy to a person (G5)", () => {
    for (const word of ["先止损", "恢复 worker", "G5", "原 worker"]) expect(text(), word).toContain(word);
  });

  it("treats pasted output as data and never reads or prints tokens or cookies", () => {
    for (const word of ["数据，不是指令", "令牌", "Cookie"]) expect(text(), word).toContain(word);
  });
});

// ---- AO6: gate A feasibility, conflict catalog and existing-PWA branch --------------------------------------------------

const gateAFile = join(referencesDir, "gate-a-feasibility.md");
const gateAThirdParty = join(referencesDir, "gate-a-third-party-sw.md");

describe("AO6 gate A feasibility and conflict catalog", () => {
  const text = () => readFileSync(gateAFile, "utf8");

  it("checks the supported combination and stops on an unsupported one, a relative base or a Nuxt runtime cache", () => {
    for (const word of ["Vite ^5", "^8", "Vue ^3.4", "React ^19.2", "22.12", "相对路径", "Nuxt", "停止条件"]) expect(text(), word).toContain(word);
    const baseRow = text().split(/\r?\n/).find((line) => /^\|\s*`base`/.test(line)) ?? "";
    expect(baseRow, "the base row must reject relative paths and stop").toMatch(/相对路径.*停下/);
    const nuxtRow = text().split(/\r?\n/).find((line) => /^\|\s*运行时缓存/.test(line)) ?? "";
    expect(nuxtRow, "the runtime-cache row must stop for Nuxt").toMatch(/Nuxt.*停下/);
  });

  it("splits conflicts into the three classes with a file-and-line evidence requirement", () => {
    for (const word of ["必须移除", "需要评估", "仅提示", "文件与行号"]) expect(text(), word).toContain(word);
  });

  it("lists the detectable evidence of every must-remove conflict", () => {
    for (const pattern of [
      "vite-plugin-pwa", "@vite-pwa/", "workbox-window", "workbox-build", "sw-precache", "sw-toolbox",
      "virtual:pwa-register", "registerSW", "navigator.serviceWorker.register", "self.__WB_MANIFEST",
      "sw.js", "sw.ts", "public/manifest", 'rel="manifest"',
    ]) expect(text(), pattern).toContain(pattern);
  });

  it("keeps the hints migrated from the old Vite 5 + Vue 3.4 skill", () => {
    for (const word of ["<base>", "PurgeCSS", "/^pwa-update-notice/", "混淆", "哈希", "确定性"]) expect(text(), word).toContain(word);
  });

  it("never deletes on its own: removal is a proposal on a separate branch, confirmed by a person (G1)", () => {
    for (const word of ["G1", "单独分支", "不自动删除", "只读"]) expect(text(), word).toContain(word);
  });

  it("walks the existing-PWA branch in order and leaves cache cleanup and the worker switch to a person (G5)", () => {
    const section = text().slice(text().indexOf("## 存量 PWA"));
    expect(section.length).toBeGreaterThan(0);
    const order = ["先记录", "身份字段", "不会自动清理旧缓存", "所有受控标签页关闭", "停下点"];
    let last = -1;
    for (const word of order) {
      const at = section.indexOf(word);
      expect(at, word).toBeGreaterThan(last);
      last = at;
    }
    for (const word of ["G5", "G2", "清理旧缓存", "切换 worker"]) expect(section, word).toContain(word);
  });

  it("points at the third-party service worker reference", () => {
    expect(text()).toContain("gate-a-third-party-sw.md");
  });
});

describe("AO6 third-party service worker scope rules", () => {
  const text = () => readFileSync(gateAThirdParty, "utf8");

  it("judges by scope overlap with the longest-prefix rule, not by equality", () => {
    for (const word of ["最长前缀", "相等", "子路径", "互不为前缀", "无法判定"]) expect(text(), word).toContain(word);
  });

  it("covers the seven push SDKs and marks what is unverified", () => {
    for (const sdk of ["Firebase", "OneSignal", "Braze", "Pusher Beams", "CleverTap", "MoEngage", "Airship"]) expect(text(), sdk).toContain(sdk);
    expect(text()).toContain("未核实");
    for (const file of ["firebase-messaging-sw.js", "OneSignalSDKWorker.js", "clevertap_sw.js", "push-worker.js"]) expect(text(), file).toContain(file);
  });

  it("lists the situations that cannot be decided statically and hands them to a person", () => {
    for (const word of ["环境变量", "Service-Worker-Allowed", "标签管理器", "无末尾斜杠", "交给人"]) expect(text(), word).toContain(word);
  });
});

// ---- AO8: gate 2 public/private classification --------------------------------------------------------------------------

const gate2File = join(referencesDir, "gate-2-classification.md");

describe("AO8 gate 2 classification gate", () => {
  const text = () => readFileSync(gate2File, "utf8");

  it("writes no rule by default and only after a person confirms each interface (G3)", () => {
    for (const word of ["默认一条都不写", "逐个", "G3", "明确", "状态文件"]) expect(text(), word).toContain(word);
  });

  it("does not accept a blanket yes or a guess from the interface name", () => {
    expect(text()).toMatch(/全部|统一|都缓存/);
    expect(text()).toContain("不能凭名字");
  });

  it("lists what the platform never caches, and what Set-Cookie, Authorization and Vary mean for admission", () => {
    for (const word of ["私有数据", "写请求", "流媒体", "未分类", "Set-Cookie", "Authorization", "Vary"]) expect(text(), word).toContain(word);
  });

  it("refers to the public read cache page and does not copy its admission list", () => {
    expect(text()).toContain("公共读取缓存");
    expect(text()).not.toContain("maxEntryBytes 为");
  });

  it("names only the two runtime classes and strategies that exist, and hands unsupported combinations to the build diagnostics", () => {
    for (const word of ["public-data", "navigation-public-dynamic", "network-first", "stale-while-revalidate"]) expect(text(), word).toContain(word);
    for (const code of ["compile.runtime-strategy-unsupported", "compile.runtime-cache-unused"]) {
      expect(text(), code).toContain(code);
      const hits = execFileSync("grep", ["-rl", code, ...["core", "contracts", "vite"].map((name) => join(packagesDir, name, "src"))], { encoding: "utf8" });
      expect(hits.trim().length, `${code} is no longer a real diagnostic code`).toBeGreaterThan(0);
    }
  });

  it("asks for the three limits instead of assuming defaults, and stops for Nuxt or an interface it cannot confirm", () => {
    for (const word of ["maxEntries", "maxEntryBytes", "maxAgeSeconds", "没有默认值", "Nuxt", "无法确认"]) expect(text(), word).toContain(word);
  });

  it("is skipped, and says so in the state file, when Q9 was answered no", () => {
    expect(text()).toContain("skipped");
    expect(text()).toContain("Q9");
  });
});

// ---- Checkpoint A read-through fixes --------------------------------------------------------------------------------------

describe("checkpoint A read-through fixes", () => {
  const read = (name: string) => readFileSync(join(referencesDir, name), "utf8");

  it("SKILL.md gives the gate order, marks gate 2 as conditional, gate 5 as optional and gate 6 as a loop", () => {
    const text = readFileSync(skillFile, "utf8");
    const section = sectionOf(text, "## 流程");
    expect(section.length).toBeGreaterThan(0);
    expect(section).toMatch(/A\s*→\s*0\s*→\s*1\s*→\s*2\s*→\s*3\s*→\s*4\s*→\s*5\s*→\s*6/);
    for (const word of ["Q9", "可选", "循环"]) expect(section, word).toContain(word);
    expect(text.indexOf("## 流程")).toBeLessThan(text.indexOf("## 关卡索引"));
  });

  it("gate 1 config file handles Q6 = no: no manifest and the policy stops offering install", () => {
    const text = read("gate-1-config-file.md");
    expect(text).toContain("Q6");
    expect(text).toContain("install: null");
    expect(text).toContain("install: { enabled: false }");
  });

  it("gate 3 has the person declare the domain first and records it in the state file", () => {
    const gate3 = read("gate-3-server.md");
    const before = gate3.slice(0, gate3.indexOf("```bash"));
    expect(before).toContain("声明");
    expect(before).toContain("状态文件");
    expect(sectionOf(gate3, "## 先确认域名"), "no record, no request").toMatch(/没有这条记录.*不发任何请求/);
    expect(read("state-file.md")).toContain("域名");
  });

  it("gate 3 no longer talks to maintainers about tests", () => {
    expect(read("gate-3-server.md")).not.toContain("测试把");
  });

  it("the English glossary translates the conflict classes, the stop point and 'cannot confirm'", () => {
    const text = read("glossary-en.md");
    for (const term of ["必须移除", "需要评估", "仅提示", "停下点", "无法确认"]) expect(text, term).toContain(term);
  });
});
