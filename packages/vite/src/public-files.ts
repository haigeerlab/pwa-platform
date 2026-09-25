// The one module in this package that touches the file system.
//
// Vite copies `publicDir` into the output directory verbatim at write time: those files never enter the bundle,
// never pass through a plugin hook, and are therefore invisible to `generateBundle`. They are still published, and
// apps routinely put icons, robots.txt and an offline page there. Leaving them out of the file manifest would make
// the plan describe a smaller build than the one that ships — and the release check would then report every one of
// them as a missing artifact.
//
// So the bundle alone is not the whole truth about a build, and this module reads the rest of it. Everything else
// in the package stays a pure function of what it is handed; the import guard pins `node:fs` to this file.
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, sep } from "node:path";

export type PwaPublicFile = {
  /** POSIX path relative to the public directory, matching how bundle entries name themselves. */
  readonly path: string;
  readonly content: Uint8Array;
};

/**
 * Reads every file under `publicDir`, recursively.
 *
 * Returns nothing when the directory is disabled (`publicDir` resolves to an empty string), when copying is turned
 * off (`build.copyPublicDir === false`), or when the directory simply is not there — in all three cases Vite
 * publishes nothing from it, so neither should the manifest claim it did.
 */
export function readPublicFiles(publicDir: string, copyPublicDir: boolean): readonly PwaPublicFile[] {
  // The `publicDir === ""` half is deliberately redundant: an empty path would make `readdirSync` throw ENOENT,
  // which `collect` already swallows into an empty result. Keeping it explicit means the disabled case does not
  // rest on a system call happening to fail in the right way, and costs nothing. A mutation that drops this half
  // therefore survives — it is equivalent, not a gap in the tests.
  if (publicDir === "" || !copyPublicDir) return [];

  const files: PwaPublicFile[] = [];
  collect(publicDir, "", files);
  return files;
}

function collect(directory: string, prefix: string, into: PwaPublicFile[]): void {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    // A missing public directory is the common case for apps that have none; anything else (permissions, a file
    // where the directory should be) is reported by Vite itself when it tries to copy. Guessing here would turn a
    // plain "no public directory" into a build failure.
    return;
  }

  for (const entry of entries) {
    const full = join(directory, entry.name);
    // Paths are joined with POSIX separators regardless of platform: they become URLs further down, and a
    // backslash from a Windows build would produce a path no browser ever requests.
    const relative = prefix === "" ? entry.name : posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      collect(full, relative, into);
    } else if (entry.isFile()) {
      into.push({ path: relative.split(sep).join(posix.sep), content: readFileSync(full) });
    }
  }
}
