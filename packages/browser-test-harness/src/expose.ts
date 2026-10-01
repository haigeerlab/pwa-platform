import { exposeToAndroid } from "./android.js";
import { readIosDevice, startIosProxy, type ExposedServer } from "./ios.js";

export type ExposeOptions = {
  /** Host name of the origin tests use: `localhost` (default) or, for a server that only answers it, `127.0.0.1`. */
  readonly hostname?: string;
  /** iPhone runs: called before the per-test cleanup loads its document, to bring the server back online. */
  readonly prepareCleanup?: () => void;
};

/**
 * Makes the 127.0.0.1 server on `port` reachable from the test browser and returns the origin tests must use.
 * Chrome and desktop Safari/Firefox: `http://<hostname>:<port>` as is. Android (ADR-0048): the same, after an
 * `adb reverse`. iPhone (ADR-0049): `https://<LAN IP>:<proxy port>`, an HTTPS proxy on the Mac's LAN address.
 * `release` undoes the mapping or closes the proxy.
 */
export async function exposeServer(port: number, options: ExposeOptions = {}, env: Readonly<Record<string, string | undefined>> = process.env): Promise<ExposedServer> {
  const hostname = options.hostname ?? "localhost";
  const ios = readIosDevice(env);
  if (ios !== undefined) return startIosProxy(ios, port, { hostname, ...(options.prepareCleanup === undefined ? {} : { prepareCleanup: options.prepareCleanup }) });
  return { origin: `http://${hostname}:${port}`, release: await exposeToAndroid(port, env) };
}
