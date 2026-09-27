import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const INSTALL_ICON_PATHS = [
  "icons/192.png",
  "icons/192-maskable.png",
  "icons/512.png",
  "icons/512-maskable.png",
] as const;

/** Writes the real browser fixture icons into a temporary Vite app's public directory. */
export function writeInstallIconFixture(root: string): void {
  for (const path of INSTALL_ICON_PATHS) {
    const name = path.slice("icons/".length);
    const source = fileURLToPath(new URL(`../browser-tests/app/public/icons/${name}`, import.meta.url));
    const target = join(root, "public", path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}
