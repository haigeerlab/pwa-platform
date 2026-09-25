// Detects and validates <link rel="manifest"> in the HTML Vite has already processed. This is not the source
// file: other transformIndexHtml hooks may have added markup, so writeBundle scans the final emitted HTML too.

/** One manifest link found in live HTML. */
export type ManifestLinkMatch = {
  readonly href: string;
};

/** What the plugin should do with a page's HTML: inject a link, or leave an already-correct one in place. */
export type ManifestLinkAction = "inject" | "keep";

// Matches a complete <link> while respecting > characters inside quoted values.
const LINK_TAG = /<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const BASE_TAG = /<base\b(?:[^>"']|"[^"]*"|'[^']*')*>/i;
const COMMENT = /<!--[\s\S]*?-->/g;
const INERT_CONTENT = /<(script|style|template|noscript|textarea)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/gi;
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Finds all manifest links in rendered HTML, excluding comments and elements whose text browsers do not parse as links. */
export function findManifestLinks(html: string): readonly ManifestLinkMatch[] {
  const matches: ManifestLinkMatch[] = [];
  for (const tag of renderedHtml(html).matchAll(LINK_TAG)) {
    const attrs = parseAttributes(tag[0]);
    if (!isManifestRel(attrs.get("rel"))) continue;
    matches.push({ href: attrs.get("href") ?? "" });
  }
  return matches;
}

/**
 * Decides whether to inject or retain the manifest link for a Vite HTML entry. Existing links are deliberately
 * strict: a root path must equal manifestUrl exactly, while a full URL must be on identityOrigin and name exactly
 * that path. Relative URLs and <base> make the browser's effective request depend on the current page URL.
 */
export function resolveManifestLinkAction(
  html: string,
  identityOrigin: string,
  manifestUrl: string,
  entryLabel: string,
): ManifestLinkAction {
  if (BASE_TAG.test(renderedHtml(html))) {
    throw manifestLinkError(entryLabel, "declares a <base> element and cannot use an explicit manifest link");
  }

  const links = findManifestLinks(html);
  if (links.length === 0) return "inject";
  if (links.length > 1) {
    throw manifestLinkError(entryLabel, "declares more than one manifest link");
  }

  const [link] = links;
  if (link === undefined || !isAcceptedManifestHref(link.href, identityOrigin, manifestUrl)) {
    throw manifestLinkError(entryLabel, "declares a manifest link that does not match this build");
  }
  return "keep";
}

/** Ensures the emitted HTML contains the link that transformIndexHtml was meant to leave behind. */
export function assertFinalManifestLink(
  html: string,
  identityOrigin: string,
  manifestUrl: string,
  entryLabel: string,
): void {
  const action = resolveManifestLinkAction(html, identityOrigin, manifestUrl, entryLabel);
  if (action === "inject") {
    throw manifestLinkError(entryLabel, "has no manifest link in the final HTML output");
  }
}

function renderedHtml(html: string): string {
  return html.replace(INERT_CONTENT, "").replace(COMMENT, "");
}

function parseAttributes(tag: string): Map<string, string> {
  const body = tag.replace(/^<link\b/i, "").replace(/\/?>$/, "");
  const attrs = new Map<string, string>();
  for (const match of body.matchAll(ATTRIBUTE)) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    if (name === undefined) continue;
    const key = name.toLowerCase();
    // Browsers use the first duplicate attribute; mirror that behavior rather than letting a later value override it.
    if (!attrs.has(key)) attrs.set(key, doubleQuoted ?? singleQuoted ?? unquoted ?? "");
  }
  return attrs;
}

function isManifestRel(rel: string | undefined): boolean {
  return rel?.split(/\s+/).some((token) => token.toLowerCase() === "manifest") ?? false;
}

function isAcceptedManifestHref(href: string, identityOrigin: string, manifestUrl: string): boolean {
  if (href.startsWith("/")) return href === manifestUrl;
  if (!URL.canParse(href)) return false;

  const url = new URL(href);
  return url.origin === identityOrigin && url.pathname === manifestUrl && url.search === "" && url.hash === "";
}

function manifestLinkError(entryLabel: string, reason: string): Error {
  return new Error(
    `pwa-platform: ${entryLabel} ${reason}; the link was possibly injected by another plugin.`,
  );
}
