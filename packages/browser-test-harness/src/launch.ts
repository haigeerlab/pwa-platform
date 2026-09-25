/** Chrome executable used instead of the installed stable channel, for example a desktop N-1 build. */
export const CHROME_PATH_ENV = "PWA_HARNESS_CHROME_PATH";

export type HarnessEnvironment = Readonly<Record<string, string | undefined>>;

/** Launch options layered over Playwright's: an explicit executable takes precedence over the Chrome channel. */
export function desktopLaunchOverrides(env: HarnessEnvironment): { readonly executablePath?: string } {
  const executablePath = env[CHROME_PATH_ENV];
  return executablePath === undefined || executablePath === "" ? {} : { executablePath };
}
