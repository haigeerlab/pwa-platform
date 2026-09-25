import type { AbsolutePath, PwaDiagnostic, PwaIdentity } from "@pwa-platform/contracts";
import type { PwaCompileHostOutput, PwaHostBuildFile } from "./input.js";
import { diagnostic } from "./internal/diagnostics.js";
import type { InputField } from "./internal/diagnostics.js";
import { decodedPathKey } from "./internal/path-key.js";
import { isCanonicalPath, isRelativeFilePath } from "./internal/paths.js";
import { hasExactKeys } from "./internal/shape.js";

const HOST_FIELDS = ["publicPath", "serviceWorkerFile", "manifestFile", "files"] as const;
const FILE_FIELDS = ["path", "fingerprinted", "contentHash"] as const;
const CONTENT_HASH = /^[A-Za-z0-9_-]{8,128}$/;
const ACCESSOR = Symbol("accessor");

export type CheckedHostOutput = {
  readonly findings: PwaDiagnostic[];
  /** A fresh copy of the manifest, present only when `findings` is empty. */
  readonly output: PwaCompileHostOutput | undefined;
};

/**
 * Validates the host build output manifest against the identity (when it is valid) and returns a
 * snapshot, so later compilation steps never read the caller's objects again.
 */
export function checkHostOutput(
  value: unknown,
  identity: Pick<PwaIdentity, "scope" | "serviceWorkerUrl" | "manifestUrl"> | undefined,
): CheckedHostOutput {
  const invalid = (...segments: (InputField | number)[]): PwaDiagnostic =>
    diagnostic("compile.invalid-host-output", ["hostBuildOutput", ...segments]);

  if (!hasExactKeys(value, HOST_FIELDS)) return { findings: [invalid()], output: undefined };

  const findings: PwaDiagnostic[] = [];
  const { publicPath, serviceWorkerFile, manifestFile, files } = value;

  const publicPathValid = typeof publicPath === "string" && isCanonicalPath(publicPath) && publicPath.endsWith("/");
  const publicPathInScope = publicPathValid && (identity === undefined || publicPath.startsWith(identity.scope));
  if (!publicPathValid) {
    findings.push(invalid("publicPath"));
  } else if (!publicPathInScope) {
    findings.push(diagnostic("compile.public-path-outside-scope", ["hostBuildOutput", "publicPath"]));
  }

  // The worker and the manifest must be the very files the identity registers and links. A public
  // path outside the scope is already reported, so their URLs are only compared when it is in scope.
  const artifacts = [
    ["serviceWorkerFile", serviceWorkerFile, identity?.serviceWorkerUrl],
    ["manifestFile", manifestFile, identity?.manifestUrl],
  ] as const;
  for (const [field, fileName, identityUrl] of artifacts) {
    if (typeof fileName !== "string" || !isRelativeFilePath(fileName) || !isCanonicalPath(`/${fileName}`)) {
      findings.push(invalid(field));
    } else if (
      publicPathInScope &&
      identityUrl !== undefined &&
      decodedPathKey(`${publicPath}${fileName}`) !== decodedPathKey(identityUrl)
    ) {
      findings.push(invalid(field));
    }
  }

  const elements = denseArrayElements(files);
  if (elements === undefined) {
    findings.push(invalid("files"));
    return { findings, output: undefined };
  }

  const seenKeys = new Set<string>();
  const checkedFiles: PwaHostBuildFile[] = [];
  elements.forEach((element, index) => {
    if (element === ACCESSOR || !hasExactKeys(element, FILE_FIELDS)) {
      findings.push(invalid("files", index));
      return;
    }
    const { path, fingerprinted, contentHash } = element;
    // A file path must stay URL-canonical once served, and unique however it is spelled.
    const key = typeof path === "string" ? decodedPathKey(`/${path}`) : undefined;
    const pathValid =
      typeof path === "string" && isRelativeFilePath(path) && isCanonicalPath(`/${path}`) && !seenKeys.has(key ?? "");
    if (key !== undefined) seenKeys.add(key);
    if (!pathValid) findings.push(invalid("files", index, "path"));
    if (typeof fingerprinted !== "boolean") findings.push(invalid("files", index, "fingerprinted"));
    const contentHashValid = typeof contentHash === "string" && CONTENT_HASH.test(contentHash);
    if (!contentHashValid) findings.push(invalid("files", index, "contentHash"));
    if (pathValid && typeof fingerprinted === "boolean" && contentHashValid) {
      checkedFiles.push({ path, fingerprinted, contentHash });
    }
  });

  if (findings.length > 0) return { findings, output: undefined };
  return {
    findings,
    output: {
      publicPath: publicPath as AbsolutePath,
      serviceWorkerFile: serviceWorkerFile as string,
      manifestFile: manifestFile as string,
      files: checkedFiles,
    },
  };
}

/** Elements of a dense plain array read through property descriptors; `undefined` for anything else. */
function denseArrayElements(value: unknown): (unknown | typeof ACCESSOR)[] | undefined {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
  // Own keys are the indices plus `length`: holes or extra properties change the count.
  if (Reflect.ownKeys(value).length !== value.length + 1) return undefined;
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : ACCESSOR;
  });
}
