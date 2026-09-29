import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOnboardingFixture } from "../onboarding-smoke/build-fixture.js";
import { POINTER_PATH, type ScenarioPointer } from "./pointer.js";

const F1 = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "f1-clean-vue");

/** Installs the clean Vue fixture once, from packed tarballs; the spec builds every buildable variant inside it. */
export default async function globalSetup(): Promise<void> {
  const fixture = await buildOnboardingFixture({
    templateDir: F1,
    packageNames: ["contracts", "core", "engine-workbox", "build-verifier", "sw-runtime", "client-runtime", "vite", "vue"],
    dependencies: { vue: "3.5.42" },
    devDependencies: { vite: "8.3.0", "@vitejs/plugin-vue": "6.0.9", typescript: "6.0.3" },
    skipBuild: true,
  });
  const pointer: ScenarioPointer = { appDir: fixture.appDir, workDir: fixture.workDir };
  await writeFile(POINTER_PATH, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
}
