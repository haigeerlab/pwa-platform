import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";
import type { PwaInstallMetadata, PwaPolicy } from "@pwa-platform/contracts";
import { pwa, type PwaViteOfflinePageOptions } from "../src/index.js";
import {
  APP_ROOT,
  APP_SHELL_CSS,
  BUILD_ROOT,
  EN_HEADING_OVERRIDE,
  INSTALL_WITH_EXTENSIONS,
  MANIFEST_EXT_PUBLIC,
  IDENTITY,
  INSTALL,
  POLICY,
  POLICY_WITH_DEFAULT_OFFLINE,
  SHELL_URL,
  SITE_MANIFEST_EXT_OUT,
  SITE_OFFLINE_EN_OUT,
  SITE_OFFLINE_ZH_OUT,
  SITE_V1_OUT,
  SITE_V2_OUT,
} from "./fixture-site.js";
import sharedOriginGlobalSetup from "./shared-origin-global-setup.js";

/**
 * Builds the fixture application twice with the plugin, producing the two deployed versions the specs serve.
 *
 * Nothing here is placed by hand. sw-runtime's and client-runtime's fixtures hand-assemble a site and bundle a
 * worker into it, because a worker is all they own. This module owns the build, so what the browser registers must
 * be what the plugin wrote — otherwise the tests would be checking a site this file assembled.
 */
export default async function globalSetup(): Promise<void> {
  await rm(BUILD_ROOT, { recursive: true, force: true });

  await buildVersion(SITE_V1_OUT);

  // v2 differs in the app shell's content, so its asset hash changes and the browser sees a genuinely new worker:
  // the precache manifest injected into it lists a different URL. Editing the source and restoring it afterwards
  // keeps one application in the repository rather than two that must be kept in step.
  const original = await readFile(APP_SHELL_CSS, "utf8");
  try {
    await writeFile(APP_SHELL_CSS, original.replace('content: " v1"', 'content: " v2"'), "utf8");
    await buildVersion(SITE_V2_OUT);
  } finally {
    await writeFile(APP_SHELL_CSS, original, "utf8");
  }

  // The default offline page: built-in zh-CN copy, and en with one message overridden.
  await buildVersion(SITE_OFFLINE_ZH_OUT, { policy: POLICY_WITH_DEFAULT_OFFLINE, offlinePage: {} });
  await buildVersion(SITE_OFFLINE_EN_OUT, {
    policy: POLICY_WITH_DEFAULT_OFFLINE,
    offlinePage: { locale: "en", messages: { heading: EN_HEADING_OVERRIDE } },
  });

  // Manifest extension members: a public-directory copy that also holds the screenshot and shortcut icon.
  await cp(join(APP_ROOT, "public"), MANIFEST_EXT_PUBLIC, { recursive: true });
  await mkdir(join(MANIFEST_EXT_PUBLIC, "screenshots"), { recursive: true });
  await cp(join(APP_ROOT, "public/icons/512.png"), join(MANIFEST_EXT_PUBLIC, "screenshots/wide.png"));
  await cp(join(APP_ROOT, "public/icons/192.png"), join(MANIFEST_EXT_PUBLIC, "icons/new.png"));
  await buildVersion(SITE_MANIFEST_EXT_OUT, { install: INSTALL_WITH_EXTENSIONS, publicDir: MANIFEST_EXT_PUBLIC });

  // T7's shared-origin fixture (root + child app on one origin): a separate site tree, built independently of the
  // standalone fixture above so neither can affect the other's output.
  await sharedOriginGlobalSetup();
}

type BuildVariant = {
  readonly policy?: PwaPolicy;
  readonly offlinePage?: PwaViteOfflinePageOptions;
  readonly install?: PwaInstallMetadata;
  readonly publicDir?: string;
};

async function buildVersion(outDir: string, variant: BuildVariant = {}): Promise<void> {
  await build({
    configFile: false,
    root: APP_ROOT,
    // The identity's scope; the fixture server serves the site root, so the app lives under /app/.
    base: SHELL_URL,
    envDir: false,
    ...(variant.publicDir === undefined ? {} : { publicDir: variant.publicDir }),
    logLevel: "error",
    build: {
      outDir,
      emptyOutDir: true,
      // Unminified so a failing test can be read, and so the injected manifest is legible in the output.
      minify: false,
      sourcemap: false,
    },
    plugins: [
      pwa({
        identity: IDENTITY,
        policy: variant.policy ?? POLICY,
        install: variant.install ?? INSTALL,
        topology: { kind: "standalone-origin" },
        ...(variant.offlinePage === undefined ? {} : { offlinePage: variant.offlinePage }),
      }),
    ],
  });
}
