export type CacheControlDirective = {
  /** Lower-cased directive name. */
  readonly name: string;
  /** Unquoted value, or `null` for a directive without a value. */
  readonly value: string | null;
};

export type CacheControlExpectation = {
  /**
   * Directives that must be present. `no-cache` matches only a directive without a value, `max-age=0` requires
   * that value, and `max-age=*` accepts any value (or none).
   */
  readonly include?: readonly string[];
  /** Directives that must be absent, matched the same way as `include`. */
  readonly exclude?: readonly string[];
};

/** Anything exposing lower-cased response headers, such as Playwright's `Response` or `APIResponse`. */
export type ResponseHeaders = { headers(): Record<string, string> };

// RFC 9110 token characters.
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Splits a `Cache-Control` value into directives. Commas and line breaks separate directives outside quoted
 * strings (Playwright joins repeated header lines with a line break); backslash escapes are honoured inside
 * quotes. Malformed directives, for example with whitespace around `=`, are dropped as browsers ignore them.
 */
export function parseCacheControl(header: string | undefined): readonly CacheControlDirective[] {
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

function parseDirective(token: string): CacheControlDirective | undefined {
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
 * Checks the response's `Cache-Control` directive by directive, the way the release runbook's header baseline
 * is judged: every `include` entry must match, no `exclude` entry may match, and no directive may repeat.
 */
export function expectCacheControl(response: ResponseHeaders, expectation: CacheControlExpectation): void {
  const header = response.headers()["cache-control"];
  const directives = parseCacheControl(header);
  const shown = header === undefined ? "(absent)" : JSON.stringify(header);

  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { name } of directives) (seen.has(name) ? repeated : seen).add(name);
  if (repeated.size > 0) throw new Error(`Cache-Control ${shown} repeats directives [${[...repeated].join(", ")}]`);

  const present = (entry: string): boolean => {
    const parsed = parseCacheControl(entry);
    const [wanted] = parsed;
    if (wanted === undefined || parsed.length > 1 || entry.trim().includes(",")) {
      throw new Error(`Invalid Cache-Control expectation: "${entry}"`);
    }
    return directives.some(
      (directive) => directive.name === wanted.name && (wanted.value === "*" || directive.value === wanted.value),
    );
  };
  const missing = (expectation.include ?? []).filter((entry) => !present(entry));
  const forbidden = (expectation.exclude ?? []).filter((entry) => present(entry));
  if (missing.length > 0 || forbidden.length > 0) {
    throw new Error(
      `Cache-Control ${shown} is missing [${missing.join(", ")}] and contains forbidden [${forbidden.join(", ")}]`,
    );
  }
}
