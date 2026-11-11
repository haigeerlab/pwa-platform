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

/**
 * Whether the code that called a trapped built-in is platform browser code. `stack` starts at the trap itself; the
 * caller is the first later frame with a file location, so a call made through a native callback (for example
 * `[x].map(Object.hasOwn.bind(...))`, where the next frame is `Array.map (<anonymous>)`) is still attributed to the
 * source that set it up. Dependencies (node_modules) are never platform code.
 */
export function isPlatformBrowserCaller(stack) {
  const frames = stack.split("\n").slice(1);
  const caller = frames.slice(1).find((frame) => /\(?(?:file:\/\/)?[A-Za-z]?:?[\\/][^()]*:\d+:\d+\)?\s*$/.test(frame)) ?? "";
  return !caller.includes("node_modules") && PLATFORM_CODE.test(caller) && !BUILD_TIME_CODE.test(caller);
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
      if (isPlatformBrowserCaller(new Error().stack ?? "")) throw new TypeError(`${name} is not a function (not in the supported browser floor)`);
      return original.apply(this, args);
    },
  });
}

// Safari 13 throws "TypeError: Type error" from `new URL(value, undefined)`: an explicitly passed `undefined` base is
// not treated as absent (Safari 14 and Chromium accept it). 0.4.1 shipped a helper that did exactly that, so on Safari
// 13 every URL check failed and the worker ignored every request and the update confirmation (found on a real Safari
// 13.1). The URL constructor is wrapped so platform browser code that passes an undefined base fails here too.
const NativeURL = URL;
globalThis.URL = new Proxy(NativeURL, {
  construct(target, args, newTarget) {
    if (args.length >= 2 && args[1] === undefined && isPlatformBrowserCaller(new Error().stack ?? "")) {
      throw new TypeError("Type error (new URL with an undefined base, as Safari 13 throws)");
    }
    return Reflect.construct(target, args, newTarget);
  },
});

