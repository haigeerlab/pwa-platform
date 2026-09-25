// Turns a finished Vite bundle into the file manifest `compilePlan` expects.
//
// This is the one place where the platform learns what a build actually produced. Everything downstream — which
// files get precached, what revision each carries, whether the release check passes — rests on this list, so it is
// read from the bundle itself rather than from the disk the bundle is about to be written to.
import { createHash } from "node:crypto";
import type { PwaIdentity } from "@pwa-platform/contracts";
import type { PwaCompileHostOutput, PwaHostBuildFile } from "@pwa-platform/core";
import type { PwaArtifactSourceFile } from "./artifacts.js";
import type { PwaPublicFile } from "./public-files.js";

/** Minimal shape of a Vite/rolldown bundle entry; only the fields this module reads are named. */
type BundleEntry =
  | { readonly type: "chunk"; readonly code: string }
  | { readonly type: "asset"; readonly source: string | Uint8Array };

export type PwaBundle = Readonly<Record<string, BundleEntry>>;

/**
 * Vite's default output names end in `-<hash>` before the extension (`assets/index-BGTT0tj4.js`), where the hash is
 * base64url. Matching that shape is what marks a file as fingerprinted, and `compilePlan` turns that flag into the
 * precache revision: fingerprinted files get `revision: null`, because their URL changes when their content does.
 *
 * Erring in the two directions costs differently. Calling a plain file fingerprinted pins it forever — the worker
 * keeps serving a stale copy because nothing about its URL ever changes. Calling a fingerprinted file plain only
 * adds a redundant revision that nobody reads.
 *
 * What makes the difference is the length, not the alphabet. Vite's hash is exactly eight base64url characters
 * (measured across this repository's own builds: `BGTT0tj4`, `D9tTKZML`, `Mefq-Q2Q`, `JYp-DHDg` …), so the run is
 * anchored at exactly eight. Two earlier attempts were both wrong in a way a matrix of real names exposed:
 * `{8,}` read `main-application.js` and `app-shell-styles.css` as fingerprinted, while excluding the dash from
 * the run missed `Mefq-Q2Q` and `JYp-DHDg`, which are genuine hashes that happen to contain one.

 */
const FINGERPRINTED = /-[A-Za-z0-9_-]{8}(?:\.[A-Za-z0-9]+)+$/;

/**
 * Turns a finished Vite bundle plus the files copied from the public directory into one file list — the input
 * `buildPwaArtifacts` takes from any host.
 *
 * Files Vite inlined (assets under `build.assetsInlineLimit`) are absent from the bundle and therefore absent here.
 * That is correct rather than a gap: an inlined asset ships inside the chunk that references it, so it is already
 * precached with that chunk, and listing it separately would make the release check look for a file that no build
 * ever emits.
 */
export function bundleSourceFiles(
  bundle: PwaBundle,
  publicFiles: readonly PwaPublicFile[] = [],
): PwaArtifactSourceFile[] {
  const files: PwaArtifactSourceFile[] = Object.entries(bundle).map(([fileName, entry]) => ({
    path: fileName,
    content: entry.type === "chunk" ? entry.code : entry.source,
  }));

  // Files copied from the public directory are published too, so the manifest has to name them. A public file
  // whose name collides with a bundle entry would be two different bytes at one URL; this says so in terms of the
  // Vite wiring, which is where the mistake is, before the generic duplicate check in `collectSourceFiles` could.
  const bundled = new Set(files.map(({ path }) => path));
  for (const file of publicFiles) {
    if (bundled.has(file.path)) {
      throw new Error(
        "A file in the public directory has the same name as a build output; one would overwrite the other. " +
          "Rename it, or let the build produce it.",
      );
    }
    // Names in the public directory are copied verbatim, so any `-<hash>` in them was written by a person, not
    // derived from the content. Treating one as fingerprinted would pin a hand-named file forever.
    files.push({ path: file.path, content: file.content, fingerprinted: false });
  }
  return files;
}

/**
 * Collects a file list into a `PwaCompileHostOutput`: hashes, fingerprint flags, and the worker and manifest file
 * names relative to `base`. This is the one place both `pwa()` and `buildPwaArtifacts` derive what they hand to
 * `compilePlan`.
 *
 * Throws when the identity's worker or manifest URL does not sit under `base`; `compilePlan` would report the same
 * thing as `compile.invalid-host-output`, but that message points at the plan, while the mistake is in the wiring.
 */
