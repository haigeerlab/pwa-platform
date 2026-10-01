import type {
  AbsolutePath,
  PwaIdentity,
  PwaPortableIdentity,
  PwaInstallMetadata,
  PwaPolicy,
  PwaTopology,
  PwaPortableTopology,
} from "@pwa-platform/contracts";

export type PwaHostBuildFile = {
  /** POSIX path relative to the build output directory. */
  readonly path: string;
  /** Whether the file name already carries a content fingerprint. */
  readonly fingerprinted: boolean;
  /** Host-computed content hash: 8–128 URL-safe characters. */
  readonly contentHash: string;
};

export type PwaCompileHostOutput = {
  /** Absolute URL path ending with `/`, under which build files are served. */
  readonly publicPath: AbsolutePath;
  readonly serviceWorkerFile: string;
  readonly manifestFile: string;
  readonly files: readonly PwaHostBuildFile[];
};

/** Typed for callers; `compilePlan` still validates every field at runtime. */
type PwaCompileFields = {
  readonly install: PwaInstallMetadata | null;
  readonly policy: PwaPolicy;
  readonly hostBuildOutput: PwaCompileHostOutput;
};

export type PwaFixedCompileInput = PwaCompileFields & {
  readonly deployment?: { readonly kind: "fixed" }; readonly identity: PwaIdentity; readonly topology: PwaTopology;
};
export type PwaPortableCompileInput = PwaCompileFields & {
  readonly deployment: { readonly kind: "portable" }; readonly identity: PwaPortableIdentity; readonly topology: PwaPortableTopology;
};
export type PwaCompileInput = PwaFixedCompileInput | PwaPortableCompileInput;
