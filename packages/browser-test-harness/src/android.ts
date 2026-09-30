import { execFile } from "node:child_process";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import type { Browser } from "@playwright/test";
import { REAL_BROWSER_ENV } from "./webdriver.js";

/** Environment variable that runs the browser suites in the Chrome of a USB-connected Android phone (ADR-0048). */
export const ANDROID_SERIAL_ENV = "PWA_ANDROID_SERIAL";

const run = promisify(execFile);
/** Abstract socket on which Android Chrome serves the DevTools protocol (the one `chrome://inspect` uses). */
const DEVTOOLS_SOCKET = "localabstract:chrome_devtools_remote";

type Env = Readonly<Record<string, string | undefined>>;

/** Reads `PWA_ANDROID_SERIAL`; `undefined` when unset or empty, an error when it is combined with `PWA_REAL_BROWSER`. */
export function readAndroidSerial(env: Env): string | undefined {
  const value = env[ANDROID_SERIAL_ENV];
  if (value === undefined || value === "") return undefined;
  const real = env[REAL_BROWSER_ENV];
  if (real !== undefined && real !== "") {
    throw new Error(`${ANDROID_SERIAL_ENV} and ${REAL_BROWSER_ENV} cannot be combined: choose one browser target per run`);
  }
  return value;
}

/** True when this run drives the Chrome of an Android phone; specs use it for precise `test.skip` reasons. */
export function isAndroidRun(): boolean {
  return readAndroidSerial(process.env) !== undefined;
}

/** Log line naming the phone's Chrome, for example `Android Chrome 153.0.8010.53 (23127PN0CC, USB CDP)`. */
export function describeAndroid(browserVersion: string, model: string): string {
  return `Android Chrome ${browserVersion} (${model}, USB CDP)`;
}

async function adb(serial: string, ...args: readonly string[]): Promise<string> {
  try {
    return (await run("adb", ["-s", serial, ...args])).stdout;
  } catch (error) {
    throw new Error(`adb -s ${serial} ${args.join(" ")} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** Product model of the phone (`ro.product.model`), for the version log line. */
export async function readAndroidModel(serial: string): Promise<string> {
  return (await adb(serial, "shell", "getprop", "ro.product.model")).trim();
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

/**
 * Makes `http://localhost:<port>` on the phone reach the same port on this machine and returns the function that removes
 * the mapping. `undefined` serial (not an Android run) maps nothing.
 */
export async function exposeToAndroid(port: number, env: Env = process.env): Promise<() => Promise<void>> {
  const serial = readAndroidSerial(env);
  if (serial === undefined) return async () => {};
  await adb(serial, "reverse", `tcp:${port}`, `tcp:${port}`);
  return async () => {
    await adb(serial, "reverse", "--remove", `tcp:${port}`).catch(() => "");
  };
}

/** A DevTools connection to the phone's Chrome. Closing it only disconnects and removes the port forward. */
export type AndroidChrome = {
  readonly browser: Browser;
  close(): Promise<void>;
};

export async function connectAndroidChrome(serial: string): Promise<AndroidChrome> {
  const port = await freePort();
  await adb(serial, "forward", `tcp:${port}`, DEVTOOLS_SOCKET);
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    return {
      browser,
      async close() {
        // Only disconnects: the phone's Chrome and its everyday context stay untouched.
        await browser.close().catch(() => undefined);
        await adb(serial, "forward", "--remove", `tcp:${port}`).catch(() => "");
      },
    };
  } catch (error) {
    await adb(serial, "forward", "--remove", `tcp:${port}`).catch(() => "");
    throw error;
  }
}