export function collectSourceFiles(
  files: readonly PwaArtifactSourceFile[],
  base: string,
  identity: PwaIdentity,
): PwaCompileHostOutput {
  if (!base.startsWith("/") || !base.endsWith("/")) {
    // Vite normalises `base` to a trailing slash, and core requires the same of publicPath. A base that is a full
    // URL (Vite allows one) cannot be a same-origin publicPath, so it is refused here rather than silently sliced.
    throw new TypeError("The pwa plugin needs a same-origin base that starts and ends with a slash");
  }

  // Silently keeping one of two files at the same path would compile a plan that does not match what ships.
  const seen = new Set<string>();
  for (const { path } of files) {
    if (seen.has(path)) {
      throw new Error("Two files in the artifact input publish the same path; each path must be unique. Rename one of them.");
    }
    seen.add(path);
  }

  return {
    publicPath: base as PwaCompileHostOutput["publicPath"],
    serviceWorkerFile: relativeTo(base, identity.serviceWorkerUrl, "serviceWorkerUrl"),
    manifestFile: relativeTo(base, identity.manifestUrl, "manifestUrl"),
    files: files.map(
      (file): PwaHostBuildFile => ({
        path: file.path,
        fingerprinted: file.fingerprinted ?? FINGERPRINTED.test(file.path),
        contentHash: resolveContentHash(file),
      }),
    ),
  };
}

/**
 * `file.contentHash` when the caller already computed one, otherwise `hashOfContent(file.content)` — exactly one
 * of the two must be present (评审第 3 项). Both or neither is a caller mistake, reported by field name only:
 * echoing `content` could print a whole file's bytes into an error message, and echoing `contentHash` would be
 * pointless since the caller already has it.
 */
function resolveContentHash(file: PwaArtifactSourceFile): string {
  const { content, contentHash } = file;
  if (content !== undefined && contentHash !== undefined) {
    throw new TypeError("A source file must set exactly one of content or contentHash, not both.");
  }
  if (contentHash !== undefined) return contentHash;
  if (content !== undefined) return hashOfContent(content);
  throw new TypeError("A source file must set exactly one of content or contentHash; neither was given.");
}

/** The two steps above, as the Vite plugin used to call them in one go; kept as the unit tests' entry point. */
export function collectHostOutput(
  bundle: PwaBundle,
  base: string,
  identity: PwaIdentity,
  publicFiles: readonly PwaPublicFile[] = [],
): PwaCompileHostOutput {
  return collectSourceFiles(bundleSourceFiles(bundle, publicFiles), base, identity);
}

/** sha256 as unpadded base64url: core accepts `[A-Za-z0-9_-]{8,128}`, so the `=` padding has to go. */
function hashOfContent(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("base64url");
}

/**
 * Strips `base` off an identity URL to get the build-relative file name.
 *
 * The result is checked by putting it back together the way core does, comparing decoded path keys rather than raw
 * strings: `%2F` and a literal slash are different URLs but could otherwise produce the same-looking file name.
 */
function relativeTo(base: string, url: string, field: string): string {
  if (!url.startsWith(base)) {
    // The prefix test above is literal, while core compares decoded keys. So a base and an identity URL that name
    // the same path with different escapes (`/app/` against `/a%70p/sw.js`) would satisfy core and fail here. That
    // is a spelling mismatch the author can fix, not a URL pointing somewhere else, and saying so is the whole
    // difference between a one-line fix and a hunt.
    const sameAfterDecoding = decodedPathKey(url).startsWith(decodedPathKey(base));
    throw new TypeError(
      sameAfterDecoding
        ? `identity.${field} and the Vite base spell the same path with different escapes; make them match`
        : `identity.${field} must sit under the Vite base for the plugin to locate it in the build`,
    );
  }

  const fileName = url.slice(base.length);
  if (fileName === "" || fileName.startsWith("/")) {
    throw new TypeError(`identity.${field} must name a file under the Vite base, not the base itself`);
  }

  // No decoded round-trip check follows: `base + fileName` is by construction the same string as `url`, so core's
  // own test — decodedPathKey(publicPath + fileName) === decodedPathKey(identityUrl) — cannot disagree with this
  // slice. An earlier version checked it anyway; a mutation proved the branch unreachable.
  return fileName;
}

// The comparison key below mirrors core's `decodedPathKey`. It is duplicated rather than imported because core
// keeps it internal, and a parity test pins the two together — the same arrangement build-verifier uses for its
// second Cache-Control parser.
const ENCODED_SLASH = "\uD800";
const UTF8_DECODER = new TextDecoder("utf-8", { ignoreBOM: true });
const UTF8_ENCODER = new TextEncoder();

/** Per-segment percent decoding, so distinct spellings can collapse into one key but never split into two. */
export function decodedPathKey(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.split(/%2f/i).map(percentDecode).join(ENCODED_SLASH))
    .join("/");
}

function percentDecode(text: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const escape = text.slice(index + 1, index + 3);
    if (text[index] === "%" && /^[0-9A-Fa-f]{2}$/.test(escape)) {
      bytes.push(Number.parseInt(escape, 16));
      index += 2;
      continue;
    }
    const character = String.fromCodePoint(text.codePointAt(index) ?? 0);
    bytes.push(...UTF8_ENCODER.encode(character));
    index += character.length - 1;
  }
  return UTF8_DECODER.decode(Uint8Array.from(bytes));
}
