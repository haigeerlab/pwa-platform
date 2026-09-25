// Injectable DOM rendering for the recovery page: no direct `document`/`window` access, so it can be unit-tested
// without a real DOM (test/page/render.test.ts). All text below is written through the `textContent` property
// only — no other, HTML-parsing write path — which test/page/source-scan.test.ts checks mechanically by name
// (deliberately not spelled out in this comment, so the comment cannot itself trip that scan). See
// spec/pwa-entry-resilience.md's "入口恢复页".
import type { EntryPageModel } from "./model.js";
import type { PwaEntryPageMessages } from "./messages.js";

export type PageElement = {
  textContent: string | null;
  append(...children: PageElement[]): void;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
};

export type PageDocument = { createElement(tag: "h1" | "p" | "ul" | "li" | "button"): PageElement };

/** Maps a model status to the `messages` key carrying its headline — see spec/pwa-entry-resilience.md's "修订：恢
 *  复页的构建期语言与文案覆盖" contract table. */
const STATUS_HEADLINE_KEY: Readonly<
  Record<"migrating" | "incident" | "unconfirmed-outage", "headlineMigrating" | "headlineIncident" | "headlineUnconfirmedOutage">
> = {
  migrating: "headlineMigrating",
  incident: "headlineIncident",
  "unconfirmed-outage": "headlineUnconfirmedOutage",
};

function paragraph(doc: PageDocument, text: string, className: string): PageElement {
  const element = doc.createElement("p");
  element.textContent = text;
  element.setAttribute("class", className);
  return element;
}

/**
 * Renders `model` into `root`, replacing whatever was there. `navigate` is only ever registered as a click
 * listener here — it is never called during rendering, including when there is exactly one entry, and no
 * attribute carries an entry's `href`: it lives only in the closure the listener captures.
 *
 * Every element created here — including `root` itself — carries the class from spec/pwa-entry-resilience.md's
 * "修订：恢复页的默认样式与宿主定制" class table, and no other: test/page/render.test.ts and
 * test/page/class-alignment.test.ts hold both halves of that contract (every class used here appears in the
 * default stylesheet, src/vite/default-style.ts, and vice versa) so structure and styling cannot silently drift
 * apart from one another.
 */
export function renderPage(
  root: PageElement,
  model: EntryPageModel | "loading",
  doc: PageDocument,
  navigate: (href: string) => void,
  messages: PwaEntryPageMessages,
): void {
  root.textContent = "";
  root.setAttribute("class", "pwa-entry");

  if (model === "loading") {
    root.append(paragraph(doc, messages.loading, "pwa-entry__loading"));
    return;
  }

  if (model.kind === "none") {
    root.append(paragraph(doc, messages.empty, "pwa-entry__empty"));
    return;
  }

  const heading = doc.createElement("h1");
  heading.textContent = messages[STATUS_HEADLINE_KEY[model.status]];
  heading.setAttribute("class", "pwa-entry__headline");
  root.append(heading);

  if (model.message !== null) root.append(paragraph(doc, model.message, "pwa-entry__message"));
  root.append(paragraph(doc, messages.expiry.replace("{expiresAt}", () => model.expiresAt), "pwa-entry__expiry"));

  const list = doc.createElement("ul");
  list.setAttribute("class", "pwa-entry__list");
  for (const entry of model.entries) {
    const item = doc.createElement("li");
    item.setAttribute("class", "pwa-entry__item");
    const button = doc.createElement("button");
    // A replacement function, not a string: a host may contain `$` (a valid URL host), and a string replacement would
    // read `$&` or `$'` in it as a pattern.
    button.textContent = messages.go.replace("{host}", () => entry.host);
    button.setAttribute("type", "button");
    button.setAttribute("class", "pwa-entry__button");
    const href = entry.href;
    button.addEventListener("click", () => navigate(href));
    item.append(button);
    list.append(item);
  }
  root.append(list);
}
