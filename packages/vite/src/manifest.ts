// Generates the web app manifest from the compiled plan.
//
// Every field here already exists in the plan, put there by the app's own configuration. Not generating the file
// would mean asking the app to write the same name, colours and icons a second time, in a second format — and two
// copies of one fact drift apart. So the platform writes it, and the app never repeats itself.
import type {
  PwaIdentity,
  PwaInstallIcon,
  PwaInstallMetadata,
  PwaInstallScreenshot,
  PwaInstallShortcut,
  PwaPlan,
} from "@pwa-platform/contracts";

/**
 * The manifest members this platform emits, in the spelling the web app manifest uses.
 *
 * Deliberately not `Record<string, unknown>`: every member is listed so that adding one is a visible change to this
 * type rather than an object literal quietly growing a key.
 *
 * The last six members are optional and mirror `PwaInstallMetadata`'s own extension fields (contracts-foundation's
 * "修订：安装元数据的扩展字段"): `fromInstall` below emits a key only when the app wrote the matching install field,
 * so an app that writes none of them gets exactly the first nine members, byte-identical to before this revision.
 */
export type PwaWebManifest = {
  readonly id: string;
  readonly scope: string;
  readonly start_url: string;
  readonly display: string;
  readonly name: string;
  readonly short_name: string;
  readonly theme_color: string;
  readonly background_color: string;
  readonly icons: readonly PwaWebManifestIcon[];
  readonly description?: string;
  readonly categories?: readonly string[];
  readonly orientation?: string;
  readonly display_override?: readonly string[];
  readonly screenshots?: readonly PwaWebManifestScreenshot[];
  readonly shortcuts?: readonly PwaWebManifestShortcut[];
};

export type PwaWebManifestIcon = {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose: string;
};

export type PwaWebManifestScreenshot = {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly form_factor?: string;
  readonly label?: string;
};

export type PwaWebManifestShortcut = {
  readonly name: string;
  readonly short_name?: string;
  readonly description?: string;
  readonly url: string;
  readonly icons?: readonly PwaWebManifestIcon[];
};

/**
 * Builds the manifest for a plan that offers installation, or `null` when it does not.
 *
 * `null` is not an error: an app may deliberately ship without installability, and the platform then has nothing to
 * say about a manifest. The caller decides what that means for the build.
 *
 * No field is validated here. `validatePlan` has already checked that `startUrl` sits inside the scope, that the
 * 192px and 512px icons exist in both `any` and `maskable`, and that the two colours are hex — re-checking would
 * put a second set of rules next to the platform's own.
 */
export function createWebManifest(plan: PwaPlan): PwaWebManifest | null {
  const { install, identity } = plan;
  return install === null ? null : fromInstall(install, identity);
}

function fromInstall(install: PwaInstallMetadata, identity: PwaIdentity): PwaWebManifest {
  return {
    // `id` and `scope` come from the identity, not from the install metadata: they are what the browser uses to
    // decide whether this is the same installed app as last time, and the platform owns that (ADR-0004).
    id: identity.manifestId,
    scope: identity.scope,
    start_url: install.startUrl,
    display: install.display,
    name: install.name,
    short_name: install.shortName,
    theme_color: install.themeColor,
    background_color: install.backgroundColor,
    icons: install.icons.map(mapIcon),
    // Each extension field below is spread in only when the app wrote it, so an absent field never appears as an
    // `undefined`-valued key: `JSON.stringify` would drop such a key's value but not always its presence in every
    // consumer (and key order must stay deterministic regardless), so the key itself must not be constructed.
    ...(install.description !== undefined ? { description: install.description } : {}),
    ...(install.categories !== undefined ? { categories: [...install.categories] } : {}),
    ...(install.orientation !== undefined ? { orientation: install.orientation } : {}),
    ...(install.displayOverride !== undefined ? { display_override: [...install.displayOverride] } : {}),
    ...(install.screenshots !== undefined ? { screenshots: install.screenshots.map(mapScreenshot) } : {}),
    ...(install.shortcuts !== undefined ? { shortcuts: install.shortcuts.map(mapShortcut) } : {}),
  };
}

function mapIcon({ src, sizes, type, purpose }: PwaInstallIcon): PwaWebManifestIcon {
  return { src, sizes, type, purpose };
}

function mapScreenshot(screenshot: PwaInstallScreenshot): PwaWebManifestScreenshot {
  return {
    src: screenshot.src,
    sizes: screenshot.sizes,
    type: screenshot.type,
    ...(screenshot.formFactor !== undefined ? { form_factor: screenshot.formFactor } : {}),
    ...(screenshot.label !== undefined ? { label: screenshot.label } : {}),
  };
}

function mapShortcut(shortcut: PwaInstallShortcut): PwaWebManifestShortcut {
  return {
    name: shortcut.name,
    ...(shortcut.shortName !== undefined ? { short_name: shortcut.shortName } : {}),
    ...(shortcut.description !== undefined ? { description: shortcut.description } : {}),
    url: shortcut.url,
    ...(shortcut.icons !== undefined ? { icons: shortcut.icons.map(mapIcon) } : {}),
  };
}

/** Serialises the manifest for `emitFile`. Two spaces because a manifest is read by people as often as by browsers. */
export function serializeWebManifest(manifest: PwaWebManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
