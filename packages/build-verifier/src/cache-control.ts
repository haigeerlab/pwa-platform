// A `Cache-Control` parser. The test harness has one too, but package boundaries forbid production code from
// importing the test package, so this is a second implementation kept in step by a parity test (task #83).
//
// The rules follow RFC 9110: commas separate directives outside quoted strings, a directive is `name` or
// `name=value`, the name is a token, and the value is either a token or a quoted string. Line breaks separate
// directives as well, because repeated header lines are commonly joined with one. Malformed directives are
// dropped rather than reported: browsers ignore them, so a check that failed on them would flag deployments the
// browser is perfectly happy with.

/** RFC 9110 token characters. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export type PwaCacheControlDirective = {
  /** Lower-cased directive name. */
  readonly name: string;
  /** Unquoted value, or `null` for a directive without one. */
  readonly value: string | null;
};

/** Splits a `Cache-Control` value into directives, dropping the ones no browser would honour. */
export function parseCacheControl(header: string | undefined): readonly PwaCacheControlDirective[] {
  if (header === undefined) return [];

  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  for (const character of header) {
    if (quoted) {
      current += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === "," || character === "\n") {
      tokens.push(current);
      current = "";
      continue;
    }
    if (character === '"') quoted = true;
    current += character;
  }
  tokens.push(current);

  return tokens.flatMap((token) => {
    const directive = parseDirective(token.trim());
    return directive === undefined ? [] : [directive];
  });
}

function parseDirective(token: string): PwaCacheControlDirective | undefined {
  if (token === "") return undefined;
  const separator = token.indexOf("=");
  if (separator === -1) return TOKEN.test(token) ? { name: token.toLowerCase(), value: null } : undefined;

  const name = token.slice(0, separator);
  const raw = token.slice(separator + 1);
  if (!TOKEN.test(name)) return undefined;
  const value = raw.startsWith('"') ? unquote(raw) : TOKEN.test(raw) ? raw : undefined;
  return value === undefined ? undefined : { name: name.toLowerCase(), value };
}

function unquote(raw: string): string | undefined {
  let value = "";
  for (let index = 1; index < raw.length; index += 1) {
    const character = raw.charAt(index);
    if (character === "\\") {
      index += 1;
      if (index >= raw.length) return undefined;
      value += raw.charAt(index);
    } else if (character === '"') {
      return index === raw.length - 1 ? value : undefined;
    } else {
      value += character;
    }
  }
  return undefined;
}

/**
 * True when `directives` carries `wanted`. `no-cache` matches a directive without a value, `max-age=60` requires
 * that exact value, `max-age=*` accepts any value or none, and `max-age=+` requires a positive whole number.
 *
 * `+` exists because "the directive is present" is too weak for a baseline that asks for a long lifetime: a
 * misconfigured `max-age=0` satisfies presence while making the resource uncacheable. It is a token character in
 * RFC 9110, so the parser above reads it without a special case.
 */
export function hasDirective(directives: readonly PwaCacheControlDirective[], wanted: string): boolean {
  const parsed = parseCacheControl(wanted);
  const [first] = parsed;
  // A list such as "no-cache,immutable" would silently be judged by its first entry alone, quietly weakening the
  // rule that used it, so anything but a single valid directive is a caller mistake.
  if (first === undefined || parsed.length > 1 || wanted.includes(",")) {
    throw new TypeError("A Cache-Control expectation must be a single valid directive");
  }
  return directives.some((directive) => directive.name === first.name && valueMatches(first.value, directive.value));
}

function valueMatches(wanted: string | null, observed: string | null): boolean {
  if (wanted === "*") return true;
  if (wanted === "+") return observed !== null && /^\d+$/.test(observed) && Number(observed) > 0;
  return observed === wanted;
}
