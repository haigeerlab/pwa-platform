/** Same-origin absolute URL path. */
export type AbsolutePath = `/${string}`;

export type PwaIdentity = {
  readonly appId: string;
  readonly manifestId: string;
  readonly origin: string;
  readonly scope: AbsolutePath;
  readonly serviceWorkerUrl: AbsolutePath;
  readonly manifestUrl: AbsolutePath;
  readonly mountPath: AbsolutePath;
  /** Lowercase slug (`[a-z][a-z0-9-]*`); each environment is a separate identity. */
  readonly environment: string;
  /** Identity revision segment of the cache namespace (ADR-0008). */
  readonly cacheNamespaceSeed: string;
};

export const INSTALL_DISPLAY_MODES = [
  "standalone",
  "minimal-ui",
  "fullscreen",
  "browser",
] as const;

export type PwaDisplayMode = (typeof INSTALL_DISPLAY_MODES)[number];

export const INSTALL_ICON_PURPOSES = ["any", "maskable"] as const;

export type PwaIconPurpose = (typeof INSTALL_ICON_PURPOSES)[number];

export type PwaInstallIcon = {
  readonly src: AbsolutePath;
  /** e.g. `192x192`. */
  readonly sizes: string;
  readonly type: string;
  readonly purpose: PwaIconPurpose;
};

export const INSTALL_ORIENTATIONS = [
  "any",
  "natural",
  "portrait",
  "portrait-primary",
  "portrait-secondary",
  "landscape",
  "landscape-primary",
  "landscape-secondary",
] as const;

export type PwaOrientation = (typeof INSTALL_ORIENTATIONS)[number];

export const INSTALL_DISPLAY_OVERRIDES = [
  "window-controls-overlay",
  "fullscreen",
  "standalone",
  "minimal-ui",
  "browser",
] as const;

export type PwaDisplayOverride = (typeof INSTALL_DISPLAY_OVERRIDES)[number];

export const INSTALL_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type PwaInstallScreenshotType = (typeof INSTALL_SCREENSHOT_TYPES)[number];

export const INSTALL_SCREENSHOT_FORM_FACTORS = ["wide", "narrow"] as const;

export type PwaInstallScreenshotFormFactor = (typeof INSTALL_SCREENSHOT_FORM_FACTORS)[number];

export type PwaInstallScreenshot = {
  readonly src: AbsolutePath;
  /** Single `widthxheight` pair, e.g. `1280x800`. */
  readonly sizes: string;
  readonly type: PwaInstallScreenshotType;
  readonly formFactor?: PwaInstallScreenshotFormFactor;
  readonly label?: string;
};

export type PwaInstallShortcut = {
  readonly name: string;
  /** Must be within the identity scope. */
  readonly url: AbsolutePath;
  readonly shortName?: string;
  readonly description?: string;
  readonly icons?: readonly PwaInstallIcon[];
};

export type PwaInstallMetadata = {
  readonly startUrl: AbsolutePath;
  readonly display: PwaDisplayMode;
  readonly name: string;
  readonly shortName: string;
  readonly themeColor: string;
  readonly backgroundColor: string;
  readonly icons: readonly PwaInstallIcon[];
  readonly description?: string;
  readonly categories?: readonly string[];
  readonly orientation?: PwaOrientation;
  readonly displayOverride?: readonly PwaDisplayOverride[];
  readonly screenshots?: readonly PwaInstallScreenshot[];
  readonly shortcuts?: readonly PwaInstallShortcut[];
};
