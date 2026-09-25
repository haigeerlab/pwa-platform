// Runtime path matching: the same decoding and whole-segment rules policy-compiler applies when it orders rules and
// selects precache entries (a parity test against core keeps them equal). Imports nothing, so it runs in a worker.

// `%2F` must not become a segment boundary the URL does not have, so it is replaced by a lone surrogate: UTF-8
// decoding never produces one, so it cannot collide with decoded text.
const ENCODED_SLASH = "\uD800";
const UTF8_DECODER = new TextDecoder("utf-8", { ignoreBOM: true });
const UTF8_ENCODER = new TextEncoder();

export type PwaPathMatcher<Rule> = {
  /** The first rule whose prefix contains `path`, or `undefined` when no rule matches (unclassified). */
  match(path: string): Rule | undefined;
};

/**
 * Comparison key for a path, decoded per segment like the URL standard: valid `%XX` escapes become bytes, invalid
 * escapes stay literal, and bytes that are not UTF-8 become U+FFFD. Distinct spellings can only collapse into one
 * key, never split.
 */
export function decodedPathKey(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.split(/%2f/i).map(percentDecode).join(ENCODED_SLASH))
    .join("/");
}

/** Whole-segment containment of decoded keys: `/app/api/x` is within `/app/api`, `/app/apis` is not. */
export function isWithinPrefix(pathKey: string, prefixKey: string): boolean {
  return prefixKey === "/" || pathKey === prefixKey || pathKey.startsWith(`${prefixKey}/`);
}

/**
 * Matcher over the plan's path rules, whose order is the evaluation order. Prefix keys are decoded once, so each
 * request only decodes its own path. The query and fragment are ignored.
 */
export function createPathMatcher<Rule extends { readonly pathPrefix: string }>(rules: readonly Rule[]): PwaPathMatcher<Rule> {
  const prefixKeys = rules.map((rule) => decodedPathKey(rule.pathPrefix));
  return {
    match(path: string): Rule | undefined {
      const pathKey = decodedPathKey(pathOnly(path));
      const index = prefixKeys.findIndex((prefixKey) => isWithinPrefix(pathKey, prefixKey));
      return index === -1 ? undefined : rules[index];
    },
  };
}

function pathOnly(path: string): string {
  const end = path.search(/[?#]/);
  return end === -1 ? path : path.slice(0, end);
}

function percentDecode(text: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const escape = text.slice(index + 1, index + 3);
    if (text[index] === "%" && /^[0-9A-Fa-f]{2}$/.test(escape)) {
      bytes.push(Number.parseInt(escape, 16));
      index += 2;
      continue;
    }
    const character = String.fromCodePoint(text.codePointAt(index) ?? 0);
    bytes.push(...UTF8_ENCODER.encode(character));
    index += character.length - 1;
  }
  return UTF8_DECODER.decode(Uint8Array.from(bytes));
}
