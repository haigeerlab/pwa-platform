// Rewritten by global-setup.ts for the v2 build, then restored — same trick as examples-browser-e2e's
// browser-tests/global-setup.ts. Changing this string changes the built asset hashes, so the browser sees a
// genuinely new worker and new chunks between v1 and v2, not two identical builds.
export const APP_VERSION = "v1";
