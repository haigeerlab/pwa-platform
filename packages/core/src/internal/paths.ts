const URL_BASE = "https://core.invalid";

/** Same-origin absolute path already in WHATWG URL serialized form (mirrors contracts). */
export function isCanonicalPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.includes("//") &&
    !value.includes("\\") &&
    URL.canParse(value, URL_BASE) &&
    new URL(value, URL_BASE).pathname === value
  );
}

/** POSIX path relative to a build output directory, without dot or empty segments (mirrors contracts). */
export function isRelativeFilePath(value: string): boolean {
  return (
    value !== "" &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}
