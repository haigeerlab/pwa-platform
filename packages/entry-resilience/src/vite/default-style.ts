// The recovery page's default stylesheet — spec/pwa-entry-resilience.md's "修订：恢复页的默认样式与宿主定制". A
// single constant, not inlined into src/vite/index.ts's HTML string, so it can be reviewed on its own and hashed
// for CSP there (see that module's generateBundle). Fixed text only: nothing here comes from plugin configuration
// — a host's own CSS is appended separately, verbatim, by the `css` option (src/vite/options.ts).
//
// Colour tokens are CSS custom properties so a host can re-skin the page by resetting them alone (spec's "宿主换肤
// 的写法"): light values live directly on `.pwa-entry` (also carrying the page's only layout rules — system font
// stack, a constrained max width, block-level buttons with a comfortable tap target; no icons, web fonts, images or
// animations), dark values are redefined under `prefers-color-scheme: dark` unless `data-theme="light"` overrides
// it, and `[data-theme="dark"]` overrides the system preference outright — the exact three-selector precedence
// contract the spec pins, and the values in both tables, character for character. `data-theme` itself is set by
// src/page/main.ts before the first render, from the stored preference `setPwaTheme` (src/client/index.ts) writes.
//
// Every class selector below must be exactly the set src/page/render.ts's renderPage produces — see this module's
// own class-table comment and test/page/class-alignment.test.ts, which checks both directions mechanically.
export const DEFAULT_RECOVERY_PAGE_STYLE = `.pwa-entry {
  --pwa-entry-bg: #ffffff;
  --pwa-entry-fg: #1f2328;
  --pwa-entry-muted: #5b6470;
  --pwa-entry-accent: #0b5cd5;
  --pwa-entry-accent-fg: #ffffff;
  --pwa-entry-radius: 0.5rem;
  --pwa-entry-max-width: 34rem;
  --pwa-entry-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  /* Covers the whole viewport, whatever the body's default margin: until 2026-09-24 the root was a centred
     max-width column, so in dark mode only that column was dark and the rest of the page stayed white. The content
     keeps its width through the inline padding instead of a max-width on the root. */
  display: block;
  position: fixed;
  inset: 0;
  overflow-y: auto;
  box-sizing: border-box;
  color-scheme: light;
  padding: 3rem max(1.5rem, calc((100% - var(--pwa-entry-max-width)) / 2));
  font-family: var(--pwa-entry-font);
  line-height: 1.5;
  color: var(--pwa-entry-fg);
  background: var(--pwa-entry-bg);
}
@media (prefers-color-scheme: dark) {
  .pwa-entry:not([data-theme="light"]) {
    --pwa-entry-bg: #0f1419;
    --pwa-entry-fg: #e6e9ec;
    --pwa-entry-muted: #9aa4b0;
    --pwa-entry-accent: #4c93ff;
    --pwa-entry-accent-fg: #0b1220;
    color-scheme: dark;
  }
}
.pwa-entry[data-theme="dark"] {
  --pwa-entry-bg: #0f1419;
  --pwa-entry-fg: #e6e9ec;
  --pwa-entry-muted: #9aa4b0;
  --pwa-entry-accent: #4c93ff;
  --pwa-entry-accent-fg: #0b1220;
  color-scheme: dark;
}
.pwa-entry__headline {
  margin: 0 0 0.75rem;
  font-size: 1.375rem;
  font-weight: 600;
}
.pwa-entry__message,
.pwa-entry__expiry {
  margin: 0 0 0.75rem;
  color: var(--pwa-entry-muted);
}
.pwa-entry__list {
  display: grid;
  gap: 0.75rem;
  margin: 1.5rem 0 0;
  padding: 0;
  list-style: none;
}
.pwa-entry__item {
  margin: 0;
  padding: 0;
}
.pwa-entry__button {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: var(--pwa-entry-radius);
  background: var(--pwa-entry-accent);
  color: var(--pwa-entry-accent-fg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.pwa-entry__button:active {
  /* A brightness shift rather than a different background: swapping in a surface colour while the label keeps
     --pwa-entry-accent-fg leaves white text on a near-white fill for the light theme. */
  filter: brightness(0.92);
}
.pwa-entry__empty,
.pwa-entry__loading {
  color: var(--pwa-entry-muted);
}
@media print {
  .pwa-entry {
    position: static;
    overflow: visible;
  }
}
`;
