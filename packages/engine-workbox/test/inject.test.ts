import { validatePlan, type PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { injectPrecacheManifest, WORKBOX_INJECTION_POINT } from "../src/build/index.js";

function readPlan(): PwaPlan {
  const location = decodeURIComponent(new URL("./fixtures/storefront.plan.json", import.meta.url).pathname);
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return JSON.parse(text) as PwaPlan;
}

function withPrecache(plan: PwaPlan, precache: PwaPlan["precache"]): PwaPlan {
  return { ...plan, precache };
}

/** Evaluates the injected worker source's manifest expression, proving the output is valid JavaScript. */
function evaluateManifest(injected: string): unknown {
  const body = injected.replace(/^const manifest = /, "return ").replace(/;\nexport \{ manifest \};\n$/, ";");
  return new Function(body)() as unknown;
}

const SOURCE = `const manifest = ${WORKBOX_INJECTION_POINT};\nexport { manifest };\n`;

describe("injectPrecacheManifest", () => {
  const plan = readPlan();

  it("uses a fixture plan that contracts accept", () => {
    expect(validatePlan(plan).ok).toBe(true);
    expect(WORKBOX_INJECTION_POINT).toBe("self.__WB_MANIFEST");
  });

  it("replaces the injection point with the plan's precache entries in plan order", () => {
    expect(injectPrecacheManifest(SOURCE, plan)).toBe(
      'const manifest = [{"url":"/app/assets/app.3f9a2c7d.js","revision":null},' +
        '{"url":"/app/assets/logo.svg","revision":"a1b2c3d4e5f60718"},' +
        '{"url":"/app/offline.html","revision":"7d793037a0760186"}];\nexport { manifest };\n',
    );
  });

  it("produces a manifest equal to plan.precache, keeping null revisions", () => {
    expect(evaluateManifest(injectPrecacheManifest(SOURCE, plan))).toEqual(plan.precache);
  });

  it("leaves the rest of the source byte for byte unchanged, including replacement patterns", () => {
    const prefix = "// '$&' and \"$1\" and $$ stay literal\nconst before = 1;\n";
    const suffix = ";\nconst after = '$`';\n";
    const injected = injectPrecacheManifest(`${prefix}${WORKBOX_INJECTION_POINT}${suffix}`, plan);
    expect(injected.startsWith(prefix)).toBe(true);
    expect(injected.endsWith(suffix)).toBe(true);
  });

  it("fails unless the injection point occurs exactly once, counting comments", () => {
    expect(() => injectPrecacheManifest("const manifest = [];\n", plan)).toThrow(/exactly one self\.__WB_MANIFEST .*found 0/);
    expect(() =>
      injectPrecacheManifest(`// uses ${WORKBOX_INJECTION_POINT}\nconst manifest = ${WORKBOX_INJECTION_POINT};\n`, plan),
    ).toThrow(/found 2/);
  });

  it("keeps special characters safe for JavaScript and equal after evaluation", () => {
    const special = withPrecache(plan, [
      { url: "/app/assets/caf%C3%A9%20menu.js", revision: null },
      { url: "/app/assets/notes.txt", revision: 'r e v"</script>\\\u2028\u2029' },
    ]);
    expect(validatePlan(special).ok).toBe(true);
    const injected = injectPrecacheManifest(SOURCE, special);
    // U+2028 and U+2029 end lines in JavaScript before ES2019; the output keeps them only inside a string literal.
    expect(injected).toContain("\u2028\u2029");
    expect(evaluateManifest(injected)).toEqual(special.precache);
  });

  it("rejects precache entries that contracts accept but the worker engine would reject, without echoing them", () => {
    const secret = "tok_do_not_echo";
    const emptyRevision = withPrecache(plan, [plan.precache[0]!, { url: `/app/assets/${secret}.js`, revision: "" }]);
    const duplicate = withPrecache(plan, [plan.precache[2]!, { url: plan.precache[2]!.url, revision: secret }]);
    expect(validatePlan(emptyRevision).ok).toBe(true);
    expect(validatePlan(duplicate).ok).toBe(true);

    const messages = [emptyRevision, duplicate].map((candidate) => {
      try {
        injectPrecacheManifest(SOURCE, candidate);
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      return "";
    });
    expect(messages).toEqual([
      "Cannot inject a precache manifest the worker engine would reject: /precache/1/revision must be null or a non-empty string",
      "Cannot inject a precache manifest the worker engine would reject: /precache/1/url duplicates an earlier entry",
    ]);
    for (const message of messages) expect(message).not.toContain(secret);
  });

  it("rejects an invalid plan with diagnostic codes and paths but without echoing its values", () => {
    const secret = "tok_do_not_echo";
    const invalid = { ...plan, identity: { ...plan.identity, appId: `${secret} ` } } as unknown as PwaPlan;
    let message = "";
    try {
      injectPrecacheManifest(SOURCE, invalid);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/^Cannot inject an invalid PwaPlan: /);
    expect(message).toMatch(/plan\.cache-namespace-mismatch at \/cacheNamespace\/prefix/);
    expect(message).not.toContain(secret);
  });

  it("rejects a worker source that is not a string", () => {
    expect(() => injectPrecacheManifest(undefined as unknown as string, plan)).toThrow(TypeError);
  });

  it("is deterministic and independent of the key order of precache entries", () => {
    const reordered = withPrecache(
      plan,
      plan.precache.map(({ url, revision }) => ({ revision, url }) as unknown as PwaPlan["precache"][number]),
    );
    const first = injectPrecacheManifest(SOURCE, plan);
    expect(injectPrecacheManifest(SOURCE, plan)).toBe(first);
    expect(injectPrecacheManifest(SOURCE, reordered)).toBe(first);
  });
});
