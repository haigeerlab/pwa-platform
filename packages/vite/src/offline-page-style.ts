// The default offline page's stylesheet — spec/vite-adapter.md's "修订：平台默认离线页（2026-09-24，已评审通过）".
// A single constant, not inlined into src/offline-page.ts's HTML string, so it can be reviewed on its own and
// hashed for CSP there (see that module's renderOfflinePage). Fixed text only: nothing here comes from plugin
// configuration — a host's own CSS is appended separately, verbatim, by the `offlinePage.css` option
// (src/options.ts, wired in OP3).
//
// Same design as the entry-recovery page's default style (packages/entry-resilience/src/vite/default-style.ts):
// colour tokens as CSS custom properties so a host can re-skin the page by resetting them alone, light values on
// `.pwa-offline` itself, dark values redefined under `prefers-color-scheme: dark` unless `data-theme="light"`
// overrides it, and `[data-theme="dark"]` overriding the system preference outright — the same three-selector
// precedence contract, same variable names minus the `--pwa-entry-` -> `--pwa-offline-` prefix swap, same light and
// dark values. The two packages intentionally do not share code (spec's confirmed premise #5): this file exists
// independently rather than importing from `@pwa-platform/pwa-entry-resilience`.
//
// The offline page is a standalone document with no application script to set `data-theme`, so only the
// `prefers-color-scheme` path ever fires in practice; the `[data-theme]` selector is kept anyway so a host's
// own theme-switching CSS can be written the same way for both pages (spec's note on this).
//
// Every class selector below must be exactly the set src/offline-page.ts's renderOfflinePage produces — see this
// module's own class-table comment and test/offline-page-class-alignment.test.ts, which checks both directions
// mechanically.
export const DEFAULT_OFFLINE_PAGE_STYLE = `.pwa-offline {
  --pwa-offline-bg: #ffffff;
  --pwa-offline-fg: #1f2328;
  --pwa-offline-muted: #5b6470;
  --pwa-offline-accent: #0b5cd5;
  --pwa-offline-accent-fg: #ffffff;
  --pwa-offline-radius: 0.5rem;
  --pwa-offline-max-width: 34rem;
  --pwa-offline-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  /* Covers the whole viewport, whatever the body's default margin: the background is the page's, not a column's.
     Measured 2026-09-24: a centred max-width column left white bands around the dark background. */
  position: fixed;
  inset: 0;
  overflow-y: auto;
  color-scheme: light;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* safe: when the content is taller than the viewport (zoom, small landscape screens), it starts at the top and
     scrolls, instead of overflowing upwards out of reach. */
  justify-content: safe center;
  box-sizing: border-box;
  /* The content column stays within --pwa-offline-max-width through the inline padding, not a max-width on the
     root, so the root itself can span the viewport. */
  padding: 3rem max(1.5rem, calc((100% - var(--pwa-offline-max-width)) / 2));
  text-align: center;
  font-family: var(--pwa-offline-font);
  line-height: 1.5;
  color: var(--pwa-offline-fg);
  background: var(--pwa-offline-bg);
}
@media (prefers-color-scheme: dark) {
  .pwa-offline:not([data-theme="light"]) {
    --pwa-offline-bg: #0f1419;
    --pwa-offline-fg: #e6e9ec;
    --pwa-offline-muted: #9aa4b0;
    --pwa-offline-accent: #4c93ff;
    --pwa-offline-accent-fg: #0b1220;
    color-scheme: dark;
  }
}
.pwa-offline[data-theme="dark"] {
  --pwa-offline-bg: #0f1419;
  --pwa-offline-fg: #e6e9ec;
  --pwa-offline-muted: #9aa4b0;
  --pwa-offline-accent: #4c93ff;
  --pwa-offline-accent-fg: #0b1220;
  color-scheme: dark;
}
.pwa-offline__app {
  margin: 0 0 0.75rem;
  color: var(--pwa-offline-muted);
}
.pwa-offline__heading {
  margin: 0 0 0.75rem;
  font-size: 1.375rem;
  font-weight: 600;
}
.pwa-offline__body {
  margin: 0 0 1.5rem;
  color: var(--pwa-offline-muted);
}
.pwa-offline__retry {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: var(--pwa-offline-radius);
  background: var(--pwa-offline-accent);
  color: var(--pwa-offline-accent-fg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.pwa-offline__retry:active {
  /* A brightness shift rather than a different background: swapping in a surface colour while the label keeps
     --pwa-offline-accent-fg leaves white text on a near-white fill for the light theme. */
  filter: brightness(0.92);
}
@media print {
  .pwa-offline {
    position: static;
    overflow: visible;
  }
}
`;
