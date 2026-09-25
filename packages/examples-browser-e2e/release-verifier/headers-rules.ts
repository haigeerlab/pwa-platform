// Checks a Cloudflare Pages `_headers` file's text against the one rule the pre-deploy contract increment adds
// (module spec, "修订：上线前核验" → "两个前提由工具强制"): "暂存目录中的 `_headers` 只能包含以 `/` 开头的路径规则，
// 出现按主机名的规则即拒绝运行". Pure: takes the file's text, not a path — the caller (P3's collector) reads the
// candidate staging directory's `_headers` file and hands this function its contents.
//
// Cloudflare's own `_headers` format (https://developers.cloudflare.com/pages/configuration/headers/): a
// non-indented, non-comment, non-blank line is a URL rule; a line indented with leading whitespace is a header line
// that applies to the rule above it; a line starting with `#` is a comment; blank lines are ignored.

export type PwaHeadersRuleViolation = { readonly line: number; readonly reason: string };

export type PwaHeadersRuleCheck = { readonly ok: true } | { readonly ok: false; readonly violations: readonly PwaHeadersRuleViolation[] };

/** A host placeholder like `:project.pages.dev` — Cloudflare Pages path placeholders (`:slug`) are never followed by a dot. */
const HOST_PLACEHOLDER = /^:[A-Za-z0-9_-]+\./;

/**
 * Rejects any rule line that is not a plain path rule: an absolute URL (`http://`/`https://`), a protocol-relative
 * host (`//`), a `:placeholder` host pattern (`:project.pages.dev/*`), or anything else not starting with `/`.
 * A header line (indented) that appears before any rule line is also an error, since it cannot apply to anything.
 *
 * Returns every violating line, 1-based and in file order, rather than stopping at the first one — the module spec
 * asks the caller to list "每个违规行号"（every offending line number), not just the first.
 */
export function checkHeadersFileRules(text: string): PwaHeadersRuleCheck {
  const violations: PwaHeadersRuleViolation[] = [];
  let sawRuleLine = false;

  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    if (rawLine.trim() === "") return; // blank line, ignored
    if (rawLine.startsWith("#")) return; // comment line, ignored

    const isHeaderLine = rawLine.startsWith(" ") || rawLine.startsWith("\t");
    if (isHeaderLine) {
      if (!sawRuleLine) violations.push({ line: lineNumber, reason: "header line appears before any rule line" });
      return;
    }

    // A non-indented, non-comment, non-blank line is a rule line.
    sawRuleLine = true;
    const rule = rawLine.trim();
    if (rule.startsWith("https://") || rule.startsWith("http://")) {
      violations.push({ line: lineNumber, reason: 'rule line is an absolute URL ("http://" or "https://") instead of a path' });
    } else if (rule.startsWith("//")) {
      violations.push({ line: lineNumber, reason: 'rule line is a protocol-relative host ("//") instead of a path' });
    } else if (HOST_PLACEHOLDER.test(rule)) {
      violations.push({ line: lineNumber, reason: 'rule line contains a ":placeholder" host pattern instead of a path' });
    } else if (!rule.startsWith("/")) {
      violations.push({ line: lineNumber, reason: 'rule line does not start with "/"' });
    }
  });

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
