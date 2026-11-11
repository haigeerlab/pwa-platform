// Vitest setup for packages whose code runs in the browser. It makes built-ins that browsers older than the platform's
// supported floor (Safari 13.1 / Chrome 80 / Firefox 74) lack throw "is not a function" when called from platform
// code that runs in a browser (`packages/<name>/src` or `/dist`, minus the build-time code listed in BUILD_TIME_CODE),
// so every unit test in those packages also proves that code does not depend on them. Callers elsewhere — Vitest,
// its assertions, third-party dependencies, the tests themselves — keep the real implementation, because removing the
// built-ins outright breaks the test runner. The list is the lint layer's RESTRICTED_PROPERTIES (ADR-0053).
//
// This is a call trap, not an absence: the property still exists, so `typeof X.y === "function"` stays true. Code
// that feature-detects one of these must be tested with withoutBuiltin() (./without-builtin.mjs), which really removes
// it for one test, so the fallback branch is the one exercised.
import { RESTRICTED_PROPERTIES } from "../browser-baseline.mjs";

const PLATFORM_CODE = /[\\/]packages[\\/][^\\/]+[\\/](?:src|dist)[\\/]/;
// Build-time code runs only in Node: the packages that never ship to a browser, and the build/vite entries of the rest.
const BUILD_TIME_CODE =
  /[\\/]packages[\\/](?:contracts|core|vite|build-verifier|release-tools)[\\/]|[\\/](?:src|dist)[\\/](?:build|vite|server)[\\/]/;

/** The file of the frame that called the trap: line 0 is the message, 1 this function, 2 the trap, 3 its caller. */
function callerFile() {
  const frame = new Error().stack?.split("\n")[3] ?? "";
  return frame.includes("node_modules") ? "" : frame;
}

for (const { object, property: key } of RESTRICTED_PROPERTIES) {
  const owner = globalThis[object];
  const name = `${object}.${key}`;
  const original = owner[key];
  // A built-in this Node version lacks needs no trap: calling it fails anyway.
  if (typeof original !== "function") continue;
  Object.defineProperty(owner, key, {
    configurable: true,
    writable: true,
    value: function (...args) {
      const caller = callerFile();
      if (PLATFORM_CODE.test(caller) && !BUILD_TIME_CODE.test(caller)) throw new TypeError(`${name} is not a function (not in the supported browser floor)`);
      return original.apply(this, args);
    },
  });
}
