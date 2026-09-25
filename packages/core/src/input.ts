import type {
  AbsolutePath,
  PwaIdentity,
  PwaInstallMetadata,
  PwaPolicy,
  PwaTopology,
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
export type PwaCompileInput = {
  readonly identity: PwaIdentity;
  readonly install: PwaInstallMetadata | null;
  readonly policy: PwaPolicy;
  readonly topology: PwaTopology;
  readonly hostBuildOutput: PwaCompileHostOutput;
};
