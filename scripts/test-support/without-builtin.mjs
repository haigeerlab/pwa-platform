// Runs `run` with a built-in really removed — absent, so `typeof` sees "undefined" — and restores it afterwards. Use it
// to test the fallback branch of code that feature-detects an API newer than the browser floor (ADR-0053); the
// legacy-engine.mjs trap cannot, because there the property still exists.
export async function withoutBuiltin(owner, key, run) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (descriptor === undefined) return run();
  delete owner[key];
  try {
    return await run();
  } finally {
    Object.defineProperty(owner, key, descriptor);
  }
}
