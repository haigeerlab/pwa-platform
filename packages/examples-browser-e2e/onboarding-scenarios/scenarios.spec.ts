// The scenario fixtures behind the onboarding skill's manual evaluation (spec/ai-onboarding.md SE1-SE7): what each
// project must contain for the scenario to mean what the rubric says, and - for the buildable ones - that the skill's
// own gate-1 snippets really compile in them. The evaluation itself (an AI following the skill) is manual.
import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { POINTER_PATH, type ScenarioPointer } from "./pointer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");
const REFERENCES = join(HERE, "..", "..", "vite", "skills", "pwa-onboarding", "references");
const ICONS = join(HERE, "..", "onboarding-smoke", "template", "public", "icons");
const pointer = JSON.parse(readFileSync(POINTER_PATH, "utf8")) as ScenarioPointer;

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(full)));
    else out.push(full);
  }
  return out.sort();
}

async function projectText(name: string): Promise<string> {
  const dir = join(FIXTURES, name);
  const parts: string[] = [];
  for (const file of await files(dir)) parts.push(`--- ${relative(dir, file)}\n${await readFile(file, "utf8")}`);
  return parts.join("\n");
}

const read = (name: string, file: string): string => readFileSync(join(FIXTURES, name, file), "utf8");

/** The conflict evidence gate A lists as "must remove" (references/gate-a-feasibility.md). */
const CONFLICT_EVIDENCE = [
  "vite-plugin-pwa", "@vite-pwa/", "workbox-window", "workbox-build", "sw-precache", "sw-toolbox",
  "virtual:pwa-register", "registerSW", "navigator.serviceWorker.register", "__WB_MANIFEST", 'rel="manifest"',
];

test.describe("scenario fixtures", () => {
  for (const name of ["f1-clean-vue", "f6-english"]) {
    test(`${name} is a clean project: no PWA conflict evidence, no worker, no manifest`, async () => {
      const text = await projectText(name);
      for (const evidence of CONFLICT_EVIDENCE) expect(text, evidence).not.toContain(evidence);
      const paths = (await files(join(FIXTURES, name))).map((file) => relative(join(FIXTURES, name), file));
      expect(paths.filter((path) => /(^|\/)(sw\.(js|ts)|manifest\.[^/]+|PWA-ONBOARDING\.md)$/.test(path))).toEqual([]);
    });

    test(`${name} reads a public-looking and a private interface, so runtime caching has something to classify`, async () => {
      const api = read(name, "src/api.ts");
      expect(api).toContain("/api/catalog");
      expect(api).toContain("/api/me");
    });
  }

  test("f6 is in English and f1 in Chinese, so the language question has something to switch", async () => {
    const cjk = /[一-鿿]/;
    expect(cjk.test(read("f6-english", "src/App.vue") + read("f6-english", "index.html"))).toBe(false);
    expect(cjk.test(read("f1-clean-vue", "src/App.vue"))).toBe(true);
  });

  test("f2 has vite-plugin-pwa with virtual:pwa-register, a duplicate manifest link and workbox-window (SE2)", async () => {
    const text = await projectText("f2-vite-plugin-pwa");
    for (const evidence of ["vite-plugin-pwa", "workbox-window", "virtual:pwa-register", "registerSW", 'rel="manifest"']) expect(text, evidence).toContain(evidence);
  });

  test("f3 has a hand-written public/sw.js, a manual registration and a public manifest (SE3)", async () => {
    expect(existsSync(join(FIXTURES, "f3-custom-sw", "public", "sw.js"))).toBe(true);
    expect(existsSync(join(FIXTURES, "f3-custom-sw", "public", "manifest.webmanifest"))).toBe(true);
    expect(read("f3-custom-sw", "src/main.ts")).toContain("navigator.serviceWorker.register");
    expect(read("f3-custom-sw", "index.html")).toContain('rel="manifest"');
  });

  test("f4 is outside the supported Vite range (SE4)", async () => {
    const pkg = JSON.parse(read("f4-unsupported", "package.json")) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies.vite).toMatch(/^[\^~]?4\./);
  });

  test("f5 stopped in gate 1: a valid state file, a written config, but no plugin and no page binding (SE5)", async () => {
    const state = read("f5-half-done", "PWA-ONBOARDING.md");
    const gates = Object.fromEntries([...state.matchAll(/^ {2}"?([A0-6])"?: (\S+)$/gm)].map((match) => [match[1], match[2]]));
    expect(gates).toEqual({ A: "done", "0": "done", "1": "in-progress", "2": "skipped", "3": "pending", "4": "pending", "5": "skipped", "6": "pending" });
    expect(state).toContain("G2");
    expect(read("f5-half-done", "pwa.config.ts")).toContain("export const IDENTITY");
    expect(read("f5-half-done", "vite.config.ts")).not.toContain("pwa(");
    expect(read("f5-half-done", "src/main.ts")).not.toContain("createPwa");
  });
});

