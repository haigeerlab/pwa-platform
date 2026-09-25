import { DIAGNOSTIC_MESSAGES } from "@pwa-platform/contracts";
import type {
  PwaContractPath,
  PwaDiagnostic,
  PwaDiagnosticCode,
  PwaDiagnosticSeverity,
  PwaWarningDiagnostic,
} from "@pwa-platform/contracts";

/** Field names of `PwaCompileInput`; diagnostic paths are built only from these and array indices. */
export type InputField =
  | "identity"
  | "install"
  | "policy"
  | "topology"
  | "hostBuildOutput"
  | "publicPath"
  | "serviceWorkerFile"
  | "manifestFile"
  | "files"
  | "path"
  | "fingerprinted"
  | "contentHash"
  | "resources"
  | "pathPrefix"
  | "cache"
  | "offlineFallback"
  | "offlineWrites"
  | "runtimeCache"
  | "targets"
  | "schemaVersion"
  | "registry"
  | "startUrl"
  | "shortcuts"
  | "url";

export function diagnostic(
  code: PwaDiagnosticCode,
  segments: readonly (InputField | number)[],
  severity: PwaDiagnosticSeverity = "error",
): PwaDiagnostic {
  const path: PwaContractPath = segments.length === 0 ? "" : `/${segments.join("/")}`;
  return { code, severity, path, message: DIAGNOSTIC_MESSAGES[code] };
}

export function warningDiagnostic(
  code: PwaDiagnosticCode,
  segments: readonly (InputField | number)[],
): PwaWarningDiagnostic {
  return { ...diagnostic(code, segments), severity: "warning" };
}

/** Re-roots a contracts diagnostic, whose path is already sanitized, under an input field. */
export function withinField<T extends PwaDiagnostic>(field: "identity" | "install" | "policy", finding: T): T {
  return { ...finding, path: `/${field}${finding.path}` };
}

/** Re-roots a contracts diagnostic, whose path is already sanitized, under a sequence of fields. */
export function withinPath<T extends PwaDiagnostic>(prefix: readonly InputField[], finding: T): T {
  const prefixPath = prefix.length === 0 ? "" : `/${prefix.join("/")}`;
  return { ...finding, path: `${prefixPath}${finding.path}` as PwaContractPath };
}
