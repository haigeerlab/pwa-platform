import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const keychainServices = {
  token: "PWA Platform Cloudflare Pages",
  accountId: "PWA Platform Cloudflare Pages Account ID",
};

const credentials = {
  token: process.env.CLOUDFLARE_API_TOKEN || readKeychain(keychainServices.token),
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || readKeychain(keychainServices.accountId),
};

if (!credentials.token || !credentials.accountId) {
  throw new Error(
    "Pages deployment requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment or macOS Keychain.",
  );
}

const environment = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: credentials.token,
  CLOUDFLARE_ACCOUNT_ID: credentials.accountId,
};

run(["run", "build:pages:react"]);
writeFileSync(
  "packages/examples-browser-e2e/browser-build/react/v1/_headers",
  [
    "/app/",
    "  Cache-Control: no-cache",
    "/app/index.html",
    "  Cache-Control: no-cache",
    "/app/offline.html",
    "  Cache-Control: no-cache",
    "/app/offline",
    "  Cache-Control: no-cache",
    "/app/sw.js",
    "  Cache-Control: no-cache",
    "/app/pwa-recovery-worker.js",
    "  Cache-Control: no-cache",
    "/app/manifest.webmanifest",
    "  Cache-Control: no-cache",
    "/app/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n"),
);
run([
  "exec",
  "wrangler",
  "pages",
  "deploy",
  "packages/examples-browser-e2e/browser-build/react/v1",
  "--project-name=pwa-t15-mobile-smoke",
  "--branch=main",
]);

function readKeychain(service) {
  if (process.platform !== "darwin") return undefined;

  try {
    return execFileSync("/usr/bin/security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", service, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function run(args) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, args, { env: environment, stdio: "inherit" });
  if (result.error) process.stderr.write(`Failed to run pnpm ${args.join(" ")}: ${result.error.message}\n`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