/** Fenced code blocks of a reference file, with the language tag. */
function blocks(markdown: string): Array<{ lang: string; text: string }> {
  return [...markdown.matchAll(/^```(\w+)\n([\s\S]*?)^```/gm)].map((match) => ({ lang: match[1] ?? "", text: match[2] ?? "" }));
}

/** Puts a fixture's files into the installed project, keeping its node_modules and package.json. */
async function useFixture(name: string): Promise<void> {
  for (const entry of await readdir(pointer.appDir)) {
    if (["node_modules", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"].includes(entry) || entry.startsWith("dist")) continue;
    await rm(join(pointer.appDir, entry), { recursive: true, force: true });
  }
  for (const entry of await readdir(join(FIXTURES, name))) {
    if (entry === "package.json" || entry === "README.md") continue;
    await cp(join(FIXTURES, name, entry), join(pointer.appDir, entry), { recursive: true });
  }
}

function typecheck(): { ok: boolean; output: string } {
  const result = spawnSync("pnpm", ["exec", "tsc", "--noEmit", "--project", "tsconfig.json"], { cwd: pointer.appDir, encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout}\n${result.stderr}` };
}

function viteBuild(outDir: string): { ok: boolean; output: string } {
  const result = spawnSync("pnpm", ["exec", "vite", "build", "--outDir", outDir, "--emptyOutDir"], { cwd: pointer.appDir, encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout}\n${result.stderr}` };
}

async function applySnippets(): Promise<void> {
  const config = blocks(readFileSync(join(REFERENCES, "gate-1-config-file.md"), "utf8")).find((block) => block.text.startsWith("// pwa.config.ts"));
  const vue = blocks(readFileSync(join(REFERENCES, "gate-1-vue.md"), "utf8"));
  const viteConfig = vue.find((block) => block.text.startsWith("// vite.config.ts"));
  const main = vue.find((block) => block.text.startsWith("// src/main.ts"));
  const app = vue.find((block) => block.lang === "vue" && block.text.includes("usePwa"));
  if (!config || !viteConfig || !main || !app) throw new Error("gate-1 snippets not found in the skill's reference files");
  const types = blocks(readFileSync(join(REFERENCES, "gate-1-vue.md"), "utf8")).find((block) => block.lang === "json" && block.text.includes("@pwa-platform/vite/virtual"));
  if (!types) throw new Error("the tsconfig types snippet is missing from gate-1-vue.md");
  const tsconfigPath = join(pointer.appDir, "tsconfig.json");
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as { compilerOptions: { types: string[] } };
  tsconfig.compilerOptions.types = (JSON.parse(types.text) as { compilerOptions: { types: string[] } }).compilerOptions.types;
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
  await writeFile(join(pointer.appDir, "pwa.config.ts"), config.text);
  await writeFile(join(pointer.appDir, "vite.config.ts"), viteConfig.text);
  await writeFile(join(pointer.appDir, "src", "main.ts"), main.text);
  await writeFile(join(pointer.appDir, "src", "App.vue"), app.text);
}

test.describe("buildable fixtures", () => {
  test("f1 and f3 build as they are, without the skill and without PWA packages in use", async () => {
    for (const name of ["f1-clean-vue", "f3-custom-sw", "f6-english"]) {
      await useFixture(name);
      const result = viteBuild(join(pointer.workDir, `dist-${name}`));
      expect(result.ok, `${name}:\n${result.output}`).toBe(true);
    }
  });

  test("the skill's gate-1 snippets compile in f1 and produce the worker, manifest and offline page", async () => {
    await useFixture("f1-clean-vue");
    await mkdir(join(pointer.appDir, "public"), { recursive: true });
    await cp(ICONS, join(pointer.appDir, "public", "icons"), { recursive: true });
    await applySnippets();
    // A bundler build does not check types (a misspelled function still bundles), so the snippets are also type-checked.
    const types = typecheck();
    expect(types.ok, types.output).toBe(true);
    const outDir = join(pointer.workDir, "dist-snippets");
    const result = viteBuild(outDir);
    expect(result.ok, result.output).toBe(true);
    for (const file of ["sw.js", "manifest.webmanifest", "offline.html"]) expect(existsSync(join(outDir, file)), file).toBe(true);
  });

  test("the same snippets without the icon files fail with the icon diagnostic gate 1 tells the AI to read", async () => {
    await useFixture("f1-clean-vue");
    await applySnippets();
    const result = viteBuild(join(pointer.workDir, "dist-no-icons"));
    expect(result.ok).toBe(false);
    expect(result.output).toContain("vite.manifest-icon");
  });
});
