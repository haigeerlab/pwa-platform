// What a Cloudflare build receipt's `files` map means as served site paths. Pure string mapping: no filesystem or
// network access, so it can be exercised on any receipt shape without touching a real build.

/**
 * Maps a build receipt's `files` map (`build.json`'s `files`, keyed by paths relative to the upload root — e.g.
 * `"app/assets/index-a1b2c3d4.js"`, `"_headers"`) to the absolute paths the site serves them at
 * (`"/app/assets/index-a1b2c3d4.js"`).
 *
 * `_headers` is excluded: Cloudflare Pages reads it to configure response headers for the other files, but it is
 * never itself requested as a served resource, so including it would make `verifyArtifacts`/`verifyResponseHeaders`
 * judge a path that no plan ever names and no browser ever fetches.
 */
export function publishedPaths(receiptFiles: Readonly<Record<string, string>>): readonly string[] {
  return Object.keys(receiptFiles)
    .filter((path) => path !== "_headers")
    .map((path) => `/${path}`);
}
